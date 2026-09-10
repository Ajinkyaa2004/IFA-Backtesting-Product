"""Admin engagement endpoints - Chirag Item #1.

    GET   /admin/clients/{client_id}/engagement    - read
    PATCH /admin/clients/{client_id}/engagement    - edit scope + engine +
                                                    tier + deliverable +
                                                    canonical_strategy_id.
                                                    Scope edit bumps
                                                    scope_version, resets
                                                    acked_scope_version on
                                                    all client users so they
                                                    re-ack on next login.

Every mutation is audit-logged with the before/after so we can answer
"who bumped the scope on 2026-05-18" three months later.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import Client, Engagement, Service, User
from app.db.session import get_db
from app.services import audit

router = APIRouter()


class EngagementOut(BaseModel):
    id: str
    code: str
    client_id: str
    status: str
    tier: str
    scope_in: list[str]
    scope_out: list[str]
    scope_version: int
    engine_assignment: str
    engine_id: str | None
    canonical_strategy_id: str | None
    accepted_tnc_version_id: str | None
    deliverable: str
    whatsapp_group_link: str | None
    service_id: str | None
    service_code: str | None
    service_name: str | None
    created_at: datetime
    updated_at: datetime


class EngagementPatchIn(BaseModel):
    status: Literal["pending", "active", "suspended", "closed"] | None = None
    tier: Literal["tier1", "tier2", "tier3"] | None = None
    scope_in: list[str] | None = None
    scope_out: list[str] | None = None
    engine_assignment: Literal["existing", "bespoke", "manual"] | None = None
    engine_id: str | None = None
    canonical_strategy_id: str | None = None
    deliverable: str | None = Field(default=None, max_length=2000)
    whatsapp_group_link: str | None = Field(default=None, max_length=500)
    service_id: str | None = None


def _to_out(e: Engagement, service: Service | None = None) -> EngagementOut:
    return EngagementOut(
        id=str(e.id),
        code=e.code,
        client_id=str(e.client_id),
        status=e.status,
        tier=e.tier,
        scope_in=list(e.scope_in or []),
        scope_out=list(e.scope_out or []),
        scope_version=e.scope_version,
        engine_assignment=e.engine_assignment,
        engine_id=str(e.engine_id) if e.engine_id else None,
        canonical_strategy_id=str(e.canonical_strategy_id) if e.canonical_strategy_id else None,
        accepted_tnc_version_id=str(e.accepted_tnc_version_id) if e.accepted_tnc_version_id else None,
        deliverable=e.deliverable,
        whatsapp_group_link=e.whatsapp_group_link,
        service_id=str(e.service_id) if e.service_id else None,
        service_code=service.code if service else None,
        service_name=service.name if service else None,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


def _load_service(db: Session, service_id) -> Service | None:
    if not service_id:
        return None
    return db.query(Service).filter(Service.id == service_id).first()


@router.get("/clients/{client_id}/engagement", response_model=EngagementOut)
def get_engagement(
    client_id: uuid.UUID,
    _admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    eng = db.query(Engagement).filter(Engagement.client_id == client_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return _to_out(eng, _load_service(db, eng.service_id))


@router.patch("/clients/{client_id}/engagement", response_model=EngagementOut)
def patch_engagement(
    client_id: uuid.UUID,
    payload: EngagementPatchIn,
    request: Request,
    admin: User = Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    eng = db.query(Engagement).filter(Engagement.client_id == client_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    changes = payload.model_dump(exclude_none=True)
    if not changes:
        return _to_out(eng)

    # Snapshot before so audit + scope-change detection has both sides.
    before = {
        "status": eng.status,
        "tier": eng.tier,
        "scope_in": list(eng.scope_in or []),
        "scope_out": list(eng.scope_out or []),
        "scope_version": eng.scope_version,
        "engine_assignment": eng.engine_assignment,
        "engine_id": str(eng.engine_id) if eng.engine_id else None,
        "canonical_strategy_id": str(eng.canonical_strategy_id) if eng.canonical_strategy_id else None,
        "deliverable": eng.deliverable,
        "whatsapp_group_link": eng.whatsapp_group_link,
    }

    # Detect scope changes: mutating scope_in OR scope_out bumps scope_version
    # and clears acked_scope_version on all users under this client (they re-ack
    # on next login). This is the mechanic Chirag calls out in Section 5.
    scope_changed = False
    if "scope_in" in changes and changes["scope_in"] != before["scope_in"]:
        scope_changed = True
    if "scope_out" in changes and changes["scope_out"] != before["scope_out"]:
        scope_changed = True

    # Apply the plain-field edits first.
    for k, v in changes.items():
        if k == "engine_id":
            setattr(eng, k, uuid.UUID(v) if v else None)
        elif k == "canonical_strategy_id":
            setattr(eng, k, uuid.UUID(v) if v else None)
        elif k == "service_id":
            setattr(eng, k, uuid.UUID(v) if v else None)
        else:
            setattr(eng, k, v)

    # If tier changed, keep Client.tier in sync so the tier-gate deps don't
    # diverge from the Engagement. Chirag Section 9 calls out consolidation
    # under the Engagement, but existing enforcement reads Client.tier.
    if "tier" in changes:
        client = db.query(Client).filter(Client.id == client_id).first()
        if client and client.tier != changes["tier"]:
            client.tier = changes["tier"]

    # Scope-change side effects
    if scope_changed:
        eng.scope_version += 1
        db.query(User).filter(User.client_id == client_id).update(
            {User.acked_scope_version: None}, synchronize_session=False
        )

    audit.record(
        db,
        actor_user_id=admin.id,
        action="engagement.update",
        target_type="engagement",
        target_id=eng.id,
        payload={
            "client_id": str(client_id),
            "before": before,
            "changes": changes,
            "scope_bumped": scope_changed,
            "new_scope_version": eng.scope_version,
        },
        ip=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(eng)
    return _to_out(eng, _load_service(db, eng.service_id))
