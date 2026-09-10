"""Admin content editing endpoints.

    GET  /admin/content              - return full merged content dict + list
                                       of which keys have DB overrides vs. defaults
    PATCH /admin/content/{key}       - overwrite one category's stored value

Every write is audit-logged with the before/after diff so we can answer
'who changed the welcome banner and when' three months later.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import ContentSetting, User
from app.db.session import get_db
from app.services import audit, content

router = APIRouter()


class ContentGetOut(BaseModel):
    content: dict[str, dict]
    overridden_keys: list[str]


@router.get("/content", response_model=ContentGetOut)
def get_admin_content(
    _admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    overridden = {r.key for r in db.query(ContentSetting.key).all()}
    return ContentGetOut(
        content=content.get_all_content(db),
        overridden_keys=sorted(overridden),
    )


class ContentPatchIn(BaseModel):
    value: dict[str, Any]


@router.patch("/content/{key}")
def patch_content(
    key: str,
    payload: ContentPatchIn,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    if key not in content.CATEGORY_KEYS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown content category. Allowed: {sorted(content.CATEGORY_KEYS)}",
        )
    # Snapshot the previous state for audit
    prev = content.get_content_for_key(db, key)
    new_merged = content.upsert_content(db, key, payload.value, updated_by=admin.id)
    audit.record(
        db,
        actor_user_id=admin.id,
        action=f"content.update.{key}",
        target_type="content_setting",
        target_id=None,
        payload={"key": key, "previous": prev, "new": new_merged},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return {"key": key, "value": new_merged}


@router.post("/content/{key}/reset")
def reset_content(
    key: str,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    """Drop the admin override for a category - client sees the hardcoded
    default again on next load."""
    if key not in content.CATEGORY_KEYS:
        raise HTTPException(status_code=404, detail="Unknown content category")
    row = db.query(ContentSetting).filter(ContentSetting.key == key).first()
    if row is not None:
        db.delete(row)
        audit.record(
            db,
            actor_user_id=admin.id,
            action=f"content.reset.{key}",
            target_type="content_setting",
            target_id=None,
            payload={"key": key},
            ip=request.client.host if request.client else None,
        )
        db.commit()
    return {"key": key, "value": content.get_content_for_key(db, key)}
