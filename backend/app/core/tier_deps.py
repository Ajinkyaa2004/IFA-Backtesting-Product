"""FastAPI dependencies for tier enforcement.

Wrap the raw check_feature / check_backtest_limit primitives from tier.py
into deps that plug directly into router signatures.

Usage:
    @router.post("/vam/run")
    def run_vam(
        _tier: None = Depends(require_feature("vam_engine")),
        _limit: None = Depends(enforce_backtest_limit),
        ...
    ):
        ...

The deps look up the caller's client_id via client_scope, then read the
Client's tier from the DB. Admin impersonation is honored — an admin
impersonating a Growth-tier client sees Growth-tier limits.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import tier as tier_config
from app.core.deps import client_scope
from app.db.models import Backtest, Client, StrategyDocument
from app.db.session import get_db


def _get_client_tier(client_id: uuid.UUID, db: Session) -> str:
    row = db.query(Client.tier).filter(Client.id == client_id).first()
    if not row:
        # Client vanished between client_scope check and here (soft-delete race)
        raise HTTPException(
            status_code=404,
            detail="Client not found",
        )
    return row[0]


def require_feature(feature: tier_config.FeatureKey):
    """Return a FastAPI dependency that raises 403 if the caller's tier
    doesn't include the named feature.
    """
    def _check(
        client_id: uuid.UUID = Depends(client_scope),
        db: Session = Depends(get_db),
    ) -> None:
        tier = _get_client_tier(client_id, db)
        try:
            tier_config.check_feature(tier, feature)
        except tier_config.TierGateError as e:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=e.as_detail(),
            ) from e

    return _check


def enforce_backtest_limit(
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
) -> None:
    """Raise 429 if the caller has hit the monthly backtest cap.

    'Backtest' here means any row in `backtests` with created_at in the
    current calendar month, regardless of engine or status. This is the
    conservative reading — a client can't create-then-cancel to bypass.
    """
    tier = _get_client_tier(client_id, db)
    cfg = tier_config.get_tier_config(tier)
    if cfg.backtests_per_month is None:
        return  # unlimited
    start, end = tier_config.month_bounds()
    used = (
        db.query(Backtest)
        .filter(
            Backtest.client_id == client_id,
            Backtest.created_at >= start,
            Backtest.created_at < end,
        )
        .count()
    )
    try:
        tier_config.check_backtest_limit(tier, used)
    except tier_config.TierGateError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=e.as_detail(),
        ) from e


# Explicit-target variants for admin routes that act on behalf of a
# specific client. These take the client_id as an argument rather than
# reading it from client_scope, so admin upload/run flows can still
# respect the client's tier limits.

def check_backtest_limit_for_client(client_id: uuid.UUID, db: Session) -> None:
    tier = _get_client_tier(client_id, db)
    cfg = tier_config.get_tier_config(tier)
    if cfg.backtests_per_month is None:
        return
    start, end = tier_config.month_bounds()
    used = (
        db.query(Backtest)
        .filter(
            Backtest.client_id == client_id,
            Backtest.created_at >= start,
            Backtest.created_at < end,
        )
        .count()
    )
    try:
        tier_config.check_backtest_limit(tier, used)
    except tier_config.TierGateError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=e.as_detail(),
        ) from e


def enforce_active_strategy_limit(
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
) -> None:
    """Raise 429 on new strategy upload if the tier's active-strategy cap is hit."""
    tier = _get_client_tier(client_id, db)
    cfg = tier_config.get_tier_config(tier)
    if cfg.max_active_strategies is None:
        return
    active = (
        db.query(StrategyDocument)
        .filter(
            StrategyDocument.client_id == client_id,
            StrategyDocument.is_source_of_truth.is_(True),
            StrategyDocument.status == "active",
        )
        .count()
    )
    try:
        tier_config.check_active_strategy_limit(tier, active)
    except tier_config.TierGateError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=e.as_detail(),
        ) from e
