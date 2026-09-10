"""Tier feature matrix + monthly limits.

Single source of truth for what a client on each tier can do. The frontend
mirrors this at frontend/src/lib/tier.ts - both must be updated together
when Anmol's final numbers land (see DECISIONS_BY_AJINKYA.md § 'Still
needs Anmol').

Enforcement layer:
  * require_feature("<feature_key>") — FastAPI dependency that raises 403
    with a helpful upgrade hint if the caller's tier doesn't include it
  * enforce_backtest_limit() — raises 429 if the caller has already run
    N backtests in the current calendar month, where N = tier.backtests_per_month

The design keeps the tier logic HERE (not sprinkled through routers) so
turning a knob is a one-file edit.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

TierName = Literal["tier1", "tier2", "tier3"]

# Feature keys — every gated feature has an entry in TIER_CONFIG.features
FeatureKey = Literal[
    "pdf_export",
    "vam_engine",
    "benchmark_comparison",
    "ai_chatbot",
    "optimisation_engine",
    "priority_support",
    "custom_strategy_engineering",
    "unlimited_backtests",
]


@dataclass(frozen=True)
class TierConfig:
    key: TierName
    label: str
    tagline: str
    # None = unlimited; int = hard cap per calendar month
    backtests_per_month: int | None
    # None = unlimited; int = maximum concurrent (active) strategy docs
    max_active_strategies: int | None
    features: frozenset[FeatureKey] = field(default_factory=frozenset)
    # First-response SLA in business hours — displayed to the user, not enforced
    support_response_hours: int = 24


TIER_CONFIG: dict[TierName, TierConfig] = {
    "tier1": TierConfig(
        key="tier1",
        label="Starter",
        tagline="Everything you need to submit a strategy and see one backtest a month.",
        backtests_per_month=1,
        max_active_strategies=3,
        features=frozenset({
            "pdf_export",
        }),
        support_response_hours=24,
    ),
    "tier2": TierConfig(
        key="tier2",
        label="Growth",
        tagline="Multiple backtests, direct engine access, priority attention.",
        backtests_per_month=5,
        max_active_strategies=10,
        features=frozenset({
            "pdf_export",
            "vam_engine",
            "benchmark_comparison",
            "priority_support",
        }),
        support_response_hours=8,
    ),
    "tier3": TierConfig(
        key="tier3",
        label="Enterprise",
        tagline="Unlimited backtests + custom strategy engineering + SLA.",
        backtests_per_month=None,      # unlimited
        max_active_strategies=None,    # unlimited
        features=frozenset({
            "pdf_export",
            "vam_engine",
            "benchmark_comparison",
            "priority_support",
            "custom_strategy_engineering",
            "unlimited_backtests",
        }),
        support_response_hours=2,
    ),
}


def get_tier_config(tier: str) -> TierConfig:
    """Look up a tier config, defaulting to Starter if the value is
    malformed. The DB CheckConstraint guarantees tier1/2/3 so this is
    defence-in-depth, not a real fallback path."""
    return TIER_CONFIG.get(tier, TIER_CONFIG["tier1"])  # type: ignore[return-value]


def month_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return the UTC start/end of the current calendar month.

    Used by enforce_backtest_limit to count backtests in the current
    billing window. Calendar month, not rolling 30d, matches typical SaaS
    billing intuition ('you have 5 backtests each month').
    """
    now = now or datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Move to the first of next month, then back one microsecond
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


class TierGateError(Exception):
    """Raised when a request violates the caller's tier limits.

    The router-level handler converts this to an HTTP 429 (limit hit) or
    403 (feature not available) with a JSON body that the frontend uses
    to render the upgrade prompt.
    """

    def __init__(
        self,
        kind: Literal["limit", "feature"],
        message: str,
        current_tier: str,
        required_tier: TierName | None = None,
        feature_key: FeatureKey | None = None,
        limit: int | None = None,
        used: int | None = None,
    ):
        super().__init__(message)
        self.kind = kind
        self.current_tier = current_tier
        self.required_tier = required_tier
        self.feature_key = feature_key
        self.limit = limit
        self.used = used

    def as_detail(self) -> dict:
        """Body the router will hand to HTTPException(detail=...)."""
        return {
            "error": "tier_gate",
            "kind": self.kind,
            "message": str(self),
            "current_tier": self.current_tier,
            "required_tier": self.required_tier,
            "feature_key": self.feature_key,
            "limit": self.limit,
            "used": self.used,
        }


def check_feature(tier: str, feature: FeatureKey) -> None:
    """Raise TierGateError if the tier doesn't include the feature.

    Router code:
        try:
            check_feature(client.tier, "pdf_export")
        except TierGateError as e:
            raise HTTPException(status_code=403, detail=e.as_detail()) from e
    """
    cfg = get_tier_config(tier)
    if feature not in cfg.features:
        # Find the lowest tier that DOES have this feature — the frontend
        # uses this to prompt "Upgrade to Growth" specifically.
        required = None
        for t_name, t_cfg in TIER_CONFIG.items():
            if feature in t_cfg.features:
                required = t_name
                break
        raise TierGateError(
            kind="feature",
            message=(
                f"{feature.replace('_', ' ').title()} is not available on the "
                f"{cfg.label} tier. Upgrade to unlock it."
            ),
            current_tier=tier,
            required_tier=required,  # type: ignore[arg-type]
            feature_key=feature,
        )


def check_backtest_limit(tier: str, used_this_month: int) -> None:
    """Raise TierGateError if the tier's monthly backtest cap is hit."""
    cfg = get_tier_config(tier)
    limit = cfg.backtests_per_month
    if limit is None:
        return  # unlimited
    if used_this_month >= limit:
        raise TierGateError(
            kind="limit",
            message=(
                f"You've used {used_this_month} of {limit} backtests on the "
                f"{cfg.label} plan this month. Upgrade for more."
            ),
            current_tier=tier,
            limit=limit,
            used=used_this_month,
        )


def check_active_strategy_limit(tier: str, active_count: int) -> None:
    """Raise TierGateError if uploading a new strategy would exceed the tier's cap.

    'Active' means status='active' and is_source_of_truth=True (only current
    versions count; historical versions are free).
    """
    cfg = get_tier_config(tier)
    limit = cfg.max_active_strategies
    if limit is None:
        return  # unlimited
    if active_count >= limit:
        raise TierGateError(
            kind="limit",
            message=(
                f"You have {active_count} of {limit} strategies allowed on the "
                f"{cfg.label} plan. Archive one or upgrade to upload more."
            ),
            current_tier=tier,
            limit=limit,
            used=active_count,
        )
