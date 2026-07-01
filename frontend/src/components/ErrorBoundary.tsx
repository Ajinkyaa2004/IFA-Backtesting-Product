import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Top-level React error boundary. Without this, a component-render
 * exception (e.g. a bad `undefined` access after an API shape change)
 * produces a silent whitescreen — no way for the user to recover
 * beyond hard-refreshing. Wraps the whole <App /> in main.tsx.
 *
 * Also breadcrumbs the error to Sentry so we see it in prod without
 * relying on the user to send a support ticket.
 */
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Sentry captures automatically via its own boundary if wired, but we
    // send explicitly so this component works whether or not Sentry is on.
    try {
      Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    } catch { /* no-op: Sentry may not be initialised */ }
    // Console for local dev / when Sentry DSN is unset.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    // Full reload so any Zustand / axios state is fresh.
    window.location.href = "/";
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-ink-50 dark:bg-ink-950 px-4">
          <div className="max-w-md w-full bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-pop p-8 text-center">
            <div className="mx-auto size-12 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
              <AlertTriangle size={22}/>
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              Something went wrong
            </h1>
            <p className="text-sm text-ink-600 dark:text-ink-300 mt-2">
              The dashboard hit an unexpected error. Our team has been alerted automatically.
              You can reload to try again.
            </p>
            <button
              onClick={this.reset}
              className="mt-6 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium"
            >
              <RefreshCw size={14}/> Reload dashboard
            </button>
            {import.meta.env.DEV && (
              <details className="mt-6 text-left text-[10px] font-mono text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3 overflow-x-auto">
                <summary className="cursor-pointer text-xs font-sans font-medium not-italic mb-2">Debug (dev only)</summary>
                <pre className="whitespace-pre-wrap">{this.state.error.stack ?? this.state.error.message}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
