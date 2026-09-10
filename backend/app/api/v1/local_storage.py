"""Local-mode storage route: serves files written by services.local_storage.

Only registered when Settings.STORAGE_BACKEND == "local". The route handles
both PUT (frontend uploading to a signed URL the backend just issued) and
GET (anyone with a valid token can download).

Why this exists: in production, the frontend PUTs strategy docs directly to
Supabase Storage via a server-issued signed URL - the backend never sees
the bytes. To preserve that flow in offline-local mode, we issue signed
URLs pointing at OURSELVES and accept PUTs at this endpoint, validating
the same HMAC token. Functionally identical to the production flow from
the frontend's perspective.

Security: every request is HMAC-validated. Path-traversal is blocked at
the filesystem layer (see local_storage._safe_target). This endpoint is
NOT auth-gated - the signed token IS the auth, same as a Supabase signed
URL. Local-mode is for dev only; never enable on a public deployment.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.core.config import get_settings
from app.services import local_storage as _local

router = APIRouter()


def _check_enabled() -> None:
    """Refuse to serve if storage backend was switched away from local at
    runtime. Belt-and-braces: the router is only included in api_router when
    STORAGE_BACKEND=local at process start, so under normal conditions
    requests can't reach here in supabase mode. This check covers the
    edge case where the env changes mid-process via a hot-reload."""
    if (get_settings().STORAGE_BACKEND or "supabase").lower() != "local":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="local-storage backend is not active",
        )


@router.put("/local-storage/{path:path}")
async def put_object(
    path: str,
    request: Request,
    t: str = Query(..., description="HMAC token from the signed URL"),
):
    _check_enabled()
    if not _local.verify_token(path, t):
        raise HTTPException(status_code=403, detail="Invalid signed URL token")
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        _local.upload_bytes(path, body)
    except ValueError as e:
        # Path traversal attempt
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "path": path, "bytes": len(body)}


@router.get("/local-storage/{path:path}")
def get_object(path: str, t: str = Query(..., description="HMAC token")):
    _check_enabled()
    if not _local.verify_token(path, t):
        raise HTTPException(status_code=403, detail="Invalid signed URL token")
    try:
        body = _local.download_bytes(path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="Object not found") from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    # We could sniff the path suffix to set Content-Type but the only thing
    # callers actually need is the bytes — the frontend already knows it's
    # JSON / PDF / etc. from context.
    return Response(content=body, media_type="application/octet-stream")
