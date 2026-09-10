/**
 * Shared VAM /run error classifier (audit PF25).
 *
 * ClientRunBacktestPage and VamResultSidebar both let the client
 * kick off a VAM run - Sidebar via "Rerun with these params", main
 * page via the primary CTA. Both used to have their own thin error
 * handling: the Sidebar's version didn't understand the tier_gate
 * detail shape and printed a bare "Rate limit hit" for the exact same
 * response the main page rendered as an upgrade prompt.
 *
 * Consolidating the classifier gives both entry points the same
 * copy and the same guidance for every failure mode:
 *   - tier_gate  -> "…Contact us via the Requests tab to upgrade"
 *   - 429        -> "several runs in quick succession, pause"
 *   - 422 with violations -> "engine rejected these params:"
 *   - 502        -> "engine error, retry"
 *   - 503        -> "engine offline, try again shortly"
 *   - else       -> raw message
 */

export type RunErr = {
  kind: "config" | "ratelimit" | "validation" | "engine" | "unknown";
  message: string;
  violations?: { path: string; message: string }[];
  retryAfter?: number;
};

export function extractMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const ax = (e as { response?: { data?: { detail?: unknown } }; message?: string });
    const detail = ax.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const msg = (detail as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
    if (typeof ax.message === "string") return ax.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

export function classifyVamRunError(e: unknown): RunErr {
  const ax = (e as {
    response?: {
      status?: number;
      data?: { detail?: unknown };
      headers?: Record<string, string>;
    };
  }).response;
  const status = ax?.status;
  const detail = ax?.data?.detail;

  // Tier-gate first - both 403 (feature unavailable) and 429 (limit hit)
  // ride this shape. Render as a friendly upgrade prompt.
  if (
    typeof detail === "object" &&
    detail !== null &&
    (detail as { error?: string }).error === "tier_gate"
  ) {
    const g = detail as { message: string; kind: string };
    return {
      kind: g.kind === "limit" ? "ratelimit" : "config",
      message: `${g.message} Contact us via the Requests tab to upgrade your plan.`,
    };
  }
  if (status === 503) {
    return {
      kind: "config",
      message: "The engine is currently offline. Please try again shortly.",
    };
  }
  if (status === 429) {
    return {
      kind: "ratelimit",
      message:
        "You've made several runs in quick succession. Please pause for a moment.",
      retryAfter:
        parseInt(ax?.headers?.["retry-after"] ?? "0", 10) || undefined,
    };
  }
  if (
    status === 422 &&
    typeof detail === "object" &&
    detail !== null &&
    "violations" in detail
  ) {
    return {
      kind: "validation",
      message: "The engine rejected one or more parameters:",
      violations: (detail as { violations: { path: string; message: string }[] })
        .violations,
    };
  }
  if (status === 502) {
    return {
      kind: "engine",
      message:
        "Engine error - please retry. If it keeps happening, contact support.",
    };
  }
  return { kind: "unknown", message: extractMessage(e) || "Run failed" };
}
