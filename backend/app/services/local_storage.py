"""Filesystem-backed storage backend for local development.

Activated when Settings.STORAGE_BACKEND == "local". Files live under
<repo>/storage-local/<path> on disk. Signed URLs are issued by HMAC-signing
the path with STORAGE_LOCAL_SECRET; the matching backend route
(/api/v1/local-storage/{path}) verifies the token before serving the bytes.

This keeps the public surface identical to the Supabase backend
(upload_bytes / download_bytes / delete_object / signed_upload_url /
signed_download_url) so the dispatching layer in services/storage.py can
flip between the two without callers caring.
"""
from __future__ import annotations

import hashlib
import hmac
from pathlib import Path

from app.core.config import get_settings

# Files live in <repo>/storage-local/. Mirrors the Supabase bucket layout
# (clients/<client_id>/backtests/<backtest_id>/result.json etc.).
_BASE_DIR = Path(__file__).resolve().parents[3] / "storage-local"


def _root() -> Path:
    _BASE_DIR.mkdir(parents=True, exist_ok=True)
    return _BASE_DIR


def _safe_target(path: str) -> Path:
    """Resolve <path> against the storage root, refusing any path that
    would escape the root via .. components. Defence-in-depth - the route
    handler also validates the HMAC, so this is just to make sure a bug
    upstream can't be turned into a path-traversal exploit."""
    target = (_root() / path).resolve()
    if _root().resolve() not in target.parents and target != _root().resolve():
        raise ValueError(f"path escapes storage root: {path!r}")
    return target


def _sign(path: str) -> str:
    """HMAC-SHA256 the path with the configured local secret, hex-truncated.

    24 hex chars (96 bits) is plenty to defeat brute-forcing a fake token -
    higher entropy without making URLs unwieldy.
    """
    secret = get_settings().STORAGE_LOCAL_SECRET.encode() or b"dev-local-storage-secret"
    return hmac.new(secret, path.encode(), hashlib.sha256).hexdigest()[:24]


def verify_token(path: str, token: str) -> bool:
    """Constant-time compare so the route can't be timing-attacked."""
    return hmac.compare_digest(_sign(path), token or "")


# ── Public API (mirrors the Supabase wrapper) ──────────────────────────────


def upload_bytes(path: str, content: bytes, content_type: str = "application/octet-stream") -> None:
    target = _safe_target(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    # content_type is ignored — local filesystem has no notion of MIME; the
    # backend route serves bytes back with a generic type and the frontend
    # already knows what it expects.


def download_bytes(path: str) -> bytes:
    return _safe_target(path).read_bytes()


def delete_object(path: str) -> None:
    target = _safe_target(path)
    if target.exists():
        target.unlink()
    # Clean up empty parent dirs so the storage tree doesn't accumulate
    # cruft over time (only delete dirs UNDER the bucket root, never the
    # bucket root itself).
    parent = target.parent
    root_resolved = _root().resolve()
    while parent != root_resolved and parent.exists():
        try:
            parent.rmdir()
        except OSError:
            break
        parent = parent.parent


def signed_upload_url(path: str) -> dict:
    token = _sign(path)
    base = get_settings().LOCAL_BACKEND_BASE_URL.rstrip("/")
    return {
        "signed_url": f"{base}/api/v1/local-storage/{path}?t={token}",
        "token": token,
        "path": path,
    }


def signed_download_url(path: str, expires_in: int = 900) -> str:
    """expires_in is accepted for API parity with the Supabase backend but
    is not enforced here - local-mode is for dev, not for serving untrusted
    users, so token-without-expiry is acceptable."""
    token = _sign(path)
    base = get_settings().LOCAL_BACKEND_BASE_URL.rstrip("/")
    return f"{base}/api/v1/local-storage/{path}?t={token}"
