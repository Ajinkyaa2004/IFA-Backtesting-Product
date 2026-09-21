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
from app.services import audit, quote_files, storage
from app.services.quote_files import QuoteFileDownloadOut, QuoteFileOut

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
    files: list[QuoteFileOut]
    """Proposal documents, newest revision first. Sent revisions only."""
    created_at: datetime


def _to_out(q: Quote, service: Service | None, files: list[QuoteFileOut]) -> QuoteOut:
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
        files=files,
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
    files = quote_files.client_files(db, [q.id for q, _ in rows])
    return [_to_out(q, s, files[q.id]) for q, s in rows]


def _get_client_quote(quote_id: uuid.UUID, me: User, db: Session, *, lock: bool = False) -> Quote:
    query = db.query(Quote).filter(Quote.id == quote_id, Quote.client_id == me.client_id)
    if lock:
        # Serialises against an admin uploading a new proposal revision.
        query = query.with_for_update()
    q = query.first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    return q


class AcceptIn(BaseModel):
    revision: int | None = None
    """The proposal revision the client was looking at (0 = no file shown).
    When given, accept is refused if a newer revision has been sent since, so
    nobody accepts a proposal they haven't seen. Omit to skip the check."""


@router.post("/quotes/{quote_id}/accept", response_model=QuoteOut)
def accept_quote(
    quote_id: uuid.UUID,
    request: Request,
    payload: AcceptIn | None = None,
    me: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    q = _get_client_quote(quote_id, me, db, lock=True)
    if q.status != "sent":
        raise HTTPException(status_code=409, detail=f"Cannot accept a quote in status '{q.status}'")
    if q.valid_until and q.valid_until < datetime.utcnow().astimezone(q.valid_until.tzinfo):
        q.status = "expired"
        db.commit()
        raise HTTPException(status_code=409, detail="Quote has expired")
    latest = quote_files.latest_revision(db, q.id)
    if payload and payload.revision is not None and payload.revision != latest:
        raise HTTPException(
            status_code=409,
            detail=(
                "The proposal was updated while you were reviewing it. "
                "Please review the latest revision, then accept."
            ),
        )

    q.status = "accepted"
    q.accepted_at = datetime.utcnow()
    audit.record(
        db, actor_user_id=me.id, action="quote.accept",
        target_type="quote", target_id=q.id,
        payload={"code": q.code, "amount_inr": q.amount_inr, "currency": q.currency, "accepted_revision": latest or None},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(q)
    service = db.query(Service).filter(Service.id == q.service_id).first() if q.service_id else None
    return _to_out(q, service, quote_files.client_files(db, [q.id])[q.id])


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
    q = _get_client_quote(quote_id, me, db, lock=True)
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
    return _to_out(q, service, quote_files.client_files(db, [q.id])[q.id])


@router.get("/quotes/{quote_id}/files/{file_id}/download-url", response_model=QuoteFileDownloadOut)
def get_quote_file_download_url(
    quote_id: uuid.UUID,
    file_id: uuid.UUID,
    request: Request,
    me: User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    """Signed URL for one proposal revision on the caller's own quote.

    Cross-tenant safe: the quote lookup filters by the caller's client_id.
    Drafts and unsent working copies are indistinguishable from "not found".
    Older revisions stay downloadable so the client can compare or keep them.
    """
    q = _get_client_quote(quote_id, me, db)
    if q.status == "draft":
        raise HTTPException(status_code=404, detail="File not found")
    row = quote_files.published_file(db, q.id, file_id)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    expires_in = 300  # 5 minutes
    audit.record(
        db, actor_user_id=me.id, action="quote.file.download_url",
        target_type="quote", target_id=q.id,
        payload={"code": q.code, "file_id": str(row.id), "revision": row.revision, "filename": row.filename},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return QuoteFileDownloadOut(
        signed_url=storage.signed_download_url(row.storage_key, expires_in=expires_in),
        expires_in=expires_in,
    )
