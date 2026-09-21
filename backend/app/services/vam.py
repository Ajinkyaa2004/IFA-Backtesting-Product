"""VAM (Volatility-Adjusted Momentum) engine client.

Adapter over Ravi's ravi_vam FastAPI engine. Ravi's engine has:
  - no auth (deployed on our private docker network as vam-engine:8000)
  - GET /api/strategies returning {[strategy_id]: config}
  - GET /api/strategies/{strategy_id} returning full config with params dict
  - GET /api/data-source (source badge only)
  - POST /api/backtest with body {strategy_id, params, initial_capital}
    returning {daily_log, trades, metrics, data_source}

Our platform expects a VAM engine that exposes:
  - Bearer-auth on every call
  - GET /api/strategies returning [{id, name, implemented}]
  - GET /api/strategies/{step_id}/schema returning {parameters: [...]}
  - GET /api/data/symbols and /api/data/info
  - POST /api/backtest/run with body params dict merged with {"step": id}
    returning {metrics, trades, chart_data}

This module bridges the two shapes so we don't have to fork Ravi's engine.

Failure modes (all surfaced as VAMError subclasses):
  * VAMConfigError     - VAM_BASE_URL not set (the auth env vars are ignored now)
  * VAMValidationError - Ravi returned 422/500 that we could classify as bad input
  * VAMUpstreamError   - anything else (5xx, timeout, transport error)

VAMAuthError is retained for backward compatibility but is never raised now
(kept so callers that catch it don't break).
"""
from __future__ import annotations

import asyncio
import random
import time
from typing import Any

import httpx
from loguru import logger

from app.core.config import get_settings


# ── Circuit breaker ────────────────────────────────────────────────────────
#
# When the VAM engine is fully offline (5xx in a row) we don't want every
# incoming client request to sit for 15s waiting on httpx timeout. The breaker
# tracks consecutive upstream failures and, past a threshold, short-circuits
# subsequent calls with an immediate VAMUpstreamError until a cooldown passes.

_CB_FAIL_THRESHOLD = 5
_CB_COOLDOWN_S     = 30.0


class _CircuitBreaker:
    def __init__(self):
        self._consec_failures = 0
        self._opened_at: float | None = None

    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        if time.time() - self._opened_at >= _CB_COOLDOWN_S:
            return "half_open"
        return "open"

    def before_call(self) -> None:
        st = self.state()
        if st == "open":
            raise VAMUpstreamError(
                "VAM engine is temporarily unavailable (circuit breaker open). "
                "Retry in a few seconds.",
                status_code=503,
            )

    def record_success(self) -> None:
        if self._opened_at is not None:
            logger.info("VAM circuit breaker: closing after successful probe")
        self._consec_failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._consec_failures += 1
        if self._opened_at is None and self._consec_failures >= _CB_FAIL_THRESHOLD:
            logger.warning(
                "VAM circuit breaker: OPENING after {} consecutive failures",
                self._consec_failures,
            )
            self._opened_at = time.time()
        elif self.state() == "half_open":
            logger.warning("VAM circuit breaker: half-open probe failed, re-opening")
            self._opened_at = time.time()


_cb = _CircuitBreaker()


def _should_retry(status_code: int | None, attempt: int, max_attempts: int) -> bool:
    if attempt + 1 >= max_attempts:
        return False
    if status_code is None:
        return True
    if 500 <= status_code < 600 and status_code not in (501, 505):
        return True
    return False


def _backoff_seconds(attempt: int) -> float:
    base = 0.4 * (2 ** attempt)
    return base + random.uniform(0, 0.2)


# ── Exceptions ─────────────────────────────────────────────────────────────


class VAMError(Exception):
    """Base class for all VAM client failures."""


class VAMConfigError(VAMError):
    """VAM_BASE_URL not configured."""


class VAMAuthError(VAMError):
    """Retained for backward compatibility; never raised now (Ravi's engine has no auth)."""


class VAMValidationError(VAMError):
    """VAM returned 422 with field-level violations."""

    def __init__(self, message: str, violations: list[dict] | None = None):
        super().__init__(message)
        self.violations = violations or []


