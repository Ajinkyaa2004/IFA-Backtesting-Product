"""Client-facing engagement endpoints.

    POST /engagement/re-ack   — record the caller acknowledging the current
                                scope_version. együtt clears the re-ack banner
                                on their next /me call.

Client-facing GET is folded into /me — see me.py for the summary shape.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.deps import current_user
from app.db.models import Engagement, User
from app.db.session import get_db
from app.services import audit

router = APIRouter()


@router.post("/engagement/re-ack")
def re_ack_scope(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Client user acknowledges the current engagement scope_version.

    Sets User.acked_scope_version = Engagement.scope_version. On next
    /me call, the banner disappears. Every re-ack is audit-logged so we
    can prove which version a specific human accepted at what time.
    """
    if user.role != "client" or user.client_id is None:
        raise HTTPException(status_code=403, detail="Client-only endpoint")

    eng = db.query(Engagement).filter(Engagement.client_id == user.client_id).first()
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found for client")

    user.acked_scope_version = eng.scope_version
    audit.record(
        db,
        actor_user_id=user.id,
        action="engagement.scope.re_ack",
        target_type="engagement",
        target_id=eng.id,
        payload={
            "acked_scope_version": eng.scope_version,
            "client_id": str(user.client_id),
        },
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return {"ok": True, "acked_scope_version": eng.scope_version}
