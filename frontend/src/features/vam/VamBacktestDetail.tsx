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

  // Mirror VAM dashboard's metric card order
  const sharpe = m.sharpe ?? m.sharpe_ratio;
  const sortino = m.sortino ?? m.sortino_ratio;
  const calmar = m.calmar ?? m.calmar_ratio;
  const totalReturnPos = (m.total_return_pct ?? 0) >= 0;
  const cagrPos = (m.cagr_pct ?? 0) >= 0;
  const alphaPos = (m.alpha_vs_spy_pct ?? 0) >= 0;

  const cards: { label: string; value: string; tone?: "pos" | "neg" | "neutral"; sub?: string }[] = [
    { label: "Final Value", value: fmtMoney(m.final_value), tone: totalReturnPos ? "pos" : "neg" },
    { label: "Total Return", value: fmtPct(m.total_return_pct), tone: totalReturnPos ? "pos" : "neg" },
    { label: "CAGR", value: fmtPct(m.cagr_pct), tone: cagrPos ? "pos" : "neg" },
    { label: "Sharpe", value: fmtNum(sharpe, 3) },
    { label: "Sortino", value: fmtNum(sortino, 3) },
    { label: "Calmar", value: fmtNum(calmar, 3) },
    { label: "Max DD", value: fmtPct(m.max_drawdown_pct), tone: "neg", sub: (m as any).max_drawdown_date },
    { label: "Trades", value: String(m.total_trades ?? er.trades?.length ?? 0) },
    { label: "Period", value: `${m.years ? Math.round(m.years) + "y" : "-"}`, sub: `${(m as any).start_date ?? ""} → ${(m as any).end_date ?? ""}` },
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

      {/* Charts */}
      <Card padding="p-4">
        <SectionTitle sub="Portfolio NAV over the run window. Markers on the SPY panel are state-machine transitions (entries/exits, defensive trims).">
          Equity curve
        </SectionTitle>
        <ChartPanel
          height={280}
          areaSeries={er.chart_data.equity}
          areaColor="#22c55e"
          lineColor="#22c55e"
        />
      </Card>

      {(er.chart_data.spy?.length ?? 0) > 0 ? (
        <Card padding="p-4">
          <SectionTitle sub="SPY price with 50/200-day SMAs and trade markers.">
            SPY + SMAs + signals
          </SectionTitle>
          <ChartPanel
            height={260}
            lineSeries={[
              { data: er.chart_data.spy!, color: "#4a9eff", title: "SPY" },
              ...(er.chart_data.sma50 ? [{ data: er.chart_data.sma50, color: "#fbbf24", title: "SMA50" }] : []),
              ...(er.chart_data.sma200 ? [{ data: er.chart_data.sma200, color: "#f97316", title: "SMA200" }] : []),
            ]}
            markers={er.chart_data.markers}
          />
        </Card>
      ) : (er.chart_data.svix?.length ?? 0) > 0 ? (
        <Card padding="p-4">
          <SectionTitle sub="SVIX (short-volatility ETF) reference line for this step.">
            SVIX + signals
          </SectionTitle>
          <ChartPanel
            height={260}
            lineSeries={[{ data: er.chart_data.svix!, color: "#a855f7", title: "SVIX" }]}
            markers={er.chart_data.markers}
          />
        </Card>
      ) : null}

      {(er.chart_data.vix?.length ?? 0) > 0 && (
        <Card padding="p-4">
          <SectionTitle sub="CBOE VIX index. Kill-switch + re-entry rules read off this.">
            VIX
          </SectionTitle>
          <ChartPanel
            height={140}
            lineSeries={[{ data: er.chart_data.vix!, color: "#f59e0b", title: "VIX" }]}
          />
        </Card>
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
interface ChartPanelProps {
  height: number;
  areaSeries?: TimeValuePoint[];
  areaColor?: string;
  lineColor?: string;
  lineSeries?: LineSeriesSpec[];
  markers?: { time: string; position?: string; color?: string; shape?: string; text?: string }[];
}

function ChartPanel({
  height,
  areaSeries,
  areaColor,
  lineSeries,
  markers,
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

    if (areaSeries && areaSeries.length > 0) {
      const a = chart.addAreaSeries({
        lineColor: areaColor ?? "#22c55e",
        topColor: hexA(areaColor ?? "#22c55e", 0.4),
        bottomColor: hexA(areaColor ?? "#22c55e", 0.0),
        lineWidth: 2,
      });
      a.setData(areaSeries.map((p) => ({ time: p.time as Time, value: p.value })));
    }

    if (lineSeries && lineSeries.length > 0) {
      // Build all line series, keep the array — first one is where markers attach.
      // (Direct array build rather than forEach + closure-assign keeps TS's flow
      // analysis from narrowing the marker target to `never`.)
      const builtSeries: ISeriesApi<"Line">[] = lineSeries.map((spec, idx) => {
        const ls = chart.addLineSeries({
          color: spec.color,
          lineWidth: idx === 0 ? 2 : 1,
          title: spec.title,
        });
        ls.setData(spec.data.map((p) => ({ time: p.time as Time, value: p.value })));
        return ls;
      });
      const firstLine = builtSeries[0];
      if (firstLine && markers && markers.length > 0) {
        firstLine.setMarkers(
          markers.map((mk) => ({
            time: mk.time as Time,
            position: (mk.position as "aboveBar" | "belowBar" | "inBar") ?? "aboveBar",
            color: mk.color ?? "#4a9eff",
            shape: (mk.shape as "circle" | "square" | "arrowUp" | "arrowDown") ?? "circle",
            text: mk.text ?? "",
          })),
        );
      }
    }

    // Resize on container resize (covers window resize + sidebar collapse)
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
  }, [areaSeries, lineSeries, markers, height]);

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
  // Compute which columns to show (set intersection — sample first row).
  const first = trades[0] ?? {};
  const cols = useMemo(
    () => CANONICAL_TRADE_FIELDS.filter((f) => f in first),
    [first],
  );

  // Reverse once (most recent first), then page.
  const ordered = useMemo(() => [...trades].reverse(), [trades]);

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(ordered.length / TRADES_PER_PAGE));
  // Clamp current page if trade count changes (defensive — keeps us in range).
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
