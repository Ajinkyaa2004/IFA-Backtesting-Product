from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from firebase_admin import auth as fb_auth
from loguru import logger
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import _TOKEN_PUBLIC_MESSAGES, current_user
from app.core.rate_limit import limiter
from app.core.security import TokenError, verify_id_token
from app.db.models import Client, User
from app.db.session import get_db
from app.services.email import send_admin_signup_notification

router = APIRouter()


class LoginIn(BaseModel):
    id_token: str = Field(min_length=20, max_length=8192)  # cheap DoS guard


class LoginOut(BaseModel):
    ok: bool
    user_id: str
    role: str


# 20/min per IP — a legitimate user won't fat-finger 20 times a minute, and a
# wrong password rejects in ~200ms so at cap a credential stuffer only gets
# ~1200 tries/hour before nginx also declines. Request is required by
# slowapi to extract client IP.
@router.post("/login", response_model=LoginOut)
@limiter.limit("20/minute")
def login(request: Request, payload: LoginIn, db: Session = Depends(get_db)):
    """Frontend signs in via Firebase, then POSTs the ID token here.
    Backend verifies it and confirms the user is provisioned in our DB.

    Error contract:
      401 - token missing, malformed, expired, revoked
      403 - token valid but user suspended OR user not provisioned in our DB
      503 - Firebase certificate-fetch / service issue
    """
    try:
        decoded = verify_id_token(payload.id_token)
    except TokenError as e:
        msg = _TOKEN_PUBLIC_MESSAGES.get(e.reason, "Invalid token")
        status_code = (
            status.HTTP_503_SERVICE_UNAVAILABLE
            if e.reason == "auth_service_unavailable"
            else status.HTTP_401_UNAUTHORIZED
        )
        raise HTTPException(status_code=status_code, detail=msg) from e

    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.firebase_uid == uid, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not provisioned")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User suspended")

    # Suspended-client gate (audit LT2). If the client the user belongs
    # to is suspended, refuse the login even though the User row itself
    # is still 'active'. Without this an admin can suspend a client and
    # they'd still sign in and reach the dashboard — the suspension
    # would only take effect on the NEXT admin action against them.
    if user.role == "client" and user.client_id:
        client = db.query(Client).filter(Client.id == user.client_id).first()
        if client and client.status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "This account is currently suspended. Please contact your "
                    "IFA account manager to reactivate it."
                ),
            )

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return LoginOut(ok=True, user_id=str(user.id), role=user.role)


class SignupIn(BaseModel):
    """Payload for self-serve signup. The client has already created a
    Firebase account via the web SDK and is sending us the resulting ID
    token plus their profile fields.
    """
    id_token: str = Field(min_length=20, max_length=8192)
    name: str = Field(min_length=2, max_length=120)
    company: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=4, max_length=40)
    purpose: str | None = Field(default=None, max_length=1000)
    # Honeypot - hidden in the signup form so real users never see it.
    # A bot that submits every field will fill this; we drop the request
    # silently with 400. Cheap defence against form-crawler bots without
    # a captcha dependency. (Audit BE3.)
    website: str | None = Field(default=None, max_length=200)


class SignupOut(BaseModel):
    ok: bool
    user_id: str
    signup_status: str


# Signup is expensive downstream (Firebase verify + DB insert + SMTP) so
# cap it hard: 5 requests / minute / IP is more than any legitimate flow
# needs and stops spam bots from filling the pending queue.
@router.post("/signup", response_model=SignupOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def signup(
    request: Request,
    payload: SignupIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Self-serve client signup.

    Flow:
      1. Frontend creates Firebase user via createUserWithEmailAndPassword
      2. Frontend calls this endpoint with the resulting Firebase ID token
      3. We verify the token, create a User row with signup_status='pending_approval'
      4. Background task pings the admin email
      5. Frontend redirects to /pending
    """
    # Honeypot check (BE3). Silently drop bot submissions with a 400 so
    # we never write a DB row, never mint a Firebase token, and never
    # email admin about a fake signup.
    if payload.website and payload.website.strip():
        logger.info(
            "Signup rejected: honeypot filled (from={})",
            request.client.host if request.client else "?",
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid submission")

    try:
        decoded = verify_id_token(payload.id_token)
    except TokenError as e:
        msg = _TOKEN_PUBLIC_MESSAGES.get(e.reason, "Invalid token")
        status_code = (
            status.HTTP_503_SERVICE_UNAVAILABLE
            if e.reason == "auth_service_unavailable"
            else status.HTTP_401_UNAUTHORIZED
        )
        raise HTTPException(status_code=status_code, detail=msg) from e

    uid = decoded.get("uid")
    email_from_token = decoded.get("email")
    if not uid or not email_from_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # Idempotency + collision guard. If a user with this firebase_uid or
    # email already exists we do not create a duplicate.
    existing_by_uid = db.query(User).filter(User.firebase_uid == uid).first()
    if existing_by_uid:
        # Someone hitting /signup again with a token they already used —
        # return their current signup_status so the frontend can route.
        return SignupOut(
            ok=True,
            user_id=str(existing_by_uid.id),
            signup_status=existing_by_uid.signup_status,
        )
    existing_by_email = db.query(User).filter(User.email == email_from_token.lower()).first()
    if existing_by_email:
        # Rare: Firebase reused an email (very unlikely) or someone manually
        # created a DB user with the same email as a fresh Firebase signup.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    now = datetime.now(timezone.utc)
    user = User(
        firebase_uid=uid,
        email=email_from_token.lower(),
        role="client",
        status="active",
        client_id=None,  # linked only once admin approves + creates the Client
        signup_status="pending_approval",
        signup_metadata={
            "name": payload.name,
            "company": payload.company,
            "phone": payload.phone,
            "purpose": payload.purpose,
        },
        signup_requested_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Fire the admin notification in the background so a slow SMTP handshake
    # never blocks the signup response. The email helper catches its own
    # exceptions, so this is fully fire-and-forget.
    settings = get_settings()
    admin_url = f"{settings.frontend_url}/admin/signups"
    background.add_task(
        send_admin_signup_notification,
        name=payload.name,
        email=email_from_token,
        company=payload.company,
        phone=payload.phone,
        purpose=payload.purpose,
        admin_url=admin_url,
    )

    logger.info(
        "New signup pending approval: user_id={} email={} company={!r}",
        user.id, email_from_token, payload.company,
    )
    return SignupOut(ok=True, user_id=str(user.id), signup_status=user.signup_status)


@router.post("/logout")
def logout(user: User = Depends(current_user)):
    """Revoke the Firebase refresh token for the user, so an ID token captured
    before logout becomes invalid the next time the backend verifies it (any
    request with check_revoked=True, plus all refresh attempts).

    Without this, an ID token snapshot (devtools, malicious extension)
    remained server-valid for up to ~1h after the user clicked Sign Out -
    a real shared-device leak. Sweep finding #18.
    """
    try:
        fb_auth.revoke_refresh_tokens(user.firebase_uid)
    except Exception as e:
        # Don't refuse logout if the Firebase call fails — the client-side
        # signOut still drops the local credentials. But log it loudly so
        # we notice ops issues.
        logger.warning("Failed to revoke Firebase refresh tokens for {}: {}", user.id, e)
    return {"ok": True}
