"""Admin engine registry (Chirag Items #3 + #6).

    GET    /admin/engines                       list all engines
    POST   /admin/engines                       create
    GET    /admin/engines/{id}                  detail
    PATCH  /admin/engines/{id}                  edit non-status fields
    POST   /admin/engines/{id}/isolation-pass   record isolation test pass (Item #6)
    POST   /admin/engines/{id}/status           transition status
                                                (dev → isolation_pending → live
                                                 → retired). Cannot reach 'live'
                                                without isolation_passed_at set.

Every mutation is audit-logged.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Engagement, Engine, User
from app.db.session import get_db
from app.services import audit

router = APIRouter()


class EngineOut(BaseModel):
    id: str
    code: str
    name: str
    owner_email: str
    strategy_family: str
    status: str
    covers: str
    param_schema: dict
    isolation_passed_at: datetime | None
    isolation_notes: str
    created_at: datetime
    updated_at: datetime


class EngineCreate(BaseModel):
    code: str = Field(min_length=3, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    owner_email: EmailStr
    strategy_family: str = Field(min_length=1, max_length=64)
    covers: str = Field(default="", max_length=4000)
    param_schema: dict = Field(default_factory=dict)


class EnginePatch(BaseModel):
    name: str | None = None
    owner_email: EmailStr | None = None
    strategy_family: str | None = None
    covers: str | None = None
    param_schema: dict | None = None


class IsolationPassIn(BaseModel):
    notes: str = Field(min_length=1, max_length=4000)


class StatusTransitionIn(BaseModel):
    new_status: Literal["dev", "isolation_pending", "live", "retired"]


def _to_out(e: Engine) -> EngineOut:
    return EngineOut(
        id=str(e.id),
        code=e.code,
        name=e.name,
        owner_email=e.owner_email,
        strategy_family=e.strategy_family,
        status=e.status,
        covers=e.covers,
        param_schema=e.param_schema or {},
        isolation_passed_at=e.isolation_passed_at,
        isolation_notes=e.isolation_notes,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


@router.get("/engines", response_model=list[EngineOut])
def list_engines(
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    rows = db.query(Engine).order_by(Engine.created_at.desc()).all()
    return [_to_out(e) for e in rows]


@router.post("/engines", response_model=EngineOut, status_code=201)
def create_engine(
    payload: EngineCreate,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    if db.query(Engine).filter(Engine.code == payload.code).first():
        raise HTTPException(status_code=409, detail=f"Engine code already exists: {payload.code}")
    row = Engine(
        code=payload.code,
        name=payload.name,
        owner_email=payload.owner_email,
        strategy_family=payload.strategy_family,
        covers=payload.covers,
        param_schema=payload.param_schema,
    )
    db.add(row)
    db.flush()
    audit.record(
        db,
        actor_user_id=admin.id,
        action="engine.create",
        target_type="engine",
        target_id=row.id,
        payload={"code": payload.code, "family": payload.strategy_family},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return _to_out(row)


@router.get("/engines/{engine_id}", response_model=EngineOut)
def get_engine(
    engine_id: uuid.UUID,
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    row = db.query(Engine).filter(Engine.id == engine_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Engine not found")
    return _to_out(row)


@router.patch("/engines/{engine_id}", response_model=EngineOut)
def patch_engine(
    engine_id: uuid.UUID,
    payload: EnginePatch,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    row = db.query(Engine).filter(Engine.id == engine_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Engine not found")
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        return _to_out(row)
    for k, v in changes.items():
        setattr(row, k, v)
    audit.record(
        db,
        actor_user_id=admin.id,
        action="engine.update",
        target_type="engine",
        target_id=row.id,
        payload={"changes": list(changes.keys())},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/engines/{engine_id}/isolation-pass", response_model=EngineOut)
def mark_isolation_passed(
    engine_id: uuid.UUID,
    payload: IsolationPassIn,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Chirag Item #6 — the hard gate before an engine can go live.

    Admin records that the isolation harness passed (no writes outside
    its scope, no other-tenant reads, no live-market side effects).
    isolation_passed_at is stamped; notes preserved for the audit trail.
    Idempotent — subsequent calls overwrite notes.
    """
    row = db.query(Engine).filter(Engine.id == engine_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Engine not found")
    row.isolation_passed_at = datetime.now(timezone.utc)
    row.isolation_notes = payload.notes
    audit.record(
        db,
        actor_user_id=admin.id,
        action="engine.isolation.pass",
        target_type="engine",
        target_id=row.id,
        payload={"code": row.code, "notes_len": len(payload.notes)},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


_LEGAL_TRANSITIONS: dict[str, set[str]] = {
    "dev":                {"isolation_pending", "retired"},
    "isolation_pending":  {"live", "dev", "retired"},
    "live":               {"retired"},
    "retired":            set(),
}


@router.post("/engines/{engine_id}/status", response_model=EngineOut)
def transition_status(
    engine_id: uuid.UUID,
    payload: StatusTransitionIn,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Move an engine through its lifecycle.

    The critical guard (Chirag Item #6): status cannot become 'live'
    without isolation_passed_at set. This is the hard block before a
    real tenant sees the engine.
    """
    row = db.query(Engine).filter(Engine.id == engine_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Engine not found")
    prev = row.status
    target = payload.new_status
    if target == prev:
        return _to_out(row)
    if target not in _LEGAL_TRANSITIONS.get(prev, set()):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Illegal transition {prev} → {target}. "
                f"Allowed: {sorted(_LEGAL_TRANSITIONS.get(prev, set())) or ['(terminal)']}"
            ),
        )
    if target == "live" and row.isolation_passed_at is None:
        raise HTTPException(
            status_code=409,
            detail="Cannot go live: isolation harness must pass first. Call /admin/engines/{id}/isolation-pass.",
        )
    row.status = target
    audit.record(
        db,
        actor_user_id=admin.id,
        action="engine.status.transition",
        target_type="engine",
        target_id=row.id,
        payload={"from": prev, "to": target, "code": row.code},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)
