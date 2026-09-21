/**
 * VAM parameter helpers + constant tables, intentionally kept in a non-TSX
 * file so that React Fast Refresh treats the sibling VamParamForm.tsx as a
 * pure-component file (it would otherwise full-page-reload on every edit,
 * blowing away in-progress form state). See sweep finding #11.
 */
import type { VamParamSchemaField, VamStepSchema } from "../../lib/api";

/** Build a fresh params dict from a schema's defaults - used on mount + reset. */
export function defaultsFromSchema(schema: VamStepSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of schema.parameters) {
    if (p.default === undefined || p.default === null) continue;
    out[p.name] = p.default;
  }
  return out;
}

/** Coerce the raw input value to the right JS type before bubbling up. */
export function coerceParam(p: VamParamSchemaField, raw: string | boolean): unknown {
  if (p.type === "bool") return Boolean(raw);
  if (raw === "" || raw === null || raw === undefined) {
    // Empty number/date is null - VAM treats null = use full window / use default.
    return null;
  }
  if (p.type === "int") {
    const n = parseInt(String(raw), 10);
    return Number.isNaN(n) ? null : n;
  }
  if (p.type === "float") {
    const n = parseFloat(String(raw));
    return Number.isNaN(n) ? null : n;
  }
  // enum / date / string - pass through
  return raw;
}

// Friendly labels mapping for the step dropdown - keep this client-side so
// we don't need a separate API call. Order = ascending complexity.
export const VAM_STEP_OPTIONS: { id: string; label: string; description: string }[] = [
  {
    id: "step1_upro_4state",
    label: "Step 1 - UPRO 4-state",
    description: "UPRO-only base strategy with RSI + VIX kill-switch on SPY (4-state machine).",
  },
  {
    id: "step2_upro_tqqq_6state",
    label: "Step 2 - UPRO + TQQQ 6-state",
    description: "Adds TQQQ sleeve on top of Step 1 (6-state machine).",
  },
  {
    id: "v3_7state_optimized",
    label: "v3 - 7-state optimized",
    description: "7-state optimized variant with additional sleeve refinements.",
  },
  {
    id: "v5_leveraged",
    label: "v5 - Leveraged",
    description: "Leveraged variant with dynamic ATR/drawdown protection.",
  },
  {
    id: "v5b_nonleveraged",
    label: "v5b - Non-leveraged",
    description: "Non-leveraged sibling of v5 - lower risk profile.",
  },
];
