/**
 * Client-facing VAM configurator: `/backtests/new`.
 *
 * Flow:
 *   1. On mount: fetch list of strategy steps + SPY date range.
 *   2. User picks a step → fetch that step's parameter schema.
 *   3. VamParamForm renders the dynamic form, controlled by local state.
 *   4. (Optional) User links the run to one of their uploaded strategy docs
 *      so the row in their Backtests list shows the strategy name.
 *   5. Submit → POST /vam/run → on success, redirect to /backtests/{id}.
 *
 * Failure modes surfaced to the user (not just logged):
 *   - 503 (engine not configured) → "Engine offline" banner
 *   - 429 (rate limit)            → "You've hit your quota — try again in Ns"
 *   - 422 (bad params)            → "VAM rejected:" + violations list
 *   - 502 (engine error)          → "Engine error — please retry"
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, FileText, Play } from "lucide-react";
import { Button, Card, SectionTitle } from "../../components/ui";
import {
  fetchStrategies,
  fetchVamSchema,
  fetchVamStrategies,
  fetchVamSymbols,
  runVamAsClient,
  type Strategy,
  type VamStepSchema,
  type VamStrategy,
  type VamSymbol,
} from "../../lib/api";
import { useAuth } from "../../store/auth";
import { VamParamForm } from "./VamParamForm";
import { VAM_STEP_OPTIONS, defaultsFromSchema } from "./vamParams";

type RunErr = {
  kind: "config" | "ratelimit" | "validation" | "engine" | "unknown";
  message: string;
  violations?: { path: string; message: string }[];
  retryAfter?: number;
};

export default function ClientRunBacktestPage() {
  // HOOKS MUST ALL RUN ON EVERY RENDER. The hard route guard for non-VAM
  // clients used to live up here before the hook calls, but if useAuth ever
  // re-rendered with vamEnabled flipping (admin promoting mid-session,
  // /me re-fetch on token refresh, sign-out from Layout), React would see
  // a different hook count and crash with
  //   "Rendered fewer hooks than expected".
  // The fix is the canonical one: declare every hook FIRST, run the guard
  // LAST. See sweep finding #1.
  const nav = useNavigate();
  const vamEnabled = useAuth((s) => s.me?.vam_enabled ?? false);

  const [vamStrategies, setVamStrategies] = useState<VamStrategy[] | null>(null);
  const [vamSymbols, setVamSymbols] = useState<VamSymbol[]>([]);
  const [myStrategies, setMyStrategies] = useState<Strategy[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);

  const [step, setStep] = useState<string>("step1");
  const [schema, setSchema] = useState<VamStepSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const [params, setParams] = useState<Record<string, unknown>>({});
  const [strategyId, setStrategyId] = useState<string>(""); // empty = unlinked

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<RunErr | null>(null);

  const spyRange = useMemo(() => {
    const spy = vamSymbols.find((s) => s.symbol === "SPY");
    return spy ? { start: spy.start, end: spy.end } : null;
  }, [vamSymbols]);

  // ── Boot: load strategy list + SPY range + the client's own uploaded strategies
  useEffect(() => {
    (async () => {
      try {
        const [vs, vsym, mine] = await Promise.all([
          fetchVamStrategies(),
          fetchVamSymbols().catch(() => [] as VamSymbol[]),
          fetchStrategies().catch(() => [] as Strategy[]),
        ]);
        setVamStrategies(vs);
        setVamSymbols(vsym);
        setMyStrategies(mine);
        // If the default step (step1) isn't implemented, pick the first implemented one
        const implemented = vs.filter((s) => s.implemented);
        if (implemented.length && !implemented.some((s) => s.id === "step1")) {
          setStep(implemented[0].id);
        }
      } catch (e: unknown) {
        setBootError(extractMessage(e) || "Could not load the engine — it may be offline.");
      }
    })();
  }, []);

  // ── On step change: fetch its schema, reset params to defaults
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    setSchemaLoading(true);
    setSchema(null);
    fetchVamSchema(step)
      .then((s) => {
        if (cancelled) return;
        setSchema(s);
        setParams(defaultsFromSchema(s));
      })
      .catch((e) => {
        if (cancelled) return;
        setBootError(`Could not load parameters for ${step}: ${extractMessage(e)}`);
      })
      .finally(() => !cancelled && setSchemaLoading(false));
    return () => {
      cancelled = true;
    };
  }, [step]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const out = await runVamAsClient({
        step,
        params,
        strategy_id: strategyId || null,
      });
      nav(`/backtests/${out.backtest_id}`);
    } catch (e: unknown) {
      setErr(classifyError(e));
    } finally {
      setSubmitting(false);
    }
  }, [step, params, strategyId, nav]);

  // ── Guards (run AFTER all hooks so React's hook order stays stable when
  //    upstream state flips, e.g. admin revoking vam_enabled mid-session) ──
  if (!vamEnabled) {
    return <Navigate to="/backtests" replace />;
  }

  if (bootError) {
    return (
      <div className="space-y-6">
        <Card>
          <SectionTitle sub="The backtesting engine is reachable through our API. If you're seeing this, the engine is offline or our connection to it has lapsed.">
            <span className="inline-flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle size={18} /> Engine offline
            </span>
          </SectionTitle>
          <p className="text-sm text-ink-600 dark:text-ink-300">{bootError}</p>
          <div className="mt-4">
            <Link to="/backtests" className="text-sm text-accent-700 dark:text-accent-300 hover:underline inline-flex items-center gap-1">
              <ArrowLeft size={14} /> Back to Backtests
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const stepOptions = (vamStrategies ?? [])
    .filter((s) => s.implemented)
    .map((s) => {
      const friendly = VAM_STEP_OPTIONS.find((o) => o.id === s.id);
      return { id: s.id, label: friendly?.label ?? s.name, description: friendly?.description ?? "" };
    });
  const selectedStepLabel = stepOptions.find((o) => o.id === step)?.label ?? step;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link to="/backtests" className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Backtests
          </Link>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Run a new backtest</h1>
          <p className="mt-1 text-sm text-ink-500">
            Configure parameters and run the engine. Results land in your Backtests list
            within seconds and are saved to your account.
          </p>
        </div>
      </div>

      <Card>
        <SectionTitle sub="Each strategy variant has its own parameters. Step 1 is the core; later steps add sleeves (UPRO leverage, SVIX short-vol).">
          1. Strategy variant
        </SectionTitle>
        {vamStrategies === null ? (
          <div className="text-sm text-ink-500">Loading strategy list…</div>
        ) : stepOptions.length === 0 ? (
          <div className="text-sm text-ink-500">No strategies implemented on the engine yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stepOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setStep(o.id)}
                disabled={submitting}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  step === o.id
                    ? "border-accent-500 bg-accent-50/40 dark:bg-accent-900/10"
                    : "border-ink-200 dark:border-ink-700 hover:border-ink-300 dark:hover:border-ink-600"
                }`}
              >
                <div className="text-sm font-semibold text-ink-900 dark:text-ink-50">{o.label}</div>
                <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{o.description}</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          sub={
            spyRange
              ? `Data available: ${spyRange.start} → ${spyRange.end}. Leave start/end empty to use the full window.`
              : "Tweak any parameter; leave the rest at sensible defaults."
          }
        >
          2. Parameters · <span className="font-mono text-xs text-ink-500">{selectedStepLabel}</span>
        </SectionTitle>
        {schemaLoading || !schema ? (
          <div className="text-sm text-ink-500">Loading parameter schema…</div>
        ) : (
          <VamParamForm
            schema={schema}
            value={params}
            onChange={setParams}
            dataRange={spyRange}
            disabled={submitting}
          />
        )}
      </Card>

      <Card>
        <SectionTitle sub="Linking the run to one of your strategy documents helps you (and us) keep track of which research a result corresponds to. Optional.">
          3. Link to a strategy document
        </SectionTitle>
        {myStrategies.length === 0 ? (
          <div className="text-xs text-ink-500 italic">
            You haven't uploaded a strategy document yet.{" "}
            <Link to="/strategies" className="text-accent-700 dark:text-accent-300 hover:underline">
              Upload one
            </Link>{" "}
            and you'll be able to link future runs to it.
          </div>
        ) : (
          <select
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
            disabled={submitting}
            className="w-full md:w-2/3 h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
          >
            <option value="">— don't link to a specific strategy —</option>
            {myStrategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (v{s.version}) {s.is_source_of_truth ? "· SoT" : ""}
              </option>
            ))}
          </select>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-ink-500">
            <FileText size={12} className="inline mr-1" /> Each run is saved to your account and visible to
            you and the IFA team. Engine runs typically take 10–30 seconds.
          </div>
          <Button
            variant="accent"
            icon={<Play size={15} />}
            onClick={submit}
            disabled={submitting || !schema}
          >
            {submitting ? "Engine running… (10–30s)" : "Run backtest"}
          </Button>
        </div>
        {err && (
          <div className="mt-4">
            <RunError err={err} />
          </div>
        )}
      </Card>
    </div>
  );
}

function RunError({ err }: { err: RunErr }) {
  const tones: Record<RunErr["kind"], string> = {
    config: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200",
    ratelimit: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200",
    validation: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200",
    engine: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200",
    unknown: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200",
  };
  return (
    <div className={`p-4 rounded-lg border text-sm ${tones[err.kind]}`}>
      <div className="font-medium">{err.message}</div>
      {err.violations && err.violations.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {err.violations.map((v, i) => (
            <li key={i}>
              <span className="font-mono">{v.path || "(root)"}</span>: {v.message}
            </li>
          ))}
        </ul>
      )}
      {err.retryAfter && (
        <div className="mt-2 text-xs">Try again in <strong>{err.retryAfter}s</strong>.</div>
      )}
    </div>
  );
}

// ── Error helpers ──────────────────────────────────────────────────────────

function extractMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "response" in e) {
    const ax = e as { response?: { data?: { detail?: unknown }; status?: number } };
    const d = ax.response?.data?.detail;
    if (typeof d === "string") return d;
    if (typeof d === "object" && d !== null && "error" in d) {
      return String((d as { error: unknown }).error);
    }
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

function classifyError(e: unknown): RunErr {
  const ax = (e as { response?: { status?: number; data?: { detail?: unknown }; headers?: Record<string, string> } }).response;
  const status = ax?.status;
  const detail = ax?.data?.detail;
  // Tier-gate first — both 403 (feature unavailable) and 429 (limit hit)
  // ride this shape. Render as a friendly upgrade prompt.
  if (typeof detail === "object" && detail !== null && (detail as { error?: string }).error === "tier_gate") {
    const g = detail as { message: string; kind: string };
    return {
      kind: g.kind === "limit" ? "ratelimit" : "config",
      message: `${g.message} Contact us via the Requests tab to upgrade your plan.`,
    };
  }
  if (status === 503) {
    return { kind: "config", message: "The engine is currently offline. Please try again shortly." };
  }
  if (status === 429) {
    return {
      kind: "ratelimit",
      message: "You've made several runs in quick succession. Please pause for a moment.",
      retryAfter: parseInt(ax?.headers?.["retry-after"] ?? "0", 10) || undefined,
    };
  }
  if (status === 422 && typeof detail === "object" && detail !== null && "violations" in detail) {
    return {
      kind: "validation",
      message: "The engine rejected one or more parameters:",
      violations: (detail as { violations: { path: string; message: string }[] }).violations,
    };
  }
  if (status === 502) {
    return { kind: "engine", message: "Engine error — please retry. If it keeps happening, contact support." };
  }
  return { kind: "unknown", message: extractMessage(e) || "Run failed" };
}
