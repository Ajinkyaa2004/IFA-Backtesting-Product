from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import TermsVersion
from app.db.session import get_db
from app.services import audit

router = APIRouter()


class Clause(BaseModel):
    id: str
    title: str
    body: str
    required: bool = True


class PublishTermsIn(BaseModel):
    version: str
    body: str
    clauses: list[Clause]


class TermsVersionOut(BaseModel):
    id: str
    version: str
    body: str
    clauses: list[Clause]
    effective_from: datetime


@router.get("/terms", response_model=list[TermsVersionOut])
def list_terms(
    _admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    rows = db.query(TermsVersion).order_by(desc(TermsVersion.effective_from)).all()
    return [
        TermsVersionOut(
            id=str(r.id),
            version=r.version,
            body=r.body,
            clauses=r.clauses,
            effective_from=r.effective_from,
        )
        for r in rows
    ]


@router.post("/terms", response_model=TermsVersionOut, status_code=201)
def publish_terms(
    payload: PublishTermsIn,
    request: Request,
    admin=Depends(require_role("main_admin")),
    db: Session = Depends(get_db),
):
    if db.query(TermsVersion).filter(TermsVersion.version == payload.version).first():
        raise HTTPException(status_code=409, detail=f"Version {payload.version} already exists")
    tv = TermsVersion(
        version=payload.version,
        body=payload.body,
        clauses=[c.model_dump() for c in payload.clauses],
        effective_from=datetime.now(timezone.utc),
        created_by=admin.id,
    )
    db.add(tv)
    db.flush()
    audit.record(
        db,
        actor_user_id=admin.id,
        action="tnc.publish",
        target_type="terms_version",
        target_id=tv.id,
        payload={"version": payload.version, "n_clauses": len(payload.clauses)},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return TermsVersionOut(
        id=str(tv.id),
        version=tv.version,
        body=tv.body,
        clauses=tv.clauses,
        effective_from=tv.effective_from,
    )
