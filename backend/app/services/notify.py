"""Notification firing helpers.

The Notification table (backend/app/db/models/notification.py) was seeded
only by two manual admin actions (broadcast + personal). The audit item
PB2 flagged that clients had no automated signal for anything: a delivered
backtest, a status change on their request, a quote issued. They had to
guess when to refresh.

Everything here is best-effort: a Notification insert failure NEVER
raises to the caller. Notifications are a nice-to-have signal on top of
the primary state change, not a hard prerequisite for it.

Callers pass the db.Session so notifications commit inside the same
transaction as the underlying state change - either both stick or
neither does. We do NOT commit here.
"""

from __future__ import annotations

import uuid
from typing import Literal

from loguru import logger
from sqlalchemy.orm import Session

from app.db.models import Notification, User


NotifKind = Literal["backtest", "quote", "request", "tnc", "broadcast", "system"]


def _client_users(db: Session, client_id: uuid.UUID) -> list[User]:
    return (
        db.query(User)
        .filter(
            User.client_id == client_id,
            User.deleted_at.is_(None),
            User.role == "client",
        )
        .all()
    )


def fire_for_client(
    db: Session,
    *,
    client_id: uuid.UUID,
    kind: NotifKind,
    title: str,
    body: str,
    payload: dict | None = None,
) -> int:
    """Insert one Notification row per active user of the client.

    Returns the number of rows queued. Silently returns 0 on any error.
    The caller owns the transaction - commit yourself.
    """
    try:
        users = _client_users(db, client_id)
        if not users:
            return 0
        for u in users:
            db.add(
                Notification(
                    recipient_user_id=u.id,
                    kind=kind,
                    title=title[:300],
                    body=body,
                    payload=payload or {},
                )
            )
        db.flush()
        return len(users)
    except Exception as e:
        logger.warning(
            "notify.fire_for_client failed for client={} kind={}: {}",
            client_id, kind, e,
        )
        return 0


def backtest_delivered(
    db: Session, *, client_id: uuid.UUID, backtest_id: uuid.UUID, code: str, name: str
) -> None:
    fire_for_client(
        db,
        client_id=client_id,
        kind="backtest",
        title=f"Backtest {code} delivered",
        body=(
            f"{name} is ready to view. Head to your Backtests to see the "
            f"equity curve, drawdown, trade log and metrics."
        ),
        payload={"backtest_id": str(backtest_id), "code": code},
    )


def backtest_status_changed(
    db: Session,
    *,
    client_id: uuid.UUID,
    backtest_id: uuid.UUID,
    code: str,
    from_status: str,
    to_status: str,
) -> None:
    # Only tell the client about client-meaningful transitions. Draft ↔
    # in_progress is admin bookkeeping the client doesn't care about.
    client_meaningful = {"quote_sent", "approved", "in_progress", "completed", "cancelled"}
    if to_status not in client_meaningful:
        return
    label = to_status.replace("_", " ")
    fire_for_client(
        db,
        client_id=client_id,
        kind="backtest",
        title=f"Backtest {code} - now {label}",
        body=f"Status moved from '{from_status}' to '{to_status}'.",
        payload={"backtest_id": str(backtest_id), "code": code, "status": to_status},
    )


def quote_sent(
    db: Session, *, client_id: uuid.UUID, quote_id: uuid.UUID, code: str, title_str: str
) -> None:
    fire_for_client(
        db,
        client_id=client_id,
        kind="quote",
        title=f"Quote {code} - {title_str}",
        body=(
            "A new quote is ready for your review. Accept or reject it from "
            "your dashboard's Quotes card."
        ),
        payload={"quote_id": str(quote_id), "code": code},
    )


def request_status_changed(
    db: Session,
    *,
    client_id: uuid.UUID,
    request_id: uuid.UUID,
    request_type: str,
    from_status: str,
    to_status: str,
) -> None:
    label = to_status.replace("_", " ")
    fire_for_client(
        db,
        client_id=client_id,
        kind="request",
        title=f"Request - {label}",
        body=(
            f"Your {request_type.replace('_', ' ')} request moved from "
            f"'{from_status}' to '{to_status}'."
        ),
        payload={"request_id": str(request_id), "status": to_status},
    )
