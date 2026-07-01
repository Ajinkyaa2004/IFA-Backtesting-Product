// Sentry client init. No-op when VITE_SENTRY_DSN_FRONTEND is unset so local
// dev / self-hosted deploys without an observability plan don't pay a cost.
// Wired in main.tsx before <App/> renders so we catch render-phase errors.

import * as Sentry from "@sentry/react";

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN_FRONTEND as string | undefined;
  if (!dsn) return;
  const env = (import.meta.env.VITE_APP_ENV as string | undefined) ?? "production";
  Sentry.init({
    dsn,
    environment: env,
    release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.1.0",
    // Traces sampled low; upstream traffic is currently small enough that
    // 100% would just be noise. Bump when we start caring about p95 traces.
    tracesSampleRate: 0.1,
    // Session replay off by default — expensive and PII-sensitive. Enable
    // by setting VITE_SENTRY_REPLAY=1 once we have a data-handling review.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Strip anything that looks like an ID token from breadcrumbs — Firebase
    // ID tokens are JWTs and leaking them to Sentry gives whoever can read
    // the project a live session.
    beforeBreadcrumb(bc) {
      if (bc.category === "xhr" || bc.category === "fetch") {
        if (bc.data && typeof bc.data === "object") {
          delete (bc.data as Record<string, unknown>).Authorization;
        }
      }
      return bc;
    },
  });
}

/**
 * Attach the current user to Sentry so every error is grouped by who
 * hit it. Called from the auth store whenever the /me response lands.
 * We deliberately only send { id, role } — no email, no client name —
 * to keep PII exposure minimal (see sentry-sdk send_default_pii=False
 * on the backend, matching discipline).
 */
export function setSentryUser(user: { id: string; role: string } | null): void {
  try {
    if (!user) {
      Sentry.setUser(null);
      return;
    }
    Sentry.setUser({ id: user.id, segment: user.role });
  } catch { /* no-op if Sentry not initialised */ }
}
