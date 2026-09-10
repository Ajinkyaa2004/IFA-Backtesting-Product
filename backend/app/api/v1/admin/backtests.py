from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jsonschema import Draft202012Validator
from loguru import logger
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.core.tier_deps import check_backtest_limit_for_client
from app.db.models import Backtest, BacktestFile, Client
from app.db.session import get_db
from app.services import audit, notify, storage

router = APIRouter()

REPO_ROOT = Path(__file__).resolve().parents[5]
SCHEMA_PATH = REPO_ROOT / "schemas" / "backtest.schema.json"
EXAMPLE_PATH = REPO_ROOT / "schemas" / "backtest.example.json"


def _load_schema() -> dict:
    if not SCHEMA_PATH.exists():
        raise RuntimeError(f"Backtest schema not found at {SCHEMA_PATH}")
    return json.loads(SCHEMA_PATH.read_text())


@router.get("/backtests/example-template")
def backtest_example_template(
    _admin=Depends(require_role("main_admin", "sub_admin")),
):
    """Returns the canonical v1.0 example backtest JSON as a starting template
    admins can copy and adapt for their own backtest results."""
    if not EXAMPLE_PATH.exists():
        raise HTTPException(status_code=500, detail="Example template not found on server")
    return json.loads(EXAMPLE_PATH.read_text())


class AdminBacktestSummary(BaseModel):
    id: str
    code: str
    name: str
    status: str
    engine: str
    completed_at: datetime | None
    created_at: datetime


