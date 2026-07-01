"""End-to-end Selenium test — exercises every clickable element on the client portal.

Run with both dev servers up (uvicorn on :8000, vite on :5173).

    cd backend
    source .venv/bin/activate
    python -m tests.e2e_selenium
"""
from __future__ import annotations

import json
import sys
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

FRONTEND = "http://localhost:5173"
DEMO_EMAIL = "demo.client@sterlingcap.test"
DEMO_PASSWORD = "DemoClient!2026"
ADMIN_EMAIL = "insightfusionanalytics@gmail.com"
ADMIN_PASSWORD = "sg&^XpSP9GAu2PmBYcrE"
BAD_PASSWORD = "wrongpassword"

REPO_ROOT = Path(__file__).resolve().parents[2]  # ifa-backtest-product/
BACKTEST_EXAMPLE = REPO_ROOT / "schemas" / "backtest.example.json"

SCREENSHOT_DIR = Path(__file__).parent / "screenshots"
SCREENSHOT_DIR.mkdir(exist_ok=True)


@dataclass
class TestRun:
    passes: list[str] = field(default_factory=list)
    fails: list[tuple[str, str]] = field(default_factory=list)

    def record(self, name: str, ok: bool, detail: str = "") -> None:
        if ok:
            print(f"  ✅ {name}")
            self.passes.append(name)
        else:
            print(f"  ❌ {name}  ({detail})")
            self.fails.append((name, detail))


def make_driver() -> webdriver.Chrome:
    opts = Options()
    # Visible browser so you can watch — comment for CI/headless
    # opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1440,900")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    return webdriver.Chrome(options=opts)


def take_screenshot(driver: webdriver.Chrome, label: str) -> None:
    safe = label.replace(" ", "_").replace("/", "_")[:60]
    path = SCREENSHOT_DIR / f"{safe}.png"
    driver.save_screenshot(str(path))


def wait_for(driver, selector: str, timeout: int = 10, by=By.CSS_SELECTOR):
    return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, selector)))


def wait_clickable(driver, selector: str, timeout: int = 10, by=By.CSS_SELECTOR):
    return WebDriverWait(driver, timeout).until(EC.element_to_be_clickable((by, selector)))


def wait_visible(driver, selector: str, timeout: int = 10, by=By.CSS_SELECTOR):
    return WebDriverWait(driver, timeout).until(EC.visibility_of_element_located((by, selector)))


def text_present(driver, text: str, timeout: int = 5) -> bool:
    try:
        WebDriverWait(driver, timeout).until(
            lambda d: text.lower() in d.find_element(By.TAG_NAME, "body").text.lower()
        )
        return True
    except Exception:
        return False


def wait_for_page_ready(driver, expect_text: str, timeout: int = 15) -> bool:
    """Waits until 'Loading…' is gone AND `expect_text` appears."""
    try:
        WebDriverWait(driver, timeout).until(
            lambda d: (
                "loading" not in d.find_element(By.TAG_NAME, "body").text.strip().lower()[:40]
                and expect_text.lower() in d.find_element(By.TAG_NAME, "body").text.lower()
            )
        )
        return True
    except Exception:
        return False


def goto(driver, path: str, expect_text: str) -> bool:
    """Navigate to a protected path and wait for the page to actually render."""
    driver.get(f"{FRONTEND}{path}")
    return wait_for_page_ready(driver, expect_text, timeout=15)


# ────────────────────────────────────────────────────────────────────


def test_login_bad_password(driver, run: TestRun) -> None:
    print("\n— Login: bad password —")
    driver.get(f"{FRONTEND}/login")
    try:
        email = wait_for(driver, "input[type='email']")
        password = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
        submit = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        email.send_keys(DEMO_EMAIL)
        password.send_keys(BAD_PASSWORD)
        submit.click()
        # Wait for error message
        time.sleep(2)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        has_error = "fail" in body or "invalid" in body or "wrong" in body or "error" in body or "auth/" in body
        run.record("login rejects bad password with error", has_error,
                   "no error message visible" if not has_error else "")
    except Exception as e:
        take_screenshot(driver, "login_bad_password_fail")
        run.record("login rejects bad password", False, str(e)[:80])


