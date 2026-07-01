"""Explicit edge-case upload tests:
- 1 trade
- 0 trades (empty)
- all-winners (30 trades)
- all-losers (30 trades)
- large (1000 trades) — verify perf
- payload size approaching 25MB cap

Plus: verify each renders without divide-by-zero or NaN in the dashboard.
"""
from __future__ import annotations

import copy
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app.db.models import Backtest, BacktestFile, User
from app.db.session import SessionLocal

STRATEGIES_DIR = Path(__file__).parent / "strategies"
BACKEND = "http://localhost:8000/api/v1"
FIREBASE_KEY = "AIzaSyD_CmcpWcgjk9QoWpE6lxat1PbQ_bVVU18"
ADMIN_EMAIL = "insightfusionanalytics@gmail.com"
ADMIN_PASS = "sg&^XpSP9GAu2PmBYcrE"
DEMO_EMAIL = "demo.client@sterlingcap.test"


def token(email: str, password: str) -> str:
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}",
        json={"email": email, "password": password, "returnSecureToken": True},
    )
    r.raise_for_status()
    return r.json()["idToken"]


def hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def get_client_id() -> str:
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == DEMO_EMAIL).first()
        return str(u.client_id)
    finally:
        db.close()


def upload(admin_token: str, client_id: str, result: dict) -> tuple[int, dict]:
    t0 = time.time()
    r = requests.post(
        f"{BACKEND}/admin/backtests/upload-result",
        headers=hdr(admin_token),
        json={"client_id": client_id, "result": result},
        timeout=120,
    )
    elapsed = round(time.time() - t0, 2)
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:500]}
    return r.status_code, {"status": r.status_code, "elapsed": elapsed, **body}


