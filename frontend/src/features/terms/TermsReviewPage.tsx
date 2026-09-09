/**
 * Read-only T&C review — reachable from the client footer any time after
 * first-time acceptance. No checkboxes, no accept action; just the full
 * text of the currently-published version so the client can re-read.
 *
 * A separate route (rather than a modal) because:
 *   - T&C can be long, and a full-page render is easier to read
 *   - shareable URL — client can bookmark or forward the link to counsel
 *   - identical text/version rendering to /terms (single source of truth)
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, ShieldCheck } from "lucide-react";
import { fetchTerms, type Terms } from "../../lib/api";
import PaymentDisclaimer from "../../components/PaymentDisclaimer";

export default function TermsReviewPage() {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTerms()
      .then(setTerms)
      .catch((e) =>
        setError(e?.response?.data?.detail ?? "Failed to load T&C"),
      );
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-6 sm:py-8 px-4">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 mb-4"
      >
        <ChevronLeft size={14} /> Back to dashboard
      </Link>

      <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-card border border-ink-200 dark:border-ink-800 overflow-hidden">
        <div className="px-6 sm:px-8 py-6 border-b border-ink-100 dark:border-ink-800 flex items-center gap-3">
          <span className="size-10 rounded-xl bg-accent-600/10 text-accent-700 dark:text-accent-300 flex items-center justify-center">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              Terms & Conditions
            </h1>
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
              {terms ? (
                <>
                  Version <span className="font-mono">{terms.version}</span>{" "}
                  · effective{" "}
                  {new Date(terms.effective_from).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </>
              ) : (
                "Loading…"
              )}
            </p>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-6">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2 mb-4">
              {error}
            </div>
          )}

          {!terms ? (
            <div className="text-sm text-ink-500">Loading terms…</div>
          ) : (
            <>
              <p className="text-sm text-ink-600 dark:text-ink-300 mb-6">
                These are the terms you accepted when you first signed in.
                They apply to every engagement, backtest, and deliverable
                on the IFA Backtest Engine portal.
              </p>

              <ol className="space-y-5">
                {terms.clauses.map((c, i) => (
                  <li
                    key={c.id}
                    className="pl-4 border-l-2 border-accent-500/50"
                  >
                    <div className="text-[11px] uppercase tracking-wider text-accent-700 dark:text-accent-300 font-semibold">
                      Clause {i + 1}
                    </div>
                    <h2 className="mt-1 text-sm font-semibold text-ink-900 dark:text-ink-50">
                      {c.title}
                    </h2>
                    <p className="mt-2 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">
                      {c.body}
                    </p>
                  </li>
                ))}
              </ol>

              <div className="mt-8">
                <PaymentDisclaimer />
              </div>

              <p className="mt-6 text-xs text-ink-500 dark:text-ink-400">
                To revoke acceptance or request changes to these terms,
                please contact your IFA account manager.
              </p>
            </>
          )}
        </div>

        <div className="px-6 sm:px-8 py-4 border-t border-ink-100 dark:border-ink-800 bg-ink-50 dark:bg-ink-950/40 flex items-center justify-between text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <FileText size={12} /> Read-only view of the current terms
          </span>
          <Link
            to="/dashboard"
            className="font-medium text-accent-700 dark:text-accent-300 hover:underline"
          >
            Back to dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}
