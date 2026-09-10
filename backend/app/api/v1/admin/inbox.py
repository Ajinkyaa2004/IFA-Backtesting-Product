"""Admin inbox - surfaces 'things that need admin attention'.

Currently feeds two streams:
  1. Strategy uploads with no completed backtest yet for that client + strategy
  2. Requests in 'open' status

Both are sorted newest-first and cap at 50 items.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Backtest, Client, Request as Req, StrategyDocument
from app.db.session import get_db

router = APIRouter()


class InboxItem(BaseModel):
    type: str  # "strategy_uploaded" | "request_open"
    id: str
    client_id: str
    client_name: str
    title: str
    subtitle: str
    occurred_at: datetime
    href: str  # where the admin should click through to


class InboxOut(BaseModel):
    items: list[InboxItem]
    total: int
    unread_strategies: int
    unread_requests: int


@router.get("/inbox", response_model=InboxOut)
def admin_inbox(
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
    limit: int = 50,
):
    items: list[InboxItem] = []

    # 1) Strategy uploads that have NO completed backtest linked yet
    # (definition of "needs attention": active strategy with no completed backtest where strategy_version_id == this strategy)
    strategies = (
        db.query(StrategyDocument, Client)
        .join(Client, Client.id == StrategyDocument.client_id)
        .filter(StrategyDocument.status == "active")
        .filter(Client.deleted_at.is_(None))
        .order_by(desc(StrategyDocument.created_at))
        .limit(200)
        .all()
    )
    unhandled_strategies = 0
    for s, c in strategies:
        # Has a completed backtest linked to this strategy?
        has_bt = (
            db.query(Backtest)
            .filter(
                Backtest.strategy_version_id == s.id,
                Backtest.status == "completed",
            )
            .first()
        )
        if has_bt:
            continue
        unhandled_strategies += 1
        items.append(
            InboxItem(
                type="strategy_uploaded",
                id=str(s.id),
                client_id=str(c.id),
                client_name=c.name,
                title=f"{c.name} uploaded a strategy",
                subtitle=f"{s.name} (v{s.version}) - needs a backtest",
                occurred_at=s.created_at,
                href=f"/admin/clients",
            )
        )

    # 2) Requests in 'open' status
    open_requests = (
        db.query(Req, Client)
        .join(Client, Client.id == Req.client_id)
        .filter(Req.status == "open")
        .filter(Client.deleted_at.is_(None))
        .order_by(desc(Req.created_at))
        .limit(50)
        .all()
    )
    for r, c in open_requests:
        summary = (r.payload or {}).get("summary") or (r.payload or {}).get("question") or "(no summary)"
        items.append(
            InboxItem(
                type="request_open",
                id=str(r.id),
                client_id=str(c.id),
                client_name=c.name,
                title=f"{c.name}: new {r.type.replace('_', ' ')} request",
                subtitle=str(summary)[:120],
                occurred_at=r.created_at,
                href=f"/admin/clients",
            )
        )

    # Sort all items by occurred_at desc and cap
    items.sort(key=lambda i: i.occurred_at, reverse=True)
    items = items[:limit]

    return InboxOut(
        items=items,
        total=len(items),
        unread_strategies=unhandled_strategies,
        unread_requests=len(open_requests),
    )
