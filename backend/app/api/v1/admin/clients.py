from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from firebase_admin import auth as fb_auth
from loguru import logger
from pydantic import BaseModel, EmailStr
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.core.security import create_firebase_user, get_firebase_user_by_email
from app.db.models import Client, User
from app.db.session import get_db
from app.services import audit


def _sync_firebase_disabled(client_id: uuid.UUID, db: Session, disabled: bool) -> None:
    """Set Firebase user.disabled = `disabled` for every User row tied to
    this client, and (if disabling) revoke their refresh tokens so any live
    ID token becomes invalid within ~1h instead of staying alive until
    natural expiry.

    Without this sync, when an admin suspended a client the backend would
    keep rejecting their API calls but Firebase would keep minting new ID
    tokens — the user could repeatedly "log in" and see a confusing error
    instead of a clear account-disabled message. Sweep finding #17.

    Best-effort: a Firebase API failure does NOT block the DB update. The
    failure is logged for ops follow-up.
    """
    users = db.query(User).filter(User.client_id == client_id, User.deleted_at.is_(None)).all()
    for u in users:
        try:
            fb_auth.update_user(u.firebase_uid, disabled=disabled)
            if disabled:
                fb_auth.revoke_refresh_tokens(u.firebase_uid)
        except Exception as e:
            logger.warning(
                "Firebase sync failed for user {} client {} disabled={}: {}",
                u.id, client_id, disabled, e,
            )

router = APIRouter()


class ClientOut(BaseModel):
    id: str
    name: str
    primary_contact: str | None
    tier: str
    status: str
    vam_enabled: bool
    deleted_at: datetime | None
    created_at: datetime


class ClientWithUsers(ClientOut):
    users: list[dict]


class ClientCreate(BaseModel):
    name: str
    primary_contact: str | None = None
    tier: Literal["tier1", "tier2", "tier3"] = "tier1"
    user_email: EmailStr
    user_password: str


class ClientUpdate(BaseModel):
    name: str | None = None
    primary_contact: str | None = None
    tier: Literal["tier1", "tier2", "tier3"] | None = None
    status: Literal["active", "suspended"] | None = None
    vam_enabled: bool | None = None


def _client_out(c: Client) -> ClientOut:
    return ClientOut(
        id=str(c.id),
        name=c.name,
        primary_contact=c.primary_contact,
        tier=c.tier,
        status=c.status,
        vam_enabled=bool(c.vam_enabled),
        deleted_at=c.deleted_at,
        created_at=c.created_at,
    )


class ActivityEvent(BaseModel):
    id: str
    kind: str            # 'strategy_upload' | 'strategy_finalize' | 'request' | 'backtest_status' | 'terms_accept' | 'other'
    title: str
    subtitle: str | None = None
    actor_email: str | None = None
    occurred_at: datetime


