"""Selenium smoke test for the LIVE deployment at
https://backtestingengine.insightfusionanalytics.com.

Designed to be useful even while the upstream Supabase project is paused —
i.e. when anything DB-dependent (login, /me, list pages, etc.) will return
500. We test what we CAN verify in that state:

    * frontend loads (HTML + favicon + IFA branding)
    * /healthz returns 200 from the backend
    * /login and /admin/login pages render the form
    * a bad-password attempt surfaces a friendly error
    * a good-password attempt hits the backend and surfaces our AuthErrorScreen
      (the "backend unavailable" branch, sweep finding #3) rather than spinning
      "Loading…" forever — proving the post-fix code is deployed and the 500
      CORS headers are present (sweep CORS-on-500 fix)
    * https → HTTPS redirect / TLS cert validity
    * Open Graph / SEO meta is present in the served HTML

Run:
    cd backend && source .venv/bin/activate && python -m tests.e2e_deployment_smoke
"""
from __future__ import annotations

import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

LIVE_URL = "https://backtestingengine.insightfusionanalytics.com"
BACKEND  = LIVE_URL  # nginx routes /api/* on the same host

RAVI_EMAIL    = "ravi@ifa.com"
RAVI_PASSWORD = "Admin@2025"

SCREENSHOT_DIR = Path(__file__).parent / "screenshots"
SCREENSHOT_DIR.mkdir(exist_ok=True)


@dataclass
class TestRun:
    passes: list[str] = field(default_factory=list)
    fails:  list[tuple[str, str]] = field(default_factory=list)

    def record(self, name: str, ok: bool, detail: str = "") -> None:
        if ok:
            print(f"  ✅ {name}")
            self.passes.append(name)
        else:
            print(f"  ❌ {name}  ({detail})")
            self.fails.append((name, detail))


def make_driver(headless: bool = True) -> webdriver.Chrome:
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1440,900")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    return webdriver.Chrome(options=opts)


def shoot(driver, label: str) -> None:
    driver.save_screenshot(str(SCREENSHOT_DIR / f"prod_{label}.png"))


def body_text(driver) -> str:
    return driver.find_element(By.TAG_NAME, "body").text


# ── Tests ──────────────────────────────────────────────────────────────────


def test_https_and_tls(run: TestRun) -> None:
    print("\n— Infrastructure: TLS + healthz —")
    try:
        # /healthz on prod returns env=production and is DB-independent
        r = requests.get(f"{BACKEND}/healthz", timeout=10)
        run.record("backend /healthz → 200", r.status_code == 200, f"status={r.status_code}")
        run.record("healthz reports production env", '"env":"production"' in r.text)
    except Exception as e:
        run.record("backend /healthz reachable", False, str(e)[:120])

    try:
        # HTTP should 301 to HTTPS
        r = requests.get(f"http://backtestingengine.insightfusionanalytics.com/",
                         timeout=10, allow_redirects=False)
        run.record("HTTP → HTTPS redirect", r.status_code in (301, 302),
                   f"got {r.status_code}")
        run.record("redirect target is https", r.headers.get("Location", "").startswith("https://"),
                   r.headers.get("Location", ""))
    except Exception as e:
        run.record("HTTP redirect test", False, str(e)[:120])