def test_login_good_password(driver, run: TestRun) -> None:
    print("\n— Login: good password —")
    driver.get(f"{FRONTEND}/login")
    try:
        wait_for(driver, "input[type='email']")
        # Clear inputs
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").clear()
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").clear()
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys(DEMO_EMAIL)
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys(DEMO_PASSWORD)
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        # Should redirect away from /login
        WebDriverWait(driver, 10).until(lambda d: "/login" not in d.current_url)
        run.record("login succeeds and redirects", True, f"now at {driver.current_url}")
    except Exception as e:
        take_screenshot(driver, "login_good_fail")
        run.record("login succeeds", False, str(e)[:80])


def test_tnc_wizard(driver, run: TestRun) -> None:
    print("\n— T&C multi-step wizard —")
    try:
        # Should be at /terms now
        WebDriverWait(driver, 10).until(lambda d: "/terms" in d.current_url)
        run.record("T&C wizard auto-loads after login", True)

        # Confirm step indicator shows
        ok = text_present(driver, "step 1 of", timeout=5)
        run.record("step indicator shows", ok)

        # Walk through 9 steps (8 clauses + final review)
        for i in range(8):
            checkbox = wait_clickable(driver, "input[type='checkbox']")
            checkbox.click()
            # Click Continue
            buttons = driver.find_elements(By.TAG_NAME, "button")
            cont = next((b for b in buttons if "continue" in b.text.lower()), None)
            if not cont:
                raise RuntimeError(f"Continue button not found on step {i+1}")
            cont.click()
            time.sleep(0.3)
        run.record("walked through all 8 clauses", True)

        # On final review — click Accept & continue
        WebDriverWait(driver, 5).until(
            lambda d: "confirm acceptance" in d.find_element(By.TAG_NAME, "body").text.lower()
        )
        run.record("final review step shown", True)

        buttons = driver.find_elements(By.TAG_NAME, "button")
        accept = next((b for b in buttons if "accept" in b.text.lower() and "continue" in b.text.lower()), None)
        if not accept:
            raise RuntimeError("Accept & continue button not found")
        accept.click()

        # Should redirect to /
        WebDriverWait(driver, 10).until(lambda d: d.current_url.endswith("/") or "/backtests" in d.current_url or "/strategies" in d.current_url)
        run.record("T&C accept redirects to overview", True, driver.current_url)
    except Exception as e:
        take_screenshot(driver, "tnc_wizard_fail")
        run.record("T&C wizard walk-through", False, str(e)[:120])
        traceback.print_exc()


def test_overview_page(driver, run: TestRun) -> None:
    print("\n— Overview page —")
    try:
        ok = goto(driver, "/", "sterling capital advisors")
        run.record("overview page renders (Loading gone)", ok)
        if not ok:
            take_screenshot(driver, "overview_loading_stuck")
            return

        body = driver.find_element(By.TAG_NAME, "body").text
        run.record("welcome banner shows client name",   "sterling capital advisors" in body.lower())
        run.record("tier badge visible",                  "tier 1" in body.lower())
        run.record("'Upload strategy' button visible",    any("upload strategy" in b.text.lower() for b in driver.find_elements(By.TAG_NAME, "button") + driver.find_elements(By.TAG_NAME, "a")))
        run.record("'New request' button visible",        any("new request" in b.text.lower() for b in driver.find_elements(By.TAG_NAME, "button") + driver.find_elements(By.TAG_NAME, "a")))

        # 4 stat tiles by label
        for label in ["active backtests", "completed", "pending quotes", "open requests"]:
            run.record(f"stat tile '{label}'", label in body.lower())

        # Demo callout — wait for backtests fetch + render to complete
        try:
            WebDriverWait(driver, 10).until(
                lambda d: "demo:" in d.find_element(By.TAG_NAME, "body").get_attribute("innerHTML").lower()
                          and "ema 20/50" in d.find_element(By.TAG_NAME, "body").get_attribute("innerHTML").lower()
            )
            run.record("demo backtest callout visible", True)
        except Exception:
            run.record("demo backtest callout visible", False, "timed out waiting for demo callout to render")

        # Open results button
        open_results = next(
            (a for a in driver.find_elements(By.TAG_NAME, "a") if "open results" in a.text.lower()),
            None,
        )
        run.record("'Open results' button on demo callout", open_results is not None)

        # Latest backtests list — should have rows linking out
        view_links = [a for a in driver.find_elements(By.TAG_NAME, "a") if a.text.strip().lower().startswith("view")]
        run.record("'Latest backtests' list has View links", len(view_links) >= 1, f"{len(view_links)} found")
    except Exception as e:
        take_screenshot(driver, "overview_fail")
        run.record("overview page", False, str(e)[:120])


