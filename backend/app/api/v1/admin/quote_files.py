"""Admin proposal-file endpoints: upload a revision, get a download link.

Revision rules live in app/db/models/quote_file.py. In short: on a draft quote
an upload is the internal working copy; on a sent quote it is a new revision
that the client sees immediately (and is notified about); on an accepted /
rejected / expired quote the file set is frozen.

The file list itself rides along on the quote (QuoteAdminOut.files), so there
is no separate list endpoint.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Quote, QuoteFile, User
from app.db.session import get_db
from app.services import audit, notify, quote_files, storage
from app.services.quote_files import QuoteFileAdminOut, QuoteFileDownloadOut

router = APIRouter()


@router.post("/quotes/{quote_id}/files", response_model=QuoteFileAdminOut, status_code=201)
def upload_quote_file(
    quote_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    note: str | None = Form(default=None),
    admin: User = Depends(require_role("main_admin")),
    db: Session = Depends(get_db),
):
    # Validate the bytes first: cheap, and nothing is locked or written yet.
    filename, ext = quote_files.clean_filename(file.filename)
    data = quote_files.read_upload(file, ext)
    note = quote_files.clean_note(note)

    # Row lock: revision numbering, the frozen-state check and a client's
    # Accept all serialise on this quote.
    q = db.query(Quote).filter(Quote.id == quote_id).with_for_update().first()
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.status not in ("draft", "sent"):
        raise HTTPException(
            status_code=409,
            detail=(
                f"This quote is {q.status}, so its proposal files are frozen. "
                "Create a new quote to send a different proposal."
            ),
        )

    row: QuoteFile | None = None
    try:
        row, replaced_key = quote_files.store_new_file(
            db, quote=q, actor=admin, filename=filename, ext=ext, data=data, note=note
        )
        published = row.revision is not None
        audit.record(
            db, actor_user_id=admin.id, action="quote.file.upload",
            target_type="quote", target_id=q.id,
            payload={
                "code": q.code,
                "file_id": str(row.id),
                "revision": row.revision,
                "filename": row.filename,
                "size_bytes": row.size_bytes,
                "checksum": row.checksum,
                "published": published,
            },
            ip=request.client.host if request.client else None,
        )
        if published:
            notify.quote_revised(
                db, client_id=q.client_id, quote_id=q.id, code=q.code,
                title_str=q.title, revision=row.revision, note=note,
            )
        db.commit()
    except Exception:
        db.rollback()
        if row is not None:
            quote_files.delete_object_quietly(row.storage_key)
        raise

    quote_files.delete_object_quietly(replaced_key)
    db.refresh(row)
    return quote_files.admin_file_out(row, admin.email)


@router.get("/quote-files/{file_id}/download-url", response_model=QuoteFileDownloadOut)
def get_quote_file_download_url(
    file_id: uuid.UUID,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Short-lived signed URL for any revision, including the unsent working
    copy. Audit-logged, same discipline as the strategy download endpoint."""
    row = db.query(QuoteFile).filter(QuoteFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    expires_in = 300  # 5 minutes
    audit.record(
        db, actor_user_id=admin.id, action="admin.quote.file.download_url",
        target_type="quote", target_id=row.quote_id,
        payload={"file_id": str(row.id), "revision": row.revision, "filename": row.filename},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return QuoteFileDownloadOut(
        signed_url=storage.signed_download_url(row.storage_key, expires_in=expires_in),
        expires_in=expires_in,
    )
