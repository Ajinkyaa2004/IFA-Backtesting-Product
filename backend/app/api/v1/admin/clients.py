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


def _client_out(c: Client) -> ClientOut:
    return ClientOut(
        id=str(c.id),
        name=c.name,
        primary_contact=c.primary_contact,
        tier=c.tier,
        status=c.status,
        deleted_at=c.deleted_at,
        created_at=c.created_at,
    )


@router.get("/clients", response_model=list[ClientOut])
def list_clients(
    include_deleted: bool = False,
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    q = db.query(Client)
    if not include_deleted:
        q = q.filter(Client.deleted_at.is_(None))
    return [_client_out(c) for c in q.order_by(desc(Client.created_at)).all()]


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
    )
    db.add(user)
    db.flush()

    audit.record(
        db,
        actor_user_id=admin.id,
        action="client.create",
        target_type="client",
        target_id=client.id,
        payload={"name": payload.name, "user_email": payload.user_email, "tier": payload.tier},
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
