"""Admin — pending signup queue.

Sits alongside admin/clients.py. Signups are a separate lifecycle stage:
a User row exists (created by /auth/signup) with signup_status='pending_approval'
and client_id=NULL. Approving a signup means creating the Client + Engagement
rows and linking them to the User; rejecting means writing a reason and
firing an email.

The approve payload asks for the fields the admin has to decide anyway when
manually provisioning a client (tier, engagement type). Keeping the picker
in the approve modal forces intentionality — the admin can't accidentally
leave a client half-configured.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import require_role
from app.db.models import Client, Engagement, User
from app.db.session import get_db
from app.services import audit
from app.services.email import (
    send_client_approval_email,
    send_client_rejection_email,
)

router = APIRouter(prefix="/signups", tags=["admin-signups"])


class SignupOut(BaseModel):
    id: str
    email: str
    signup_status: str
    signup_requested_at: datetime | None
    signup_approved_at: datetime | None
    signup_rejection_reason: str | None
    metadata: dict


def _serialise(user: User) -> SignupOut:
    return SignupOut(
        id=str(user.id),
        email=user.email,
        signup_status=user.signup_status,
        signup_requested_at=user.signup_requested_at,
        signup_approved_at=user.signup_approved_at,
        signup_rejection_reason=user.signup_rejection_reason,
        metadata=user.signup_metadata or {},
    )


@router.get("", response_model=list[SignupOut])
def list_signups(
    signup_status: Literal["pending_approval", "approved", "rejected", "all"] = "pending_approval",
    db: Session = Depends(get_db),
    _: User = Depends(require_role("main_admin", "sub_admin")),
):
    """List signups filtered by status. Default = pending only (the queue)."""
    q = db.query(User).filter(User.deleted_at.is_(None))
    if signup_status != "all":
        q = q.filter(User.signup_status == signup_status)
    users = q.order_by(desc(User.signup_requested_at)).all()
    return [_serialise(u) for u in users]


class ApproveIn(BaseModel):
    tier: Literal["tier1", "tier2", "tier3"] = "tier2"
    # Engagement wiring — mirrors the fields admin/clients.py exposes so a
    # signup-approval flows into the same engagement shape as a manual
    # provisioning would.
    engagement_type: Literal["existing", "bespoke", "manual"] = "manual"
    # Free-text one-liner shown on the client's scope panel + PDF footer.
    deliverable: str = Field(
        default="One backtest + tunable rerun once engine reaches live",
        max_length=500,
    )
    # Company name — pre-filled from signup_metadata.company but admin can
    # override before creating the Client row.
    company_name: str = Field(min_length=1, max_length=200)
    whatsapp_group_link: str | None = Field(default=None, max_length=500)


@router.post("/{user_id}/approve", response_model=SignupOut)
def approve_signup(
    user_id: uuid.UUID,
    payload: ApproveIn,
    background: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("main_admin", "sub_admin")),
):
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Signup not found")
    if user.signup_status != "pending_approval":
        raise HTTPException(
            status_code=409,
            detail=f"Signup is already {user.signup_status}",
        )

    now = datetime.now(timezone.utc)

    # 1. Create the Client row — this is what unlocks the dashboard.
    metadata = user.signup_metadata or {}
    primary_contact = metadata.get("name") or None
    client = Client(
        name=payload.company_name,
        primary_contact=primary_contact,
        tier=payload.tier,
        status="active",
    )
    db.add(client)
    db.flush()  # need client.id before we link the User + Engagement

    # 2. Create the Engagement row so the lifecycle stepper on the client
    #    dashboard has something to render. Everything else (scope, engine,
    #    strategy, T&C) admin fills in later from the client drawer.
    #    Code format matches admin/clients.py: ENG-YYYY-NNNN based on
    #    year + engagement count for that year.
    year = now.year
    year_count = (
        db.query(Engagement)
        .filter(Engagement.code.like(f"ENG-{year}-%"))
        .count()
    )
    engagement = Engagement(
        code=f"ENG-{year}-{year_count + 1:04d}",
        client_id=client.id,
        # 'pending' — Chirag Section 4 — flips to 'active' after the client
        # accepts T&C on first login.
        status="pending",
        tier=payload.tier,
        scope_in=["Backtest delivery via the IFA portal"],
        scope_out=[],
        scope_version=1,
        engine_assignment=payload.engagement_type,
        deliverable=payload.deliverable,
        whatsapp_group_link=payload.whatsapp_group_link,
    )
    db.add(engagement)

    # 3. Link the user to the fresh client + mark them approved.
    user.client_id = client.id
    user.signup_status = "approved"
    user.signup_approved_at = now
    user.signup_approved_by = admin.id

    db.commit()
    db.refresh(user)

    audit.record(
        db,
        actor_user_id=admin.id,
        action="signup.approve",
        target_type="user",
        target_id=user.id,
        payload={
            "email": user.email,
            "client_id": str(client.id),
            "engagement_code": engagement.code,
            "tier": payload.tier,
            "engagement_type": payload.engagement_type,
        },
        ip=request.client.host if request.client else None,
    )

    # 4. Ping the client — best-effort in the background.
    settings = get_settings()
    login_url = f"{settings.frontend_url}/login"
    background.add_task(
        send_client_approval_email,
        to_email=user.email,
        name=metadata.get("name") or "there",
        login_url=login_url,
    )

    logger.info(
        "Signup approved: user_id={} email={} client_id={} tier={}",
        user.id, user.email, client.id, payload.tier,
    )
    return _serialise(user)


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


@router.post("/{user_id}/reject", response_model=SignupOut)
def reject_signup(
    user_id: uuid.UUID,
    payload: RejectIn,
    background: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("main_admin", "sub_admin")),
):
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Signup not found")
    if user.signup_status != "pending_approval":
        raise HTTPException(
            status_code=409,
            detail=f"Signup is already {user.signup_status}",
        )

    user.signup_status = "rejected"
    user.signup_rejection_reason = payload.reason.strip()
    user.signup_approved_at = datetime.now(timezone.utc)
    user.signup_approved_by = admin.id
    db.commit()
    db.refresh(user)

    audit.record(
        db,
        actor_user_id=admin.id,
        action="signup.reject",
        target_type="user",
        target_id=user.id,
        payload={"email": user.email, "reason": payload.reason.strip()},
        ip=request.client.host if request.client else None,
    )

    metadata = user.signup_metadata or {}
    background.add_task(
        send_client_rejection_email,
        to_email=user.email,
        name=metadata.get("name") or "there",
        reason=payload.reason.strip(),
    )

    logger.info(
        "Signup rejected: user_id={} email={} reason={!r}",
        user.id, user.email, payload.reason,
    )
    return _serialise(user)
