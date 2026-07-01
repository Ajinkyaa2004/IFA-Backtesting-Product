from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from firebase_admin import auth as fb_auth
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import _TOKEN_PUBLIC_MESSAGES, current_user
from app.core.rate_limit import limiter
from app.core.security import TokenError, verify_id_token
from app.db.models import User
from app.db.session import get_db

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
      401 — token missing, malformed, expired, revoked
      403 — token valid but user suspended OR user not provisioned in our DB
      503 — Firebase certificate-fetch / service issue
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

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return LoginOut(ok=True, user_id=str(user.id), role=user.role)


@router.post("/logout")
def logout(user: User = Depends(current_user)):
    """Revoke the Firebase refresh token for the user, so an ID token captured
    before logout becomes invalid the next time the backend verifies it (any
    request with check_revoked=True, plus all refresh attempts).

    Without this, an ID token snapshot (devtools, malicious extension)
    remained server-valid for up to ~1h after the user clicked Sign Out —
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
