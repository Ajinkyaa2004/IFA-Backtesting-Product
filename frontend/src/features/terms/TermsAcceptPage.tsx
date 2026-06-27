import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { acceptTerms, fetchMe, fetchTerms, type Terms } from "../../lib/api";
import { useAuth } from "../../store/auth";

export default function TermsAcceptPage() {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setMe = useAuth((s) => s.setMe);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTerms()
      .then(setTerms)
      .catch((e) => setError(e?.response?.data?.detail ?? "Failed to load T&C"));
  }, []);

  if (error) return <Centered>{error}</Centered>;
  if (!terms) return <Centered>Loading…</Centered>;

  const clauses = terms.clauses;
  const totalSteps = clauses.length + 1;
  const isReviewStep = step === clauses.length;
  const currentClause = clauses[step];
  const currentTicked = currentClause ? accepted.has(currentClause.id) : true;
  const allTicked = clauses.every((c) => !c.required || accepted.has(c.id));

  const toggleCurrent = () => {
    if (!currentClause) return;
    const next = new Set(accepted);
    next.has(currentClause.id) ? next.delete(currentClause.id) : next.add(currentClause.id);
    setAccepted(next);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await acceptTerms(terms.id, Array.from(accepted));
      const me = await fetchMe();
      setMe(me);
      navigate("/");
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to accept");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-ink-900 rounded-2xl shadow-pop border border-ink-200 dark:border-ink-800 overflow-hidden">
        {/* Header */}
        <div className="px-7 py-5 border-b border-ink-100 dark:border-ink-800 flex items-center gap-3">
          <span className="size-10 rounded-xl bg-accent-600/10 text-accent-700 dark:text-accent-300 flex items-center justify-center">
            <ShieldCheck size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold tracking-tight">Terms & Conditions</h1>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Version {terms.version} · please read each clause carefully
            </p>
          </div>
          <div className="text-xs text-ink-500 tabular">
            Step {step + 1} of {totalSteps}
          </div>
        </div>

        {/* Progress */}
        <div className="h-1 bg-ink-100 dark:bg-ink-800">
          <div
            className="h-full bg-accent-600 transition-all"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Body */}
        <div className="px-7 py-7 min-h-[280px]">
          {!isReviewStep ? (
            <>
              <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Clause {step + 1} · {currentClause.title}
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">
                {currentClause.title}
              </h2>
              <p className="mt-3 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">
                {currentClause.body}
              </p>

              <label className="mt-6 flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-ink-200 dark:border-ink-700 hover:border-accent-400 dark:hover:border-accent-500 transition-colors">
                <input
                  type="checkbox"
                  checked={currentTicked}
                  onChange={toggleCurrent}
                  className="mt-0.5 size-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500/40"
                />
                <span className="text-sm text-ink-700 dark:text-ink-200">
                  I have read and accept this clause on behalf of my organisation.
                </span>
              </label>
            </>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Final review
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">
                Confirm acceptance
              </h2>
              <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">
                You have read and accepted all {clauses.length} clauses of T&C version{" "}
                <span className="font-mono">{terms.version}</span>. Your acceptance will be
                recorded with your user id, the version id, and your current IP.
              </p>
              <ul className="mt-5 space-y-2">
                {clauses.map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`size-5 rounded-full flex items-center justify-center ${
                        accepted.has(c.id)
                          ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400"
                      }`}
                    >
                      <Check size={12} />
                    </span>
                    <span className="text-ink-700 dark:text-ink-200">{c.title}</span>
                  </li>
                ))}
              </ul>
              {!allTicked && (
                <div className="mt-4 text-xs text-red-600 dark:text-red-400">
                  Some required clauses are not ticked. Go back and accept them.
                </div>
              )}
              {error && (
                <div className="mt-4 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Error banner — always rendered (was only inside review step before),
            so a submit failure followed by a back-navigation still tells the
            user what's wrong. Sweep finding #13. */}
        {error && (
          <div className="px-7 pb-3 -mt-1 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-7 py-4 border-t border-ink-100 dark:border-ink-800 bg-ink-50 dark:bg-ink-950/40 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            // Disable Back during submit so the user can't pop to an earlier
            // step mid-flight and lose sight of an error that would otherwise
            // only render on the review step. Sweep finding #13.
            disabled={step === 0 || submitting}
            className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-lg text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft size={14} /> Back
          </button>
          {!isReviewStep ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!currentTicked}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 text-sm font-medium rounded-lg bg-accent-600 hover:bg-accent-700 text-white disabled:opacity-50 disabled:pointer-events-none"
            >
              Continue <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!allTicked || submitting}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 text-sm font-medium rounded-lg bg-accent-600 hover:bg-accent-700 text-white disabled:opacity-50 disabled:pointer-events-none"
            >
              <Check size={14} />
              {submitting ? "Submitting…" : "Accept & continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-ink-500">
      {children}
    </div>
  );
}
