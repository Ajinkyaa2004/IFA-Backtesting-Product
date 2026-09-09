"""Admin quote CRUD (meeting 2026-07-09).

Admin composes a quote → optionally saves as draft → sends. Client sees
sent quotes in their dashboard. Payment happens on Upwork; the quote is
the mechanism to formally accept scope + amount inside the portal.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Client, Quote, Service, User
from app.db.session import get_db
from app.services import audit, notify

router = APIRouter()


class QuoteAdminOut(BaseModel):
    id: str
    code: str
    client_id: str
    client_name: str | None
    service_id: str | None
    service_code: str | None
    service_name: str | None
    title: str
    description: str | None
    amount_inr: int
    currency: str
    status: str
    valid_until: datetime | None
    sent_at: datetime | None
    accepted_at: datetime | None
    rejected_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class QuoteCreateIn(BaseModel):
    service_id: str | None = None
    title: str = Field(..., min_length=3, max_length=200)
    description: str | None = None
    amount_inr: int = Field(..., ge=0)
    valid_until: datetime | None = None
    notes: str | None = None


class QuotePatchIn(BaseModel):
    service_id: str | None = None
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = None
    amount_inr: int | None = Field(default=None, ge=0)
    status: Literal["draft", "sent", "accepted", "rejected", "expired"] | None = None
    valid_until: datetime | None = None
    notes: str | None = None


def _to_out(q: Quote, client: Client | None, service: Service | None) -> QuoteAdminOut:
    return QuoteAdminOut(
        id=str(q.id),
        code=q.code,
        client_id=str(q.client_id),
        client_name=client.name if client else None,
        service_id=str(q.service_id) if q.service_id else None,
        service_code=service.code if service else None,
        service_name=service.name if service else None,
        title=q.title,
        description=q.description,
        amount_inr=q.amount_inr,
        currency=q.currency,
        status=q.status,
        valid_until=q.valid_until,
        sent_at=q.sent_at,
        accepted_at=q.accepted_at,
        rejected_at=q.rejected_at,
        notes=q.notes,
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


def _next_quote_code(db: Session) -> str:
    year = datetime.utcnow().year
    count = db.query(func.count(Quote.id)).filter(
        func.extract("year", Quote.created_at) == year
    ).scalar() or 0
    return f"QT-{year}-{count + 1:04d}"


@router.get("/clients/{client_id}/quotes", response_model=list[QuoteAdminOut])
def list_quotes_for_client(
    client_id: uuid.UUID,
    _admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Quote, Client, Service)
        .outerjoin(Client, Client.id == Quote.client_id)
        .outerjoin(Service, Service.id == Quote.service_id)
        .filter(Quote.client_id == client_id)
        .order_by(Quote.created_at.desc())
        .all()
    )
    return [_to_out(q, c, s) for q, c, s in rows]


@router.post("/clients/{client_id}/quotes", response_model=QuoteAdminOut, status_code=201)
def create_quote(
    client_id: uuid.UUID,
    payload: QuoteCreateIn,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    service = None
    if payload.service_id:
        service = db.query(Service).filter(Service.id == uuid.UUID(payload.service_id)).first()
        if not service:
            raise HTTPException(status_code=400, detail="Unknown service_id")

    q = Quote(
        code=_next_quote_code(db),
        client_id=client_id,
        service_id=service.id if service else None,
        title=payload.title,
        description=payload.description,
        amount_inr=payload.amount_inr,
        currency="INR",
        status="draft",
        valid_until=payload.valid_until,
        notes=payload.notes,
    )
    db.add(q)
    db.flush()
    audit.record(
        db, actor_user_id=admin.id, action="quote.create",
        target_type="quote", target_id=q.id,
        payload={"client_id": str(client_id), "code": q.code, "amount_inr": q.amount_inr, "service_id": payload.service_id},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(q)
    return _to_out(q, client, service)


@router.patch("/quotes/{quote_id}", response_model=QuoteAdminOut)
def patch_quote(
    quote_id: uuid.UUID,
    payload: QuotePatchIn,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        client = db.query(Client).filter(Client.id == q.client_id).first()
        service = db.query(Service).filter(Service.id == q.service_id).first() if q.service_id else None
        return _to_out(q, client, service)

    before = {"status": q.status, "amount_inr": q.amount_inr, "title": q.title}

    for k, v in changes.items():
        if k == "service_id":
            setattr(q, k, uuid.UUID(v) if v else None)
        elif k == "status" and v == "sent" and q.status == "draft":
            q.status = "sent"
            q.sent_at = datetime.utcnow()
        else:
            setattr(q, k, v)

    audit.record(
        db, actor_user_id=admin.id, action="quote.update",
        target_type="quote", target_id=q.id,
        payload={"code": q.code, "before": before, "changes": changes},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(q)
    client = db.query(Client).filter(Client.id == q.client_id).first()
    service = db.query(Service).filter(Service.id == q.service_id).first() if q.service_id else None
    return _to_out(q, client, service)


@router.post("/quotes/{quote_id}/send", response_model=QuoteAdminOut)
def send_quote(
    quote_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status != "draft":
        raise HTTPException(status_code=409, detail=f"Only drafts can be sent (this is '{q.status}')")
    q.status = "sent"
    q.sent_at = datetime.utcnow()
    audit.record(
        db, actor_user_id=admin.id, action="quote.send",
        target_type="quote", target_id=q.id,
        payload={"code": q.code, "amount_inr": q.amount_inr},
        ip=request.client.host if request.client else None,
    )
    # Notify the client — same transaction so the state flip and the
    # signal always land together. (Audit PB2.)
    notify.quote_sent(
        db, client_id=q.client_id, quote_id=q.id, code=q.code, title_str=q.title,
    )
    db.commit()
    db.refresh(q)
    client = db.query(Client).filter(Client.id == q.client_id).first()
    service = db.query(Service).filter(Service.id == q.service_id).first() if q.service_id else None
    return _to_out(q, client, service)
