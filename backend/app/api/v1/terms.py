from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import current_user
from app.db.models import Engagement, TermsAcceptance, TermsVersion, User
from app.db.session import get_db
from app.services import audit

router = APIRouter()


class Clause(BaseModel):
    id: str
    title: str
    body: str
    required: bool = True


class TermsOut(BaseModel):
    id: str
    version: str
    body: str
    clauses: list[Clause]
    effective_from: datetime


class AcceptIn(BaseModel):
    version_id: str
    accepted_clauses: list[str]


class AcceptOut(BaseModel):
    ok: bool
    acceptance_id: str


@router.get("/terms/current", response_model=TermsOut)
def get_current_terms(
    _user: User = Depends(current_user), db: Session = Depends(get_db)
):
    latest = db.query(TermsVersion).order_by(TermsVersion.effective_from.desc()).first()
    if not latest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No T&C version published")
    return TermsOut(
        id=str(latest.id),
        version=latest.version,
        body=latest.body,
        clauses=latest.clauses,
        effective_from=latest.effective_from,
    )


@router.post("/terms/accept", response_model=AcceptOut)
def accept_terms(
    payload: AcceptIn,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    latest = db.query(TermsVersion).order_by(TermsVersion.effective_from.desc()).first()
    if not latest or str(latest.id) != payload.version_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Submitted version is not current",
        )

    required_ids = {c["id"] for c in latest.clauses if c.get("required", True)}
    accepted = set(payload.accepted_clauses)
    missing = required_ids - accepted
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required clauses: {sorted(missing)}",
        )

    existing = (
        db.query(TermsAcceptance)
        .filter(
            TermsAcceptance.user_id == user.id,
            TermsAcceptance.terms_version_id == latest.id,
        )
        .first()
    )
    if existing:
        return AcceptOut(ok=True, acceptance_id=str(existing.id))

    acceptance = TermsAcceptance(
        user_id=user.id,
        terms_version_id=latest.id,
        clauses_accepted=payload.accepted_clauses,
        accepted_at=datetime.now(timezone.utc),
        ip=request.client.host if request.client else None,
    )
    db.add(acceptance)
    db.flush()

    # Activate the client's engagement now that the wall is cleared
    # (audit BE2). Without this, the lifecycle stepper stays on
    # 'pending' forever even after the client did everything asked of
    # them. Also stamps accepted_tnc_version_id so we know which
    # version this engagement was live under.
    engagement_activated = False
    if user.role == "client" and user.client_id:
        engagement = (
            db.query(Engagement)
            .filter(Engagement.client_id == user.client_id)
            .first()
        )
        if engagement:
            engagement.accepted_tnc_version_id = latest.id
            if engagement.status == "pending":
                engagement.status = "active"
                engagement_activated = True

    audit.record(
        db,
        actor_user_id=user.id,
        action="tnc.accept",
        target_type="terms_version",
        target_id=latest.id,
        payload={
            "clauses": payload.accepted_clauses,
            "version": latest.version,
            "engagement_activated": engagement_activated,
        },
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return AcceptOut(ok=True, acceptance_id=str(acceptance.id))
