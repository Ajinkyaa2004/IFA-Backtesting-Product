import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, Card, KV, SectionTitle } from "../../components/ui";
import {
  type BacktestBenchmark,
  downloadBacktestReport,
  fetchBacktest,
  fetchBacktestBenchmark,
  type BacktestDetail,
  type BacktestResult,
  type VamPersistedBacktest,
} from "../../lib/api";
import { useAuth } from "../../store/auth";
import { useSidebarOverride } from "../../store/sidebarOverride";
import VamBacktestDetail from "../vam/VamBacktestDetail";
import VamResultSidebar from "../vam/VamResultSidebar";

export default function BacktestDetailPage() {
  const { id = "" } = useParams();
  const [bt, setBt] = useState<BacktestDetail | null>(null);
  const [benchmark, setBenchmark] = useState<BacktestBenchmark | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const vamEnabled = useAuth((s) => s.me?.vam_enabled ?? false);
  const setSidebarOverride = useSidebarOverride((s) => s.setOverride);

  // Reset state at the top of every id change so the user never sees the
  // previous backtest's data or error while the new one loads. Cancellation
  // flag drops a stale response if the user clicks a third backtest before
  // the second fetch returns. See sweep finding #5.
  useEffect(() => {
    let cancelled = false;
    setBt(null);
    setBenchmark(null);
    setErr(null);
    fetchBacktest(id)
      .then((d) => { if (!cancelled) setBt(d); })
      .catch((e) => {
        if (cancelled) return;
        const detail = e?.response?.data?.detail;
        setErr(typeof detail === "string" ? detail : "Failed to load backtest");
      });
    // Benchmark fetch is best-effort — chart still renders if it fails.
    // Also skips the fetch when the backtest has no date range (some VAM
    // envelopes) since /benchmark would return an empty series anyway.
    fetchBacktestBenchmark(id)
      .then((b) => { if (!cancelled) setBenchmark(b); })
      .catch(() => { /* silent — benchmark is a nice-to-have overlay */ });
    return () => { cancelled = true; };
  }, [id]);

  // For a VAM-engine result viewed by a VAM-enabled client, swap the layout
  // sidebar for the tweak-and-rerun panel. The Layout already provides a
  // toggle button in its sidebar header so the user can flip back to the
  // workspace nav without leaving this page. On unmount (or when the
  // backtest changes), the cleanup function clears the override.
  useEffect(() => {
    if (bt && bt.engine === "vam" && vamEnabled) {
      const envelope = bt.result as VamPersistedBacktest;
      setSidebarOverride(
        <VamResultSidebar
          step={envelope.step}
          initialParams={(envelope.params ?? {}) as Record<string, unknown>}
        />,
      );
    } else {
      setSidebarOverride(null);
    }
    return () => setSidebarOverride(null);
  }, [bt, vamEnabled, setSidebarOverride]);

  if (err) {
    return (
      <div className="space-y-4">
        <Link to="/backtests" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5">
          <ArrowLeft size={13}/> Back to backtests
        </Link>
        <Card>
          <div className="text-sm font-medium text-red-700 dark:text-red-300">{err}</div>
          <p className="mt-1 text-xs text-ink-500">
            The backtest may have been removed, or there's a temporary issue reaching the server.
          </p>
        </Card>
      </div>
    );
  }
  if (!bt) return <div className="text-sm text-ink-500">Loading…</div>;

  // VAM-engine results have a completely different shape. Render the VAM-native
  // view inside the same page header so the user still sees the back-link + name.
  if (bt.engine === "vam" && bt.result) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <Link to="/backtests" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5 mb-2">
              <ArrowLeft size={13}/> Back to backtests
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{bt.name}</h1>
              <Badge status={bt.status} dot>{bt.status.replace("_", " ")}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
              <span className="font-mono tabular">{bt.code}</span>
              {bt.completed_at && (
                <><span>·</span><span>Delivered {new Date(bt.completed_at).toLocaleDateString()}</span></>
              )}
            </div>
          </div>
        </div>
        <VamBacktestDetail envelope={bt.result as VamPersistedBacktest} />
      </div>
    );
  }

  // Manual-upload (v1.0 schema) — original renderer below.
  // We narrow the union for the rest of this function: result is a v1.0 BacktestResult.
  const result = bt.result as Exclude<BacktestDetail["result"], VamPersistedBacktest | null> | null;
  const summary = (bt.metrics?.summary ?? result?.metrics?.summary) as Record<string, number> | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <Link to="/backtests" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5 mb-2">
            <ArrowLeft size={13}/> Back to backtests
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{bt.name}</h1>
            <Badge status={bt.status} dot>{bt.status.replace("_", " ")}</Badge>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
            <span className="font-mono tabular">{bt.code}</span>
            {result?.strategy?.version && <><span>·</span><span>Strategy {result.strategy.version}</span></>}
            {bt.completed_at && <><span>·</span><span>Delivered {new Date(bt.completed_at).toLocaleDateString()}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportReportButton backtestId={bt.id} status={bt.status} />
        </div>
      </div>

      {!result && (
        <Card>
          <SectionTitle sub="No completed result yet for this backtest.">Awaiting delivery</SectionTitle>
          <p className="text-sm text-ink-500">
            Once IFA marks this backtest completed, the full results — equity curve, drawdown, trade log,
            and metrics — will appear here.
          </p>
        </Card>
      )}

      {result && (
        <>
          {/* Assumptions */}
          <Card padding="p-0">
            <div className="px-5 py-4 flex items-center justify-between border-b border-ink-100 dark:border-ink-800">
              <div>
                <div className="text-sm font-semibold">Assumptions</div>
                <div className="text-xs text-ink-500">Parameters and constraints used for this run</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 px-5 pb-5 pt-1">
              <KV k="Date range" v={`${result.assumptions.date_range.from} → ${result.assumptions.date_range.to}`} mono />
              <KV k="Initial capital" v={`${result.assumptions.initial_capital.currency} ${result.assumptions.initial_capital.amount.toLocaleString()}`} mono />
              <KV k="Universe" v={String(result.universe?.name ?? "—")} />
              <KV k="Timeframe" v={String(result.assumptions.timeframe)} mono />
              <KV k="Execution" v={String(result.assumptions.execution ?? "—")} />
              <KV k="Leverage" v={String(result.assumptions.leverage ?? "—")} mono />
              <KV k="Data source" v={String(result.assumptions.data_source ?? "—")} />
              <KV k="Market data provider" v={String(result.universe?.market_data_provider?.name ?? "—")} />
              <KV k="Brokerage (firm)" v={String(result.universe?.brokerage?.name ?? "—")} />
              <KV k="Currency" v={String(result.assumptions.currency ?? "—")} mono />
            </div>
          </Card>

          {/* KPIs */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Total Return" value={fmtPct(summary.total_return_pct)} tone="pos" />
              <KpiCard label="CAGR" value={fmtPct(summary.cagr_pct)} tone="pos" />
              <KpiCard label="Sharpe" value={summary.sharpe?.toFixed(2)} />
              <KpiCard label="Sortino" value={summary.sortino?.toFixed(2)} />
              <KpiCard label="Max Drawdown" value={fmtPct(summary.max_drawdown_pct)} tone="neg" />
              <KpiCard label="Win Rate" value={`${summary.win_rate_pct?.toFixed(1)}%`} />
              <KpiCard label="Profit Factor" value={summary.profit_factor?.toFixed(2)} />
              <KpiCard label="# Trades" value={String(summary.n_trades ?? "—")} />
            </div>
          )}

          {/* Equity curve with multi-benchmark overlay */}
          {result.time_series.equity_curve.length > 1 && (
            <Card>
              <SectionTitle sub="Strategy NAV vs benchmarks — normalised to 100">Equity curve</SectionTitle>
              <div className="h-72 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mergeBenchmark(result, benchmark)} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="currentColor" className="text-ink-200 dark:text-ink-800" strokeDasharray="2 4" vertical={false}/>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
                      tickFormatter={(d) => new Date(d).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                      minTickGap={48}/>
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} domain={["dataMin - 2", "dataMax + 2"]} width={42}/>
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="nav" name="Strategy" stroke="#4f5cf5" strokeWidth={2.25} dot={false}/>
                    {result.time_series.benchmark_curves?.[0] && (
                      <Line type="monotone" dataKey="benchmark" name={result.time_series.benchmark_curves[0].name} stroke="#8a8a98" strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>
                    )}
                    {benchmark?.meta.map((m) => (
                      <Line
                        key={m.symbol}
                        type="monotone"
                        dataKey={`bench_${m.symbol}`}
                        name={m.display_name}
                        stroke={m.color}
                        strokeWidth={1.4}
                        strokeDasharray="3 4"
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {benchmark && benchmark.source && (
                <p className="mt-2 text-[10px] text-ink-400 dark:text-ink-500 italic">
                  Benchmark series are indicative (synthetic curves matching real-world drift/volatility for each asset). Real Yahoo Finance data lands in a later release — see roadmap.
                </p>
              )}
            </Card>
          )}

          {/* Drawdown */}
          {result.time_series.drawdown_curve.length > 1 && (
            <Card>
              <SectionTitle sub="Peak-to-trough decline of strategy NAV">Drawdown</SectionTitle>
              <div className="h-48 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.time_series.drawdown_curve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity="0.35"/>
                        <stop offset="100%" stopColor="#dc2626" stopOpacity="0.04"/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="currentColor" className="text-ink-200 dark:text-ink-800" strokeDasharray="2 4" vertical={false}/>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
                      tickFormatter={(d) => new Date(d).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                      minTickGap={48}/>
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={42} tickFormatter={(v) => `${v}%`}/>
                    <Tooltip />
                    <Area type="monotone" dataKey="drawdown_pct" stroke="#dc2626" strokeWidth={1.5} fill="url(#ddFill)"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Trades */}
          <Card padding="p-0">
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-base font-semibold tracking-tight">Trade log</h2>
              <p className="text-xs text-ink-500 mt-0.5">{result.trades.length} trades</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400 border-b border-ink-100 dark:border-ink-800">
                    <th className="text-left font-medium px-5 py-2.5">ID</th>
                    <th className="text-left font-medium px-5 py-2.5">Symbol</th>
                    <th className="text-left font-medium px-5 py-2.5">Entry</th>
                    <th className="text-left font-medium px-5 py-2.5">Exit</th>
                    <th className="text-left font-medium px-5 py-2.5">Side</th>
                    <th className="text-right font-medium px-5 py-2.5">Net PnL</th>
                    <th className="text-right font-medium px-5 py-2.5">PnL %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {result.trades.map((t) => {
                    const pos = t.pnl.net >= 0;
                    return (
                      <tr key={t.id} className="hover:bg-ink-50/70 dark:hover:bg-ink-800/30">
                        <td className="px-5 py-2.5 font-mono text-xs text-ink-500 tabular">{t.id}</td>
                        <td className="px-5 py-2.5">{t.symbol}</td>
                        <td className="px-5 py-2.5 tabular text-ink-700 dark:text-ink-200">{t.entry.timestamp.slice(0, 10)}</td>
                        <td className="px-5 py-2.5 tabular text-ink-700 dark:text-ink-200">{t.exit.timestamp.slice(0, 10)}</td>
                        <td className="px-5 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                            <span className="size-1.5 rounded-full bg-accent-500"/>{t.side}
                          </span>
                        </td>
                        <td className={`px-5 py-2.5 text-right tabular font-medium ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {pos ? "+" : "−"}₹{Math.abs(t.pnl.net).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </td>
                        <td className={`px-5 py-2.5 text-right tabular font-medium ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {pos ? "+" : "−"}{Math.abs(t.pnl.pct).toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {result.disclaimer && (
            <p className="text-xs italic text-ink-400 dark:text-ink-500 leading-relaxed max-w-3xl">
              Disclaimer · {result.disclaimer}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ExportReportButton({ backtestId, status }: { backtestId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = status === "completed";
  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadBacktestReport(backtestId);
    } catch (e: any) {
      // Backend returns JSON errors for schema/validation. Since we requested
      // responseType blob, axios wraps the JSON body in a Blob — unwrap it.
      let detail = e?.response?.data;
      if (detail instanceof Blob) {
        try { detail = JSON.parse(await detail.text())?.detail ?? "Report generation failed"; }
        catch { detail = "Report generation failed"; }
      }
      setError(typeof detail === "string" ? detail : "Report generation failed");
    } finally {
      setBusy(false);
    }
  };
  const hint = enabled ? "Download PDF report" : "Report available once backtest is completed";
  return (
    <div className="flex flex-col items-end gap-1" title={hint}>
      <Button
        variant="accent"
        icon={<Download size={15}/>}
        onClick={onClick}
        disabled={!enabled || busy}
      >
        {busy ? "Rendering…" : "Export report"}
      </Button>
      {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

function fmtPct(v?: number) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function KpiCard({ label, value, tone = "neutral" }: { label: string; value?: string; tone?: "pos" | "neg" | "neutral" }) {
  const color = tone === "pos" ? "text-emerald-600 dark:text-emerald-400" : tone === "neg" ? "text-red-600 dark:text-red-400" : "text-ink-900 dark:text-ink-50";
  return (
    <Card padding="p-4">
      <div className="text-[11px] uppercase tracking-wider font-medium text-ink-500 dark:text-ink-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular tracking-tight ${color}`}>{value ?? "—"}</div>
    </Card>
  );
}

// Operates only on the v1.0 (BacktestResult) shape — VAM-engine results have
// their own renderer and never call this helper. We accept the union for the
// call-site convenience but narrow + bail out if VAM accidentally lands here.
function mergeBenchmark(
  result: BacktestDetail["result"],
  benchmark: BacktestBenchmark | null,
) {
  if (!result) return [];
  if ("engine_response" in result) return []; // VAM envelope — not applicable
  const v1 = result as BacktestResult;
  const legacyBench = v1.time_series.benchmark_curves?.[0];
  const legacyMap = new Map((legacyBench?.series ?? []).map((p) => [p.date, p.value]));
  // Multi-benchmark maps keyed by symbol so we don't allocate per-row.
  const benchMaps: Record<string, Map<string, number>> = {};
  if (benchmark) {
    for (const [symbol, series] of Object.entries(benchmark.series)) {
      benchMaps[symbol] = new Map(series.map((p) => [p.date, p.value]));
    }
  }
  return v1.time_series.equity_curve.map((p) => {
    const row: Record<string, number | string | undefined> = {
      date: p.date,
      nav: p.nav,
      benchmark: legacyMap.get(p.date) ?? undefined,
    };
    for (const [symbol, m] of Object.entries(benchMaps)) {
      row[`bench_${symbol}`] = m.get(p.date);
    }
    return row;
  });
}