def test_cors_on_500(run: TestRun) -> None:
    """The CORS-on-500 fix from earlier today must be deployed: even when the
    backend can't reach the DB and returns 500, the response MUST include
    access-control-allow-origin so the browser sees the real error rather
    than a misleading 'CORS policy' error. This is sweep finding #2's fix."""
    print("\n— CORS headers on 500 (sweep CORS-on-500 fix) —")
    try:
        # Send a request that will reach a DB-requiring endpoint, with an
        # Origin header. We expect a 500 (because DB is down) but the response
        # MUST include the CORS headers.
        r = requests.get(
            f"{BACKEND}/api/v1/me",
            headers={
                "Authorization": "Bearer dummy-token-to-trigger-firebase-verify",
                "Origin": LIVE_URL,
            },
            timeout=10,
        )
        # Either 401 (Firebase token rejected → has CORS headers via middleware)
        # OR 500 (Firebase token valid but DB unreachable → has CORS headers
        # via our explicit fix). Both must include the header.
        has_cors = r.headers.get("access-control-allow-origin") == LIVE_URL
        run.record(f"/me with Origin header has access-control-allow-origin (got {r.status_code})",
                   has_cors, f"status={r.status_code} headers={dict(r.headers)}")
    except Exception as e:
        run.record("CORS on /me", False, str(e)[:120])

    # Also preflight
    try:
        r = requests.options(
            f"{BACKEND}/api/v1/me",
            headers={
                "Origin": LIVE_URL,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
            timeout=10,
        )
        run.record("OPTIONS preflight → 200", r.status_code == 200, f"status={r.status_code}")
        run.record("preflight returns matching Allow-Origin",
                   r.headers.get("access-control-allow-origin") == LIVE_URL)
        run.record("preflight allows authorization header",
                   "authorization" in (r.headers.get("access-control-allow-headers") or "").lower())
    except Exception as e:
        run.record("CORS preflight", False, str(e)[:120])


def test_frontend_html_and_seo(run: TestRun) -> None:
    """Frontend HTML must load with IFA branding + SEO meta — independent of
    backend. Confirms the build artifact deployed correctly."""
    print("\n— Frontend HTML + SEO —")
    try:
        r = requests.get(LIVE_URL, timeout=10)
        run.record("frontend / → 200", r.status_code == 200, f"status={r.status_code}")
        html = r.text.lower()
        run.record("title is IFA Backtest Engine (not 'frontend')",
                   "ifa backtest engine" in html and ">frontend</title>" not in html)
        run.record("description meta present", '<meta name="description"' in html or 'name="description"' in html)
        run.record("og:title meta present", "og:title" in html)
        run.record("og:image points at favicon-512.png", "favicon-512.png" in html)
        run.record("theme-color set", 'name="theme-color"' in html)
        run.record("robots noindex on private portal", "noindex" in html)
    except Exception as e:
        run.record("frontend HTML fetch", False, str(e)[:120])

    # Favicon files exist
    for size in ("favicon.svg", "favicon-16.png", "favicon-32.png", "favicon-180.png", "favicon-512.png"):
        try:
            r = requests.head(f"{LIVE_URL}/{size}", timeout=8)
            run.record(f"asset /{size} reachable", r.status_code == 200, f"status={r.status_code}")
        except Exception as e:
            run.record(f"asset /{size}", False, str(e)[:120])


def test_login_pages_render(driver, run: TestRun) -> None:
    """Both /login and /admin/login pages must render their forms."""
    print("\n— Login pages render —")
    try:
        driver.get(f"{LIVE_URL}/login")
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
        )
        body = body_text(driver).lower()
        run.record("/login renders the form", "sign in" in body)
        run.record("/login has email field", bool(driver.find_elements(By.CSS_SELECTOR, "input[type='email']")))
        run.record("/login has password field", bool(driver.find_elements(By.CSS_SELECTOR, "input[type='password']")))
        run.record("/login has submit button", bool(driver.find_elements(By.CSS_SELECTOR, "button[type='submit']")))
        run.record("/login has admin-console link", any("admin console" in a.text.lower() for a in driver.find_elements(By.TAG_NAME, "a")))
    except Exception as e:
        shoot(driver, "login_render_fail")
        run.record("/login renders", False, str(e)[:120])

    try:
        driver.get(f"{LIVE_URL}/admin/login")
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
        )
        run.record("/admin/login renders the form",
                   "sign in" in body_text(driver).lower())
    except Exception as e:
        shoot(driver, "admin_login_render_fail")
        run.record("/admin/login renders", False, str(e)[:120])


def test_bad_password_friendly_error(driver, run: TestRun) -> None:
    """Bad-password attempt should surface a friendly error — does NOT need
    backend DB (Firebase rejects before we ever call /me)."""
    print("\n— Bad password surfaces friendly error —")
    try:
        driver.get(f"{LIVE_URL}/login")
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
        )
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys(RAVI_EMAIL)
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys("definitely-not-the-password")
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        # An error must appear within a reasonable timeout
        ok = WebDriverWait(driver, 12).until(
            lambda d: any(s in body_text(d).lower() for s in
                          ["invalid", "incorrect", "wrong", "could not", "couldn't", "auth/", "error"])
        )
        run.record("bad password surfaces an error", bool(ok))
    except Exception as e:
        shoot(driver, "bad_password_no_error")
        run.record("bad password error", False, str(e)[:120])


