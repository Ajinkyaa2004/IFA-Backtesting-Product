from __future__ import annotations

import os
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import client_scope, current_user
from app.core.tier_deps import enforce_active_strategy_limit
from app.db.models import StrategyDocument, User
from app.db.session import get_db
from app.services import audit, storage

router = APIRouter()

MAX_STRATEGY_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_MIME = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}
ALLOWED_EXTS = {".pdf", ".doc", ".docx", ".txt"}
MAX_FILENAME_LEN = 200
_SAFE_CHAR_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_filename(raw: str) -> str:
    """Extension-allowlist + character-allowlist filename sanitizer.

    Rejects with 400 if the input is untrustworthy. The previous
    "replace('/','_').replace('..','_')" was too loose - it let through
    null bytes, backslashes on Windows uploads, unicode homoglyphs, and
    dotfiles like ".htaccess". Trust nothing from the client.
    """
    if "\x00" in raw:
        raise HTTPException(status_code=400, detail="Invalid filename (null byte)")
    # Strip any path component — accept only the basename.
    base = os.path.basename(raw.replace("\\", "/")).strip()
    if not base or base in {".", ".."} or base.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    root, ext = os.path.splitext(base)
    ext_lower = ext.lower()
    if ext_lower not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file extension: {ext or '(none)'}. Allowed: pdf, doc, docx, txt.",
        )
    # Collapse any run of non-safe chars into single "_" — preserves
    # readability without letting shell/URL metacharacters through.
    safe_root = _SAFE_CHAR_RE.sub("_", root).strip("._-")
    if not safe_root:
        safe_root = "file"
    cleaned = (safe_root + ext_lower)[:MAX_FILENAME_LEN]
    return cleaned


class StrategyOut(BaseModel):
    id: str
    name: str
    version: int
    storage_key: str
    size_bytes: int | None
    mime_type: str | None
    checksum: str | None
    is_source_of_truth: bool
    status: str
    uploaded_at: datetime
    # Included so the version-history UI can show "uploaded by X on Y" without
    # a second round-trip. Nullable because the User row may have been deleted
    # (uploaded_by is SET NULL on ondelete).
    uploaded_by_email: str | None


class UploadIn(BaseModel):
    name: str
    filename: str
    size_bytes: int
    mime_type: str


class UploadOut(BaseModel):
    upload_id: str
    storage_key: str
    signed_url: str
    token: str | None = None
    expires_in: int = 900


class FinalizeIn(BaseModel):
    checksum: str


class FinalizeOut(BaseModel):
    ok: bool
    strategy: StrategyOut


@router.get("/strategies", response_model=list[StrategyOut])
def list_strategies(
    client_id: uuid.UUID = Depends(client_scope), db: Session = Depends(get_db)
):
    # LEFT JOIN so a document whose uploader was deleted still shows up.
    rows = (
        db.query(StrategyDocument, User.email)
        .outerjoin(User, User.id == StrategyDocument.uploaded_by)
        .filter(StrategyDocument.client_id == client_id)
        .order_by(desc(StrategyDocument.created_at))
        .all()
    )
    return [
        StrategyOut(
            id=str(r.StrategyDocument.id),
            name=r.StrategyDocument.name,
            version=r.StrategyDocument.version,
            storage_key=r.StrategyDocument.storage_key,
            size_bytes=r.StrategyDocument.size_bytes,
            mime_type=r.StrategyDocument.mime_type,
            checksum=r.StrategyDocument.checksum,
            is_source_of_truth=r.StrategyDocument.is_source_of_truth,
            status=r.StrategyDocument.status,
            uploaded_at=r.StrategyDocument.created_at,
            uploaded_by_email=r.email,
        )
        for r in rows
    ]