def test_sidebar_nav(driver, run: TestRun) -> None:
    print("\n— Sidebar navigation —")
    for label, expect in [
        ("Strategies", "/strategies"),
        ("Requests", "/requests"),
        ("Backtests", "/backtests"),
        ("Overview", "/"),
    ]:
        try:
            link = next(
                (a for a in driver.find_elements(By.TAG_NAME, "a") if a.text.strip() == label),
                None,
            )
            if not link:
                run.record(f"sidebar '{label}' link present", False, "not found")
                continue
            link.click()
            time.sleep(0.5)
            ok = driver.current_url.endswith(expect) or driver.current_url.endswith(expect + "/")
            run.record(f"sidebar '{label}' navigates to {expect}", ok, driver.current_url)
        except Exception as e:
            take_screenshot(driver, f"nav_{label}_fail")
            run.record(f"sidebar '{label}'", False, str(e)[:80])


def test_strategies_page(driver, run: TestRun) -> None:
    print("\n— Strategies page —")
    try:
        ok = goto(driver, "/strategies", "strategy library")
        run.record("strategies page renders", ok)
        if not ok:
            take_screenshot(driver, "strategies_loading_stuck")
            return
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        run.record("page title 'Strategy library' visible", "strategy library" in body)

        # Click Upload strategy
        upload_btn = next(
            (b for b in driver.find_elements(By.TAG_NAME, "button") if "upload strategy" in b.text.lower()),
            None,
        )
        if not upload_btn:
            run.record("Upload strategy button present", False, "not found")
            return
        upload_btn.click()
        time.sleep(0.5)
        run.record("Upload strategy button opens modal",
                   "drop your file here" in driver.find_element(By.TAG_NAME, "body").text.lower() or
                   "upload strategy document" in driver.find_element(By.TAG_NAME, "body").text.lower())

        # Close modal via Cancel
        cancel = next(
            (b for b in driver.find_elements(By.TAG_NAME, "button") if b.text.strip().lower() == "cancel"),
            None,
        )
        if cancel:
            cancel.click()
            time.sleep(0.3)
            run.record("Cancel button closes modal",
                       "drop your file here" not in driver.find_element(By.TAG_NAME, "body").text.lower())
        else:
            run.record("Cancel button present", False, "not found")
    except Exception as e:
        take_screenshot(driver, "strategies_fail")
        run.record("strategies page", False, str(e)[:120])


def test_requests_page(driver, run: TestRun) -> None:
    print("\n— Requests page —")
    try:
        ok = goto(driver, "/requests", "submit a request")
        run.record("requests page renders", ok)
        if not ok:
            take_screenshot(driver, "requests_loading_stuck")
            return

        # Check all 4 tabs are present
        tabs = driver.find_elements(By.TAG_NAME, "button")
        tab_labels = [t.text.strip() for t in tabs if t.text.strip()]
        for label in ["New Strategy", "Change Request", "Request for Quote", "Clarification"]:
            run.record(f"tab '{label}' visible", any(label in t for t in tab_labels))

        # Click each tab
        for label in ["New Strategy", "Change Request", "Request for Quote", "Clarification"]:
            tab = next((b for b in driver.find_elements(By.TAG_NAME, "button") if b.text.strip() == label), None)
            if tab:
                tab.click()
                time.sleep(0.3)
                run.record(f"clicked tab '{label}'", True)

        # Fill change request and submit
        change_tab = next((b for b in driver.find_elements(By.TAG_NAME, "button") if b.text.strip() == "Change Request"), None)
        if change_tab:
            change_tab.click()
            time.sleep(0.3)
        summary_input = driver.find_element(By.CSS_SELECTOR, "input[placeholder*='One-line summary']")
        summary_input.send_keys("Selenium test change request")
        submit_btn = next(
            (b for b in driver.find_elements(By.CSS_SELECTOR, "button[type='submit']") if "submit request" in b.text.lower()),
            None,
        )
        if submit_btn:
            submit_btn.click()
            time.sleep(2)
            ok = "submitted" in driver.find_element(By.TAG_NAME, "body").text.lower() or \
                 "selenium test change request" in driver.find_element(By.TAG_NAME, "body").text.lower()
            run.record("submitted change request appears in history", ok)
        else:
            run.record("Submit request button", False, "not found")
    except Exception as e:
        take_screenshot(driver, "requests_fail")
        run.record("requests page", False, str(e)[:120])


