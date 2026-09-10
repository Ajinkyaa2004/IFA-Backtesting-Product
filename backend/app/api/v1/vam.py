"""Client-facing VAM endpoints (self-serve).

A signed-in client can:
  * Browse the VAM strategy list / per-step parameter schema (so the dashboard
    can build the configurator form).
  * POST /vam/run to actually trigger a backtest. The result lands in the
    client's own Backtests list (engine='vam'), identical to admin-delivered.

Authorisation: all routes use the existing client_scope dependency, which
returns the caller's client_id (UUID) and rejects admins / unscoped users.
The endpoint server-side pins the client to that ID - clients CAN'T target
another client's account even by forging the body.

Rate limiting: per-client in-memory sliding window. Defaults to 5 runs/min/client.
Resets on process restart (fine for a single-instance Render deploy; if we
ever scale horizontally we'll move this to Redis).
"""
from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.admin.vam import VamRunOut, _translate_vam_error
from app.core.config import get_settings
from app.core.deps import current_user
from app.db.models import Client, User
from app.db.session import get_db
from app.services.vam import get_vam_client
from app.services.vam_run import persist_vam_run


# ── Feature-gate dependency ────────────────────────────────────────────────
#
# Only clients whose Client row has vam_enabled=True can hit any /vam/* route.
# Admins are NOT subject to this — the admin variants live under /admin/vam/.
# Returns the client_id (UUID) for downstream handlers that need it.

def vam_client_scope(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    if user.role != "client" or user.client_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client-only endpoint")
    client = (
        db.query(Client).filter(Client.id == user.client_id, Client.deleted_at.is_(None)).first()
    )
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    if not client.vam_enabled:
        # 403 with a clear reason so the frontend can show a friendly "not enabled" state
        # rather than a generic forbidden screen.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="vam_not_enabled_for_client",
        )
    return client.id

router = APIRouter(prefix="/vam", tags=["vam"])


# ── Rate limiter (in-memory sliding window) ────────────────────────────────


_RATE_WINDOW_S = 60  # the "per minute" of "5/minute"
_rate_lock = Lock()
_rate_log: dict[uuid.UUID, deque[float]] = defaultdict(deque)


def _check_rate_limit(client_id: uuid.UUID, db: "Session | None" = None) -> None:
    """Raise 429 if this client has exceeded VAM_CLIENT_RUNS_PER_MINUTE in the last 60s.

    Why in-memory: the rate limit is a politeness throttle (stop runaway
    sliders from spamming VAM), not a security boundary. A process restart
    resetting the window is acceptable. If we add a second backend instance
    we should switch to Redis or per-client DB counters.

    Ratelimit hits are audit-logged so admins can spot spammy clients from
    the Audit page without needing to trawl uvicorn access logs.
    """
    cap = get_settings().VAM_CLIENT_RUNS_PER_MINUTE
    now = time.time()
    cutoff = now - _RATE_WINDOW_S
    with _rate_lock:
        log = _rate_log[client_id]
        while log and log[0] < cutoff:
            log.popleft()
        if len(log) >= cap:
            # Compute retry-after: how long until the oldest entry exits the window.
            retry_after = max(1, int(log[0] + _RATE_WINDOW_S - now))
            if db is not None:
                try:
                    from app.services import audit
                    audit.record(
                        db, actor_user_id=None,
                        action="ratelimit.hit",
                        target_type="client",
                        target_id=client_id,
                        payload={"scope": "vam.run", "cap": cap, "window_s": _RATE_WINDOW_S, "retry_after": retry_after},
                        ip=None,
                    )
                    db.commit()
                except Exception as e:
                    logger.warning("audit write failed on ratelimit hit: {}", e)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit: {cap} VAM runs per {_RATE_WINDOW_S}s. Retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )
        log.append(now)


# ── Schemas ────────────────────────────────────────────────────────────────


class ClientVamRunIn(BaseModel):
    step: str = Field(..., description="VAM step id (step1 / step2 / step3 / step4_svix / step4_combined)")
    params: dict = Field(default_factory=dict, description="Body for VAM /api/backtest/run, sans `step` (server canonicalises)")
    strategy_id: str | None = Field(None, description="Optional FK to one of this client's strategy_documents")


# ── Proxy reads (auth = any signed-in user) ────────────────────────────────
#
# We re-expose the strategy list + schema to clients via this router (NOT the
# admin one) so that fetchVamStrategies in the frontend can call /api/v1/vam/...
# for both admins and clients. Keeps the frontend simpler.


@router.get("/strategies")
async def list_strategies(_client_id: uuid.UUID = Depends(vam_client_scope)):
    try:
        return await get_vam_client().list_strategies()
    except Exception as e:
        raise _translate_vam_error(e) from e


@router.get("/strategies/{step_id}/schema")
async def get_step_schema(step_id: str, _client_id: uuid.UUID = Depends(vam_client_scope)):
    try:
        return await get_vam_client().get_step_schema(step_id)
    except Exception as e:
        raise _translate_vam_error(e) from e


@router.get("/symbols")
async def list_symbols(_client_id: uuid.UUID = Depends(vam_client_scope)):
    try:
        return await get_vam_client().list_symbols()
    except Exception as e:
        raise _translate_vam_error(e) from e


# ── The workflow endpoint ──────────────────────────────────────────────────


@router.post("/run", response_model=VamRunOut, status_code=201)
async def client_run_via_vam(
    payload: ClientVamRunIn,
    request: Request,
    client_id: uuid.UUID = Depends(vam_client_scope),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Authenticated VAM-enabled client triggers a backtest run for themselves.

    Differences vs the admin endpoint:
      * client_id is pinned from the session — the body can't target another client
      * actor_type = "client" in the audit log + envelope
      * subject to the per-client sliding-window rate limit
      * requires Client.vam_enabled = True (enforced by vam_client_scope)
      * subject to the tier's monthly backtest cap + vam_engine feature gate
    """
    _check_rate_limit(client_id, db)

    # Tier gates — feature check + monthly count. Both raise HTTPException with
    # the standard tier-gate detail body so the frontend can render an upgrade
    # prompt. Runs BEFORE we hit VAM, so limit-blocked clients don't burn a
    # backtest slot on the upstream engine.
    from app.core.tier_deps import check_backtest_limit_for_client
    from app.core import tier as _tier_config
    _client_tier = db.query(Client.tier).filter(Client.id == client_id).scalar()
    try:
        _tier_config.check_feature(_client_tier or "tier1", "vam_engine")
    except _tier_config.TierGateError as e:
        raise HTTPException(status_code=403, detail=e.as_detail()) from e
    check_backtest_limit_for_client(client_id, db)

    client = (
        db.query(Client).filter(Client.id == client_id, Client.deleted_at.is_(None)).first()
    )
    if not client:
        # Shouldn't happen — client_scope guarantees the user has a live client_id.
        # Belt-and-braces: race with a soft-delete in another tab.
        raise HTTPException(status_code=404, detail="Client not found")

    vam_params = {**payload.params, "step": payload.step}
    try:
        vam_response = await get_vam_client().run_backtest(vam_params)
    except Exception as e:
        raise _translate_vam_error(e) from e

    backtest, storage_key = persist_vam_run(
        db=db,
        client=client,
        step=payload.step,
        params=vam_params,
        vam_response=vam_response,
        actor=user,
        actor_type="client",
        strategy_id_str=payload.strategy_id,
        ip=request.client.host if request.client else None,
    )

    return VamRunOut(
        backtest_id=str(backtest.id),
        code=backtest.code,
        name=backtest.name,
        storage_key=storage_key,
    )
