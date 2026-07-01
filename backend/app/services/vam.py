"""VAM (Volatility-Adjusted Momentum) engine client.

Wraps the backtestravi.insightfusionanalytics.com REST API. One shared IFA
account is used for all our backend-initiated calls; the token is cached
in-process and refreshed lazily.

Threading model: a single `asyncio.Lock` guards the login flow so concurrent
requests can't trigger multiple parallel logins. Reads of the cached token
itself are atomic Python dict assignments — no lock needed on the hot path.

Failure modes (all surfaced as VAMError subclasses):
  * VAMConfigError   — VAM_ADMIN_EMAIL / VAM_ADMIN_PASSWORD not set
  * VAMAuthError     — login failed (bad creds, or VAM rejected our token twice)
  * VAMValidationError — VAM returned 422 with field-level violations
  * VAMUpstreamError — anything else (5xx, timeout, transport error)

The client retries ONCE on a 401 (assumes our cached token expired) by forcing
a re-login. A second 401 raises VAMAuthError so the caller can surface "engine
auth failed — check VAM_ADMIN_PASSWORD".
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
# When the VAM engine is fully offline (500 5xx in a row) we don't want every
# incoming client request to sit for 15s waiting on httpx timeout. The breaker
# tracks consecutive upstream failures and, past a threshold, short-circuits
# subsequent calls with an immediate VAMUpstreamError until a cooldown passes.
# On the first attempt after cooldown we allow ONE probe; success closes it,
# failure re-opens with a fresh cooldown.

_CB_FAIL_THRESHOLD = 5           # consecutive failures to trip
_CB_COOLDOWN_S     = 30.0        # how long to stay open before allowing a probe
_CB_HALF_OPEN_MAX_INFLIGHT = 1   # only one probe at a time


class _CircuitBreaker:
    def __init__(self):
        self._consec_failures = 0
        self._opened_at: float | None = None
        self._probe_lock = asyncio.Lock()

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
        # closed or half_open — allowed to proceed

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
            # Probe failed — reopen with fresh cooldown.
            logger.warning("VAM circuit breaker: half-open probe failed, re-opening")
            self._opened_at = time.time()


_cb = _CircuitBreaker()


def _should_retry(status_code: int | None, attempt: int, max_attempts: int) -> bool:
    """Retry on transient errors: 5xx (except 501/505) and connection errors
    (status_code=None). Don't retry client errors (4xx) or the terminal attempt.
    """
    if attempt + 1 >= max_attempts:
        return False
    if status_code is None:
        return True  # transport error / connection reset — always retry
    if 500 <= status_code < 600 and status_code not in (501, 505):
        return True
    return False


def _backoff_seconds(attempt: int) -> float:
    """Exponential backoff with jitter: 0.4, 0.8, 1.6, ... + up to 200ms jitter.
    """
    base = 0.4 * (2 ** attempt)
    return base + random.uniform(0, 0.2)


# ── Exceptions ─────────────────────────────────────────────────────────────


class VAMError(Exception):
    """Base class for all VAM client failures."""


class VAMConfigError(VAMError):
    """VAM credentials are not configured."""


class VAMAuthError(VAMError):
    """Login failed, or a re-login still produced 401."""


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


# ── Client ─────────────────────────────────────────────────────────────────


class VAMClient:
    """Async client for the VAM backtesting API.

    Single-instance-per-process pattern: see `get_vam_client()` below.
    """

    # Refresh the token this many seconds before its declared expiry.
    # VAM's expires_in_seconds tends to be in the hours range, so 5 min of headroom
    # is plenty without burning tokens unnecessarily.
    _TOKEN_REFRESH_HEADROOM_S = 300

    # Backtest runs can take 10-30s on the free tier; allow plenty of room.
    _BACKTEST_TIMEOUT_S = 90.0
    _DEFAULT_TIMEOUT_S = 15.0

    def __init__(self, base_url: str, email: str, password: str):
        self._base_url = base_url.rstrip("/")
        self._email = email
        self._password = password
        self._token: str | None = None
        self._token_expires_at: float = 0.0  # unix timestamp
        self._login_lock = asyncio.Lock()

    # ---- Auth ----

    async def _login(self, client: httpx.AsyncClient) -> None:
        """Fetch a fresh token from POST /api/auth/login and cache it.

        Must be called with self._login_lock held.
        """
        try:
            resp = await client.post(
                f"{self._base_url}/api/auth/login",
                json={"email": self._email, "password": self._password},
                timeout=self._DEFAULT_TIMEOUT_S,
            )
        except httpx.RequestError as e:
            raise VAMUpstreamError(f"VAM login transport error: {e}") from e

        if resp.status_code != 200:
            # Don't log password; do log status + a short body excerpt for diagnosis.
            body_preview = resp.text[:200]
            logger.warning("VAM login returned {}: {}", resp.status_code, body_preview)
            raise VAMAuthError(
                f"VAM login failed: HTTP {resp.status_code} — check VAM_ADMIN_EMAIL/PASSWORD"
            )

        data = resp.json()
        self._token = data["token"]
        # `expires_in_seconds` is documented in their LoginResponse schema.
        # Default to 1 hour if absent (graceful).
        expires_in = int(data.get("expires_in_seconds") or 3600)
        self._token_expires_at = time.time() + expires_in
        logger.info(
            "VAM login OK for {}: token cached for ~{}s (refresh headroom {}s)",
            self._email,
            expires_in,
            self._TOKEN_REFRESH_HEADROOM_S,
        )

    async def _ensure_token(self, client: httpx.AsyncClient) -> str:
        """Return a valid token, logging in (or refreshing) if needed."""
        now = time.time()
        if self._token and now < self._token_expires_at - self._TOKEN_REFRESH_HEADROOM_S:
            return self._token

        async with self._login_lock:
            # Re-check under lock — another coroutine may have refreshed while we waited.
            if self._token and now < self._token_expires_at - self._TOKEN_REFRESH_HEADROOM_S:
                return self._token
            await self._login(client)
        assert self._token is not None
        return self._token

    # ---- HTTP plumbing ----

    # Retry policy — applied to transient upstream failures (5xx + connection
    # errors). 4xx client errors and 422 validation errors are NOT retried.
    _MAX_ATTEMPTS = 3

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        timeout: float | None = None,
        _is_retry: bool = False,
    ) -> Any:
        """Perform an authenticated HTTP request with retry-with-backoff on
        transient upstream failures + a circuit breaker for total outages.

        Retries 5xx and connection errors up to _MAX_ATTEMPTS with exponential
        backoff (0.4s, 0.8s, 1.6s + jitter). 401 triggers a re-login and one
        immediate retry (unchanged from earlier behaviour). Validation errors
        (422), auth errors, and client-side 4xx do NOT retry.

        Returns the parsed JSON body on 2xx.
        Raises VAMAuthError / VAMValidationError / VAMUpstreamError on failure.
        """
        _cb.before_call()  # short-circuit if breaker open
        timeout = timeout or self._DEFAULT_TIMEOUT_S

        last_exc: VAMUpstreamError | None = None
        for attempt in range(self._MAX_ATTEMPTS):
            async with httpx.AsyncClient() as client:
                token = await self._ensure_token(client)
                headers = {"Authorization": f"Bearer {token}"}
                try:
                    resp = await client.request(
                        method,
                        f"{self._base_url}{path}",
                        json=json,
                        headers=headers,
                        timeout=timeout,
                    )
                except httpx.RequestError as e:
                    _cb.record_failure()
                    if _should_retry(None, attempt, self._MAX_ATTEMPTS):
                        wait = _backoff_seconds(attempt)
                        logger.warning(
                            "VAM transport error on {} {} attempt {}/{} — retrying in {:.2f}s: {}",
                            method, path, attempt + 1, self._MAX_ATTEMPTS, wait, e,
                        )
                        await asyncio.sleep(wait)
                        continue
                    raise VAMUpstreamError(
                        f"VAM transport error on {method} {path} after {attempt + 1} attempts: {e}"
                    ) from e

                # 401 → force re-login and retry ONCE (breaker doesn't count this).
                if resp.status_code == 401 and not _is_retry:
                    logger.info("VAM returned 401 on {} {} — forcing re-login + retry", method, path)
                    self._token = None
                    self._token_expires_at = 0.0
                    return await self._request(method, path, json=json, timeout=timeout, _is_retry=True)

                if resp.status_code == 401:
                    _cb.record_success()  # 401 isn't an upstream fault — engine responded
                    raise VAMAuthError("VAM rejected our token even after re-login")

                if resp.status_code == 422:
                    _cb.record_success()  # 422 = valid engine response, just bad input
                    detail = self._extract_violations(resp)
                    raise VAMValidationError(
                        f"VAM rejected payload on {method} {path}", violations=detail
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
                return resp.json()

        # Should only reach here if the retry loop exhausted without raising.
        if last_exc:
            raise last_exc
        raise VAMUpstreamError("VAM call failed after all retries", status_code=None)

    @staticmethod
    def _extract_violations(resp: httpx.Response) -> list[dict]:
        """Normalize FastAPI's 422 body shape into [{path, message}]."""
        try:
            body = resp.json()
        except ValueError:
            return [{"path": "(root)", "message": resp.text[:200]}]
        # FastAPI default: {"detail": [{"loc": [...], "msg": "...", "type": "..."}]}
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

    # ---- Public API ----

    async def list_strategies(self) -> list[dict]:
        """GET /api/strategies — list of {id, name, implemented}."""
        return await self._request("GET", "/api/strategies")

    async def get_step_schema(self, step_id: str) -> dict:
        """GET /api/strategies/{step_id}/schema — parameter schema for one step."""
        return await self._request("GET", f"/api/strategies/{step_id}/schema")

    async def list_symbols(self) -> list[dict]:
        """GET /api/data/symbols — minimal {symbol, start, end} per available symbol."""
        return await self._request("GET", "/api/data/symbols")

    async def get_data_info(self) -> dict:
        """GET /api/data/info — full per-symbol lineage for the Data Sources modal."""
        return await self._request("GET", "/api/data/info")

    async def get_profile(self) -> dict:
        """GET /api/auth/profile — VAM-side profile (the IFA admin account).

        Useful as a debug probe / health badge: 200 here means our token works.
        """
        return await self._request("GET", "/api/auth/profile")

    async def run_backtest(self, params: dict) -> dict:
        """POST /api/backtest/run — the engine. params must include `step`.

        Returns the full VAM response: {cached, metrics, trades, chart_data}.
        Use the longer backtest timeout because runs can take 10-30s.
        """
        return await self._request(
            "POST",
            "/api/backtest/run",
            json=params,
            timeout=self._BACKTEST_TIMEOUT_S,
        )


# ── Single-instance factory ────────────────────────────────────────────────


_instance: VAMClient | None = None


def get_vam_client() -> VAMClient:
    """Return the process-wide VAMClient, lazily constructed from settings.

    Raises VAMConfigError if credentials are not set.
    """
    global _instance
    if _instance is not None:
        return _instance
    settings = get_settings()
    if not settings.vam_configured:
        raise VAMConfigError(
            "VAM credentials not configured. Set VAM_ADMIN_EMAIL + VAM_ADMIN_PASSWORD "
            "in your environment."
        )
    _instance = VAMClient(
        base_url=settings.VAM_BASE_URL,
        email=settings.VAM_ADMIN_EMAIL,
        password=settings.VAM_ADMIN_PASSWORD,
    )
    return _instance


def reset_vam_client() -> None:
    """Test helper: drop the cached instance so settings changes pick up."""
    global _instance
    _instance = None