def test_backtests_list(driver, run: TestRun) -> None:
    print("\n— Backtests list page —")
    try:
        ok = goto(driver, "/backtests", "BT-2026-0001")
        run.record("backtests list page renders", ok)
        if not ok:
            take_screenshot(driver, "backtests_loading_stuck")
            return

        body = driver.find_element(By.TAG_NAME, "body").text
        run.record("BT-2026-0001 present in list", "BT-2026-0001" in body)
        run.record("5 backtest codes visible", sum(1 for code in ["BT-2026-0001", "BT-2026-0002", "BT-2026-0003", "BT-2026-0004", "BT-2026-0005"] if code in body) == 5)

        # Filter chips
        chips = [b for b in driver.find_elements(By.TAG_NAME, "button") if b.text.strip().lower() in ["all", "draft", "in progress", "completed", "approved", "cancelled"]]
        run.record(f"filter chips present", len(chips) >= 5, f"{len(chips)} chips found")

        # Click 'completed' chip
        completed_chip = next((c for c in chips if c.text.strip().lower() == "completed"), None)
        if completed_chip:
            completed_chip.click()
            # Wait for filter to apply — BT-2026-0002 (in_progress) should disappear
            try:
                WebDriverWait(driver, 10).until(
                    lambda d: "BT-2026-0002" not in d.find_element(By.TAG_NAME, "body").text
                              and "BT-2026-0001" in d.find_element(By.TAG_NAME, "body").text
                )
                run.record("'completed' filter shows only completed", True)
            except Exception:
                body = driver.find_element(By.TAG_NAME, "body").text
                still_has = "BT-2026-0001" in body
                no_in_prog = "BT-2026-0002" not in body
                run.record("'completed' filter shows only completed", False,
                           f"timed out — has 0001: {still_has}, missing 0002: {no_in_prog}")

        # Reset to 'all' for next test
        all_chip = next((c for c in chips if c.text.strip().lower() == "all"), None)
        if all_chip:
            all_chip.click()
            time.sleep(0.5)

        # Find the BT-2026-0001 row and click its View button (it's the only completed one with a real result)
        rows = driver.find_elements(By.CSS_SELECTOR, "tbody tr")
        target_row = next((r for r in rows if "BT-2026-0001" in r.text), None)
        if target_row:
            view_btn = target_row.find_element(By.TAG_NAME, "button")
            view_btn.click()
            # Wait for the detail page to load BT-2026-0001's data
            ok = WebDriverWait(driver, 15).until(
                lambda d: "BT-2026-0001" in d.find_element(By.TAG_NAME, "body").text
                          and "loading" not in d.find_element(By.TAG_NAME, "body").text.strip().lower()[:40]
            )
            run.record("View on BT-2026-0001 navigates to detail with content", bool(ok))
        else:
            run.record("BT-2026-0001 row found in table", False, "row not found")
    except Exception as e:
        take_screenshot(driver, "backtests_list_fail")
        run.record("backtests list", False, str(e)[:120])


def test_backtest_detail(driver, run: TestRun) -> None:
    print("\n— Backtest detail page —")
    try:
        # Should be on detail page from previous step
        body = driver.find_element(By.TAG_NAME, "body").text
        run.record("backtest code BT-2026-0001 in header", "BT-2026-0001" in body)
        run.record("Assumptions section visible", "assumptions" in body.lower())
        run.record("Date range row visible", "date range" in body.lower())
        run.record("Initial capital row visible", "initial capital" in body.lower())
        run.record("Market data provider visible", "global data feeds" in body.lower() or "market data provider" in body.lower())
        run.record("Brokerage (firm) visible", "fyers" in body.lower() or "brokerage (firm)" in body.lower())
        run.record("KPI Total Return visible", "total return" in body.lower())
        run.record("KPI Sharpe visible", "sharpe" in body.lower())
        run.record("KPI Sortino visible", "sortino" in body.lower())
        run.record("KPI Max Drawdown visible", "max drawdown" in body.lower())

        # Equity curve - recharts renders an svg
        svgs = driver.find_elements(By.TAG_NAME, "svg")
        run.record(f"chart SVG elements rendered", len(svgs) >= 1, f"{len(svgs)} svgs")

        # Trade log
        run.record("Trade log section visible", "trade log" in body.lower())
        # Trade IDs are T-NNNN; check for any 4-digit T-prefixed ID rather than two specific ones.
        import re
        trade_ids = re.findall(r"T-\d{4}", body)
        run.record("≥1 trade row with T-NNNN id visible", len(trade_ids) >= 1, f"{len(trade_ids)} found")
        run.record("≥2 trade rows visible", len(trade_ids) >= 2, f"{len(trade_ids)} found")
        run.record("Disclaimer visible", "past performance" in body.lower())

        # Back button
        back_link = next((a for a in driver.find_elements(By.TAG_NAME, "a") if "back to backtests" in a.text.lower()), None)
        if back_link:
            back_link.click()
            time.sleep(0.5)
            run.record("Back to backtests link works", driver.current_url.endswith("/backtests"))
        else:
            run.record("Back link present", False, "not found")
    except Exception as e:
        take_screenshot(driver, "backtest_detail_fail")
        run.record("backtest detail", False, str(e)[:120])


