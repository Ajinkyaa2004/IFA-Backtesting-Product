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
    // Empty number/date is null — VAM treats null = use full window / use default.
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
  // enum / date / string — pass through
  return raw;
}

// Friendly labels mapping for the step dropdown — keep this client-side so
// we don't need a separate API call. Order = ascending complexity.
export const VAM_STEP_OPTIONS: { id: string; label: string; description: string }[] = [
  { id: "step1", label: "Core (step 1)", description: "Base RSI + VIX kill-switch strategy on SPY." },
  { id: "step2", label: "+ UPRO leverage (step 2)", description: "Adds 3× leveraged SPY (UPRO) sleeve." },
  { id: "step3", label: "Step 3", description: "Additional sleeve / refinement." },
  { id: "step4_svix", label: "+ SVIX short-vol (step 4 SVIX)", description: "Adds SVIX short-volatility allocation." },
  { id: "step4_combined", label: "Combined (step 4)", description: "Full combined strategy with all sleeves active." },
];
