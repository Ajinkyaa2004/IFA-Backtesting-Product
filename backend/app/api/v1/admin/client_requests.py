"""Admin: per-client request feed + status updates.

Lets admin see ALL requests for a given client (not just opens) and move
their status forward. Until this file's PATCH endpoint landed, every
client request stayed on status='open' forever from the client's POV,
even after admin had quoted or delivered work against it. (Audit PB3.)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Client, Request as Req, User
from app.db.session import get_db
from app.services import audit, notify

router = APIRouter()


class RequestAdminOut(BaseModel):
    id: str
    type: str
    status: str
    payload: dict
    strategy_id: str | None
    submitted_at: datetime


@router.get("/clients/{client_id}/requests", response_model=list[RequestAdminOut])
def list_client_requests(
    client_id: uuid.UUID,
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    rows = (
        db.query(Req)
        .filter(Req.client_id == client_id)
        .order_by(desc(Req.created_at))
        .all()
    )
    return [
        RequestAdminOut(
            id=str(r.id),
            type=r.type,
            status=r.status,
            payload=r.payload or {},
            strategy_id=str(r.strategy_id) if r.strategy_id else None,
            submitted_at=r.created_at,
        )
        for r in rows
    ]


REQUEST_STATUSES = ("open", "in_review", "quoted", "resolved", "rejected")


class RequestStatusPatch(BaseModel):
    status: Literal["open", "in_review", "quoted", "resolved", "rejected"]
    note: str | None = Field(default=None, max_length=1000)


@router.patch("/requests/{request_id}", response_model=RequestAdminOut)
def update_request_status(
    request_id: uuid.UUID,
    payload: RequestStatusPatch,
    http_request: FastAPIRequest,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Move a client request through its lifecycle.

    Fires a Notification to the client on every meaningful transition so
    they don't have to poll the dashboard. Audits the change with the
    admin's id + optional note. (Audit PB3 + PB2.)
    """
    row = db.query(Req).filter(Req.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")

    from_status = row.status
    to_status = payload.status
    if from_status == to_status:
        return RequestAdminOut(
            id=str(row.id),
            type=row.type,
            status=row.status,
            payload=row.payload or {},
            strategy_id=str(row.strategy_id) if row.strategy_id else None,
            submitted_at=row.created_at,
        )

    row.status = to_status
    if to_status in ("resolved", "rejected") and row.resolved_at is None:
        row.resolved_at = datetime.now(timezone.utc)

    audit.record(
        db,
        actor_user_id=admin.id,
        action="request.status.change",
        target_type="request",
        target_id=row.id,
        payload={
            "from": from_status,
            "to": to_status,
            "client_id": str(row.client_id),
            "note": payload.note,
        },
        ip=http_request.client.host if http_request.client else None,
    )
    notify.request_status_changed(
        db,
        client_id=row.client_id,
        request_id=row.id,
        request_type=row.type,
        from_status=from_status,
        to_status=to_status,
    )
    db.commit()
    db.refresh(row)
    return RequestAdminOut(
        id=str(row.id),
        type=row.type,
        status=row.status,
        payload=row.payload or {},
        strategy_id=str(row.strategy_id) if row.strategy_id else None,
        submitted_at=row.created_at,
    )