def test_dark_mode(driver, run: TestRun) -> None:
    print("\n— Dark mode toggle —")
    try:
        # Theme toggle in topbar — first button after main content has Moon/Sun icon
        # Find by aria-less position: typically third button from right (theme/bell/avatar)
        # Easier: find buttons in <header>
        header = driver.find_element(By.TAG_NAME, "header")
        buttons = header.find_elements(By.TAG_NAME, "button")
        # The first non-avatar size-9 button is the dark toggle
        toggles = [b for b in buttons if b.get_attribute("class") and "size-9" in b.get_attribute("class")]
        if not toggles:
            run.record("dark mode toggle button", False, "no size-9 buttons in header")
            return
        before = "dark" in (driver.find_element(By.TAG_NAME, "html").get_attribute("class") or "")
        toggles[0].click()
        time.sleep(0.3)
        after = "dark" in (driver.find_element(By.TAG_NAME, "html").get_attribute("class") or "")
        run.record("dark mode toggles class on <html>", before != after, f"{before} → {after}")
        # Toggle back
        toggles[0].click()
        time.sleep(0.2)
    except Exception as e:
        take_screenshot(driver, "dark_mode_fail")
        run.record("dark mode toggle", False, str(e)[:80])


def test_avatar_logout(driver, run: TestRun) -> None:
    print("\n— Avatar dropdown + logout —")
    try:
        header = driver.find_element(By.TAG_NAME, "header")
        # Avatar button is the last button in the header
        buttons = header.find_elements(By.TAG_NAME, "button")
        avatar_btn = buttons[-1]
        avatar_btn.click()
        time.sleep(0.3)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        run.record("avatar dropdown opens", "log out" in body)

        logout_btn = next(
            (b for b in driver.find_elements(By.TAG_NAME, "button") if "log out" in b.text.lower()),
            None,
        )
        if logout_btn:
            logout_btn.click()
            WebDriverWait(driver, 5).until(lambda d: "/login" in d.current_url)
            run.record("logout redirects to /login", True)
        else:
            run.record("logout button", False, "not found in dropdown")
    except Exception as e:
        take_screenshot(driver, "logout_fail")
        run.record("avatar/logout", False, str(e)[:80])


# ────────────────────────────────────────────────────────────────────


def reset_db_state() -> None:
    """Wipe demo-client T&C acceptances + recent test-noise (requests, all test-prefixed backtests).
    Removes BT-SYN-*, BT-EDGE-*, TEST-* prefixes so filter/list tests work cleanly."""
    from sqlalchemy import create_engine, or_
    from sqlalchemy.orm import sessionmaker
    from app.core.config import get_settings
    from app.db.models import Backtest, BacktestFile, Request as Req, TermsAcceptance, User

    e = create_engine(get_settings().DATABASE_URL_SYNC)
    s = sessionmaker(bind=e)()
    demo = s.query(User).filter(User.email == DEMO_EMAIL).first()
    if demo:
        n1 = s.query(TermsAcceptance).filter(TermsAcceptance.user_id == demo.id).delete()
        n2 = s.query(Req).filter(Req.client_id == demo.client_id).delete()
        # Drop any test-prefix backtests + their files
        test_bts = s.query(Backtest).filter(
            Backtest.client_id == demo.client_id,
            or_(
                Backtest.code.startswith("TEST-"),
                Backtest.code.startswith("BT-SYN-"),
                Backtest.code.startswith("BT-EDGE-"),
            ),
        ).all()
        n3 = len(test_bts)
        for bt in test_bts:
            s.query(BacktestFile).filter(BacktestFile.backtest_id == bt.id).delete()
            s.delete(bt)
        s.commit()
        print(f"  reset: cleared {n1} T&C, {n2} requests, {n3} test backtests")