def test_good_password_with_db_outage(driver, run: TestRun) -> None:
    """Good Firebase password → backend /me → 500 (Supabase paused).
    The frontend MUST surface our AuthErrorScreen ("backend unavailable")
    rather than spinning Loading or showing a CORS-policy error in console.
    This proves both sweep #3 (typed AuthErrorScreen) and the CORS-on-500
    fix are deployed."""
    print("\n— Good Firebase password but Supabase down → AuthErrorScreen —")
    try:
        driver.get(f"{LIVE_URL}/login")
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
        )
        # Use the JS-aware input set so React state syncs (we learned this
        # the hard way on local Selenium).
        email_el = driver.find_element(By.CSS_SELECTOR, "input[type='email']")
        pwd_el = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
        for el, v in [(email_el, RAVI_EMAIL), (pwd_el, RAVI_PASSWORD)]:
            driver.execute_script(
                "const e=arguments[0],v=arguments[1];"
                "const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
                "s.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));",
                el, v,
            )
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()

        # Expect ONE of:
        #   (a) AuthErrorScreen with "backend unavailable" / "can't reach the server"
        #       (Supabase paused → /me 500 → classifyAuthGateError → backend_unavailable)
        #   (b) Successful login + landing page (would happen if Supabase came back)
        #   (c) Stuck on /login with a stale "Could not reach" friendly error
        try:
            WebDriverWait(driver, 25).until(
                lambda d: (
                    "can't reach the server" in body_text(d).lower()
                    or "backend is temporarily unavailable" in body_text(d).lower()
                    or "try again" in body_text(d).lower()
                    or "overview" in body_text(d).lower()
                    or "backtests" in body_text(d).lower()
                    or "terms" in d.current_url
                )
            )
        except Exception:
            pass

        body = body_text(driver).lower()
        url = driver.current_url
        # CASE A: AuthErrorScreen for backend_unavailable
        showed_error_screen = (
            "can't reach the server" in body
            or "backend is temporarily unavailable" in body
        )
        # CASE B: Login succeeded all the way — client landing pages are
        # /dashboard (moved from `/` when the marketing landing took over
        # root), /backtests, or /terms.
        landed_in_app = any(s in url for s in ["/dashboard", "/backtests", "/terms"])
        # CASE C: stuck on /login (not great but not catastrophic)
        stuck_on_login = url.endswith("/login")

        if showed_error_screen:
            run.record("AuthErrorScreen 'backend unavailable' shown (Supabase down handled gracefully)", True)
        elif landed_in_app:
            run.record("logged in successfully (Supabase came back online)", True, url)
        elif stuck_on_login:
            run.record("AuthErrorScreen displayed on Supabase outage", False,
                       f"still on /login with body: {body[:200]}")
            shoot(driver, "supabase_outage_stuck")
        else:
            run.record("AuthErrorScreen or app land", False, f"unexpected state at {url}")
            shoot(driver, "supabase_outage_unexpected")
    except Exception as e:
        shoot(driver, "good_password_outage_fail")
        run.record("good password under outage", False, str(e)[:120])


def test_no_misleading_cors_in_console(driver, run: TestRun) -> None:
    """Browser console should NOT contain a CORS-policy error — if it does,
    that means our CORS-on-500 fix didn't land. Confirms #2."""
    print("\n— Browser console: no spurious CORS error —")
    try:
        logs = driver.get_log("browser")
        cors_lines = [
            entry["message"] for entry in logs
            if "cors policy" in entry["message"].lower()
            or "no 'access-control-allow-origin'" in entry["message"].lower()
        ]
        run.record("no 'blocked by CORS policy' errors in console",
                   len(cors_lines) == 0,
                   f"{len(cors_lines)} CORS errors: {cors_lines[:2]}")
    except Exception as e:
        # Older Selenium versions / Chrome configurations may not expose get_log
        run.record("browser console accessible", False, str(e)[:120])


# ── runner ────────────────────────────────────────────────────────────────


def main() -> int:
    print(f"\n► Smoke-testing live deployment at {LIVE_URL}\n")

    run = TestRun()

    # Infrastructure tests don't need a browser
    test_https_and_tls(run)
    test_cors_on_500(run)
    test_frontend_html_and_seo(run)

    # Browser-driven tests
    driver = make_driver()
    # Capture console messages
    try:
        driver.execute_cdp_cmd("Log.enable", {})
    except Exception:
        pass
    try:
        test_login_pages_render(driver, run)
        test_bad_password_friendly_error(driver, run)
        test_good_password_with_db_outage(driver, run)
        test_no_misleading_cors_in_console(driver, run)
    finally:
        driver.quit()

    print("\n" + "═" * 60)
    print(f"  DEPLOYMENT SMOKE: {len(run.passes)} passed, {len(run.fails)} failed")
    print("═" * 60)
    if run.fails:
        print("\nFailures:")
        for name, detail in run.fails:
            print(f"  ✗ {name}")
            if detail:
                print(f"     {detail[:200]}")
        return 1
    print("\nAll deployment smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
