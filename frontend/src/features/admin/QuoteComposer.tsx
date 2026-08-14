/**
 * Quote composer — sits inside the admin client drawer below the
 * EngagementEditor. Admin creates + sends per-request quotes.
 * (Meeting 2026-07-09 — replaces the old tier-fixed pricing assumption.)
 *
 * Flow:
 *   1. Admin fills title + service + amount + optional description
 *   2. Save-as-draft OR send immediately
 *   3. Existing quotes for this client render as a list; each has status
 *      chip + send action for drafts
 *   4. Client sees `sent` quotes on their dashboard with accept/reject
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, DollarSign, FileText, Plus, Send, XCircle } from "lucide-react";
import { Button } from "../../components/ui";
import {
  type QuoteAdmin,
  type Service,
  createQuoteForClient,
  fetchQuotesForClient,
  fetchServices,
  sendQuote,
} from "../../lib/api";
import { toast } from "../../store/toast";

export default function QuoteComposer({ clientId }: { clientId: string }) {
  const [quotes, setQuotes] = useState<QuoteAdmin[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Compose form state
  const [title, setTitle] = useState("");
  const [serviceId, setServiceId] = useState<string>("");
  const [amountRupees, setAmountRupees] = useState<string>("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetchQuotesForClient(clientId),
      fetchServices().catch(() => [] as Service[]),
    ])
      .then(([qs, svcs]) => {
        setQuotes(qs);
        setServices(svcs);
      })
      .catch(() => setQuotes([]))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [clientId]);

  const resetForm = () => {
    setTitle("");
    setServiceId("");
    setAmountRupees("");
    setDescription("");
    setNotes("");
  };

  const validAmount = /^\d+(\.\d{1,2})?$/.test(amountRupees) && Number(amountRupees) > 0;
  const canSave = title.trim().length >= 3 && validAmount;

  const save = async (thenSend: boolean) => {
    if (!canSave) return;
    setSaving(true);
    try {
      const q = await createQuoteForClient(clientId, {
        title: title.trim(),
        service_id: serviceId || null,
        amount_inr: Math.round(Number(amountRupees) * 100),
        description: description.trim() || null,
        notes: notes.trim() || null,
      });
      if (thenSend) {
        await sendQuote(q.id);
        toast.success("Quote sent", `${q.code} — visible to client now.`);
      } else {
        toast.success("Draft saved", `${q.code}`);
      }
      resetForm();
      setComposing(false);
      refresh();
    } catch (e: any) {
      toast.error("Save failed", e?.response?.data?.detail ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const send = async (q: QuoteAdmin) => {
    try {
      await sendQuote(q.id);
      toast.success("Quote sent", `${q.code}`);
      refresh();
    } catch (e: any) {
      toast.error("Send failed", e?.response?.data?.detail ?? "Unknown error");
    }
  };

  return (
    <div className="pt-4 border-t border-ink-100 dark:border-ink-800 space-y-3">
      <div className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <DollarSign size={12} className="text-accent-600" /> Quotes
        </span>
        {!composing && (
          <button
            onClick={() => setComposing(true)}
            className="text-[11px] font-medium text-accent-700 dark:text-accent-300 hover:underline inline-flex items-center gap-1"
          >
            <Plus size={11} /> New quote
          </button>
        )}
      </div>

      {composing && (
        <div className="p-3 rounded-lg border border-accent-500/30 bg-accent-500/5 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title — e.g. EMA/RSI backtest + 2 tuning rounds"
            className="w-full h-8 px-2 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="h-8 px-2 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
            >
              <option value="">— service (optional) —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-500">₹</span>
              <input
                type="number"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                placeholder="Amount"
                className="w-full h-8 pl-5 pr-2 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 tabular"
              />
            </div>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Description — scope, deliverables, timeline (visible to client)"
            className="w-full px-2 py-1.5 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 resize-y"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={1}
            placeholder="Admin notes (private, not shown to client)"
            className="w-full px-2 py-1.5 text-[11px] rounded-md border border-ink-200 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-950/40 resize-y italic text-ink-500"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setComposing(false); resetForm(); }}
              className="text-[11px] text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
            >
              Cancel
            </button>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => save(false)} disabled={!canSave || saving}>
                {saving ? "Saving…" : "Save draft"}
              </Button>
              <Button size="sm" variant="accent" icon={<Send size={11}/>} onClick={() => save(true)} disabled={!canSave || saving}>
                {saving ? "Sending…" : "Save + send"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-[11px] text-ink-500 italic">Loading quotes…</div>
      ) : quotes.length === 0 ? (
        <div className="text-[11px] text-ink-500 italic">No quotes yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {quotes.map((q) => (
            <li key={q.id} className="p-2.5 rounded-md border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-950/40 text-[11.5px]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-ink-800 dark:text-ink-100 truncate">{q.title}</div>
                  <div className="text-[10px] text-ink-500 font-mono mt-0.5">
                    {q.code} · {q.service_name ?? "no service"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold tabular">₹{(q.amount_inr / 100).toLocaleString("en-IN")}</div>
                  <QuoteStatusChip status={q.status} />
                </div>
              </div>
              {q.status === "draft" && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => send(q)}
                    className="text-[10.5px] font-medium text-accent-700 dark:text-accent-300 hover:underline inline-flex items-center gap-1"
                  >
                    <Send size={10} /> Send to client
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuoteStatusChip({ status }: { status: QuoteAdmin["status"] }) {
  const style: Record<QuoteAdmin["status"], string> = {
    draft:    "bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300",
    sent:     "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    rejected: "bg-red-500/15 text-red-700 dark:text-red-400",
    expired:  "bg-ink-200 dark:bg-ink-700 text-ink-500 line-through",
  };
  return (
    <span className={`inline-block mt-0.5 px-1.5 h-4 rounded-full text-[9px] font-semibold uppercase tracking-wide ${style[status]}`}>
      {status}
    </span>
  );
}