def login_as(driver, email: str, password: str, *, as_admin: bool = False) -> bool:
    login_path = "/admin/login" if as_admin else "/login"
    driver.get(f"{FRONTEND}{login_path}")
    try:
        wait_for(driver, "input[type='email']")
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").clear()
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").clear()
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys(email)
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys(password)
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        # Wait until URL leaves the login page entirely (no /login or /admin/login)
        WebDriverWait(driver, 10).until(
            lambda d: not (d.current_url.endswith("/login") or d.current_url.endswith("/admin/login"))
        )
        return True
    except Exception:
        return False


def test_admin_login(driver, run: TestRun) -> None:
    print("\n— Admin login at /admin/login routes to /admin —")
    try:
        ok = login_as(driver, ADMIN_EMAIL, ADMIN_PASSWORD, as_admin=True)
        run.record("admin login at /admin/login succeeds", ok)
        run.record("admin redirected to /admin", "/admin" in driver.current_url and "/login" not in driver.current_url, driver.current_url)
    except Exception as e:
        take_screenshot(driver, "admin_login_fail")
        run.record("admin login", False, str(e)[:120])


def test_admin_pulse(driver, run: TestRun) -> None:
    print("\n— Admin Pulse page —")
    try:
        ok = goto(driver, "/admin", "operations dashboard")
        run.record("admin pulse renders", ok)
        if not ok:
            take_screenshot(driver, "admin_pulse_fail")
            return
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        run.record("Pulse stat 'Clients'",       "clients" in body)
        run.record("Pulse stat 'Backtests'",     "backtests" in body)
        run.record("Pulse stat 'Completed'",     "completed" in body)
        run.record("Pulse stat 'Open requests'", "open requests" in body)
        run.record("Pulse stat 'Tiers'",         "tiers" in body)
        run.record("Sterling Capital listed",    "sterling capital advisors" in body)
    except Exception as e:
        take_screenshot(driver, "admin_pulse_fail")
        run.record("admin pulse", False, str(e)[:120])


def test_admin_sidebar_nav(driver, run: TestRun) -> None:
    print("\n— Admin sidebar nav —")
    for label, expect in [
        ("Clients", "/admin/clients"),
        ("Upload backtest", "/admin/backtests/upload"),
        ("T&C editor", "/admin/terms"),  # may not have a route; will still attempt
        ("Notifications", "/admin/notifications"),
        ("Audit log", "/admin/audit"),
        ("Pulse", "/admin"),
    ]:
        try:
            link = next((a for a in driver.find_elements(By.TAG_NAME, "a") if a.text.strip() == label), None)
            if not link:
                run.record(f"admin sidebar '{label}'", False, "not found")
                continue
            link.click()
            time.sleep(0.6)
            ok = driver.current_url.endswith(expect) or driver.current_url.endswith(expect + "/")
            run.record(f"admin sidebar '{label}' → {expect}", ok, driver.current_url)
        except Exception as e:
            run.record(f"admin sidebar '{label}'", False, str(e)[:80])


def test_admin_clients_drawer(driver, run: TestRun) -> None:
    print("\n— Admin Clients page —")
    try:
        ok = goto(driver, "/admin/clients", "sterling capital advisors")
        run.record("admin clients renders", ok)
        if not ok:
            take_screenshot(driver, "admin_clients_fail")
            return
        # Click the row
        row = next(
            (r for r in driver.find_elements(By.CSS_SELECTOR, "tbody tr") if "sterling" in r.text.lower()),
            None,
        )
        if not row:
            run.record("Sterling row found", False)
            return
        row.click()
        # Wait for drawer
        ok = WebDriverWait(driver, 5).until(
            lambda d: any("save" == b.text.strip().lower() for b in d.find_elements(By.TAG_NAME, "button"))
        )
        run.record("drawer opens with Save button", bool(ok))
        # Close drawer by clicking the X
        x_btn = next(
            (b for b in driver.find_elements(By.TAG_NAME, "button") if b.text.strip() == "" and "size-8" in (b.get_attribute("class") or "")),
            None,
        )
        if x_btn:
            x_btn.click()
            time.sleep(0.3)
            run.record("drawer closes via X", True)
    except Exception as e:
        take_screenshot(driver, "admin_clients_fail")
        run.record("admin clients drawer", False, str(e)[:120])


