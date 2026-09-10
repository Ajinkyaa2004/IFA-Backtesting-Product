"""Storage façade - dispatches between Supabase and local-filesystem backends.

Selected at runtime by Settings.STORAGE_BACKEND:
  - "supabase" (default): talks to the real Supabase Storage REST API
  - "local":              writes/reads under <repo>/storage-local/

Both backends expose the same five operations. Callers (seed, admin upload,
VAM persist, strategy upload finalize) never need to care which is in use.
"""
from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings
from app.services import local_storage as _local


class StorageObjectMissing(Exception):
    """The requested object does not exist in the backend.

    Distinct from network / auth / decode failures so callers can render
    a specific "we never wrote this file" error instead of a generic
    "storage backend unreachable". Raised by download_bytes only.
    """
    def __init__(self, path: str):
        super().__init__(f"storage object not found: {path}")
        self.path = path


# ── Supabase backend (kept inline since it's a thin wrapper) ───────────────


@lru_cache
def _supabase_client() -> Client:
    s = get_settings()
    return create_client(s.SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY)


def _is_local() -> bool:
    return (get_settings().STORAGE_BACKEND or "supabase").lower() == "local"


def get_client() -> Client:
    """Exposed for callers that want the raw Supabase client.

    In local mode there IS no Supabase client; raising loudly is preferred
    over silently returning something useless.
    """
    if _is_local():
        raise RuntimeError(
            "storage.get_client() is not available in local mode; use the typed"
            " helpers (upload_bytes / download_bytes / signed_*_url / delete_object)"
        )
    return _supabase_client()


# ── Public API — same signatures across both backends ─────────────────────


def signed_upload_url(path: str) -> dict:
    if _is_local():
        return _local.signed_upload_url(path)
    s = get_settings()
    res = _supabase_client().storage.from_(s.SUPABASE_BUCKET).create_signed_upload_url(path)
    return {
        "signed_url": res.get("signed_url") or res.get("signedURL"),
        "token": res.get("token"),
        "path": path,
    }


def signed_download_url(path: str, expires_in: int = 900) -> str:
    if _is_local():
        return _local.signed_download_url(path, expires_in)
    s = get_settings()
    res = _supabase_client().storage.from_(s.SUPABASE_BUCKET).create_signed_url(path, expires_in)
    return res.get("signed_url") or res.get("signedURL")


def upload_bytes(path: str, content: bytes, content_type: str = "application/octet-stream") -> None:
    if _is_local():
        return _local.upload_bytes(path, content, content_type)
    s = get_settings()
    _supabase_client().storage.from_(s.SUPABASE_BUCKET).upload(
        path, content, {"upsert": "true", "content-type": content_type}
    )


def download_bytes(path: str) -> bytes:
    """Fetch the bytes stored at `path`.

    Raises:
      StorageObjectMissing - the object does not exist. Callers render this
                             as a clear "file was never written / has been
                             deleted" state rather than a generic 500.
      Exception            - any other failure (network, auth, corruption)
                             so callers can still 502.
    """
    if _is_local():
        try:
            return _local.download_bytes(path)
        except FileNotFoundError as e:
            raise StorageObjectMissing(path) from e
    s = get_settings()
    try:
        return _supabase_client().storage.from_(s.SUPABASE_BUCKET).download(path)
    except Exception as e:  # supabase raises its own StorageException hierarchy
        # Match the common "object not found" message shape — supabase-py 2.x
        # surfaces this in the exception body or code.
        text = f"{type(e).__name__}: {e}"
        if "not found" in text.lower() or "404" in text or "Object not found" in text:
            raise StorageObjectMissing(path) from e
        raise


def delete_object(path: str) -> None:
    if _is_local():
        return _local.delete_object(path)
    s = get_settings()
    _supabase_client().storage.from_(s.SUPABASE_BUCKET).remove([path])
