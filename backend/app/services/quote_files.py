"""Proposal-file helpers shared by the admin and client quote endpoints.

The model (app/db/models/quote_file.py) documents the revision rules. This
module holds the mechanics: validating an upload, storing it, numbering
revisions, and shaping rows for the two audiences.

Every function that changes rows expects the CALLER to hold a row lock on the
parent Quote (SELECT ... FOR UPDATE) and to own the transaction. The lock is
what makes "next revision = max + 1" safe when two admins upload at once, and
what stops an upload racing a client's Accept.
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from collections.abc import Callable
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Quote, QuoteFile, User
from app.services import storage

MAX_BYTES = 25 * 1024 * 1024  # 25 MB, matches nginx client_max_body_size
MAX_NOTE_LEN = 1000
MAX_FILENAME_LEN = 200
_SAFE_CHAR_RE = re.compile(r"[^A-Za-z0-9._-]+")

_ZIP_MAGIC = b"PK\x03\x04"  # docx / xlsx / pptx are zip containers
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy doc / xls / ppt


def _looks_like_text(head: bytes) -> bool:
    return b"\x00" not in head


# extension -> (mime type, does the file header match that type?)
# The mime type is derived here, never taken from the client, and the header
# check stops an .exe renamed to .pdf from being served to a client.
_TYPES: dict[str, tuple[str, Callable[[bytes], bool]]] = {
    ".pdf": ("application/pdf", lambda h: b"%PDF-" in h[:1024]),
    ".doc": ("application/msword", lambda h: h.startswith(_OLE_MAGIC)),
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        lambda h: h.startswith(_ZIP_MAGIC),
    ),
    ".xls": ("application/vnd.ms-excel", lambda h: h.startswith(_OLE_MAGIC)),
    ".xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        lambda h: h.startswith(_ZIP_MAGIC),
    ),
    ".ppt": ("application/vnd.ms-powerpoint", lambda h: h.startswith(_OLE_MAGIC)),
    ".pptx": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        lambda h: h.startswith(_ZIP_MAGIC),
    ),
    ".txt": ("text/plain", _looks_like_text),
}
ALLOWED_EXTENSIONS = tuple(_TYPES)


# ── Upload validation ──────────────────────────────────────────────────────


def clean_filename(raw: str | None) -> tuple[str, str]:
    """Return (safe_filename, extension). 400 / 415 if untrustworthy."""
    if not raw or "\x00" in raw:
        raise HTTPException(status_code=400, detail="Invalid filename")
    base = os.path.basename(raw.replace("\\", "/")).strip()
    if not base or base in {".", ".."} or base.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    root, ext = os.path.splitext(base)
    ext = ext.lower()
    if ext not in _TYPES:
        allowed = ", ".join(e.lstrip(".") for e in ALLOWED_EXTENSIONS)
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {ext or '(none)'}. Allowed: {allowed}.",
        )
    safe_root = _SAFE_CHAR_RE.sub("_", root).strip("._-") or "proposal"
    return (safe_root + ext)[:MAX_FILENAME_LEN], ext


def read_upload(upload: UploadFile, ext: str) -> bytes:
    """Read the whole upload with a hard size cap and a header sanity check."""
    data = upload.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_BYTES // (1024 * 1024)}MB limit",
        )
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    if not _TYPES[ext][1](data[:8192]):
        raise HTTPException(
            status_code=415,
            detail=f"File contents do not look like a {ext.lstrip('.').upper()} file",
        )
    return data


def clean_note(note: str | None) -> str | None:
    note = (note or "").strip()
    if not note:
        return None
    if len(note) > MAX_NOTE_LEN:
        raise HTTPException(status_code=400, detail=f"Note is longer than {MAX_NOTE_LEN} characters")
    return note


# ── Queries ────────────────────────────────────────────────────────────────


def working_copy(db: Session, quote_id: uuid.UUID) -> QuoteFile | None:
    return (
        db.query(QuoteFile)
        .filter(QuoteFile.quote_id == quote_id, QuoteFile.revision.is_(None))
        .first()
    )


def latest_revision(db: Session, quote_id: uuid.UUID) -> int:
    """Highest published revision number, 0 when nothing has been sent."""
    return (
        db.query(func.coalesce(func.max(QuoteFile.revision), 0))
        .filter(QuoteFile.quote_id == quote_id)
        .scalar()
    )


def published_file(db: Session, quote_id: uuid.UUID, file_id: uuid.UUID) -> QuoteFile | None:
    return (
        db.query(QuoteFile)
        .filter(
            QuoteFile.id == file_id,
            QuoteFile.quote_id == quote_id,
            QuoteFile.sent_at.is_not(None),
        )
        .first()
    )


def _load(
    db: Session, quote_ids: list[uuid.UUID], *, published_only: bool
) -> dict[uuid.UUID, list[tuple[QuoteFile, str | None]]]:
    out: dict[uuid.UUID, list[tuple[QuoteFile, str | None]]] = {qid: [] for qid in quote_ids}
    if not quote_ids:
        return out
    q = (
        db.query(QuoteFile, User.email)
        .outerjoin(User, User.id == QuoteFile.uploaded_by)
        .filter(QuoteFile.quote_id.in_(quote_ids))
    )
    if published_only:
        q = q.filter(QuoteFile.sent_at.is_not(None))
    for row, email in q.all():
        out[row.quote_id].append((row, email))
    # Working copy first, then newest revision first.
    for rows in out.values():
        rows.sort(key=lambda r: (0, 0) if r[0].revision is None else (1, -r[0].revision))
    return out


# ── Response shapes ────────────────────────────────────────────────────────


class QuoteFileOut(BaseModel):
    """What the client sees. Only ever built from published revisions."""

    id: str
    revision: int
    filename: str
    mime_type: str
    size_bytes: int
    checksum: str
    note: str | None
    sent_at: datetime


class QuoteFileAdminOut(BaseModel):
    """What admins see, including the unsent working copy."""

    id: str
    revision: int | None
    is_working_copy: bool
    filename: str
    mime_type: str
    size_bytes: int
    checksum: str
    note: str | None
    uploaded_by_email: str | None
    sent_at: datetime | None
    created_at: datetime


class QuoteFileDownloadOut(BaseModel):
    signed_url: str
    expires_in: int


def client_files(db: Session, quote_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[QuoteFileOut]]:
    loaded = _load(db, quote_ids, published_only=True)
    return {
        qid: [
            QuoteFileOut(
                id=str(f.id),
                revision=f.revision,
                filename=f.filename,
                mime_type=f.mime_type,
                size_bytes=f.size_bytes,
                checksum=f.checksum,
                note=f.note,
                sent_at=f.sent_at,
            )
            for f, _ in rows
        ]
        for qid, rows in loaded.items()
    }


def admin_file_out(f: QuoteFile, uploaded_by_email: str | None) -> QuoteFileAdminOut:
    return QuoteFileAdminOut(
        id=str(f.id),
        revision=f.revision,
        is_working_copy=f.revision is None,
        filename=f.filename,
        mime_type=f.mime_type,
        size_bytes=f.size_bytes,
        checksum=f.checksum,
        note=f.note,
        uploaded_by_email=uploaded_by_email,
        sent_at=f.sent_at,
        created_at=f.created_at,
    )


def admin_files(db: Session, quote_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[QuoteFileAdminOut]]:
    loaded = _load(db, quote_ids, published_only=False)
    return {qid: [admin_file_out(f, email) for f, email in rows] for qid, rows in loaded.items()}


# ── Mutations (caller holds the Quote row lock and owns the transaction) ───


def publish_working_copy(db: Session, quote: Quote) -> QuoteFile | None:
    """Promote the draft's working copy to the next revision. Called when the
    quote is sent. Returns the published row, or None if nothing was attached
    (a quote without a proposal file is allowed)."""
    wc = working_copy(db, quote.id)
    if wc is None:
        return None
    wc.revision = latest_revision(db, quote.id) + 1
    wc.sent_at = datetime.now(timezone.utc)
    db.flush()
    return wc


def store_new_file(
    db: Session,
    *,
    quote: Quote,
    actor: User,
    filename: str,
    ext: str,
    data: bytes,
    note: str | None,
) -> tuple[QuoteFile, str | None]:
    """Write bytes to storage and add the row. Returns (row, replaced_key).

    Draft quote  -> the file becomes the working copy, replacing any earlier
                    working copy (never sent, so not history). `replaced_key`
                    is the old object the caller should delete after commit.
    Sent quote   -> the file becomes the next published revision immediately.

    If the DB step fails after the bytes were written, the new object is
    removed again so storage does not accumulate orphans.
    """
    file_id = uuid.uuid4()
    key = f"clients/{quote.client_id}/quotes/{quote.id}/{file_id}/{filename}"
    try:
        storage.upload_bytes(key, data, _TYPES[ext][0])
    except Exception as e:  # noqa: BLE001 - supabase / network errors vary
        logger.exception("quote_files: storage upload failed for quote {}: {}", quote.id, e)
        raise HTTPException(status_code=502, detail="Could not store the file. Please try again.") from e

    replaced_key: str | None = None
    try:
        publish_now = quote.status == "sent"
        if not publish_now:
            old = working_copy(db, quote.id)
            if old is not None:
                replaced_key = old.storage_key
                db.delete(old)
                # Flush the delete first: within one flush SQLAlchemy runs
                # INSERTs before DELETEs, which would trip the one-working-copy
                # unique index.
                db.flush()
        row = QuoteFile(
            id=file_id,
            quote_id=quote.id,
            revision=(latest_revision(db, quote.id) + 1) if publish_now else None,
            filename=filename,
            mime_type=_TYPES[ext][0],
            size_bytes=len(data),
            checksum=hashlib.sha256(data).hexdigest(),
            storage_key=key,
            note=note,
            uploaded_by=actor.id,
            sent_at=datetime.now(timezone.utc) if publish_now else None,
        )
        db.add(row)
        db.flush()
        return row, replaced_key
    except Exception:
        delete_object_quietly(key)
        raise


def delete_object_quietly(key: str | None) -> None:
    """Best-effort storage cleanup. A leftover object is harmless; failing the
    request over it would not be."""
    if not key:
        return
    try:
        storage.delete_object(key)
    except Exception as e:  # noqa: BLE001
        logger.warning("quote_files: could not delete storage object {}: {}", key, e)
