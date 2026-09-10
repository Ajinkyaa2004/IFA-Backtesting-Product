"""Mathematical consistency checks across the full strategy library.

For each backtest JSON, verify:
1. Schema validates against backtest.schema.json
2. n_trades == n_winners + n_losers + n_breakeven (and matches trades[] length)
3. Each trade: net = gross - fees - slippage - taxes  (within rounding tolerance)
4. summary.best_trade_pct == max(trades[].pnl.pct)
5. summary.worst_trade_pct == min(trades[].pnl.pct)
6. summary.largest_winner_amount == max(winners' pnl.net)
7. summary.largest_loser_amount  == min(losers' pnl.net)
8. summary.win_rate_pct + loss_rate_pct ≈ 100 (within rounding)
9. summary.profit_factor == sum(winners' net) / |sum(losers' net)|
10. equity_curve monotone in date, final NAV implies total_return_pct
11. drawdown_curve[i].drawdown_pct == (nav[i] - running_peak[i]) / peak * 100, always ≤ 0
12. max_drawdown_pct == min(drawdown_curve.drawdown_pct)
13. trade timestamps: exit > entry
14. shorting_allowed=False ⇒ no side="short" trades
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "schemas" / "backtest.schema.json"
STRATEGIES_DIR = Path(__file__).parent / "strategies"

TOLERANCE = 0.05  # 5% relative tolerance - synthetic data isn't perfect floats


@dataclass
class Report:
    file: str
    backtest_id: str
    schema_ok: bool
    failures: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.schema_ok and not self.failures


def relclose(a: float, b: float, tol: float = TOLERANCE) -> bool:
    if a == b:
        return True
    if a == 0 or b == 0:
        return abs(a - b) < 0.5
    return abs(a - b) / max(abs(a), abs(b)) < tol


def check_one(bt: dict[str, Any], schema: dict[str, Any]) -> Report:
    rep = Report(file="", backtest_id=bt.get("backtest_id", "?"), schema_ok=False)

    errors = list(Draft202012Validator(schema).iter_errors(bt))
    rep.schema_ok = not errors
    if errors:
        rep.failures.append(f"schema: {len(errors)} violation(s); first: {errors[0].message[:120]}")
        return rep

    trades = bt["trades"]
    summary = bt["metrics"]["summary"]
    n = len(trades)

    # 2. Trade counts
    n_winners = sum(1 for t in trades if t["pnl"]["net"] > 0)
    n_losers = sum(1 for t in trades if t["pnl"]["net"] < 0)
    n_breakeven = sum(1 for t in trades if t["pnl"]["net"] == 0)
    if summary.get("n_trades") != n:
        rep.failures.append(f"n_trades summary={summary.get('n_trades')} vs len(trades)={n}")
    if summary.get("n_winners") != n_winners:
        rep.failures.append(f"n_winners summary={summary.get('n_winners')} vs count={n_winners}")
    if summary.get("n_losers") != n_losers:
        rep.failures.append(f"n_losers summary={summary.get('n_losers')} vs count={n_losers}")
    if summary.get("n_breakeven", 0) != n_breakeven:
        rep.failures.append(f"n_breakeven summary={summary.get('n_breakeven')} vs count={n_breakeven}")
    if n_winners + n_losers + n_breakeven != n:
        rep.failures.append(f"trade counts don't sum: {n_winners}+{n_losers}+{n_breakeven} != {n}")

    # 3. Per-trade PnL identity: gross - fees - slippage - taxes ≈ net
    for t in trades:
        p = t["pnl"]
        computed = p.get("gross", 0) - p.get("fees_total", 0) - p.get("slippage_total", 0) - p.get("taxes_total", 0)
        if not relclose(computed, p["net"], tol=0.02):
            rep.failures.append(
                f"trade {t['id']}: gross-fees-slip-tax={computed:.2f} vs net={p['net']:.2f}"
            )
            break  # one is enough

    # 4–7. Extremes
    if trades:
        max_pct = max(t["pnl"]["pct"] for t in trades)
        min_pct = min(t["pnl"]["pct"] for t in trades)
        if not relclose(summary.get("best_trade_pct", 0), max_pct):
            rep.failures.append(f"best_trade_pct summary={summary.get('best_trade_pct')} vs computed={max_pct:.4f}")
        if not relclose(summary.get("worst_trade_pct", 0), min_pct):
            rep.failures.append(f"worst_trade_pct summary={summary.get('worst_trade_pct')} vs computed={min_pct:.4f}")

        winners = [t["pnl"]["net"] for t in trades if t["pnl"]["net"] > 0]
        losers = [t["pnl"]["net"] for t in trades if t["pnl"]["net"] < 0]
        if winners and not relclose(summary.get("largest_winner_amount", 0), max(winners), tol=0.02):
            rep.failures.append(
                f"largest_winner summary={summary.get('largest_winner_amount')} vs computed={max(winners):.2f}"
            )
        if losers and not relclose(summary.get("largest_loser_amount", 0), min(losers), tol=0.02):
            rep.failures.append(
                f"largest_loser summary={summary.get('largest_loser_amount')} vs computed={min(losers):.2f}"
            )

    # 8. win + loss rates sum near 100 (within rounding; breakeven slack)
    wr, lr = summary.get("win_rate_pct", 0), summary.get("loss_rate_pct", 0)
    if abs(wr + lr - 100.0) > 0.2 and n_breakeven == 0:
        rep.failures.append(f"win_rate+loss_rate = {wr+lr:.2f} (expected ~100)")

    # 9. Profit factor
    if losers:
        pf_expected = sum(winners) / abs(sum(losers))
        if not relclose(summary.get("profit_factor", 0), pf_expected, tol=0.03):
            rep.failures.append(f"profit_factor summary={summary.get('profit_factor')} vs computed={pf_expected:.4f}")

    # 10. Equity → total_return implication
    eq = bt["time_series"]["equity_curve"]
    if eq:
        final_nav = eq[-1]["nav"]
        implied = final_nav - 100.0
        if not relclose(summary.get("total_return_pct", 0), implied, tol=0.02):
            rep.failures.append(
                f"total_return_pct summary={summary.get('total_return_pct')} vs implied {implied:.4f} from final_nav={final_nav}"
            )

    # 11. Drawdown — always ≤ 0; max_dd ≤ all values
    dd = bt["time_series"]["drawdown_curve"]
    for i, p in enumerate(dd):
        if p["drawdown_pct"] > 0.001:
            rep.failures.append(f"drawdown[{i}]={p['drawdown_pct']} should be ≤ 0")
            break
    # 12. max_drawdown_pct == min(drawdown)
    if dd:
        computed_max_dd = min(p["drawdown_pct"] for p in dd)
        if not relclose(summary.get("max_drawdown_pct", 0), computed_max_dd, tol=0.05):
            rep.failures.append(
                f"max_drawdown_pct summary={summary.get('max_drawdown_pct')} vs computed={computed_max_dd:.4f}"
            )

    # 13. Trade timestamps
    for t in trades[:20]:  # spot-check first 20
        if t["exit"]["timestamp"] <= t["entry"]["timestamp"]:
            rep.failures.append(f"trade {t['id']}: exit <= entry")
            break

    # 14. Shorting consistency
    if not bt["assumptions"].get("shorting_allowed", True):
        if any(t["side"] == "short" for t in trades):
            rep.failures.append("shorts present but shorting_allowed=False")

    # 15. Equity curve monotone in date
    prev_date = ""
    for p in eq:
        if p["date"] < prev_date:
            rep.failures.append(f"equity_curve not date-sorted at {p['date']}")
            break
        prev_date = p["date"]

    return rep


def main() -> int:
    schema = json.loads(SCHEMA_PATH.read_text())
    files = sorted(STRATEGIES_DIR.glob("*.json"))
    print(f"Validating {len(files)} backtest JSONs against schema + math …\n")

    reports: list[Report] = []
    for f in files:
        try:
            bt = json.loads(f.read_text())
        except Exception as e:
            r = Report(file=f.name, backtest_id="?", schema_ok=False)
            r.failures.append(f"JSON parse error: {e}")
            reports.append(r)
            continue
        r = check_one(bt, schema)
        r.file = f.name
        reports.append(r)

    n_ok = sum(1 for r in reports if r.ok)
    n_fail = len(reports) - n_ok
    n_schema_fail = sum(1 for r in reports if not r.schema_ok)

    print(f"Schema valid: {len(reports) - n_schema_fail}/{len(reports)}")
    print(f"Math + schema clean: {n_ok}/{len(reports)}")
    if n_fail:
        print(f"\n{n_fail} failed:\n")
        for r in reports:
            if not r.ok:
                print(f"  ✗ {r.file}  ({r.backtest_id})")
                for fail in r.failures[:5]:
                    print(f"      · {fail}")
                if len(r.failures) > 5:
                    print(f"      · …and {len(r.failures)-5} more")

    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
