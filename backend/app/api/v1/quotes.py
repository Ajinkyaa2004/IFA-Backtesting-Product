"""Client-side quote endpoints.

Clients see quotes admins have issued to them (status='sent') and can
accept or reject. Draft quotes are admin-only and never returned here.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Quote, Service, User
from app.db.session import get_db
from app.services import audit

router = APIRouter()


class QuoteOut(BaseModel):
    id: str
    code: str
    title: str
    description: str | None
    amount_inr: int
    currency: str
    status: str
    service_code: str | None
    service_name: str | None
    sent_at: datetime | None
    valid_until: datetime | None
    accepted_at: datetime | None
    rejected_at: datetime | None
    created_at: datetime


def _to_out(q: Quote, service: Service | None) -> QuoteOut:
    return QuoteOut(
        id=str(q.id),
        code=q.code,
        title=q.title,
        description=q.description,
        amount_inr=q.amount_inr,
        currency=q.currency,
        status=q.status,
        service_code=service.code if service else None,
        service_name=service.name if service else None,
        sent_at=q.sent_at,
        valid_until=q.valid_until,
        accepted_at=q.accepted_at,
        rejected_at=q.rejected_at,
        created_at=q.created_at,
    )


@router.get("/quotes", response_model=list[QuoteOut])
def list_my_quotes(
    me: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    """Every quote for this client except drafts (drafts are admin-internal)."""
    if me.client_id is None:
        return []
    rows = (
        db.query(Quote, Service)
        .outerjoin(Service, Service.id == Quote.service_id)
        .filter(Quote.client_id == me.client_id)
        .filter(Quote.status != "draft")
        .order_by(Quote.created_at.desc())
        .all()
    )
    return [_to_out(q, s) for q, s in rows]


def _get_client_quote(quote_id: uuid.UUID, me: User, db: Session) -> Quote:
    q = db.query(Quote).filter(Quote.id == quote_id, Quote.client_id == me.client_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return q


@router.post("/quotes/{quote_id}/accept", response_model=QuoteOut)
def accept_quote(
    quote_id: uuid.UUID,
    request: Request,
    me: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    q = _get_client_quote(quote_id, me, db)
    if q.status != "sent":
        raise HTTPException(status_code=409, detail=f"Cannot accept a quote in status '{q.status}'")
    if q.valid_until and q.valid_until < datetime.utcnow().astimezone(q.valid_until.tzinfo):
        q.status = "expired"
        db.commit()
        raise HTTPException(status_code=409, detail="Quote has expired")

    q.status = "accepted"
    q.accepted_at = datetime.utcnow()
    audit.record(
        db, actor_user_id=me.id, action="quote.accept",
        target_type="quote", target_id=q.id,
        payload={"code": q.code, "amount_inr": q.amount_inr},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(q)
    service = db.query(Service).filter(Service.id == q.service_id).first() if q.service_id else None
    return _to_out(q, service)


class RejectIn(BaseModel):
    reason: str | None = None


@router.post("/quotes/{quote_id}/reject", response_model=QuoteOut)
def reject_quote(
    quote_id: uuid.UUID,
    payload: RejectIn,
    request: Request,
    me: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    q = _get_client_quote(quote_id, me, db)
    if q.status != "sent":
        raise HTTPException(status_code=409, detail=f"Cannot reject a quote in status '{q.status}'")
    q.status = "rejected"
    q.rejected_at = datetime.utcnow()
    audit.record(
        db, actor_user_id=me.id, action="quote.reject",
        target_type="quote", target_id=q.id,
        payload={"code": q.code, "reason": payload.reason},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(q)
    service = db.query(Service).filter(Service.id == q.service_id).first() if q.service_id else None
    return _to_out(q, service)
