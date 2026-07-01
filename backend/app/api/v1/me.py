from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import tier as tier_config
from app.core.deps import current_user
from app.db.models import Backtest, Client, StrategyDocument, TermsAcceptance, TermsVersion, User
from app.db.session import get_db

router = APIRouter()


class TierUsage(BaseModel):
    """Current usage + limits so the frontend can render bars + upgrade prompts."""
    tier: str
    tier_label: str
    tier_tagline: str
    backtests_used_this_month: int
    backtests_per_month: int | None       # null = unlimited
    active_strategies: int
    max_active_strategies: int | None     # null = unlimited
    features: list[str]                    # feature keys included in this tier
    support_response_hours: int
    month_started_at: datetime
    month_ends_at: datetime


class ClientOut(BaseModel):
    id: str
    name: str
    tier: str
    status: str
    vam_enabled: bool = False  # drives client-side gating of the engine UI
    tier_usage: TierUsage | None = None


class MeOut(BaseModel):
    id: str
    email: str
    role: str
    status: str
    client: ClientOut | None
    needs_tnc_acceptance: bool
    latest_tnc_version_id: str | None
    # Convenience copy at the top level so the frontend can `if (me.vam_enabled)` without
    # null-checking through me.client. Mirrors me.client.vam_enabled when client is set.
    vam_enabled: bool = False


@router.get("/me", response_model=MeOut)
def get_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    client_out: ClientOut | None = None
    vam_enabled = False
    if user.client_id:
        client = db.query(Client).filter(Client.id == user.client_id).first()
        if client:
            vam_enabled = bool(client.vam_enabled)
            # Assemble tier usage — cheap 2 counts, keeps the /me response
            # a one-stop shop for the frontend header + tier card.
            cfg = tier_config.get_tier_config(client.tier)
            m_start, m_end = tier_config.month_bounds()
            bt_used = (
                db.query(Backtest)
                .filter(
                    Backtest.client_id == client.id,
                    Backtest.created_at >= m_start,
                    Backtest.created_at < m_end,
                )
                .count()
            )
            active_strat = (
                db.query(StrategyDocument)
                .filter(
                    StrategyDocument.client_id == client.id,
                    StrategyDocument.is_source_of_truth.is_(True),
                    StrategyDocument.status == "active",
                )
                .count()
            )
            usage = TierUsage(
                tier=cfg.key,
                tier_label=cfg.label,
                tier_tagline=cfg.tagline,
                backtests_used_this_month=bt_used,
                backtests_per_month=cfg.backtests_per_month,
                active_strategies=active_strat,
                max_active_strategies=cfg.max_active_strategies,
                features=sorted(cfg.features),
                support_response_hours=cfg.support_response_hours,
                month_started_at=m_start,
                month_ends_at=m_end,
            )
            client_out = ClientOut(
                id=str(client.id),
                name=client.name,
                tier=client.tier,
                status=client.status,
                vam_enabled=vam_enabled,
                tier_usage=usage,
            )

    latest = (
        db.query(TermsVersion).order_by(TermsVersion.effective_from.desc()).first()
    )
    needs_tnc = False
    latest_id = None
    if latest and user.role == "client":
        latest_id = str(latest.id)
        accepted = (
            db.query(TermsAcceptance)
            .filter(
                TermsAcceptance.user_id == user.id,
                TermsAcceptance.terms_version_id == latest.id,
            )
            .first()
        )
        needs_tnc = accepted is None

    return MeOut(
        id=str(user.id),
        email=user.email,
        role=user.role,
        status=user.status,
        client=client_out,
        needs_tnc_acceptance=needs_tnc,
        latest_tnc_version_id=latest_id,
        vam_enabled=vam_enabled,
    )
