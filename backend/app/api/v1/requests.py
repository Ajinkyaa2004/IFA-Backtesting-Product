from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import client_scope, current_user
from app.db.models import Request as RequestRow
from app.db.models import User
from app.db.session import get_db
from app.services import audit

router = APIRouter()

RequestType = Literal["new_strategy", "change", "quote", "clarification"]


class RequestIn(BaseModel):
    type: RequestType
    payload: dict
    strategy_id: str | None = None


class RequestOut(BaseModel):
    id: str
    type: str
    status: str
    payload: dict
    strategy_id: str | None
    submitted_at: datetime


@router.get("/requests", response_model=list[RequestOut])
def list_requests(
    client_id: uuid.UUID = Depends(client_scope), db: Session = Depends(get_db)
):
    rows = (
        db.query(RequestRow)
        .filter(RequestRow.client_id == client_id)
        .order_by(desc(RequestRow.created_at))
        .all()
    )
    return [
        RequestOut(
            id=str(r.id),
            type=r.type,
            status=r.status,
            payload=r.payload or {},
            strategy_id=str(r.strategy_id) if r.strategy_id else None,
            submitted_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/requests", response_model=RequestOut)
def submit_request(
    payload: RequestIn,
    request: Request,
    user: User = Depends(current_user),
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
):
    # Chirag Item #7: summary is required OR we auto-fill from strategy name
    # + type. Prevents the admin inbox from showing "(no summary)" rows.
    summary = (payload.payload.get("summary") or "").strip()
    if not summary:
        # Auto-fill fallback: use a short title from strategy name + request type.
        from app.db.models import StrategyDocument
        strategy_name = ""
        if payload.strategy_id:
            try:
                sid = uuid.UUID(payload.strategy_id)
                sdoc = db.query(StrategyDocument).filter(StrategyDocument.id == sid).first()
                if sdoc:
                    strategy_name = sdoc.name
            except ValueError:
                pass
        type_labels = {
            "new_strategy":  "New strategy",
            "change":        "Change request",
            "quote":         "Request for quote",
            "clarification": "Clarification",
        }
        auto = f"{type_labels.get(payload.type, payload.type)}"
        if strategy_name:
            auto = f"{auto} · {strategy_name}"
        if not auto:
            raise HTTPException(
                status_code=422,
                detail="Request needs a summary. Add one to payload.summary.",
            )
        payload.payload = {**payload.payload, "summary": auto}

    row = RequestRow(
        client_id=client_id,
        type=payload.type,
        payload=payload.payload,
        strategy_id=uuid.UUID(payload.strategy_id) if payload.strategy_id else None,
        status="open",
        submitted_by=user.id,
    )
    db.add(row)
    db.flush()

    audit.record(
        db,
        actor_user_id=user.id,
        action=f"request.submit.{payload.type}",
        target_type="request",
        target_id=row.id,
        payload={"type": payload.type, "summary": payload.payload.get("summary", "")[:200]},
        ip=request.client.host if request.client else None,
    )
    db.commit()

    return RequestOut(
        id=str(row.id),
        type=row.type,
        status=row.status,
        payload=row.payload,
        strategy_id=str(row.strategy_id) if row.strategy_id else None,
        submitted_at=row.created_at,
    )