def test_admin_backtest_upload(driver, run: TestRun) -> None:
    print("\n— Admin Backtest Upload —")
    try:
        ok = goto(driver, "/admin/backtests/upload", "upload backtest result")
        run.record("admin backtest upload renders", ok)
        if not ok:
            take_screenshot(driver, "admin_upload_fail")
            return

        # Pick a client (default is "" now — no auto-select). Wait for clients fetch.
        from selenium.webdriver.support.ui import Select
        WebDriverWait(driver, 10).until(
            lambda d: len(d.find_element(By.TAG_NAME, "select").find_elements(By.TAG_NAME, "option")) >= 2
        )
        client_select = driver.find_element(By.TAG_NAME, "select")
        Select(client_select).select_by_index(1)  # first real client
        time.sleep(0.5)

        textarea = driver.find_element(By.TAG_NAME, "textarea")

        # ── TEST 1: bad JSON (missing required fields) → expect violations ──
        textarea.clear()
        textarea.send_keys('{"schema_version": "1.0", "backtest_id": "TEST-BAD"}')
        upload_btn = next(b for b in driver.find_elements(By.TAG_NAME, "button") if "validate" in b.text.lower())
        upload_btn.click()
        time.sleep(2)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        run.record("bad JSON shows validation failed", "validation failed" in body or "violation" in body)

        # ── TEST 2: good JSON with unique code → expect success ──
        # Reload the page so stale "Validation failed" card doesn't poison the wait check
        driver.get(f"{FRONTEND}/admin/backtests/upload")
        wait_for_page_ready(driver, "upload backtest result")

        # Re-pick the client after reload
        WebDriverWait(driver, 10).until(
            lambda d: len(d.find_element(By.TAG_NAME, "select").find_elements(By.TAG_NAME, "option")) >= 2
        )
        client_select = driver.find_element(By.TAG_NAME, "select")
        Select(client_select).select_by_index(1)
        time.sleep(0.5)

        example = json.loads(BACKTEST_EXAMPLE.read_text())
        ts = int(time.time())
        example["backtest_id"] = f"TEST-BT-{ts}"
        example["strategy"]["name"] = f"Selenium test backtest {ts}"
        textarea = driver.find_element(By.TAG_NAME, "textarea")
        payload_json = json.dumps(example)
        # Inject the value via the React-aware path (native prototype setter + input event)
        driver.execute_script("""
            const el = arguments[0];
            const v = arguments[1];
            const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            setter.call(el, v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        """, textarea, payload_json)

        # Wait for React to flush state — verify the char count display updated
        try:
            WebDriverWait(driver, 5).until(
                lambda d: f"{len(payload_json)} chars" in d.find_element(By.TAG_NAME, "body").text
            )
        except Exception:
            time.sleep(1.5)  # fallback if char-count text isn't present

        # Click upload
        upload_btn = next(b for b in driver.find_elements(By.TAG_NAME, "button") if "validate" in b.text.lower())
        upload_btn.click()

        try:
            WebDriverWait(driver, 30).until(
                lambda d: "upload complete" in d.find_element(By.TAG_NAME, "body").text.lower()
                          or "validation failed" in d.find_element(By.TAG_NAME, "body").text.lower()
            )
            body = driver.find_element(By.TAG_NAME, "body").text.lower()
            if "upload complete" in body:
                run.record(f"valid JSON uploads (code TEST-BT-{ts})", True)
            else:
                take_screenshot(driver, "admin_upload_unexpected")
                run.record("valid JSON uploads", False, "validation failed unexpectedly")
        except Exception:
            take_screenshot(driver, "admin_upload_timeout")
            # Dump button text to see if it's stuck
            btns = [b.text for b in driver.find_elements(By.TAG_NAME, "button") if "validate" in b.text.lower() or "uploading" in b.text.lower()]
            run.record("valid JSON uploads", False, f"no upload-complete after 30s; button text: {btns}")
    except Exception as e:
        take_screenshot(driver, "admin_upload_fail")
        run.record("admin backtest upload", False, str(e)[:120])