@router.post(
    "/strategies/upload",
    response_model=UploadOut,
    dependencies=[Depends(enforce_active_strategy_limit)],
)
def init_upload(
    payload: UploadIn,
    request: Request,
    user: User = Depends(current_user),
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
):
    if payload.size_bytes > MAX_STRATEGY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_STRATEGY_BYTES // (1024 * 1024)}MB limit",
        )
    if payload.mime_type and payload.mime_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported mime type: {payload.mime_type}",
        )

    existing = (
        db.query(StrategyDocument)
        .filter(
            StrategyDocument.client_id == client_id,
            StrategyDocument.name == payload.name,
        )
        .order_by(desc(StrategyDocument.version))
        .first()
    )
    next_version = (existing.version + 1) if existing else 1

    strategy_id = uuid.uuid4()
    safe_filename = _sanitize_filename(payload.filename)
    storage_key = f"clients/{client_id}/strategies/{strategy_id}/{safe_filename}"

    signed = storage.signed_upload_url(storage_key)

    row = StrategyDocument(
        id=strategy_id,
        client_id=client_id,
        name=payload.name,
        version=next_version,
        storage_key=storage_key,
        size_bytes=payload.size_bytes,
        mime_type=payload.mime_type,
        uploaded_by=user.id,
        status="pending",
    )
    db.add(row)

    audit.record(
        db,
        actor_user_id=user.id,
        action="strategy.upload.init",
        target_type="strategy_document",
        target_id=strategy_id,
        payload={"name": payload.name, "version": next_version, "size": payload.size_bytes},
        ip=request.client.host if request.client else None,
    )
    db.commit()

    return UploadOut(
        upload_id=str(strategy_id),
        storage_key=storage_key,
        signed_url=signed["signed_url"],
        token=signed.get("token"),
    )


class DownloadUrlOut(BaseModel):
    signed_url: str
    expires_in: int


@router.get("/strategies/{strategy_id}/download-url", response_model=DownloadUrlOut)
def get_own_strategy_download_url(
    strategy_id: uuid.UUID,
    request: Request,
    user: User = Depends(current_user),
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
):
    """Signed download URL for a client's own strategy document.

    Cross-tenant safe: the query filters by client_id from client_scope,
    so a user can only download rows their client owns. Audit-logged so
    we track who downloaded what and when - matches the discipline of
    the admin download endpoint added in Phase 4.
    """
    row = (
        db.query(StrategyDocument)
        .filter(StrategyDocument.id == strategy_id, StrategyDocument.client_id == client_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if row.status != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Strategy is {row.status}, not yet finalised. Cannot download.",
        )
    expires_in = 300  # 5 minutes
    signed_url = storage.signed_download_url(row.storage_key, expires_in=expires_in)
    audit.record(
        db,
        actor_user_id=user.id,
        action="strategy.download_url",
        target_type="strategy_document",
        target_id=row.id,
        payload={"name": row.name, "version": row.version},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return DownloadUrlOut(signed_url=signed_url, expires_in=expires_in)


@router.post("/strategies/{upload_id}/finalize", response_model=FinalizeOut)
def finalize_upload(
    upload_id: uuid.UUID,
    payload: FinalizeIn,
    request: Request,
    user: User = Depends(current_user),
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
):
    row = (
        db.query(StrategyDocument)
        .filter(StrategyDocument.id == upload_id, StrategyDocument.client_id == client_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Upload not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"Already {row.status}")

    row.checksum = payload.checksum
    row.status = "active"
    # New uploads become the source of truth, demote prior versions
    db.query(StrategyDocument).filter(
        StrategyDocument.client_id == client_id,
        StrategyDocument.name == row.name,
        StrategyDocument.id != row.id,
    ).update({StrategyDocument.is_source_of_truth: False})
    row.is_source_of_truth = True

    audit.record(
        db,
        actor_user_id=user.id,
        action="strategy.upload.finalize",
        target_type="strategy_document",
        target_id=row.id,
        payload={"name": row.name, "version": row.version, "checksum": payload.checksum},
        ip=request.client.host if request.client else None,
    )
    db.commit()

    return FinalizeOut(
        ok=True,
        strategy=StrategyOut(
            id=str(row.id),
            name=row.name,
            version=row.version,
            storage_key=row.storage_key,
            size_bytes=row.size_bytes,
            mime_type=row.mime_type,
            checksum=row.checksum,
            is_source_of_truth=row.is_source_of_truth,
            status=row.status,
            uploaded_at=row.created_at,
            uploaded_by_email=user.email,
        ),
    )
