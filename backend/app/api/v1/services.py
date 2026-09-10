"""Public services catalog endpoint.

Read-only. Returns the list of active services in sort_order. Consumed by:
  * The client onboarding wizard (service picker step)
  * The admin engagement editor's service dropdown
  * The client dashboard (to render service-appropriate copy)

Kept unauthenticated because it's just a static catalog - no client data.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.models import Service
from app.db.session import get_db

router = APIRouter()


class ServiceOut(BaseModel):
    id: str
    code: str
    name: str
    tagline: str | None
    description: str | None
    icon: str | None
    sort_order: int
    lifecycle_template: list[dict] | None


@router.get("/services", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)):
    rows = (
        db.query(Service)
        .filter(Service.is_active.is_(True))
        .order_by(Service.sort_order.asc(), Service.name.asc())
        .all()
    )
    return [
        ServiceOut(
            id=str(r.id),
            code=r.code,
            name=r.name,
            tagline=r.tagline,
            description=r.description,
            icon=r.icon,
            sort_order=r.sort_order,
            lifecycle_template=r.lifecycle_template,
        )
        for r in rows
    ]