@router.get("/clients/{client_id}/activity", response_model=list[ActivityEvent])
def client_activity_timeline(
    client_id: uuid.UUID,
    limit: int = 50,
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Chronological event stream for one client — merges audit log rows
    whose target belongs to this client with recent backtest state
    changes. Powers the admin drawer's Activity tab so support can see
    exactly what's happened in the last N days without pivoting through
    the global audit filter.
    """
    # Import inside to avoid circular deps between clients module + audit model
    from app.db.models import AuditLog, Backtest as BT, StrategyDocument as SD, User as U, Request as Req

    events: list[ActivityEvent] = []

    # Audit rows that mention this client — either as target_id (direct) or
    # via a strategy / request / backtest whose client_id matches.
    # For MVP simplicity we pull audit rows and filter by joining target
    # against the client's owned rows in Python — the row counts are small.
    strategy_ids = {r.id for r in db.query(SD.id).filter(SD.client_id == client_id).all()}
    backtest_ids = {r.id for r in db.query(BT.id).filter(BT.client_id == client_id).all()}
    request_ids = {r.id for r in db.query(Req.id).filter(Req.client_id == client_id).all()}

    audit_rows = (
        db.query(AuditLog, U.email)
        .outerjoin(U, U.id == AuditLog.actor_user_id)
        .filter(
            (AuditLog.target_id == client_id)
            | (AuditLog.target_id.in_(strategy_ids) if strategy_ids else False)
            | (AuditLog.target_id.in_(backtest_ids) if backtest_ids else False)
            | (AuditLog.target_id.in_(request_ids) if request_ids else False)
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )

    for a, email in audit_rows:
        kind = _classify_audit_action(a.action)
        title, subtitle = _describe_audit_row(a)
        events.append(
            ActivityEvent(
                id=f"a-{a.id}",
                kind=kind,
                title=title,
                subtitle=subtitle,
                actor_email=email,
                occurred_at=a.created_at,
            )
        )

    events.sort(key=lambda e: e.occurred_at, reverse=True)
    return events[:limit]


def _classify_audit_action(action: str) -> str:
    if action.startswith("strategy."):
        return "strategy_upload"
    if action.startswith("backtest."):
        return "backtest_status"
    if action.startswith("tnc.") or action.startswith("terms."):
        return "terms_accept"
    if action.startswith("request."):
        return "request"
    if action.startswith("admin.impersonate"):
        return "impersonate"
    if action.startswith("client."):
        return "client_update"
    return "other"


def _describe_audit_row(a) -> tuple[str, str | None]:
    """Human labels for the timeline. Falls back to the raw action string."""
    action = a.action
    p = a.payload or {}
    if action == "strategy.upload.init":
        return (f"Started upload · {p.get('name', 'strategy')}", f"v{p.get('version', '?')} · {p.get('size', '?')} bytes")
    if action == "strategy.upload.finalize":
        return (f"Finalised strategy · {p.get('name', 'strategy')}", f"v{p.get('version', '?')} · checksum {p.get('checksum', '')[:12]}")
    if action == "backtest.status.change":
        return (f"Backtest {p.get('code', '')} · {p.get('from', '?')} → {p.get('to', '?')}", p.get('note'))
    if action == "backtest.result.upload":
        return (f"Uploaded backtest result · {p.get('code', '?')}", p.get('name'))
    if action == "backtest.report.export":
        return (f"Exported PDF report · {p.get('code', '?')}", f"{p.get('size_bytes', '?')} bytes")
    if action.startswith("admin.impersonate"):
        return (f"Impersonation · {action.split('.')[-1]}", None)
    if action == "client.update":
        return ("Admin edited client", ", ".join(f"{k}={v}" for k, v in p.items()))
    return (action, None)


@router.get("/clients", response_model=list[ClientOut])
def list_clients(
    include_deleted: bool = False,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Paginated + searchable client list.

    Optional `q` matches (case-insensitive) against name + primary_contact.
    Frontend passes limit=50 and paginates via offset. Ordering is
    newest-first so 'Load more' visually stacks under recent rows.
    """
    query = db.query(Client)
    if not include_deleted:
        query = query.filter(Client.deleted_at.is_(None))
    if q:
        term = f"%{q.strip().lower()}%"
        from sqlalchemy import func, or_
        query = query.filter(
            or_(
                func.lower(Client.name).like(term),
                func.lower(Client.primary_contact).like(term),
            )
        )
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    rows = query.order_by(desc(Client.created_at)).offset(offset).limit(limit).all()
    return [_client_out(c) for c in rows]


@router.get("/clients/{client_id}", response_model=ClientWithUsers)
def get_client(
    client_id: uuid.UUID,
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    users = (
        db.query(User)
        .filter(User.client_id == c.id, User.deleted_at.is_(None))
        .all()
    )
    return ClientWithUsers(
        **_client_out(c).model_dump(),
        users=[{"id": str(u.id), "email": u.email, "role": u.role, "status": u.status} for u in users],
    )


@router.post("/clients", response_model=ClientWithUsers, status_code=201)
def create_client(
    payload: ClientCreate,
    request: Request,
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    existing_fb = get_firebase_user_by_email(payload.user_email)
    if existing_fb:
        raise HTTPException(status_code=409, detail=f"Firebase user already exists: {payload.user_email}")

    client = Client(name=payload.name, primary_contact=payload.primary_contact, tier=payload.tier, status="active")
    db.add(client)
    db.flush()

    fb_uid = create_firebase_user(payload.user_email, payload.user_password, display_name=payload.name)
    user = User(
        firebase_uid=fb_uid,
        email=payload.user_email,
        role="client",
        status="active",
        client_id=client.id,
        # Set to 1 so they don't see a stale re-ack prompt on first login.
        acked_scope_version=1,
    )
    db.add(user)
    db.flush()

    # Auto-create the Engagement — Chirag Item #1. Every client has exactly
    # one. Generated code is ENG-YYYY-NNNN based on current year + row count
    # for that year. Not thread-safe under high concurrency (client creation
    # is admin-triggered so contention is negligible), but a proper sequence
    # can replace this later.
    from datetime import datetime
    from app.db.models import Engagement
    year = datetime.utcnow().year
    # MAX(existing) + 1 — count()+1 breaks when demo/QA rows are deleted
    # and leave gaps, causing UniqueViolation on the next approve.
    latest_code = (
        db.query(Engagement.code)
        .filter(Engagement.code.like(f"ENG-{year}-%"))
        .order_by(Engagement.code.desc())
        .first()
    )
    next_num = 1
    if latest_code and latest_code[0]:
        try:
            next_num = int(latest_code[0].rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            next_num = (
                db.query(Engagement)
                .filter(Engagement.code.like(f"ENG-{year}-%"))
                .count()
            ) + 1
    engagement = Engagement(
        code=f"ENG-{year}-{next_num:04d}",
        client_id=client.id,
        status="pending",   # T&C not yet accepted — matches Chirag Section 4
        tier=payload.tier,
        scope_in=["Backtest delivery via the IFA portal"],
        scope_out=[],
        scope_version=1,
        engine_assignment="manual",
        deliverable="One backtest + tunable rerun once engine reaches live",
    )
    db.add(engagement)
    db.flush()

    audit.record(
        db,
        actor_user_id=admin.id,
        action="client.create",
        target_type="client",
        target_id=client.id,
        payload={
            "name": payload.name,
            "user_email": payload.user_email,
            "tier": payload.tier,
            "engagement_code": engagement.code,
            "engagement_id": str(engagement.id),
        },
        ip=request.client.host if request.client else None,
    )
    db.commit()

    return ClientWithUsers(
        **_client_out(client).model_dump(),
        users=[{"id": str(user.id), "email": user.email, "role": user.role, "status": user.status}],
    )


@router.patch("/clients/{client_id}", response_model=ClientOut)
def update_client(
    client_id: uuid.UUID,
    payload: ClientUpdate,
    request: Request,
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    c = db.query(Client).filter(Client.id == client_id, Client.deleted_at.is_(None)).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    changes = payload.model_dump(exclude_none=True)
    old_status = c.status
    for k, v in changes.items():
        setattr(c, k, v)
    audit.record(
        db,
        actor_user_id=admin.id,
        action="client.update",
        target_type="client",
        target_id=c.id,
        payload=changes,
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(c)
    # If the admin just flipped client status, propagate to Firebase so
    # suspended users can't keep generating fresh ID tokens. Sweep #17.
    if "status" in changes and changes["status"] != old_status:
        _sync_firebase_disabled(c.id, db, disabled=(c.status != "active"))
    return _client_out(c)


@router.delete("/clients/{client_id}", status_code=204)
def soft_delete_client(
    client_id: uuid.UUID,
    request: Request,
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Soft delete: hides client, keeps data for 30 days."""
    c = db.query(Client).filter(Client.id == client_id, Client.deleted_at.is_(None)).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    c.deleted_at = datetime.now(timezone.utc)
    c.deleted_by = admin.id
    c.status = "suspended"
    audit.record(
        db,
        actor_user_id=admin.id,
        action="client.delete.soft",
        target_type="client",
        target_id=c.id,
        ip=request.client.host if request.client else None,
    )
    db.commit()
    # Soft-delete implies suspended → lock Firebase users too. Sweep #17.
    _sync_firebase_disabled(c.id, db, disabled=True)


@router.post("/clients/{client_id}/restore", response_model=ClientOut)
def restore_client(
    client_id: uuid.UUID,
    request: Request,
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    c = db.query(Client).filter(Client.id == client_id, Client.deleted_at.is_not(None)).first()
    if not c:
        raise HTTPException(status_code=404, detail="No soft-deleted client with that id")
    c.deleted_at = None
    c.deleted_by = None
    c.status = "active"
    audit.record(
        db,
        actor_user_id=admin.id,
        action="client.restore",
        target_type="client",
        target_id=c.id,
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(c)
    # Re-enable Firebase users so the client can sign in again. Sweep #17.
    _sync_firebase_disabled(c.id, db, disabled=False)
    return _client_out(c)