@router.get("/clients/{client_id}/backtests", response_model=list[AdminBacktestSummary])
def list_client_backtests(
    client_id: uuid.UUID,
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Admin per-client backtest listing. Powers the status-change dropdown
    in the admin client drawer - admins need to see every backtest at a
    glance and flip its status without hunting through the general list.
    """
    rows = (
        db.query(Backtest)
        .filter(Backtest.client_id == client_id)
        .order_by(Backtest.created_at.desc())
        .all()
    )
    return [
        AdminBacktestSummary(
            id=str(r.id),
            code=r.code,
            name=r.name,
            status=r.status,
            engine=r.engine,
            completed_at=r.completed_at,
            created_at=r.created_at,
        )
        for r in rows
    ]


class UploadResultIn(BaseModel):
    client_id: str
    result: dict  # full v1.0 JSON
    strategy_id: str | None = None  # optional FK to strategy_documents.id


class UploadResultOut(BaseModel):
    backtest_id: str
    code: str
    name: str
    storage_key: str
    strategy_version_id: str | None = None


@router.post("/backtests/upload-result", response_model=UploadResultOut, status_code=201)
def upload_backtest_result(
    payload: UploadResultIn,
    request: Request,
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Validate the uploaded JSON against the locked v1.0 schema, persist to bucket,
    and create a backtests row + backtest_files row."""
    # 1. Schema validation
    schema = _load_schema()
    errors = list(Draft202012Validator(schema).iter_errors(payload.result))
    if errors:
        violations = [
            {"path": "/".join(str(p) for p in e.absolute_path), "message": e.message}
            for e in errors[:25]
        ]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Schema validation failed", "violations": violations},
        )

    # 1b. Cross-field consistency: trade list length must match summary n_trades
    summary = payload.result.get("metrics", {}).get("summary", {})
    trades = payload.result.get("trades", [])
    if "n_trades" in summary and summary["n_trades"] != len(trades):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Internal consistency check failed",
                "violations": [{
                    "path": "metrics.summary.n_trades",
                    "message": f"summary.n_trades={summary['n_trades']} but len(trades)={len(trades)}",
                }],
            },
        )

    # 2. Resolve target client + honor its tier's monthly backtest cap. Admin
    #    uploads on-behalf still count against the client's plan — otherwise
    #    admins would silently side-step the limit that the client is billed on.
    client_uuid = uuid.UUID(payload.client_id)
    client = db.query(Client).filter(Client.id == client_uuid, Client.deleted_at.is_(None)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    check_backtest_limit_for_client(client_uuid, db)

    # 2b. Resolve optional strategy_id — must belong to this client (cross-tenant guard)
    from app.db.models import StrategyDocument

    strategy_version_id = None
    if payload.strategy_id:
        try:
            sid = uuid.UUID(payload.strategy_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="strategy_id is not a valid UUID")
        sdoc = (
            db.query(StrategyDocument)
            .filter(StrategyDocument.id == sid, StrategyDocument.client_id == client.id)
            .first()
        )
        if not sdoc:
            raise HTTPException(
                status_code=404,
                detail="Strategy not found, or it does not belong to the target client",
            )
        strategy_version_id = sdoc.id

    # 3. Stamp client into payload, serialise, upload to bucket
    payload.result["client"] = {"client_id": str(client.id), "client_name": client.name}
    raw = json.dumps(payload.result, ensure_ascii=False).encode("utf-8")
    checksum = hashlib.sha256(raw).hexdigest()

    bt_id = uuid.uuid4()
    storage_key = f"clients/{client.id}/backtests/{bt_id}/result.json"
    storage.upload_bytes(storage_key, raw, "application/json")

    # 4. Insert DB rows
    backtest = Backtest(
        id=bt_id,
        client_id=client.id,
        strategy_version_id=strategy_version_id,
        name=payload.result["strategy"]["name"],
        code=payload.result["backtest_id"],
        status="completed",
        assumptions=payload.result["assumptions"],
        metrics=payload.result["metrics"],
        completed_at=datetime.now(timezone.utc),
    )
    db.add(backtest)
    db.flush()
    bf = BacktestFile(
        backtest_id=backtest.id,
        file_type="result_json",
        storage_key=storage_key,
        size_bytes=len(raw),
        checksum=checksum,
    )
    db.add(bf)

    audit.record(
        db,
        actor_user_id=admin.id,
        action="backtest.result.upload",
        target_type="backtest",
        target_id=backtest.id,
        payload={
            "client_id": str(client.id),
            "code": backtest.code,
            "name": backtest.name,
            "size_bytes": len(raw),
        },
        ip=request.client.host if request.client else None,
    )

    # Auto-notify the client that their real (non-demo) backtest is
    # ready. Failure is swallowed by the notify helper. (Audit PB2.)
    notify.backtest_delivered(
        db,
        client_id=client.id,
        backtest_id=backtest.id,
        code=backtest.code,
        name=backtest.name,
    )

    db.commit()
    logger.info("Admin uploaded backtest {} for client {}", backtest.code, client.name)

    return UploadResultOut(
        backtest_id=str(backtest.id),
        code=backtest.code,
        name=backtest.name,
        storage_key=storage_key,
        strategy_version_id=str(strategy_version_id) if strategy_version_id else None,
    )


# ─── Status transitions ────────────────────────────────────────────
# Legal lifecycle graph. Not strictly required (admin is trusted), but the map
# blocks the common footgun where an admin fat-fingers "completed" on a draft
# backtest and skips 5 statuses. Pass `override=true` in the body to bypass.
_LEGAL_TRANSITIONS: dict[str, set[str]] = {
    "draft":              {"quote_requested", "cancelled"},
    "quote_requested":    {"quote_sent", "cancelled"},
    "quote_sent":         {"approved", "cancelled"},
    "approved":           {"in_progress", "cancelled"},
    "in_progress":        {"completed", "revision_requested", "cancelled"},
    "completed":          {"revision_requested"},
    "revision_requested": {"in_progress", "cancelled"},
    "cancelled":          set(),  # terminal
}
_VALID_STATUSES = set(_LEGAL_TRANSITIONS.keys())


class StatusChangeIn(BaseModel):
    new_status: str
    note: str | None = None
    override: bool = False   # bypass the transition map if the admin knows better


class StatusChangeOut(BaseModel):
    ok: bool
    backtest_id: str
    from_status: str
    to_status: str


@router.post("/backtests/{backtest_id}/status", response_model=StatusChangeOut)
def change_backtest_status(
    backtest_id: uuid.UUID,
    payload: StatusChangeIn,
    request: Request,
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    if payload.new_status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{payload.new_status}'. Must be one of: {sorted(_VALID_STATUSES)}",
        )

    row = db.query(Backtest).filter(Backtest.id == backtest_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Backtest not found")

    from_status = row.status
    if from_status == payload.new_status:
        # No-op, but not an error — return the current state.
        return StatusChangeOut(ok=True, backtest_id=str(row.id), from_status=from_status, to_status=from_status)

    if not payload.override:
        allowed = _LEGAL_TRANSITIONS.get(from_status, set())
        if payload.new_status not in allowed:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Illegal transition {from_status} → {payload.new_status}. "
                    f"Allowed from '{from_status}': {sorted(allowed) or ['(terminal)']}. "
                    f"Pass override=true to force."
                ),
            )

    row.status = payload.new_status
    # If we're marking completed, stamp completed_at (unless already set — preserve
    # historical timestamps if an admin flips completed → revision_requested → completed).
    if payload.new_status == "completed" and row.completed_at is None:
        row.completed_at = datetime.now(timezone.utc)

    # Auto-notify the client about the status change (audit PB2). Only
    # fires on client-meaningful transitions and only for non-demo rows.
    if not row.is_demo:
        if payload.new_status == "completed" and from_status != "completed":
            notify.backtest_delivered(
                db,
                client_id=row.client_id,
                backtest_id=row.id,
                code=row.code,
                name=row.name,
            )
        else:
            notify.backtest_status_changed(
                db,
                client_id=row.client_id,
                backtest_id=row.id,
                code=row.code,
                from_status=from_status,
                to_status=payload.new_status,
            )

    audit.record(
        db,
        actor_user_id=admin.id,
        action="backtest.status.change",
        target_type="backtest",
        target_id=row.id,
        payload={
            "from": from_status,
            "to": payload.new_status,
            "override": payload.override,
            "note": payload.note,
            "client_id": str(row.client_id),
            "code": row.code,
        },
        ip=request.client.host if request.client else None,
    )
    db.commit()
    logger.info(
        "Admin changed backtest {} status: {} → {}{}",
        row.code, from_status, payload.new_status,
        " (override)" if payload.override else "",
    )
    return StatusChangeOut(
        ok=True,
        backtest_id=str(row.id),
        from_status=from_status,
        to_status=payload.new_status,
    )