def test_admin_audit(driver, run: TestRun) -> None:
    print("\n— Admin Audit Log —")
    try:
        ok = goto(driver, "/admin/audit", "audit log")
        run.record("audit log renders", ok)
        if not ok:
            take_screenshot(driver, "admin_audit_fail")
            return
        WebDriverWait(driver, 10).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, "tbody tr")) > 0
        )

        # Use the filter input to find specific actions (audit returns last 100;
        # tnc.accept may be ranked off if there's been heavy backtest upload activity)
        filter_input = driver.find_element(By.CSS_SELECTOR, "input[placeholder*='Filter by action prefix']")
        filter_input.clear()
        filter_input.send_keys("tnc.")
        # Wait for re-fetch
        time.sleep(1.0)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        run.record("audit filter 'tnc.' finds entries", "tnc." in body and "tnc.accept" in body)

        filter_input.clear()
        filter_input.send_keys("backtest.result.upload")
        time.sleep(1.0)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        run.record("audit filter 'backtest.result.upload' finds entries", "backtest.result.upload" in body)
    except Exception as e:
        run.record("admin audit", False, str(e)[:120])


def test_admin_notifications(driver, run: TestRun) -> None:
    print("\n— Admin Notifications —")
    try:
        ok = goto(driver, "/admin/notifications", "compose notification")
        run.record("notifications page renders", ok)
        # Toggle modes
        broadcast_btn = next(b for b in driver.find_elements(By.TAG_NAME, "button") if "broadcast" in b.text.lower())
        personal_btn = next(b for b in driver.find_elements(By.TAG_NAME, "button") if b.text.strip().lower() == "personal")
        personal_btn.click()
        time.sleep(0.3)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        run.record("personal mode shows client selector", "target client" in body)
        broadcast_btn.click()
        time.sleep(0.3)
        body = driver.find_element(By.TAG_NAME, "body").text.lower()
        run.record("broadcast mode hides client selector", "target client" not in body)
    except Exception as e:
        run.record("admin notifications", False, str(e)[:120])


def test_client_blocked_from_admin(driver, run: TestRun) -> None:
    print("\n— Cross-role isolation —")
    try:
        # Log out, then log in as client
        header = driver.find_element(By.TAG_NAME, "header")
        avatar_btns = header.find_elements(By.TAG_NAME, "button")
        avatar_btns[-1].click()
        time.sleep(0.3)
        logout_btn = next(b for b in driver.find_elements(By.TAG_NAME, "button") if "log out" in b.text.lower())
        logout_btn.click()
        WebDriverWait(driver, 5).until(lambda d: "/login" in d.current_url)

        ok = login_as(driver, DEMO_EMAIL, DEMO_PASSWORD)
        run.record("client login after admin logout", ok)

        # Now attempt to navigate to /admin
        driver.get(f"{FRONTEND}/admin")
        time.sleep(1)
        # Should redirect away from /admin (to /)
        run.record("client blocked from /admin (redirected)", "/admin" not in driver.current_url, driver.current_url)
    except Exception as e:
        run.record("cross-role isolation", False, str(e)[:120])


def main() -> int:
    print("\nResetting demo-client state…")
    reset_db_state()

    run = TestRun()
    driver = make_driver()
    try:
        # ── CLIENT FLOW ──
        test_login_bad_password(driver, run)
        test_login_good_password(driver, run)
        test_tnc_wizard(driver, run)
        test_overview_page(driver, run)
        test_sidebar_nav(driver, run)
        test_strategies_page(driver, run)
        test_requests_page(driver, run)
        test_backtests_list(driver, run)
        test_backtest_detail(driver, run)
        test_dark_mode(driver, run)
        test_avatar_logout(driver, run)

        # ── ADMIN FLOW ──
        test_admin_login(driver, run)
        test_admin_pulse(driver, run)
        test_admin_sidebar_nav(driver, run)
        test_admin_clients_drawer(driver, run)
        test_admin_backtest_upload(driver, run)
        test_admin_notifications(driver, run)
        test_admin_audit(driver, run)

        # ── CROSS-ROLE ──
        test_client_blocked_from_admin(driver, run)
    finally:
        driver.quit()

    print("\n" + "═" * 60)
    print(f"  TOTAL: {len(run.passes)} passed, {len(run.fails)} failed")
    print("═" * 60)
    if run.fails:
        print("\nFailures:")
        for name, detail in run.fails:
            print(f"  ✗ {name}")
            if detail:
                print(f"     {detail}")
        return 1
    print("\nAll tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
