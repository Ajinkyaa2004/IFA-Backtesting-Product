from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import AuditLog, User
from app.db.session import get_db

router = APIRouter()


class AuditOut(BaseModel):
    id: str
    actor_user_id: str | None
    actor_email: str | None
    action: str
    target_type: str | None
    target_id: str | None
    payload: dict | None
    ip: str | None
    occurred_at: datetime


@router.get("/audit", response_model=list[AuditOut])
def list_audit(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    action_prefix: str | None = None,
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog, User.email).outerjoin(User, User.id == AuditLog.actor_user_id)
    if action_prefix:
        q = q.filter(AuditLog.action.startswith(action_prefix))
    rows = q.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit).all()
    return [
        AuditOut(
            id=str(a.id),
            actor_user_id=str(a.actor_user_id) if a.actor_user_id else None,
            actor_email=email,
            action=a.action,
            target_type=a.target_type,
            target_id=str(a.target_id) if a.target_id else None,
            payload=a.payload,
            ip=a.ip,
            occurred_at=a.created_at,
        )
        for a, email in rows
    ]
