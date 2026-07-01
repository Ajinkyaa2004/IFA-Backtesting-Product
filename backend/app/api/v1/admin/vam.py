"""Admin VAM proxy + run-and-persist endpoints.

All gated by require_role("main_admin", "sub_admin"). The five GET routes
are thin pass-throughs to VAM so the admin UI can populate its strategy
dropdown, parameter form, and date-range hints without ever holding a VAM
token in the browser. The POST /run route is the workflow: it calls VAM,
hands the response to vam_run.persist_vam_run, and returns the resulting
backtest's code so the admin UI can link the client to it.

All VAM-side failures are translated into stable HTTP responses:
  * VAMConfigError      -> 503 "VAM engine not configured"
  * VAMAuthError        -> 502 "VAM auth failed"
  * VAMValidationError  -> 422 with violations (passed through)
  * VAMUpstreamError    -> 502 with VAM's status code in detail
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Client, User
from app.db.session import get_db
from app.services.vam import (
    VAMAuthError,
    VAMConfigError,
    VAMUpstreamError,
    VAMValidationError,
    get_vam_client,
)
from app.services.vam_run import persist_vam_run

router = APIRouter(prefix="/vam", tags=["admin-vam"])


# ── Schemas ────────────────────────────────────────────────────────────────


class VamRunIn(BaseModel):
    client_id: str = Field(..., description="UUID of the target client")
    step: str = Field(..., description="VAM step id (step1 / step2 / step3 / step4_svix / step4_combined)")
    params: dict = Field(default_factory=dict, description="Request body for VAM /api/backtest/run, EXCLUDING the `step` key (we set that from .step)")
    strategy_id: str | None = Field(None, description="Optional FK to client's strategy_documents row, for provenance")


class VamRunOut(BaseModel):
    backtest_id: str
    code: str
    name: str
    storage_key: str


# ── Error translation helper ───────────────────────────────────────────────


def _translate_vam_error(exc: Exception) -> HTTPException:
    """Map a VAM client exception to a stable HTTPException."""
    if isinstance(exc, VAMConfigError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VAM engine not configured on this server (missing VAM_ADMIN_EMAIL/PASSWORD).",
        )
    if isinstance(exc, VAMAuthError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="VAM engine authentication failed. Check VAM_ADMIN_PASSWORD.",
        )
    if isinstance(exc, VAMValidationError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "VAM rejected the parameters", "violations": exc.violations},
        )
    if isinstance(exc, VAMUpstreamError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"VAM engine error: {exc} (upstream status {exc.status_code or '?'})",
        )
    # Unknown — bubble as 500 so it ends up in logs with a traceback.
    return HTTPException(status_code=500, detail=f"VAM call failed: {exc}")


# ── Proxy reads ────────────────────────────────────────────────────────────


@router.get("/strategies")
async def list_strategies(_admin: User = Depends(require_role("main_admin", "sub_admin"))):
    try:
        return await get_vam_client().list_strategies()
    except Exception as e:
        raise _translate_vam_error(e) from e


@router.get("/strategies/{step_id}/schema")
async def get_step_schema(
    step_id: str,
    _admin: User = Depends(require_role("main_admin", "sub_admin")),
):
    try:
        return await get_vam_client().get_step_schema(step_id)
    except Exception as e:
        raise _translate_vam_error(e) from e


@router.get("/symbols")
async def list_symbols(_admin: User = Depends(require_role("main_admin", "sub_admin"))):
    try:
        return await get_vam_client().list_symbols()
    except Exception as e:
        raise _translate_vam_error(e) from e


@router.get("/data-info")
async def data_info(_admin: User = Depends(require_role("main_admin", "sub_admin"))):
    try:
        return await get_vam_client().get_data_info()
    except Exception as e:
        raise _translate_vam_error(e) from e


@router.get("/profile")
async def vam_profile(_admin: User = Depends(require_role("main_admin", "sub_admin"))):
    """Debug/health probe — confirms our cached token works.

    Returns 200 + VAM's profile body if we can hit VAM; the failure path
    above (503/502) tells the admin exactly what's wrong.
    """
    try:
        return await get_vam_client().get_profile()
    except Exception as e:
        raise _translate_vam_error(e) from e


@router.get("/health")
async def vam_health(_admin: User = Depends(require_role("main_admin", "sub_admin"))):
    """Non-throwing health check used by the AdminPulsePage health card.

    Never raises — always returns a structured status so the frontend can
    render a green/red pill + last-error message without try/catch juggling.
    Measures round-trip latency to /api/auth/profile as the canary call.
    """
    import time
    started = time.time()
    try:
        await get_vam_client().get_profile()
        return {
            "ok": True,
            "latency_ms": round((time.time() - started) * 1000, 1),
            "error": None,
            "checked_at": time.time(),
        }
    except Exception as e:
        # Reason string, not full traceback — the frontend renders it inline.
        return {
            "ok": False,
            "latency_ms": round((time.time() - started) * 1000, 1),
            "error": str(e)[:200],
            "checked_at": time.time(),
        }


# ── The workflow endpoint ──────────────────────────────────────────────────


@router.post("/run", response_model=VamRunOut, status_code=201)
async def admin_run_via_vam(
    payload: VamRunIn,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Admin runs a VAM backtest on behalf of a client and persists the result.

    Flow:
        1. Resolve target client (404 if not found / soft-deleted).
        2. Call VAM /api/backtest/run with {step, **params}. The step key inside
           params will be overwritten — the canonical source is payload.step.
        3. Persist via vam_run.persist_vam_run (validates against vam schema,
           uploads to Storage, inserts backtests + backtest_files rows, audits).
        4. Return the backtest code so the admin can link the client to it.
    """
    # 1. Resolve client
    try:
        client_uuid = uuid.UUID(payload.client_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="client_id is not a valid UUID")
    client = (
        db.query(Client).filter(Client.id == client_uuid, Client.deleted_at.is_(None)).first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # 2. Call VAM. We canonicalise the step from .step (not .params.step) so the
    # body we record is unambiguous.
    vam_params = {**payload.params, "step": payload.step}
    try:
        vam_response = await get_vam_client().run_backtest(vam_params)
    except Exception as e:
        raise _translate_vam_error(e) from e

    # 3. Persist
    backtest, storage_key = persist_vam_run(
        db=db,
        client=client,
        step=payload.step,
        params=vam_params,
        vam_response=vam_response,
        actor=admin,
        actor_type="admin",
        strategy_id_str=payload.strategy_id,
        ip=request.client.host if request.client else None,
    )

    return VamRunOut(
        backtest_id=str(backtest.id),
        code=backtest.code,
        name=backtest.name,
        storage_key=storage_key,
    )