class VAMUpstreamError(VAMError):
    """VAM returned 5xx, timed out, or transport-level error."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


# ── Static data lineage (no /api/data/symbols on Ravi's engine) ─────────────
#
# Hardcoded from the DataBento CSVs bundled with ravi_vam. Update the ranges
# if we ingest fresher data. Used by list_symbols() and get_data_info().

_DATABENTO_SYMBOLS: list[dict[str, str]] = [
    {"symbol": "SPY",  "start": "2020-01-02", "end": "2025-12-30"},
    {"symbol": "QQQ",  "start": "2020-01-02", "end": "2025-12-30"},
    {"symbol": "UPRO", "start": "2018-05-01", "end": "2025-12-30"},
    {"symbol": "TQQQ", "start": "2020-01-02", "end": "2025-12-30"},
    {"symbol": "SHY",  "start": "2018-05-01", "end": "2025-12-30"},
    {"symbol": "GLD",  "start": "2018-05-01", "end": "2025-12-30"},
    {"symbol": "TLT",  "start": "2018-05-01", "end": "2025-12-30"},
    {"symbol": "VIX",  "start": "1990-01-02", "end": "2026-03-20"},
]


# ── Client ─────────────────────────────────────────────────────────────────


class VAMClient:
    """Async client for Ravi's VAM engine, exposing the API shape our platform expects."""

    _BACKTEST_TIMEOUT_S = 90.0
    _DEFAULT_TIMEOUT_S = 15.0
    _MAX_ATTEMPTS = 3

    def __init__(self, base_url: str, email: str = "", password: str = ""):
        # email/password kept in the signature for backward compat; unused.
        self._base_url = base_url.rstrip("/")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        timeout: float | None = None,
    ) -> Any:
        """Perform an unauthenticated HTTP request with retry + circuit breaker.

        Ravi's engine has no auth layer, so we don't manage tokens. Retries 5xx
        and connection errors up to _MAX_ATTEMPTS with exponential backoff.
        422 is surfaced as VAMValidationError; other 4xx as VAMUpstreamError.
        """
        _cb.before_call()
        timeout = timeout or self._DEFAULT_TIMEOUT_S

        last_exc: VAMUpstreamError | None = None
        for attempt in range(self._MAX_ATTEMPTS):
            async with httpx.AsyncClient() as client:
                try:
                    resp = await client.request(
                        method,
                        f"{self._base_url}{path}",
                        json=json,
                        timeout=timeout,
                    )
                except httpx.RequestError as e:
                    _cb.record_failure()
                    if _should_retry(None, attempt, self._MAX_ATTEMPTS):
                        wait = _backoff_seconds(attempt)
                        logger.warning(
                            "VAM transport error on {} {} attempt {}/{} - retrying in {:.2f}s: {}",
                            method, path, attempt + 1, self._MAX_ATTEMPTS, wait, e,
                        )
                        await asyncio.sleep(wait)
                        continue
                    raise VAMUpstreamError(
                        f"VAM transport error on {method} {path} after {attempt + 1} attempts: {e}"
                    ) from e

                if resp.status_code == 422:
                    _cb.record_success()
                    detail = self._extract_violations(resp)
                    raise VAMValidationError(
                        f"VAM rejected payload on {method} {path}", violations=detail
                    )

                if resp.status_code == 404:
                    _cb.record_success()
                    body_preview = resp.text[:200]
                    raise VAMUpstreamError(
                        f"VAM {resp.status_code} on {method} {path}: {body_preview}",
                        status_code=resp.status_code,
                    )

                if not resp.is_success:
                    body_preview = resp.text[:300]
                    logger.warning(
                        "VAM upstream {} on {} {} (attempt {}/{}): {}",
                        resp.status_code, method, path,
                        attempt + 1, self._MAX_ATTEMPTS, body_preview,
                    )
                    _cb.record_failure()
                    last_exc = VAMUpstreamError(
                        f"VAM {resp.status_code} on {method} {path}: {body_preview}",
                        status_code=resp.status_code,
                    )
                    if _should_retry(resp.status_code, attempt, self._MAX_ATTEMPTS):
                        wait = _backoff_seconds(attempt)
                        logger.info("Retrying VAM call in {:.2f}s", wait)
                        await asyncio.sleep(wait)
                        continue
                    raise last_exc

                _cb.record_success()
                if resp.headers.get("content-type", "").startswith("text/"):
                    return resp.text
                return resp.json()

        if last_exc:
            raise last_exc
        raise VAMUpstreamError("VAM call failed after all retries", status_code=None)

    @staticmethod
    def _extract_violations(resp: httpx.Response) -> list[dict]:
        """Normalize a 422 body into [{path, message}]. Handles FastAPI shape."""
        try:
            body = resp.json()
        except ValueError:
            return [{"path": "(root)", "message": resp.text[:200]}]
        raw = body.get("detail") if isinstance(body, dict) else None
        if isinstance(raw, list):
            return [
                {
                    "path": "/".join(str(p) for p in (item.get("loc") or [])),
                    "message": item.get("msg") or str(item),
                }
                for item in raw
                if isinstance(item, dict)
            ]
        if isinstance(raw, str):
            return [{"path": "(root)", "message": raw}]
        return [{"path": "(root)", "message": str(body)[:200]}]

    # ---- Public API (platform-facing shape) ----

    async def list_strategies(self) -> list[dict]:
        """Return [{id, name, implemented}] - flattened from Ravi's dict-of-configs."""
        raw = await self._request("GET", "/api/strategies")
        if not isinstance(raw, dict):
            return []
        out: list[dict] = []
        for sid, cfg in raw.items():
            if not isinstance(cfg, dict):
                continue
            out.append({
                "id": sid,
                "name": cfg.get("name") or sid,
                "implemented": True,
            })
        return out

    async def get_step_schema(self, step_id: str) -> dict:
        """Return {step_id, parameters: [...]} shaped for our frontend VamParamForm.

        Transforms Ravi's params dict (metadata keyed by param name) into a
        list of parameter descriptors with typed `type` fields.
        """
        cfg = await self._request("GET", f"/api/strategies/{step_id}")
        if not isinstance(cfg, dict):
            return {"step_id": step_id, "parameters": []}
        params_dict = cfg.get("params") or {}
        parameters: list[dict] = []
        for name, meta in params_dict.items():
            if not isinstance(meta, dict):
                continue
            default = meta.get("default")
            step_size = meta.get("step")
            # Choose type: int if default+step both look integral, else float
            if isinstance(default, int) and not isinstance(default, bool) and (
                isinstance(step_size, int) or step_size is None
            ):
                typ = "int"
            else:
                typ = "float"
            parameters.append({
                "name": name,
                "type": typ,
                "default": default,
                "min": meta.get("min"),
                "max": meta.get("max"),
                "description": meta.get("label") or meta.get("group") or "",
            })
        return {"step_id": step_id, "parameters": parameters}

    async def list_symbols(self) -> list[dict]:
        """Static list — Ravi's engine doesn't expose /api/data/symbols."""
        return list(_DATABENTO_SYMBOLS)

    async def get_data_info(self) -> dict:
        """Expand /api/data-source into the lineage shape our Data Sources modal reads."""
        src = await self._request("GET", "/api/data-source")
        return {
            "source": src.get("source"),
            "label": src.get("label"),
            "is_fallback": src.get("is_fallback"),
            "symbols": list(_DATABENTO_SYMBOLS),
        }

    async def get_profile(self) -> dict:
        """Health-probe substitute for Ravi's engine (no /api/auth/profile)."""
        src = await self._request("GET", "/api/data-source")
        return {
            "ok": True,
            "account": "vam-engine (internal)",
            "data_source": src.get("source"),
            "data_label": src.get("label"),
        }

    async def run_backtest(self, params: dict) -> dict:
        """POST /api/backtest on Ravi's engine, then reshape response for our platform.

        Input: `params` includes {"step": <strategy_id>, "initial_capital"?: ...}
               plus every tunable knob (vixThreshold, uproSplit, ...).
        Output: {metrics, trades, chart_data} — daily_log is condensed into
                chart_data equity/spy/sma/vix series.
        """
        working = dict(params)  # don't mutate caller's dict
        strategy_id = working.pop("step", None)
        initial_capital = working.pop("initial_capital", 100_000.0)

        body = {
            "strategy_id": strategy_id,
            "params": working,
            "initial_capital": initial_capital,
        }
        raw = await self._request(
            "POST",
            "/api/backtest",
            json=body,
            timeout=self._BACKTEST_TIMEOUT_S,
        )

        if not isinstance(raw, dict):
            raise VAMUpstreamError("VAM engine returned non-object response")

        daily_log = raw.get("daily_log") or []
        trades = raw.get("trades") or []
        metrics = raw.get("metrics") or {}

        chart_data = self._build_chart_data(daily_log, trades)
        trade_stats = self._build_trade_stats(
            trades,
            chart_data["equity"],
            chart_data["spy_bh"],
        )

        return {
            "metrics": metrics,
            "trades": trades,
            "chart_data": chart_data,
            "trade_stats": trade_stats,
            # Preserve daily_log too; some clients may want the raw series.
            "daily_log": daily_log,
            "data_source": raw.get("data_source"),
        }

    @staticmethod
    def _build_chart_data(daily_log: list[dict], trades: list[dict]) -> dict:
        """Convert Ravi's daily_log rows into lightweight-charts-compatible series
        and derived analytics: SPY buy-and-hold, drawdown, state timeline.
        Mirrors what backtestravi.insightfusionanalytics.com's dashboard renders,
        so the platform's VAM detail page can match feature-for-feature.
        """

        def _series(field: str) -> list[dict]:
            out = []
            for row in daily_log:
                v = row.get(field)
                d = row.get("date")
                if d is not None and v is not None:
                    out.append({"time": d, "value": v})
            return out

        # ── SPY Buy & Hold (normalized to same starting NAV as strategy) ────
        equity = _series("portfolio_value")
        spy = _series("spy_close")
        spy_bh: list[dict] = []
        if equity and spy:
            initial_capital = equity[0]["value"]
            spy_base = spy[0]["value"]
            if spy_base:
                for pt in spy:
                    spy_bh.append({
                        "time": pt["time"],
                        "value": initial_capital * pt["value"] / spy_base,
                    })

        # ── Drawdown from peak (%) ───────────────────────────────────────
        drawdown: list[dict] = []
        peak = 0.0
        for pt in equity:
            v = pt["value"]
            peak = max(peak, v)
            if peak > 0:
                drawdown.append({
                    "time": pt["time"],
                    "value": (v - peak) / peak * 100.0,
                })

        # ── Trade markers, enriched with state_to text ────────────────────
        # Skip trades without a real execution_date - schema requires string
        # for chart_data.markers[].time and lightweight-charts would break
        # on None anyway.
        markers: list[dict] = []
        for t in trades:
            when = t.get("execution_date")
            if not isinstance(when, str) or not when:
                continue
            action = str(t.get("action") or "")
            is_buy = "BUY" in action.upper()
            state_to = t.get("state_to") or ""
            text = state_to if state_to else action
            markers.append({
                "time": when,
                "position": "belowBar" if is_buy else "aboveBar",
                "color": "#22c55e" if is_buy else "#ef4444",
                "shape": "arrowUp" if is_buy else "arrowDown",
                "text": text,
            })

        # ── State timeline (contiguous runs) ─────────────────────────────
        state_timeline: list[dict] = []
        total_rows = len(daily_log)
        if total_rows:
            current_state: str | None = None
            run_start: str | None = None
            run_count = 0
            for row in daily_log:
                s = row.get("state")
                d = row.get("date")
                if s is None or d is None:
                    continue
                if current_state is None:
                    current_state = s
                    run_start = d
                    run_count = 1
                elif s == current_state:
                    run_count += 1
                else:
                    state_timeline.append({
                        "state": current_state,
                        "start": run_start,
                        "end": d,
                        "days": run_count,
                        "pct": round(run_count / total_rows * 100.0, 2),
                    })
                    current_state = s
                    run_start = d
                    run_count = 1
            if current_state is not None and run_start is not None:
                state_timeline.append({
                    "state": current_state,
                    "start": run_start,
                    "end": daily_log[-1].get("date"),
                    "days": run_count,
                    "pct": round(run_count / total_rows * 100.0, 2),
                })

        # ── Current state (last row's state) ─────────────────────────────
        current_state = None
        if daily_log:
            current_state = daily_log[-1].get("state")

        return {
            "equity":         equity,
            "spy":            spy,
            "spy_bh":         spy_bh,
            "sma50":          _series("spy_sma_def"),
            "sma200":         _series("spy_sma_kill"),
            "vix":            _series("vix"),
            # Ravi's daily_log uses `spy_rsi_14` (RSI period baked into name).
            # If a future run exposes a generic `spy_rsi` field we fall back to it.
            "rsi":            _series("spy_rsi_14") or _series("spy_rsi"),
            "drawdown":       drawdown,
            "markers":        markers,
            "state_timeline": state_timeline,
            "current_state":  current_state,
        }

    @staticmethod
    def _build_trade_stats(
        trades: list[dict],
        equity: list[dict],
        spy_bh: list[dict],
    ) -> dict:
        """Aggregate win rate + best/worst trade + SPY B&H return for the trade-stats card."""
        # Pair BUY -> next SELL as one round trip. Ravi's engine emits both,
        # per instrument (UPRO / TQQQ). Use trade_value_dollars if present,
        # else fall back to exec_price × implied shares from portfolio delta.
        round_trip_returns: list[float] = []
        pending_buys: dict[str, dict] = {}  # instrument -> BUY row
        for t in trades:
            action = str(t.get("action") or "").upper()
            instr = str(t.get("instrument") or "")
            if "BUY" in action:
                pending_buys[instr] = t
            elif "SELL" in action and instr in pending_buys:
                buy = pending_buys.pop(instr)
                buy_price = buy.get("exec_price")
                sell_price = t.get("exec_price")
                if buy_price and sell_price and buy_price > 0:
                    round_trip_returns.append((sell_price - buy_price) / buy_price * 100.0)

        win_rate_pct = None
        best_trade_pct = None
        worst_trade_pct = None
        if round_trip_returns:
            wins = sum(1 for r in round_trip_returns if r > 0)
            win_rate_pct = round(wins / len(round_trip_returns) * 100.0, 1)
            best_trade_pct = round(max(round_trip_returns), 2)
            worst_trade_pct = round(min(round_trip_returns), 2)

        spy_bh_return_pct = None
        if len(spy_bh) >= 2 and spy_bh[0]["value"]:
            spy_bh_return_pct = round(
                (spy_bh[-1]["value"] - spy_bh[0]["value"]) / spy_bh[0]["value"] * 100.0,
                2,
            )

        return {
            "win_rate_pct": win_rate_pct,
            "best_trade_pct": best_trade_pct,
            "worst_trade_pct": worst_trade_pct,
            "spy_bh_return_pct": spy_bh_return_pct,
            "round_trip_count": len(round_trip_returns),
        }


# ── Single-instance factory ────────────────────────────────────────────────


_instance: VAMClient | None = None


def get_vam_client() -> VAMClient:
    """Return the process-wide VAMClient, lazily constructed from settings.

    Raises VAMConfigError if VAM_BASE_URL is unset.
    """
    global _instance
    if _instance is not None:
        return _instance
    settings = get_settings()
    base_url = getattr(settings, "VAM_BASE_URL", None)
    if not base_url:
        raise VAMConfigError(
            "VAM_BASE_URL is not configured. Set it in your environment."
        )
    _instance = VAMClient(
        base_url=base_url,
        email=getattr(settings, "VAM_ADMIN_EMAIL", "") or "",
        password=getattr(settings, "VAM_ADMIN_PASSWORD", "") or "",
    )
    return _instance


def reset_vam_client() -> None:
    """Test helper: drop the cached instance so settings changes pick up."""
    global _instance
    _instance = None
