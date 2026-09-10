from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Client, Notification, User
from app.db.session import get_db
from app.services import audit

router = APIRouter()


class BroadcastIn(BaseModel):
    title: str
    body: str
    kind: Literal["broadcast", "system"] = "broadcast"


class PersonalIn(BaseModel):
    client_id: str
    title: str
    body: str
    kind: Literal["backtest", "quote", "request", "tnc", "system"] = "system"


class NotifOut(BaseModel):
    id: str
    recipient_user_id: str | None
    kind: str
    title: str
    body: str
    created_at: datetime


@router.post("/notifications/broadcast", response_model=NotifOut, status_code=201)
def broadcast(
    payload: BroadcastIn,
    request: Request,
    admin=Depends(require_role("main_admin")),
    db: Session = Depends(get_db),
):
    n = Notification(
        recipient_user_id=None,  # null = broadcast, every client sees it
        kind=payload.kind,
        title=payload.title,
        body=payload.body,
    )
    db.add(n)
    db.flush()
    audit.record(
        db,
        actor_user_id=admin.id,
        action="notification.broadcast",
        target_type="notification",
        target_id=n.id,
        payload={"title": payload.title},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return NotifOut(
        id=str(n.id),
        recipient_user_id=None,
        kind=n.kind,
        title=n.title,
        body=n.body,
        created_at=n.created_at,
    )


@router.post("/notifications/personal", response_model=list[NotifOut], status_code=201)
def personal(
    payload: PersonalIn,
    request: Request,
    admin=Depends(require_role("main_admin")),
    db: Session = Depends(get_db),
):
    """Sends to every active user under the given client_id."""
    client_uuid = uuid.UUID(payload.client_id)
    users = (
        db.query(User)
        .filter(User.client_id == client_uuid, User.status == "active", User.deleted_at.is_(None))
        .all()
    )
    if not users:
        raise HTTPException(status_code=404, detail="No active users under that client")

    out: list[NotifOut] = []
    for u in users:
        n = Notification(
            recipient_user_id=u.id,
            kind=payload.kind,
            title=payload.title,
            body=payload.body,
        )
        db.add(n)
        db.flush()
        out.append(
            NotifOut(
                id=str(n.id),
                recipient_user_id=str(u.id),
                kind=n.kind,
                title=n.title,
                body=n.body,
                created_at=n.created_at,
            )
        )
    audit.record(
        db,
        actor_user_id=admin.id,
        action="notification.personal",
        target_type="client",
        target_id=client_uuid,
        payload={"title": payload.title, "n_recipients": len(out)},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return out
