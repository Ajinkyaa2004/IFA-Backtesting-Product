from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import tier as tier_config
from app.core.deps import current_user
from app.db.models import Backtest, Client, Engagement, StrategyDocument, TermsAcceptance, TermsVersion, User
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


class EngagementSummary(BaseModel):
    """Compact summary embedded in /me so the client scope panel + lifecycle
    stepper render without a second round-trip."""
    id: str
    code: str
    status: str
    scope_in: list[str]
    scope_out: list[str]
    scope_version: int
    engine_assignment: str
    engine_id: str | None
    deliverable: str
    canonical_strategy_id: str | None
    accepted_tnc_version_id: str | None
    # True when the CURRENT user has NOT acked the current scope_version.
    # Drives the re-ack banner + gate on the client-facing UI.
    needs_scope_reack: bool
    # Lifecycle stepper signals (Chirag Section 6). Derived on read so we
    # never persist a snapshot that goes stale.
    has_completed_backtest: bool
    # Engine.status once Item #3 lands. For MVP we approximate from
    # engine_assignment: 'existing' → 'live', 'bespoke' → 'dev', 'manual'
    # → None (step is skipped for manual). Frontend consumes this to render
    # the Engine ready step.
    engine_status: str | None


class ClientOut(BaseModel):
    id: str
    name: str
    tier: str
    status: str
    vam_enabled: bool = False  # drives client-side gating of the engine UI
    tier_usage: TierUsage | None = None
    engagement: EngagementSummary | None = None


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

            # Engagement summary — one row per client (Chirag Item #1).
            engagement_summary: EngagementSummary | None = None
            eng = db.query(Engagement).filter(Engagement.client_id == client.id).first()
            if eng:
                # Re-ack gate: user's acked_scope_version lags behind current.
                needs_reack = (
                    user.role == "client"
                    and (user.acked_scope_version or 0) < eng.scope_version
                )
                # Lifecycle stepper signals (Chirag Section 6).
                has_completed_bt = (
                    db.query(Backtest)
                    .filter(Backtest.client_id == client.id, Backtest.status == "completed")
                    .first()
                    is not None
                )
                # Engine status approximation until Item #3 ships the
                # engines table. Ravi's Enterprise VAM setup should show
                # engine ready; manual clients skip the step entirely.
                engine_status_str: str | None
                if eng.engine_assignment == "manual":
                    engine_status_str = None
                elif eng.engine_assignment == "existing":
                    engine_status_str = "live"
                else:  # bespoke
                    engine_status_str = "dev"
                engagement_summary = EngagementSummary(
                    id=str(eng.id),
                    code=eng.code,
                    status=eng.status,
                    scope_in=list(eng.scope_in or []),
                    scope_out=list(eng.scope_out or []),
                    scope_version=eng.scope_version,
                    engine_assignment=eng.engine_assignment,
                    engine_id=str(eng.engine_id) if eng.engine_id else None,
                    deliverable=eng.deliverable,
                    canonical_strategy_id=str(eng.canonical_strategy_id) if eng.canonical_strategy_id else None,
                    accepted_tnc_version_id=str(eng.accepted_tnc_version_id) if eng.accepted_tnc_version_id else None,
                    needs_scope_reack=needs_reack,
                    has_completed_backtest=has_completed_bt,
                    engine_status=engine_status_str,
                )

            client_out = ClientOut(
                id=str(client.id),
                name=client.name,
                tier=client.tier,
                status=client.status,
                vam_enabled=vam_enabled,
                tier_usage=usage,
                engagement=engagement_summary,
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