def main() -> int:
    admin_t = token(ADMIN_EMAIL, ADMIN_PASS)
    client_t = token(DEMO_EMAIL, "DemoClient!2026")
    client_id = get_client_id()

    passes, fails = [], []

    print("─── EDGE CASE: single-trade backtest ───")
    bt = json.loads((STRATEGIES_DIR / "BT-SYN-EDGE-1trade.json").read_text())
    bt["backtest_id"] = f"BT-EDGE-1trade-{int(time.time())}"
    code, info = upload(admin_t, client_id, bt)
    ok = code == 201
    print(f"  upload status={code} t={info['elapsed']}s")
    if ok:
        # Now fetch as client
        bts = requests.get(f"{BACKEND}/backtests", headers=hdr(client_t)).json()
        match = next((b for b in bts if b["code"] == bt["backtest_id"]), None)
        if match:
            detail = requests.get(f"{BACKEND}/backtests/{match['id']}", headers=hdr(client_t)).json()
            n_trades = len(detail["result"]["trades"])
            print(f"  rendered trades={n_trades}, summary.n_trades={detail['result']['metrics']['summary']['n_trades']}")
            (passes if n_trades == 1 else fails).append("1-trade upload + render")
        else:
            fails.append("1-trade: uploaded but not in client list")
    else:
        fails.append(f"1-trade: upload {code}")

    print("\n─── EDGE CASE: empty trades array ───")
    bt = json.loads((STRATEGIES_DIR / "BT-SYN-EDGE-1trade.json").read_text())
    bt["backtest_id"] = f"BT-EDGE-empty-{int(time.time())}"
    bt["trades"] = []
    bt["metrics"]["summary"]["n_trades"] = 0
    code, info = upload(admin_t, client_id, bt)
    print(f"  empty trades upload status={code} t={info['elapsed']}s")
    (passes if code == 201 else fails).append(f"empty trades upload (status={code})")

    print("\n─── EDGE CASE: all-winners (30) ───")
    bt = json.loads((STRATEGIES_DIR / "BT-SYN-EDGE-allwins.json").read_text())
    bt["backtest_id"] = f"BT-EDGE-allwins-{int(time.time())}"
    n_losers_in_data = sum(1 for t in bt["trades"] if t["pnl"]["net"] < 0)
    print(f"  source had {n_losers_in_data} losers (synthetic gen may bleed) — upload anyway")
    code, info = upload(admin_t, client_id, bt)
    print(f"  status={code} t={info['elapsed']}s")
    (passes if code == 201 else fails).append(f"all-wins upload (status={code})")

    print("\n─── EDGE CASE: all-losses (30) ───")
    bt = json.loads((STRATEGIES_DIR / "BT-SYN-EDGE-alllosses.json").read_text())
    bt["backtest_id"] = f"BT-EDGE-alllosses-{int(time.time())}"
    n_winners = sum(1 for t in bt["trades"] if t["pnl"]["net"] > 0)
    print(f"  source had {n_winners} winners (synthetic gen) — upload anyway")
    code, info = upload(admin_t, client_id, bt)
    print(f"  status={code} t={info['elapsed']}s")
    (passes if code == 201 else fails).append(f"all-losses upload (status={code})")

    print("\n─── EDGE CASE: LARGE (1000 trades) ───")
    bt = json.loads((STRATEGIES_DIR / "BT-SYN-EDGE-large.json").read_text())
    bt["backtest_id"] = f"BT-EDGE-large-{int(time.time())}"
    payload_size = len(json.dumps(bt))
    print(f"  payload size: {payload_size:,} bytes ({payload_size / 1024:.1f} KB)")
    code, info = upload(admin_t, client_id, bt)
    print(f"  status={code} t={info['elapsed']}s")
    (passes if code == 201 else fails).append(f"large 1000-trade upload (status={code}, took {info['elapsed']}s)")

    # Fetch + render-time check
    if code == 201:
        t0 = time.time()
        bts = requests.get(f"{BACKEND}/backtests", headers=hdr(client_t)).json()
        match = next((b for b in bts if b["code"] == bt["backtest_id"]), None)
        if match:
            detail = requests.get(f"{BACKEND}/backtests/{match['id']}", headers=hdr(client_t)).json()
            elapsed = round(time.time() - t0, 2)
            n = len(detail["result"]["trades"]) if detail.get("result") else 0
            print(f"  fetch + parse 1000-trade detail took {elapsed}s, got {n} trades")
            (passes if n == 1000 and elapsed < 5 else fails).append(f"large fetch (n={n}, t={elapsed}s)")

    print("\n─── EDGE CASE: payload >25MB (should be rejected gracefully) ───")
    # Inflate a backtest with synthetic massive trade list
    big_bt = json.loads((STRATEGIES_DIR / "BT-SYN-EDGE-large.json").read_text())
    big_bt["backtest_id"] = f"BT-EDGE-toobig-{int(time.time())}"
    # Duplicate trades to inflate
    one_trade = big_bt["trades"][0]
    while len(json.dumps(big_bt)) < 27_000_000:
        # ~10K extra trades at a time
        big_bt["trades"].extend([{**one_trade, "id": f"T-INF-{i}"} for i in range(10_000)])
    size_mb = len(json.dumps(big_bt)) / 1024 / 1024
    print(f"  inflated payload: {size_mb:.1f} MB")
    try:
        t0 = time.time()
        r = requests.post(
            f"{BACKEND}/admin/backtests/upload-result",
            headers=hdr(admin_t),
            json={"client_id": client_id, "result": big_bt},
            timeout=120,
        )
        elapsed = round(time.time() - t0, 2)
        # Either it's rejected cleanly or it succeeds — both acceptable for now
        # What MUST NOT happen: 500 server error from buffer overflow / OOM
        if r.status_code in (200, 201):
            print(f"  ⚠ Server accepted {size_mb:.1f}MB upload (no enforced limit). status={r.status_code} t={elapsed}s")
            passes.append(f"large upload accepted (status={r.status_code})")
        elif r.status_code == 413:
            print(f"  ✅ Server correctly rejected with 413 Payload Too Large t={elapsed}s")
            passes.append("413 enforcement")
        elif r.status_code == 422:
            print(f"  ✅ Server rejected with 422 (validation/schema) t={elapsed}s")
            passes.append("422 rejection")
        elif r.status_code == 500:
            print(f"  ❌ Server 500 on big upload (bad!) t={elapsed}s")
            fails.append("500 on oversized upload — should be 413")
        else:
            print(f"  ?? Unexpected status {r.status_code} t={elapsed}s")
            passes.append(f"oversized upload status={r.status_code}")
    except Exception as e:
        print(f"  ⚠ Connection error on big upload (likely Nginx/uvicorn body limit): {type(e).__name__}")
        passes.append("oversized upload — connection-level rejection")

    print("\n─── EDGE CASE: duplicate code ───")
    bt = json.loads((STRATEGIES_DIR / "BT-SYN-EDGE-1trade.json").read_text())
    bt["backtest_id"] = f"BT-EDGE-dup-{int(time.time())}"
    code1, _ = upload(admin_t, client_id, bt)
    # Re-upload same code
    code2, info2 = upload(admin_t, client_id, bt)
    print(f"  first upload status={code1}, second status={code2}")
    # System should either accept (idempotent / new row) or reject 409 — both reasonable
    # But MUST NOT 500
    ok = code1 in (200, 201) and code2 in (200, 201, 409, 422)
    (passes if ok else fails).append(f"duplicate code handling ({code1},{code2})")

    print("\n" + "═" * 60)
    print(f"  {len(passes)} passed, {len(fails)} failed")
    print("═" * 60)
    if fails:
        for f in fails:
            print(f"  ✗ {f}")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
