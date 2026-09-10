"""Admin impersonation endpoints - Phase 4.5 Day 4.

Two thin endpoints that bracket a support session. The actual impersonation
happens client-side (the admin's frontend sends an X-Impersonate-Client-Id
header on every request), which app/core/deps.client_scope honors. These
endpoints exist purely to:
  * validate the target client exists before the UI stores its id, and
  * write a clean audit-log start/end pair so we can answer 'when did
    ops staff view whose data' after the fact.

Session boundary is intentionally client-side + audit-log. We do NOT need
a server-side session table for MVP: the admin's Firebase ID token is still
required on every impersonated request, so revoking their token immediately
kills any in-flight impersonation.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Client, User
from app.db.session import get_db
from app.services import audit

router = APIRouter()


class ImpersonateStartOut(BaseModel):
    client_id: str
    client_name: str
    tier: str
    started_at: datetime


class ImpersonateExitOut(BaseModel):
    ok: bool
    client_id: str
    client_name: str


@router.post("/impersonate/{client_id}", response_model=ImpersonateStartOut)
def start_impersonation(
    client_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_role("main_admin")),
    db: Session = Depends(get_db),
):
    """Validate + audit-log the start of a support impersonation session."""
    client = (
        db.query(Client)
        .filter(Client.id == client_id, Client.deleted_at.is_(None))
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    now = datetime.utcnow()
    audit.record(
        db,
        actor_user_id=admin.id,
        action="admin.impersonate.start",
        target_type="client",
        target_id=client.id,
        payload={
            "client_name": client.name,
            "tier": client.tier,
        },
        ip=request.client.host if request.client else None,
    )
    db.commit()

    return ImpersonateStartOut(
        client_id=str(client.id),
        client_name=client.name,
        tier=client.tier,
        started_at=now,
    )


@router.post("/impersonate/{client_id}/exit", response_model=ImpersonateExitOut)
def exit_impersonation(
    client_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Audit-log the end of an impersonation session.

    Deliberately not 404 if the client no longer exists - we still want a
    clean stop record, even if the client was hard-deleted between start
    and end (unlikely but possible during a soft-delete-then-purge flow).
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    client_name = client.name if client else "(unknown/deleted)"

    audit.record(
        db,
        actor_user_id=admin.id,
        action="admin.impersonate.exit",
        target_type="client",
        target_id=client_id,
        payload={"client_name": client_name},
        ip=request.client.host if request.client else None,
    )
    db.commit()

    return ImpersonateExitOut(ok=True, client_id=str(client_id), client_name=client_name)
