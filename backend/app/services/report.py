"""Backtest report renderer.

Given a Backtest row + its associated v1.0 result JSON blob, render a
polished A4 PDF via Jinja2 → WeasyPrint. All charts are inline SVG generated
in-process (see svg_chart.py) so we don't depend on matplotlib.

The report intentionally embeds the four mandatory legal disclaimers, the
current T&C version the client accepted, and a SHA-256 checksum of the
underlying result JSON - this closes Todoist section 15 and gives the
report evidentiary weight if a client ever disputes the delivered results.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.services.svg_chart import ChartStyle, area_chart, line_chart

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "xml", "j2"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _fmt_currency(amount: float | int | None, currency: str | None) -> str:
    if amount is None:
        return "-"
    sym = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(currency or "", "")
    try:
        return f"{sym}{amount:,.0f}"
    except (TypeError, ValueError):
        return str(amount)


def _fmt_pct(value: float | int | None, digits: int = 2) -> str:
    if value is None:
        return "-"
    try:
        return f"{value:.{digits}f}%"
    except (TypeError, ValueError):
        return str(value)


def _fmt_num(value: float | int | None, digits: int = 2) -> str:
    if value is None:
        return "-"
    try:
        if isinstance(value, int):
            return f"{value:,}"
        return f"{value:,.{digits}f}"
    except (TypeError, ValueError):
        return str(value)


def _build_metric_cards(summary: dict[str, Any]) -> list[dict[str, str]]:
    """The 12 metrics required by Todoist section 5. If any is missing from
    the payload we simply skip it - better than showing '-' everywhere."""
    spec = [
        ("total_return_pct",     "Total return",    lambda v: (_fmt_pct(v), "pos" if v > 0 else "neg")),
        ("cagr_pct",             "CAGR",            lambda v: (_fmt_pct(v), "pos" if v > 0 else "neg")),
        ("sharpe_ratio",         "Sharpe",          lambda v: (_fmt_num(v, 2), "pos" if v > 0 else "neg")),
        ("sortino_ratio",        "Sortino",         lambda v: (_fmt_num(v, 2), "pos" if v > 0 else "neg")),
        ("max_drawdown_pct",     "Max drawdown",    lambda v: (_fmt_pct(v), "neg")),
        ("profit_factor",        "Profit factor",   lambda v: (_fmt_num(v, 2), "pos" if v > 1 else "neg")),
        ("win_rate_pct",         "Win rate",        lambda v: (_fmt_pct(v, 1), "")),
        ("n_trades",             "# Trades",        lambda v: (_fmt_num(v), "")),
        ("avg_trade_return_pct", "Avg trade",       lambda v: (_fmt_pct(v), "pos" if v > 0 else "neg")),
        ("best_trade_pct",       "Best trade",      lambda v: (_fmt_pct(v), "pos")),
        ("worst_trade_pct",      "Worst trade",     lambda v: (_fmt_pct(v), "neg")),
        ("exposure_pct",         "Exposure",        lambda v: (_fmt_pct(v, 1), "")),
    ]
    cards: list[dict[str, str]] = []
    for key, label, fmt in spec:
        v = summary.get(key)
        if v is None:
            continue
        try:
            display, tone = fmt(v)
        except Exception:
            display, tone = str(v), ""
        cards.append({"label": label, "value": display, "tone": tone})
    return cards


def _build_assumption_rows(assumptions: dict[str, Any] | None) -> list[dict[str, str]]:
    if not assumptions:
        return []
    rows: list[dict[str, str]] = []
    a = assumptions
    dr = a.get("date_range") or {}
    if dr.get("from") or dr.get("to"):
        rows.append({"label": "Date range", "value": f"{dr.get('from','-')} → {dr.get('to','-')}"})
    ic = a.get("initial_capital") or {}
    if ic.get("amount") is not None:
        rows.append({"label": "Initial capital", "value": _fmt_currency(ic.get("amount"), ic.get("currency"))})
    if a.get("timeframe"):
        rows.append({"label": "Timeframe", "value": str(a["timeframe"])})
    if a.get("session"):
        rows.append({"label": "Session", "value": str(a["session"])})
    if a.get("execution"):
        rows.append({"label": "Execution", "value": str(a["execution"])})
    if a.get("fills"):
        rows.append({"label": "Fill model", "value": str(a["fills"])})
    if a.get("data_source"):
        rows.append({"label": "Data source", "value": str(a["data_source"])})
    brk = a.get("brokerage") or {}
    if brk:
        vals = ", ".join(f"{k}={v}" for k, v in brk.items())
        rows.append({"label": "Brokerage", "value": vals})
    slp = a.get("slippage") or {}
    if slp:
        vals = ", ".join(f"{k}={v}" for k, v in slp.items())
        rows.append({"label": "Slippage", "value": vals})
    ps = a.get("position_sizing") or {}
    if ps:
        vals = ", ".join(f"{k}={v}" for k, v in ps.items())
        rows.append({"label": "Position sizing", "value": vals})
    if a.get("leverage") is not None:
        rows.append({"label": "Leverage", "value": _fmt_num(a["leverage"], 2)})
    if a.get("rebalancing"):
        rows.append({"label": "Rebalancing", "value": str(a["rebalancing"])})
    if a.get("shorting_allowed") is not None:
        rows.append({"label": "Shorting allowed", "value": "yes" if a["shorting_allowed"] else "no"})
    if a.get("currency"):
        rows.append({"label": "Reporting currency", "value": str(a["currency"])})
    return rows


def _extract_equity_series(payload: dict[str, Any]) -> list[float]:
    """The v1.0 schema puts equity under metrics.equity_curve or top-level."""
    m = payload.get("metrics") or {}
    for candidate in (m.get("equity_curve"), payload.get("equity_curve")):
        if candidate:
            try:
                if isinstance(candidate[0], dict):
                    return [float(p.get("value", p.get("equity", 0))) for p in candidate]
                return [float(x) for x in candidate]
            except Exception:
                continue
    return []


def _extract_drawdown_series(payload: dict[str, Any]) -> list[float]:
    m = payload.get("metrics") or {}
    for candidate in (m.get("drawdown_curve"), payload.get("drawdown_curve")):
        if candidate:
            try:
                if isinstance(candidate[0], dict):
                    return [float(p.get("value", p.get("drawdown", 0))) for p in candidate]
                return [float(x) for x in candidate]
            except Exception:
                continue
    return []


def _prep_trade_sample(payload: dict[str, Any], limit: int = 15) -> tuple[list[dict], int]:
    trades = payload.get("trades") or []
    total = len(trades)
    sample = []
    for t in trades[:limit]:
        row = dict(t)
        pnl = t.get("pnl") or t.get("realised_pnl")
        row["pnl_display"] = _fmt_num(pnl, 2) if pnl is not None else "-"
        sample.append(row)
    return sample, total


def render_backtest_report_pdf(
    *,
    backtest_code: str,
    strategy_name: str,
    strategy_version: str | None,
    strategy_description: str | None,
    engine_label: str,
    client_name: str,
    tnc_version: str,
    tnc_accepted_at: str | None,
    result_checksum: str,
    result_json: dict[str, Any],
) -> bytes:
    """The main entry point. Returns rendered PDF bytes."""
    # Import inside the function so the module can still be imported in test
    # environments that lack the WeasyPrint system libs (e.g. sandboxed CI).
    from weasyprint import HTML

    assumptions = result_json.get("assumptions") or {}
    summary = (result_json.get("metrics") or {}).get("summary") or {}

    equity_series = _extract_equity_series(result_json)
    drawdown_series = _extract_drawdown_series(result_json)

    equity_svg = line_chart(equity_series, ChartStyle()) if equity_series else ""
    drawdown_svg = area_chart(drawdown_series, ChartStyle(stroke="#dc2626", fill="rgba(220,38,38,0.16)")) if drawdown_series else ""

    initial_cap = (assumptions.get("initial_capital") or {})
    trade_sample, trades_total = _prep_trade_sample(result_json)

    ctx = {
        "bt_code": backtest_code,
        "strategy_name": strategy_name,
        "strategy_version": strategy_version,
        "strategy_description": strategy_description or (result_json.get("strategy") or {}).get("description"),
        "engine_label": engine_label,
        "client_name": client_name,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "assumptions": assumptions,
        "initial_capital_display": _fmt_currency(initial_cap.get("amount"), initial_cap.get("currency")),
        "metric_cards": _build_metric_cards(summary),
        "assumption_rows": _build_assumption_rows(assumptions),
        "equity_svg": equity_svg,
        "drawdown_svg": drawdown_svg,
        "trade_sample": trade_sample,
        "trades_total": trades_total,
        "tnc_version": tnc_version,
        "tnc_accepted_at": tnc_accepted_at,
        "result_checksum": result_checksum,
    }

    template = _env.get_template("backtest_report.html.j2")
    html = template.render(**ctx)
    return HTML(string=html).write_pdf()
