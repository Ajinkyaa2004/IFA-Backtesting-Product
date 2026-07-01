"""Deterministic-synthetic benchmark curves.

Section 10 of the Todoist explicitly wants 'Real benchmark data (dummy)' —
the word 'dummy' is in the ask, so we don't need real yfinance data for
MVP. We generate reproducible curves for SPY, NIFTY 50, and BTC that:

  * cover any date range without external network calls
  * have realistic drift + volatility per asset class
  * are DETERMINISTIC — same date range → same curve on every request,
    important so a client refreshing the chart sees a stable line
  * are labeled as synthetic in the response (source: 'synthetic_dummy_v1')

When Anmol's meeting Section G approves the ~$0/mo yfinance transport +
weekly cron, we swap the internal `_series` function for a DB read and
keep the endpoint shape unchanged. Frontend never has to know.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta


@dataclass(frozen=True)
class BenchmarkSpec:
    symbol: str
    display_name: str
    drift_annual_pct: float
    vol_annual_pct: float
    seed_word: str
    color: str


# Realistic-ish long-run parameters. Numbers are annualised.
BENCHMARKS: list[BenchmarkSpec] = [
    BenchmarkSpec("SPY",      "S&P 500", 10.5, 15.0, "spx",    "#0284c7"),  # sky-600
    BenchmarkSpec("NIFTY50",  "NIFTY 50", 13.5, 18.0, "nifty",  "#059669"),  # emerald-600
    BenchmarkSpec("BTC-USD",  "Bitcoin", 60.0, 65.0, "btc",    "#f59e0b"),  # amber-500
]


def _deterministic_step(seed: str, day_index: int) -> float:
    """Pseudo-Gaussian step derived from SHA-256 of (seed, day_index).

    Not a real random walk (no entropy) but produces a visually noisy curve
    that stays identical across requests. Uses two consecutive digest
    halves to approximate Box-Muller so we get roughly N(0,1) samples.
    """
    material = f"{seed}::{day_index}".encode()
    digest = hashlib.sha256(material).digest()
    # Take two 32-bit slices, normalise to (0,1), Box-Muller transform.
    u1 = int.from_bytes(digest[0:4], "big") / (2**32)
    u2 = int.from_bytes(digest[4:8], "big") / (2**32)
    u1 = max(u1, 1e-9)  # avoid log(0)
    z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
    return z


def _generate_curve(
    spec: BenchmarkSpec,
    start: date,
    end: date,
    start_value: float = 100.0,
) -> list[dict[str, float | str]]:
    """Geometric Brownian motion with deterministic pseudo-noise."""
    if end < start:
        return []
    days = (end - start).days + 1
    # Convert annualised params to daily. 252 trading days/yr; we use
    # calendar days here for simplicity — fine for a demo chart.
    drift_daily = spec.drift_annual_pct / 100.0 / 365.0
    vol_daily = spec.vol_annual_pct / 100.0 / math.sqrt(365.0)

    curve: list[dict[str, float | str]] = []
    value = start_value
    for i in range(days):
        d = start + timedelta(days=i)
        z = _deterministic_step(spec.seed_word, i)
        # dS = S * (mu*dt + sigma*sqrt(dt)*z)   with dt = 1 day
        change = value * (drift_daily + vol_daily * z)
        value = max(value + change, 0.01)
        curve.append({"date": d.isoformat(), "value": round(value, 4)})
    return curve


def build_benchmark_series(
    from_date: date | None,
    to_date: date | None,
    normalise_to: float = 100.0,
) -> dict[str, object]:
    """Return {source, from, to, series: {SYMBOL: [{date, value}, ...]}}."""
    if from_date is None or to_date is None:
        return {"source": "synthetic_dummy_v1", "from": None, "to": None, "series": {}}
    series: dict[str, list[dict[str, float | str]]] = {}
    for spec in BENCHMARKS:
        series[spec.symbol] = _generate_curve(spec, from_date, to_date, start_value=normalise_to)
    return {
        "source": "synthetic_dummy_v1",
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "series": series,
        "meta": [
            {
                "symbol": spec.symbol,
                "display_name": spec.display_name,
                "color": spec.color,
                "drift_annual_pct": spec.drift_annual_pct,
                "vol_annual_pct": spec.vol_annual_pct,
            }
            for spec in BENCHMARKS
        ],
    }


def parse_date(v: object) -> date | None:
    """Accept 'YYYY-MM-DD', datetime, or None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        try:
            return datetime.strptime(v[:10], "%Y-%m-%d").date()
        except ValueError:
            return None
    return None
