/**
 * VAM-native detail view, rendered when backtests.engine === "vam".
 *
 * Ports VAM dashboard's renderMetrics / renderCharts / renderTradeLog into
 * React, using lightweight-charts for the time-series panels (the same
 * library VAM uses, so visuals match what the user sees on backtestravi).
 *
 * The component accepts the full envelope (VamPersistedBacktest) and reads
 * engine_response.{metrics, trades, chart_data}. Anything VAM returns under
 * those keys is faithfully shown; anything missing is omitted gracefully.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { Badge, Card, SectionTitle } from "../../components/ui";
import type { VamPersistedBacktest, VamTradeAction } from "../../lib/api";

// ── Formatters (lifted from VAM's app.js, ported to TS) ────────────────────

function fmtMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "-";
  return "$" + Math.round(v).toLocaleString();
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "-";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}
function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || Number.isNaN(v)) return "-";
  return v.toFixed(decimals);
}

// ── Component ──────────────────────────────────────────────────────────────

interface VamBacktestDetailProps {
  envelope: VamPersistedBacktest;
}

export default function VamBacktestDetail({ envelope }: VamBacktestDetailProps) {
  const er = envelope.engine_response;
  const m = (er.metrics ?? {}) as Record<string, number | undefined>;

  // Threshold values for VIX kill switch + RSI panel + the SMA labels
  // come from the persisted params. Ravi's engine accepts both camelCase
  // (dashboard) and snake_case (proposal) keys, so read either. Fall
  // back to Step-1 defaults.
  const params = (envelope.params ?? {}) as Record<string, number | undefined>;
  const vixKill = Number(params.vixThreshold ?? params.vix_kill ?? 30);
  const rsiOB = Number(params.rsiOB ?? params.rsi_sell ?? 75);
  const rsiRe = Number(params.rsiRe ?? params.rsi_rebuy ?? 60);
  // Hardcoding "SMA50"/"SMA200" lied to any user who tuned the periods.
  // Derive both from the persisted params.
  const smaDef = Number(params.smaDef ?? params.sma_short ?? 50);
  const smaKill = Number(params.smaKill ?? params.sma_long ?? 200);

  // Mirror VAM dashboard's metric card order
  const sharpe = m.sharpe ?? m.sharpe_ratio;
  const sortino = m.sortino ?? m.sortino_ratio;
  const calmar = m.calmar ?? m.calmar_ratio;
  const totalReturnPos = (m.total_return_pct ?? 0) >= 0;
  const cagrPos = (m.cagr_pct ?? 0) >= 0;
  const alphaPos = (m.alpha_vs_spy_pct ?? 0) >= 0;

  // Period card: render months for sub-year runs so a 3-month run doesn't
  // show as "0y" next to a real return (audit finding).
  const periodValue =
    m.years != null && !Number.isNaN(m.years)
      ? m.years < 1
        ? `${Math.round(m.years * 12)}mo`
        : `${m.years.toFixed(1)}y`
      : "-";

  const cards: { label: string; value: string; tone?: "pos" | "neg" | "neutral"; sub?: string }[] = [
    { label: "Final Value", value: fmtMoney(m.final_value), tone: totalReturnPos ? "pos" : "neg" },
    { label: "Total Return", value: fmtPct(m.total_return_pct), tone: totalReturnPos ? "pos" : "neg" },
    { label: "CAGR", value: fmtPct(m.cagr_pct), tone: cagrPos ? "pos" : "neg" },
    { label: "Sharpe", value: fmtNum(sharpe, 3) },
    { label: "Sortino", value: fmtNum(sortino, 3) },
    { label: "Calmar", value: fmtNum(calmar, 3) },
    { label: "Max DD", value: fmtPct(m.max_drawdown_pct), tone: "neg", sub: (m as any).max_drawdown_date },
    { label: "Trades", value: String(m.total_trades ?? er.trades?.length ?? 0) },
    { label: "Period", value: periodValue, sub: `${(m as any).start_date ?? ""} → ${(m as any).end_date ?? ""}` },
  ];
  if (m.alpha_vs_spy_pct !== undefined && m.alpha_vs_spy_pct !== null) {
    cards.push({ label: "Alpha vs SPY", value: fmtPct(m.alpha_vs_spy_pct), tone: alphaPos ? "pos" : "neg" });
  }

  return (
    <div className="space-y-6">
      {/* Header chip showing engine + step */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300 text-xs font-medium border border-accent-200/60 dark:border-accent-500/30">
          VAM engine · {envelope.step}
        </span>
        {er.cached && (
          <span className="text-xs text-ink-500">
            (cached on engine side - instant rerun)
          </span>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c, i) => (
          <Card key={i} padding="p-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-500">{c.label}</div>
            <div
              className={`mt-1 text-lg font-semibold tabular ${
                c.tone === "pos"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : c.tone === "neg"
                  ? "text-red-600 dark:text-red-400"
                  : "text-ink-900 dark:text-ink-50"
              }`}
            >
              {c.value}
            </div>
            {c.sub && <div className="text-[10px] text-ink-400 mt-0.5 tabular">{c.sub}</div>}
          </Card>
        ))}
      </div>

      {/* State Machine card — current state + all state allocations. */}
      {er.chart_data.current_state && (
        <StateMachineCard
          currentState={er.chart_data.current_state}
          step={envelope.step}
        />
      )}

      {/* Equity curve with SPY Buy & Hold overlay for benchmark visibility. */}
      <Card padding="p-4">
        <SectionTitle sub="Strategy NAV vs SPY buy-and-hold. State labels sit on strategy trade points.">
          Equity curve — Strategy vs Buy &amp; Hold
        </SectionTitle>
        <ChartPanel
          height={300}
          areaSeries={er.chart_data.equity}
          areaColor="#22c55e"
          lineSeries={
            (er.chart_data.spy_bh?.length ?? 0) > 0
              ? [{ data: er.chart_data.spy_bh!, color: "#94a3b8", title: "SPY B&H" }]
              : undefined
          }
          markers={er.chart_data.markers}
          markersOnArea
        />
      </Card>

      {/* SPY + SMAs + trade markers - the classic strategy chart. Titles
          use the actual tuned SMA periods, not hardcoded 50/200. */}
      {(er.chart_data.spy?.length ?? 0) > 0 && (
        <Card padding="p-4">
          <SectionTitle sub={`SPY price with ${smaDef}/${smaKill}-day SMAs and state-machine trade markers.`}>
            SPY + SMAs + signals
          </SectionTitle>
          <ChartPanel
            height={260}
            lineSeries={[
              { data: er.chart_data.spy!, color: "#4a9eff", title: "SPY" },
              ...(er.chart_data.sma50 ? [{ data: er.chart_data.sma50, color: "#fbbf24", title: `SMA${smaDef}` }] : []),
              ...(er.chart_data.sma200 ? [{ data: er.chart_data.sma200, color: "#f97316", title: `SMA${smaKill}` }] : []),
            ]}
            markers={er.chart_data.markers}
          />
        </Card>
      )}

      {/* VIX with kill-switch threshold line. */}
      {(er.chart_data.vix?.length ?? 0) > 0 && (
        <Card padding="p-4">
          <SectionTitle sub={`CBOE VIX. Threshold line shows the kill-switch level (${vixKill}).`}>
            VIX Kill Switch
          </SectionTitle>
          <ChartPanel
            height={160}
            lineSeries={[{ data: er.chart_data.vix!, color: "#f59e0b", title: "VIX" }]}
            priceLines={[
              { price: vixKill, color: "#ef4444", title: `Kill ${vixKill}` },
            ]}
          />
        </Card>
      )}

      {/* RSI panel with 75 / 60 threshold lines. */}
      {(er.chart_data.rsi?.length ?? 0) > 0 && (
        <Card padding="p-4">
          <SectionTitle sub={`SPY RSI-14. Trim when >${rsiOB}, rebuy when <${rsiRe}.`}>
            RSI-14
          </SectionTitle>
          <ChartPanel
            height={160}
            lineSeries={[{ data: er.chart_data.rsi!, color: "#8b5cf6", title: "RSI" }]}
            priceLines={[
              { price: rsiOB, color: "#ef4444", title: `Overbought ${rsiOB}` },
              { price: rsiRe, color: "#22c55e", title: `Rebuy ${rsiRe}` },
            ]}
          />
        </Card>
      )}

      {/* Portfolio-value drawdown from peak. */}
      {(er.chart_data.drawdown?.length ?? 0) > 0 && (
        <Card padding="p-4">
          <SectionTitle sub="Peak-to-trough drawdown of the strategy portfolio, in percent.">
            Drawdown from peak (%)
          </SectionTitle>
          <ChartPanel
            height={160}
            areaSeries={er.chart_data.drawdown}
            areaColor="#ef4444"
          />
        </Card>
      )}

      {/* State timeline: colored bar showing % of time in each state. */}
      {(er.chart_data.state_timeline?.length ?? 0) > 0 && (
        <Card padding="p-4">
          <SectionTitle sub="Where the strategy spent time. Widths are proportional to days-in-state.">
            State timeline
          </SectionTitle>
          <StateTimelineBar timeline={er.chart_data.state_timeline!} />
        </Card>
      )}

      {/* Trade stats card: win rate + best/worst trade + SPY B&H benchmark. */}
      {er.trade_stats && (
        <TradeStatsCard stats={er.trade_stats} totalTrades={er.trades.length} />
      )}

      {/* Trade log */}
      <Card padding="p-4">
        <SectionTitle sub={`${er.trades.length} action${er.trades.length === 1 ? "" : "s"} from the state machine. Most recent first.`}>
          Trade log
        </SectionTitle>
        <TradeTable trades={er.trades} />
      </Card>

      {/* Footer: triggered_by */}
      {envelope.triggered_by && (
        <div className="text-xs text-ink-500 dark:text-ink-400 tabular text-right">
          Run by{" "}
          <Badge status={envelope.triggered_by.actor_type === "admin" ? "approved" : "completed"}>
            {envelope.triggered_by.actor_type}
          </Badge>
          {envelope.triggered_by.actor_email && (
            <span className="ml-2 font-mono">{envelope.triggered_by.actor_email}</span>
          )}{" "}
          · {new Date(envelope.created_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ── ChartPanel ─────────────────────────────────────────────────────────────
//
// Generic lightweight-charts wrapper. Accepts either one area series (for the
// equity curve) or multiple line series (for SPY+SMAs etc.) plus optional
// markers to attach to the first line series.

interface TimeValuePoint {
  time: string;
  value: number;
}
interface LineSeriesSpec {
  data: TimeValuePoint[];
  color: string;
  title: string;
}
interface PriceLineSpec {
  price: number;
  color: string;
  title: string;
}

interface ChartPanelProps {
  height: number;
  areaSeries?: TimeValuePoint[];
  areaColor?: string;
  lineColor?: string;
  lineSeries?: LineSeriesSpec[];
  markers?: { time: string; position?: string; color?: string; shape?: string; text?: string }[];
  /** Horizontal price lines drawn on the first series (RSI thresholds, VIX kill switch, etc.). */
  priceLines?: PriceLineSpec[];
  /** When true, markers attach to the areaSeries instead of the first line series
      (used on the equity curve so state-transition labels stay on the strategy line). */
  markersOnArea?: boolean;
}

function ChartPanel({
  height,
  areaSeries,
  areaColor,
  lineSeries,
  markers,
  priceLines,
  markersOnArea,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: { background: { color: "transparent" }, textColor: "#888" },
      grid: { vertLines: { color: "#1e1e2e" }, horzLines: { color: "#1e1e2e" } },
      timeScale: { borderColor: "#333", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#333" },
      width: el.clientWidth,
      height,
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let areaApi: ISeriesApi<any> | null = null;
    if (areaSeries && areaSeries.length > 0) {
      areaApi = chart.addAreaSeries({
        lineColor: areaColor ?? "#22c55e",
        topColor: hexA(areaColor ?? "#22c55e", 0.4),
        bottomColor: hexA(areaColor ?? "#22c55e", 0.0),
        lineWidth: 2,
      });
      areaApi.setData(areaSeries.map((p) => ({ time: p.time as Time, value: p.value })));
    }

    let firstLine: ISeriesApi<"Line"> | null = null;
    if (lineSeries && lineSeries.length > 0) {
      const builtSeries: ISeriesApi<"Line">[] = lineSeries.map((spec, idx) => {
        const ls = chart.addLineSeries({
          color: spec.color,
          lineWidth: idx === 0 ? 2 : 1,
          title: spec.title,
        });
        ls.setData(spec.data.map((p) => ({ time: p.time as Time, value: p.value })));
        return ls;
      });
      firstLine = builtSeries[0] ?? null;
    }

    // Attach markers either to the area (equity curve) or the first line (SPY panel).
    const markerTarget = markersOnArea ? areaApi : firstLine;
    if (markerTarget && markers && markers.length > 0) {
      markerTarget.setMarkers(
        markers.map((mk) => ({
          time: mk.time as Time,
          position: (mk.position as "aboveBar" | "belowBar" | "inBar") ?? "aboveBar",
          color: mk.color ?? "#4a9eff",
          shape: (mk.shape as "circle" | "square" | "arrowUp" | "arrowDown") ?? "circle",
          text: mk.text ?? "",
        })),
      );
    }

    // Horizontal threshold lines (RSI 75/60, VIX 30, etc.) — attach to whichever
    // series exists so they scale with the price axis.
    const priceLineTarget = firstLine ?? areaApi;
    if (priceLineTarget && priceLines && priceLines.length > 0) {
      for (const pl of priceLines) {
        priceLineTarget.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: 1,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: pl.title,
        });
      }
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width, height });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaSeries, lineSeries, markers, priceLines, markersOnArea, height]);

  return <div ref={containerRef} style={{ height, width: "100%" }} />;
}

/** "#22c55e" + alpha 0.4 → "rgba(34, 197, 94, 0.4)". Tiny utility for area-fill colours. */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── TradeTable ─────────────────────────────────────────────────────────────
//
// Mirrors VAM dashboard's behaviour: show whichever of the canonical columns
// are present in trades[0]; gracefully drop the rest. VAM's actual trade
// fields vary by step (e.g. step1 uses exec_price_upro_open, step3 uses
// exec_price_spxu_open). The `extras` row of remaining keys is collapsed
// behind a "show all fields" toggle so the default table stays scannable.

const CANONICAL_TRADE_FIELDS = [
  "execution_date",
  "action",
  "instrument",
  "state_from",
  "state_to",
  "trigger_reason",
  // VAM's price/value fields vary by step; render whichever is present:
  "exec_price",
  "exec_price_upro_open",
  "exec_price_tqqq_open",
  "exec_price_spxu_open",
  "exec_price_svix_open",
  "trade_value_dollars",
  "portfolio_value_at_close",
];

const TRADES_PER_PAGE = 25;

function TradeTable({ trades }: { trades: VamTradeAction[] }) {
  // Column set = union across ALL trade rows. Sampling only the first row
  // hid per-instrument price columns for step2 runs whose first trade was
  // UPRO (TQQQ price columns never showed) - audit finding.
  const cols = useMemo(
    () => CANONICAL_TRADE_FIELDS.filter((f) => trades.some((t) => f in t)),
    [trades],
  );

  // Reverse once (most recent first), then page.
  const ordered = useMemo(() => [...trades].reverse(), [trades]);

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(ordered.length / TRADES_PER_PAGE));
  // Clamp current page if trade count changes (defensive - keeps us in range).
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * TRADES_PER_PAGE;
  const end = Math.min(start + TRADES_PER_PAGE, ordered.length);
  const slice = ordered.slice(start, end);

  if (ordered.length === 0) {
    return <div className="text-sm text-ink-500 italic py-6 text-center">No trades.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-4">
        <table className="w-full text-xs">
          <thead className="bg-ink-50 dark:bg-ink-800">
            <tr className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
              {cols.map((c) => (
                <th key={c} className="text-left font-medium px-3 py-2 whitespace-nowrap font-mono">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
            {slice.map((t, i) => (
              <tr key={start + i} className="hover:bg-ink-50/70 dark:hover:bg-ink-800/30">
                {cols.map((c) => {
                  const v = (t as Record<string, unknown>)[c];
                  const cls =
                    c === "action"
                      ? typeof v === "string" && v.includes("BUY")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : typeof v === "string" && v.includes("SELL")
                        ? "text-red-600 dark:text-red-400"
                        : ""
                      : "";
                  return (
                    <td key={c} className={`px-3 py-2 whitespace-nowrap ${cls}`}>
                      {formatCell(c, v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager
        page={safePage}
        totalPages={totalPages}
        rangeStart={start + 1}
        rangeEnd={end}
        total={ordered.length}
        onChange={setPage}
      />
    </div>
  );
}

function Pager({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-3 border-t border-ink-100 dark:border-ink-800">
      <div className="text-xs text-ink-500 tabular">
        Showing <strong>{rangeStart}</strong>–<strong>{rangeEnd}</strong> of{" "}
        <strong>{total.toLocaleString()}</strong> trades
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="size-7 rounded-md border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs text-ink-600 dark:text-ink-300 tabular px-1">
          Page <strong>{page + 1}</strong> / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="size-7 rounded-md border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function formatCell(col: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") {
    if (col.includes("price") || col.includes("dollars") || col.includes("value")) {
      return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return String(v);
  }
  return String(v);
}

// ── StateMachineCard ───────────────────────────────────────────────────────
//
// Shows the current state and the full state-machine allocation table. Mirrors
// the "State Machine — Current State & Transitions" section on Ravi's live
// dashboard. Allocations are step-specific; we handle step1 (UPRO) and step2
// (UPRO+TQQQ) explicitly and fall through to a generic display for others.

const STATE_ALLOCATIONS: Record<string, { state: string; alloc: string }[]> = {
  step1_upro_4state: [
    { state: "BULL_100",     alloc: "100% UPRO" },
    { state: "BULL_TRIMMED", alloc: "75% UPRO" },
    { state: "DEFENSIVE",    alloc: "50% UPRO" },
    { state: "CASH",         alloc: "0% (all cash)" },
  ],
  step2_upro_tqqq_6state: [
    { state: "BULL_100",         alloc: "75% UPRO + 25% TQQQ" },
    { state: "BULL_100_UPRO",    alloc: "75% UPRO + cash" },
    { state: "BULL_TRIMMED",     alloc: "50% UPRO" },
    { state: "DEFENSIVE_UPRO",   alloc: "25% UPRO" },
    { state: "DEFENSIVE_TQQQ",   alloc: "12% TQQQ" },
    { state: "CASH",             alloc: "0% (all cash)" },
  ],
};

function StateMachineCard({ currentState, step }: { currentState: string; step: string }) {
  const allocations = STATE_ALLOCATIONS[step] ?? [];
  return (
    <Card padding="p-4">
      <SectionTitle sub="Current strategy state and the allocation table for every state.">
        State Machine
      </SectionTitle>
      <div className="mt-3 flex flex-col sm:flex-row items-start gap-4">
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-500">Current State</div>
          <div className="mt-1 inline-flex items-center px-3 py-1.5 rounded-md bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-500/40 text-accent-700 dark:text-accent-300 text-base font-semibold tabular">
            {currentState}
          </div>
        </div>

        {allocations.length > 0 ? (
          <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-2 w-full">
            {allocations.map((row) => (
              <div
                key={row.state}
                className={`px-3 py-2 rounded-md border text-xs ${
                  row.state === currentState
                    ? "border-accent-400 bg-accent-50/60 dark:bg-accent-900/20"
                    : "border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900"
                }`}
              >
                <div className="font-mono text-ink-700 dark:text-ink-200">{row.state}</div>
                <div className="mt-0.5 text-ink-500 dark:text-ink-400 tabular">{row.alloc}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-ink-500 dark:text-ink-400 italic">
            Allocation table for this strategy not registered in the UI yet.
          </div>
        )}
      </div>
    </Card>
  );
}

// ── StateTimelineBar ───────────────────────────────────────────────────────
//
// Renders the same coloured proportional bar Ravi's live dashboard shows under
// "State Timeline". Each contiguous run in the state machine becomes a
// horizontal segment whose width is proportional to its days-in-state.

const STATE_COLORS: Record<string, string> = {
  BULL_100:            "#22c55e",
  BULL_TRIMMED:        "#84cc16",
  DEFENSIVE:           "#f59e0b",
  DEFENSIVE_UPRO:      "#f59e0b",
  DEFENSIVE_TQQQ:      "#f97316",
  CASH:                "#94a3b8",
};

function StateTimelineBar({
  timeline,
}: {
  timeline: { state: string; start?: string; end?: string; days: number; pct: number }[];
}) {
  // Roll up total days-in-state for the legend row below the bar.
  const totals = new Map<string, number>();
  let grand = 0;
  for (const seg of timeline) {
    totals.set(seg.state, (totals.get(seg.state) ?? 0) + seg.days);
    grand += seg.days;
  }
  const legend = Array.from(totals.entries())
    .map(([state, days]) => ({ state, days, pct: grand ? (days / grand) * 100 : 0 }))
    .sort((a, b) => b.days - a.days);

  return (
    <div className="mt-2">
      <div className="w-full h-6 flex rounded overflow-hidden bg-ink-100 dark:bg-ink-800 border border-ink-200 dark:border-ink-800">
        {timeline.map((seg, i) => (
          <div
            key={i}
            style={{
              flexBasis: `${seg.pct}%`,
              backgroundColor: STATE_COLORS[seg.state] ?? "#4a9eff",
            }}
            title={`${seg.state} · ${seg.days} days · ${seg.pct.toFixed(1)}%${seg.start ? ` · ${seg.start} → ${seg.end}` : ""}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-600 dark:text-ink-300">
        {legend.map((row) => (
          <span key={row.state} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: STATE_COLORS[row.state] ?? "#4a9eff" }}
            />
            <span className="font-mono">{row.state}</span>
            <span className="text-ink-500">{row.pct.toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── TradeStatsCard ─────────────────────────────────────────────────────────
//
// Mirrors the "Trade History & Stats" section on Ravi's dashboard: Win Rate,
// Best Trade, Worst Trade, and the SPY B&H benchmark return.

function TradeStatsCard({
  stats,
  totalTrades,
}: {
  stats: {
    win_rate_pct?: number | null;
    best_trade_pct?: number | null;
    worst_trade_pct?: number | null;
    spy_bh_return_pct?: number | null;
    round_trip_count?: number;
  };
  totalTrades: number;
}) {
  const items = [
    {
      label: "Total trades",
      value: String(totalTrades),
      tone: "neutral" as const,
    },
    {
      label: "Round trips",
      value: stats.round_trip_count != null ? String(stats.round_trip_count) : "-",
      tone: "neutral" as const,
    },
    {
      label: "Win rate",
      value: stats.win_rate_pct != null ? `${stats.win_rate_pct}%` : "-",
      tone: (stats.win_rate_pct ?? 0) >= 50 ? ("pos" as const) : ("neutral" as const),
    },
    {
      // Sign-based tone so an all-losing run's Best trade doesn't look green
      // and an all-winning run's Worst trade doesn't look red. Mirrors the
      // SPY B&H return item below.
      label: "Best trade",
      value: fmtPct(stats.best_trade_pct),
      tone: (stats.best_trade_pct ?? 0) >= 0 ? ("pos" as const) : ("neg" as const),
    },
    {
      label: "Worst trade",
      value: fmtPct(stats.worst_trade_pct),
      tone: (stats.worst_trade_pct ?? 0) >= 0 ? ("pos" as const) : ("neg" as const),
    },
    {
      label: "SPY B&H return",
      value: fmtPct(stats.spy_bh_return_pct),
      tone: (stats.spy_bh_return_pct ?? 0) >= 0 ? ("pos" as const) : ("neg" as const),
    },
  ];
  return (
    <Card padding="p-4">
      <SectionTitle sub="Round-trip trade statistics vs SPY buy-and-hold benchmark.">
        Trade stats
      </SectionTitle>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-md border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-500">{it.label}</div>
            <div
              className={`mt-0.5 text-sm font-semibold tabular ${
                it.tone === "pos"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : it.tone === "neg"
                  ? "text-red-600 dark:text-red-400"
                  : "text-ink-900 dark:text-ink-50"
              }`}
            >
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
