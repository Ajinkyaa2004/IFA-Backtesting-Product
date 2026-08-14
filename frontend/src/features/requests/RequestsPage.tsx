import { useCallback, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { Badge, Button, Card, SectionTitle } from "../../components/ui";
import { fetchRequests, submitRequest, type ClientRequest, type RequestType } from "../../lib/api";
import { usePolling } from "../../lib/usePolling";
import PaymentDisclaimer from "../../components/PaymentDisclaimer";

const TABS: { id: RequestType; label: string }[] = [
  { id: "new_strategy", label: "New Strategy" },
  { id: "change", label: "Change Request" },
  { id: "quote", label: "Request for Quote" },
  { id: "clarification", label: "Clarification" },
];

export default function RequestsPage() {
  const [tab, setTab] = useState<RequestType>("change");
  const fetcher = useCallback(() => fetchRequests(), []);
  const { data, loading, refresh, lastUpdated } = usePolling<ClientRequest[]>(fetcher, 15_000);
  const history = data ?? [];
  const showSkeleton = loading && data === null;
  const showEmpty = !loading && data !== null && history.length === 0;

  return (
    <div className="space-y-6">
      <PaymentDisclaimer />
      <Card padding="p-0">
        <div className="px-5 pt-5">
          <SectionTitle sub="Open a new conversation with the IFA team. We respond within one business day.">
            Submit a request
          </SectionTitle>
        </div>

        <div className="px-5 border-b border-ink-100 dark:border-ink-800">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "text-ink-900 dark:text-ink-50"
                    : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-200"
                }`}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent-600 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          <RequestForm key={tab} type={tab} onSubmitted={refresh} />
        </div>
      </Card>

      <Card>
        <SectionTitle
          sub={
            lastUpdated
              ? `Most recent first · auto-refreshes · last ${lastUpdated.toLocaleTimeString()}`
              : "Most recent first"
          }
          action={
            <button onClick={refresh} className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1">
              <RefreshCw size={12}/> Refresh
            </button>
          }
        >
          Request history
        </SectionTitle>
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {history.map((r) => (
            <li key={r.id} className="py-3 flex items-start gap-4">
              <div className="font-mono text-[11px] text-ink-500 dark:text-ink-400 w-28 shrink-0 mt-0.5 tabular truncate">
                {r.id.slice(0, 8)}…
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-ink-900 dark:text-ink-50">
                    {TABS.find((t) => t.id === r.type)?.label ?? r.type}
                  </span>
                  <span className="text-[11px] text-ink-400 tabular">
                    · {new Date(r.submitted_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-ink-600 dark:text-ink-300 mt-0.5 truncate">
                  {(r.payload.summary as string) || (r.payload.question as string) || "(no summary)"}
                </div>
              </div>
              <Badge status={r.status} dot>{r.status.replace("_", " ")}</Badge>
            </li>
          ))}
          {showSkeleton && [0, 1, 2].map((i) => (
            <li key={`skel-${i}`} className="py-3 flex items-start gap-4 animate-pulse">
              <div className="h-3 w-24 bg-ink-100 dark:bg-ink-800 rounded mt-0.5"/>
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 bg-ink-100 dark:bg-ink-800 rounded"/>
                <div className="h-3 w-48 bg-ink-100 dark:bg-ink-800 rounded"/>
              </div>
              <div className="h-5 w-16 bg-ink-100 dark:bg-ink-800 rounded-full"/>
            </li>
          ))}
          {showEmpty && (
            <li className="py-8 text-center text-sm text-ink-500">No requests yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function RequestForm({ type, onSubmitted }: { type: RequestType; onSubmitted: () => void }) {
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setPayload({ ...payload, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await submitRequest({ type, payload });
      setSuccess(`Submitted as ${r.id.slice(0, 8)}…`);
      setPayload({});
      onSubmitted();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldCls =
    "mt-1 w-full px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40";

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={submit}>
      {type === "new_strategy" && (
        <>
          <Field label="Strategy name" className="md:col-span-2">
            <input className={`h-9 ${fieldCls}`} value={payload.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Momentum + Volatility filter" required />
          </Field>
          <Field label="Asset class">
            <select className={`h-9 ${fieldCls}`} value={payload.asset_class ?? ""} onChange={(e) => set("asset_class", e.target.value)}>
              <option value="">—</option>
              <option>Equity (Cash)</option>
              <option>Equity (F&O)</option>
              <option>Currency</option>
              <option>Crypto</option>
            </select>
          </Field>
          <Field label="Universe">
            <input className={`h-9 ${fieldCls}`} value={payload.universe ?? ""} onChange={(e) => set("universe", e.target.value)} placeholder="Nifty 50 / Smallcap 250 / custom" />
          </Field>
          <Field label="Hypothesis" className="md:col-span-2">
            <textarea className={`py-2 min-h-[100px] ${fieldCls}`} value={payload.hypothesis ?? ""} onChange={(e) => set("hypothesis", e.target.value)} placeholder="What are you testing, and why?" />
          </Field>
        </>
      )}

      {type === "change" && (
        <>
          <Field label="Summary" className="md:col-span-2">
            <input className={`h-9 ${fieldCls}`} value={payload.summary ?? ""} onChange={(e) => set("summary", e.target.value)} placeholder="One-line summary of the change" required />
          </Field>
          <Field label="Change type">
            <select className={`h-9 ${fieldCls}`} value={payload.change_type ?? ""} onChange={(e) => set("change_type", e.target.value)}>
              <option value="">—</option>
              <option>Parameter tweak</option>
              <option>Exit rule</option>
              <option>Universe change</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Details" className="md:col-span-2">
            <textarea className={`py-2 min-h-[100px] ${fieldCls}`} value={payload.details ?? ""} onChange={(e) => set("details", e.target.value)} placeholder="Be specific about what changes and how to validate it." />
          </Field>
        </>
      )}

      {type === "quote" && (
        <>
          <Field label="Summary" className="md:col-span-2">
            <input className={`h-9 ${fieldCls}`} value={payload.summary ?? ""} onChange={(e) => set("summary", e.target.value)} placeholder="e.g. 24m walk-forward backtest on smallcap momentum" required />
          </Field>
          <Field label="Engagement type">
            <select className={`h-9 ${fieldCls}`} value={payload.engagement ?? ""} onChange={(e) => set("engagement", e.target.value)}>
              <option value="">—</option>
              <option>Single backtest</option>
              <option>Walk-forward (12m)</option>
              <option>Paper trading</option>
            </select>
          </Field>
          <Field label="Turnaround">
            <select className={`h-9 ${fieldCls}`} value={payload.turnaround ?? ""} onChange={(e) => set("turnaround", e.target.value)}>
              <option value="">—</option>
              <option>Standard (5 biz days)</option>
              <option>Rush (2 biz days · +40%)</option>
            </select>
          </Field>
          <Field label="Date range — from">
            <input type="date" className={`h-9 ${fieldCls}`} value={payload.from ?? ""} onChange={(e) => set("from", e.target.value)} />
          </Field>
          <Field label="Date range — to">
            <input type="date" className={`h-9 ${fieldCls}`} value={payload.to ?? ""} onChange={(e) => set("to", e.target.value)} />
          </Field>
          <Field label="Additional notes" className="md:col-span-2">
            <textarea className={`py-2 min-h-[100px] ${fieldCls}`} value={payload.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </>
      )}

      {type === "clarification" && (
        <>
          <Field label="Topic">
            <select className={`h-9 ${fieldCls}`} value={payload.topic ?? ""} onChange={(e) => set("topic", e.target.value)}>
              <option value="">—</option>
              <option>Trade-level question</option>
              <option>Assumption / methodology</option>
              <option>Data quality</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Related backtest (optional)">
            <input className={`h-9 ${fieldCls}`} value={payload.backtest_code ?? ""} onChange={(e) => set("backtest_code", e.target.value)} placeholder="e.g. BT-2026-0001" />
          </Field>
          <Field label="Your question" className="md:col-span-2">
            <textarea className={`py-2 min-h-[100px] ${fieldCls}`} value={payload.question ?? ""} onChange={(e) => set("question", e.target.value)} placeholder="What would you like to clarify?" required />
          </Field>
        </>
      )}

      <div className="md:col-span-2 flex items-center justify-between pt-2">
        <p className="text-xs text-ink-500 dark:text-ink-400">
          By submitting you accept the engagement T&C.
        </p>
        <div className="flex items-center gap-3">
          {success && <span className="text-xs text-emerald-600 dark:text-emerald-400">{success}</span>}
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
          <Button variant="accent" icon={<Send size={15}/>} type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-ink-600 dark:text-ink-300">{label}</label>
      {children}
    </div>
  );
}
