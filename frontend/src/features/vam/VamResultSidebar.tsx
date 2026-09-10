/**
 * Sidebar panel rendered in place of the workspace nav when the user is on a
 * VAM backtest's detail page.
 *
 * Gives the user a compact param form pre-filled from the current run, plus
 * a "Rerun" button that POSTs to /vam/run and navigates to the freshly-created
 * backtest's detail page. The toggle to flip back to the workspace nav lives
 * in the Layout's sidebar header (not here) — that toggle preserves this
 * panel's mounted state so flipping between modes is instant.
 *
 * Failure modes match ClientRunBacktestPage's vocabulary (engine offline,
 * rate-limited, validation errors). When something fails we surface a small
 * banner above the Rerun button rather than navigating.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Play } from "lucide-react";
import { classifyVamRunError } from "./vamRunErrors";
import {
  fetchVamSchema,
  fetchVamSymbols,
  runVamAsClient,
  type VamStepId,
  type VamStepSchema,
} from "../../lib/api";
import { VamParamForm } from "./VamParamForm";

export interface VamResultSidebarProps {
  /** The step this result was generated with - used to fetch the right schema. */
  step: VamStepId | string;
  /** Params from the persisted envelope (engine_response is too big to redo from). */
  initialParams: Record<string, unknown>;
}

export default function VamResultSidebar({ step, initialParams }: VamResultSidebarProps) {
  const nav = useNavigate();

  const [schema, setSchema] = useState<VamStepSchema | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>(initialParams);
  const [spyRange, setSpyRange] = useState<{ start: string; end: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetch the step schema (for input types/min/max) + SPY date range once.
  useEffect(() => {
    let cancelled = false;
    fetchVamSchema(step)
      .then((s) => {
        if (!cancelled) setSchema(s);
      })
      .catch(() => {
        if (!cancelled) setErr("Could not load parameter schema.");
      });
    fetchVamSymbols()
      .then((syms) => {
        if (cancelled) return;
        const spy = syms.find((x) => x.symbol === "SPY");
        if (spy) setSpyRange({ start: spy.start, end: spy.end });
      })
      .catch(() => {
        /* SPY range is a UX nicety, not required */
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  // When the parent navigates to a different backtest, the prop changes —
  // sync the form to that backtest's params. (StrictMode-safe: we only
  // reset on prop change, not on every render.)
  useEffect(() => {
    setParams(initialParams);
  }, [initialParams]);

  const rerun = useCallback(async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const out = await runVamAsClient({ step, params, strategy_id: null });
      // Navigate to the new run. The detail page will pick up the new id,
      // remount its VamResultSidebar, and seed it with the new run's params.
      nav(`/backtests/${out.backtest_id}`);
    } catch (e: unknown) {
      // Shared classifier (audit PF25). Uses the same tier_gate + rate
      // limit + validation copy that ClientRunBacktestPage renders on
      // its main CTA - clients now see the same guidance whether they
      // click Rerun here or Run on the dedicated page.
      const classified = classifyVamRunError(e);
      const suffix =
        classified.kind === "validation" && classified.violations?.length
          ? " " + classified.violations.map((v) => v.path).join(", ")
          : "";
      setErr(classified.message + suffix);
    } finally {
      setSubmitting(false);
    }
  }, [step, params, nav]);

  if (!schema) {
    return <div className="text-xs text-ink-500 px-3 py-4">Loading parameters…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <div className="text-xs font-medium text-ink-700 dark:text-ink-200">
          Tweak &amp; rerun
        </div>
        <div className="text-[11px] text-ink-500 dark:text-ink-400 leading-snug mt-0.5">
          Adjust any parameter and rerun. The result becomes a new backtest in
          your list.
        </div>
      </div>

      <VamParamForm
        schema={schema}
        value={params}
        onChange={setParams}
        dataRange={spyRange}
        disabled={submitting}
        resettable={false}
        compact
      />

      {err && (
        <div className="px-2.5 py-2 rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-[11px] text-red-700 dark:text-red-200 flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-px" />
          <span>{err}</span>
        </div>
      )}

      {/*
        Sticky-style action row at the bottom of the panel. The sidebar body
        already scrolls; this stays in flow at the end. If a user with very
        many params has scrolled away, that's OK — they can scroll down or
        hit the toggle to bring back the nav.
      */}
      <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
        <button
          type="button"
          onClick={rerun}
          disabled={submitting}
          className="w-full h-9 px-3 rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          {submitting ? (
            "Engine running…"
          ) : (
            <>
              <Play size={13} /> Rerun with these params
            </>
          )}
        </button>
        <div className="text-[10px] text-ink-400 mt-1.5 text-center">
          Engine runs typically take 10–30 seconds.
        </div>
      </div>
    </div>
  );
}
