"""Client-facing notifications endpoints - Phase 4.5 Day 6.

Admin already had /admin/notifications/broadcast + /admin/notifications/personal
to CREATE notifications. This module gives every user (client + admin) the
matching read side: list their notifications, count unread, mark them read.

Broadcast semantics: a Notification with recipient_user_id=NULL is visible to
every active user. Whether a specific user has read a broadcast lives in the
notification_reads table (see NotificationRead model).

Personal semantics: a Notification with recipient_user_id=user.id shows up
only for that user. Its own read_at timestamp tracks whether they've read it.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.core.deps import current_user
from app.db.models import Notification, NotificationRead, User
from app.db.session import get_db

router = APIRouter()


class NotificationOut(BaseModel):
    id: str
    kind: str
    title: str
    body: str
    is_broadcast: bool
    is_read: bool
    created_at: datetime


class NotificationListOut(BaseModel):
    unread_count: int
    items: list[NotificationOut]


@router.get("/notifications", response_model=NotificationListOut)
def list_notifications(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
):
    """List the caller's notifications. Combines personal (recipient_user_id
    matches) + broadcast (recipient_user_id IS NULL) in one chronological
    stream with `is_read` computed per user.
    """
    # Fetch broadcasts + personal for this user in one query.
    rows: list[Notification] = (
        db.query(Notification)
        .filter(
            or_(
                Notification.recipient_user_id == user.id,
                Notification.recipient_user_id.is_(None),
            )
        )
        .order_by(desc(Notification.created_at))
        .limit(limit)
        .all()
    )

    # Which broadcasts has this user marked as read?
    broadcast_ids = [n.id for n in rows if n.recipient_user_id is None]
    read_broadcast_ids: set[uuid.UUID] = set()
    if broadcast_ids:
        read_rows = (
            db.query(NotificationRead.notification_id)
            .filter(
                NotificationRead.user_id == user.id,
                NotificationRead.notification_id.in_(broadcast_ids),
            )
            .all()
        )
        read_broadcast_ids = {r[0] for r in read_rows}

    items: list[NotificationOut] = []
    unread = 0
    for n in rows:
        is_broadcast = n.recipient_user_id is None
        is_read = (
            n.id in read_broadcast_ids if is_broadcast
            else n.read_at is not None
        )
        if not is_read:
            unread += 1
        items.append(
            NotificationOut(
                id=str(n.id),
                kind=n.kind,
                title=n.title,
                body=n.body,
                is_broadcast=is_broadcast,
                is_read=is_read,
                created_at=n.created_at,
            )
        )
    return NotificationListOut(unread_count=unread, items=items)


@router.post("/notifications/{notification_id}/read", status_code=204)
def mark_read(
    notification_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Mark a notification read. For personal notifications: sets read_at on
    the row. For broadcasts: creates a NotificationRead row. Idempotent.
    """
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")

    if n.recipient_user_id is not None:
        # Personal — only the recipient can mark it read.
        if n.recipient_user_id != user.id:
            raise HTTPException(status_code=404, detail="Notification not found")
        if n.read_at is None:
            n.read_at = datetime.now(timezone.utc)
            db.commit()
    else:
        # Broadcast — upsert into notification_reads.
        existing = (
            db.query(NotificationRead)
            .filter(
                NotificationRead.user_id == user.id,
                NotificationRead.notification_id == n.id,
            )
            .first()
        )
        if not existing:
            db.add(NotificationRead(user_id=user.id, notification_id=n.id))
            db.commit()
    return None


@router.post("/notifications/mark-all-read", status_code=204)
def mark_all_read(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Batch operation for the 'Mark all as read' bell action."""
    now = datetime.now(timezone.utc)
    # Personal unread
    unread_personal = (
        db.query(Notification)
        .filter(Notification.recipient_user_id == user.id, Notification.read_at.is_(None))
        .all()
    )
    for n in unread_personal:
        n.read_at = now
    # Broadcast unread — insert missing NotificationRead rows.
    all_broadcast = (
        db.query(Notification.id)
        .filter(Notification.recipient_user_id.is_(None))
        .all()
    )
    broadcast_ids = {r[0] for r in all_broadcast}
    if broadcast_ids:
        already_read = {
            r[0]
            for r in db.query(NotificationRead.notification_id)
            .filter(
                NotificationRead.user_id == user.id,
                NotificationRead.notification_id.in_(broadcast_ids),
            )
            .all()
        }
        for nid in broadcast_ids - already_read:
            db.add(NotificationRead(user_id=user.id, notification_id=nid))
    db.commit()
    return None
