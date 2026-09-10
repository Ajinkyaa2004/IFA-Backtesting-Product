/**
 * Shared parameter form for VAM backtest runs.
 *
 * Renders the dynamic schema fetched from `/vam/strategies/{step}/schema`
 * into grouped input controls (Window&Capital / State Machine / Blanket /
 * Cost Model / SPXU / SVIX / Combined), and surfaces collected values to
 * the parent via a controlled `value` + `onChange` interface.
 *
 * Used by:
 *   - AdminBacktestUploadPage  (admin runs on behalf of a client)
 *   - ClientRunBacktestPage    (client self-serve)
 *
 * Design intent:
 *   - Owner-controlled (parent holds the params dict). Lets the parent reset,
 *     deep-link, or prefill from a saved preset without the component re-mounting.
 *   - Tolerant of missing schema fields: any param the schema lists but our
 *     PARAM_GROUPS doesn't know about lands in an "Other" group.
 *   - Date inputs get min/max attributes if we have the SPY data range.
 */
import { useEffect, useMemo } from "react";
import { RotateCcw } from "lucide-react";
import type { VamParamSchemaField, VamStepSchema } from "../../lib/api";

// Mirrors VAM dashboard's PARAM_GROUPS map. Any field not listed here is
// rendered under "Other" so a new VAM param doesn't disappear from our UI.
const PARAM_GROUPS: { name: string; fields: string[] }[] = [
  {
    name: "Window & Capital",
    fields: ["start_date", "end_date", "initial_capital", "risk_free_rate", "commission_model"],
  },
  {
    name: "State Machine",
    fields: ["rsi_period", "rsi_sell", "rsi_rebuy", "defensive_confirm_days",
             "kill_switch_logic", "vix_kill", "reentry_vix", "reentry_require_50sma"],
  },
  {
    name: "Blanket / Cooldown",
    fields: ["blanket_enabled", "blanket_trading_days"],
  },
  {
    name: "Cost Model",
    fields: ["slippage_bps_normal", "slippage_bps_stress", "stress_vix_threshold"],
  },
  {
    name: "Step 2 (UPRO)",
    fields: ["step2_upro_weight"],
  },
  {
    name: "SPXU",
    fields: ["spxu_vix_entry", "spxu_exit_vix", "spxu_exit_spy_50sma",
             "spxu_allocation", "spxu_alloc_cap", "spxu_slippage_bps"],
  },
  {
    name: "SVIX",
    fields: ["svix_entry_vix_low", "svix_entry_vix_high", "svix_panic_vix",
             "svix_initial_alloc", "svix_panic_alloc", "svix_sgov_buffer",
             "svix_exit_vix", "svix_slippage_bps", "svix_launch_date"],
  },
  {
    name: "Combined",
    fields: ["combined_allocation_cap"],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function groupFields(schema: VamStepSchema): { name: string; fields: VamParamSchemaField[] }[] {
  const byName = new Map(schema.parameters.map((p) => [p.name, p]));
  const placed = new Set<string>();
  const out: { name: string; fields: VamParamSchemaField[] }[] = [];
  for (const g of PARAM_GROUPS) {
    const fields = g.fields.flatMap((n) => {
      const f = byName.get(n);
      if (!f) return [];
      placed.add(n);
      return [f];
    });
    if (fields.length) out.push({ name: g.name, fields });
  }
  const others = schema.parameters.filter((p) => !placed.has(p.name));
  if (others.length) out.push({ name: "Other", fields: others });
  return out;
}

// Helpers + constant tables live in ./vamParams.ts so Fast Refresh treats
// this file as a pure-component module. See sweep finding #11.
import { coerceParam as coerce, defaultsFromSchema } from "./vamParams";

// ── Component ──────────────────────────────────────────────────────────────

export interface VamParamFormProps {
  schema: VamStepSchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** SPY date range (from /vam/symbols) - used to constrain start_date / end_date inputs. */
  dataRange?: { start: string; end: string } | null;
  /** Show "Reset to defaults" button. Default true. */
  resettable?: boolean;
  /** Disable all inputs (e.g. while a backtest is running). */
  disabled?: boolean;
  /**
   * Compact mode: forces single-column layout + smaller spacing, suited to
   * narrow containers like the morph-sidebar (~240px wide). Default false
   * (uses the 2-column grid that fits the dedicated configurator page).
   */
  compact?: boolean;
}

export function VamParamForm({
  schema,
  value,
  onChange,
  dataRange = null,
  resettable = true,
  disabled = false,
  compact = false,
}: VamParamFormProps) {
  // On schema change, fill in any defaults the parent didn't provide.
  // (We don't overwrite values the parent already set — that would clobber
  // user edits if the schema is refetched.)
  useEffect(() => {
    const defaults = defaultsFromSchema(schema);
    const next = { ...defaults, ...value };
    // Only fire if the merged object differs from current value
    const equal =
      Object.keys(next).length === Object.keys(value).length &&
      Object.keys(next).every((k) => next[k] === value[k]);
    if (!equal) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const groups = useMemo(() => groupFields(schema), [schema]);

  const set = (name: string, raw: string | boolean, p: VamParamSchemaField) => {
    onChange({ ...value, [name]: coerce(p, raw) });
  };

  const reset = () => onChange(defaultsFromSchema(schema));

  const fieldCls =
    "w-full h-9 px-2.5 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40 disabled:opacity-50";

  // In compact mode (used in the morph-sidebar) collapse to single column +
  // tighter row spacing so 35 params fit reasonably in a 240px-wide rail.
  const gridCls = compact
    ? "grid grid-cols-1 gap-y-2.5"
    : "grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {groups.map((g) => (
        <fieldset
          key={g.name}
          className={`${compact ? "pt-2.5" : "pt-3"} border-t border-ink-100 dark:border-ink-800 first:border-t-0 first:pt-0`}
        >
          <legend className="text-[10px] uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400 mb-2 font-semibold">
            {g.name}
          </legend>
          <div className={gridCls}>
            {g.fields.map((p) => {
              const id = `vam-param-${p.name}`;
              const current = value[p.name];
              const isDateRange = p.type === "date" && (p.name === "start_date" || p.name === "end_date");
              const dateHint =
                isDateRange && dataRange
                  ? p.name === "start_date"
                    ? `Available history: ${dataRange.start} → ${dataRange.end}. Empty = use everything.`
                    : `Available through ${dataRange.end}. Empty = run through latest.`
                  : "";
              return (
                <div key={p.name} className="flex flex-col gap-1">
                  <label
                    htmlFor={id}
                    className="text-[11px] font-medium text-ink-600 dark:text-ink-300 font-mono"
                  >
                    {p.name}
                  </label>
                  {p.type === "enum" && Array.isArray(p.options) ? (
                    <select
                      id={id}
                      className={fieldCls}
                      disabled={disabled}
                      value={(current as string) ?? (p.default as string) ?? ""}
                      onChange={(e) => set(p.name, e.target.value, p)}
                    >
                      {p.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : p.type === "bool" ? (
                    <label className="inline-flex items-center gap-2 h-9">
                      <input
                        id={id}
                        type="checkbox"
                        disabled={disabled}
                        checked={Boolean(current)}
                        onChange={(e) => set(p.name, e.target.checked, p)}
                        className="accent-accent-600 size-4"
                      />
                      <span className="text-xs text-ink-500">enabled</span>
                    </label>
                  ) : p.type === "date" ? (
                    <input
                      id={id}
                      type="date"
                      className={fieldCls}
                      disabled={disabled}
                      value={(current as string) ?? ""}
                      min={isDateRange && dataRange ? dataRange.start : undefined}
                      max={isDateRange && dataRange ? dataRange.end : undefined}
                      onChange={(e) => set(p.name, e.target.value, p)}
                    />
                  ) : (
                    <input
                      id={id}
                      type="number"
                      step={p.type === "int" ? "1" : "any"}
                      className={fieldCls}
                      disabled={disabled}
                      value={
                        current === null || current === undefined
                          ? ""
                          : (current as number | string)
                      }
                      min={p.min}
                      max={p.max}
                      onChange={(e) => set(p.name, e.target.value, p)}
                    />
                  )}
                  {(p.description || dateHint) && (
                    <p className="text-[10px] text-ink-400 leading-snug">
                      {dateHint || p.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {resettable && (
        <div className="pt-2 border-t border-ink-100 dark:border-ink-800 flex justify-end">
          <button
            type="button"
            onClick={reset}
            disabled={disabled}
            className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw size={12} /> Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}

// (VAM_STEP_OPTIONS + defaultsFromSchema now live in ./vamParams.ts)
