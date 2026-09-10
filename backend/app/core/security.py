from pathlib import Path

import firebase_admin
from firebase_admin import auth as fb_auth
from firebase_admin import credentials
from loguru import logger

from app.core.config import get_settings

_initialised = False


def init_firebase() -> None:
    global _initialised
    if _initialised:
        return
    settings = get_settings()
    cred_path = Path(settings.FIREBASE_CREDENTIALS_PATH)
    if not cred_path.is_absolute():
        cred_path = Path(__file__).resolve().parents[3] / cred_path
    if not cred_path.exists():
        raise RuntimeError(f"Firebase credentials not found at {cred_path}")
    cred = credentials.Certificate(str(cred_path))
    firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})
    _initialised = True
    logger.info("Firebase Admin initialised for project {}", settings.FIREBASE_PROJECT_ID)


# Map Firebase Admin SDK exception types → public-facing reason codes.
# Internals (cryptographic detail, raw exception messages) NEVER reach the client.
_FIREBASE_REASONS = {
    fb_auth.ExpiredIdTokenError: "token_expired",
    fb_auth.RevokedIdTokenError: "token_revoked",
    fb_auth.InvalidIdTokenError: "token_invalid",
    fb_auth.UserDisabledError: "user_disabled",
    fb_auth.CertificateFetchError: "auth_service_unavailable",
}


class TokenError(ValueError):
    """Public-safe auth error. .reason is a short opaque code; .message is for logs only."""

    def __init__(self, reason: str, message: str = "") -> None:
        self.reason = reason
        self.message = message
        super().__init__(reason)


def verify_id_token(id_token: str) -> dict:
    """Verifies a Firebase ID token.

    Returns the decoded claims dict on success. On failure raises ``TokenError``
    with a short, opaque ``reason`` code. Internal exception details are logged
    server-side only - never propagated to the client.
    """
    if not _initialised:
        init_firebase()
    if not id_token or not isinstance(id_token, str):
        raise TokenError("token_missing", "empty or non-string token")
    try:
        return fb_auth.verify_id_token(id_token)
    except tuple(_FIREBASE_REASONS) as e:
        reason = _FIREBASE_REASONS[type(e)]
        logger.warning("Firebase auth rejected: reason={} type={} detail={}", reason, type(e).__name__, str(e)[:200])
        raise TokenError(reason, str(e)) from e
    except ValueError as e:
        # firebase_admin raises plain ValueError for many malformed-token cases
        logger.warning("Firebase auth ValueError: {}", str(e)[:200])
        raise TokenError("token_invalid", str(e)) from e
    except Exception as e:
        # Defence in depth: any unexpected exception still surfaces as opaque
        logger.exception("Unexpected Firebase verify failure")
        raise TokenError("token_invalid", str(e)) from e


def create_firebase_user(email: str, password: str, display_name: str | None = None) -> str:
    if not _initialised:
        init_firebase()
    record = fb_auth.create_user(email=email, password=password, display_name=display_name)
    return record.uid


def get_firebase_user_by_email(email: str):
    if not _initialised:
        init_firebase()
    try:
        return fb_auth.get_user_by_email(email)
    except fb_auth.UserNotFoundError:
        return None
