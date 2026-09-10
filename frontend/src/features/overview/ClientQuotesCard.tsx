/**
 * Client quotes card — pending quotes with accept/reject actions.
 * (Meeting 2026-07-09 — replaces tier-fixed pricing UX.)
 *
 * Placed on the client Overview page below the LifecycleStepper. Hides
 * entirely when there are no non-draft quotes. Sent quotes are actionable
 * (Accept / Reject buttons); accepted / rejected quotes are shown as
 * history for a short trail.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, FileText, XCircle } from "lucide-react";
import { Button, Card, SectionTitle } from "../../components/ui";
import PaymentDisclaimer from "../../components/PaymentDisclaimer";
import { acceptQuote, fetchMyQuotes, rejectQuote, type Quote } from "../../lib/api";
import { toast } from "../../store/toast";

export default function ClientQuotesCard() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const refresh = () => {
    fetchMyQuotes()
      .then(setQuotes)
      .catch(() => setQuotes([]));
  };

  useEffect(refresh, []);

  if (quotes === null) return null;
  if (quotes.length === 0) return null;

  const pending = quotes.filter((q) => q.status === "sent");
  const history = quotes.filter((q) => q.status !== "sent" && q.status !== "draft");

  const act = async (q: Quote, action: "accept" | "reject") => {
    setActingOn(q.id);
    try {
      if (action === "accept") {
        await acceptQuote(q.id);
        toast.success("Quote accepted", `${q.code} - IFA will invoice you on Upwork.`);
      } else {
        await rejectQuote(q.id);
        toast.success("Quote declined", `${q.code}`);
      }
      refresh();
    } catch (e: any) {
      toast.error("Action failed", e?.response?.data?.detail ?? "Unknown error");
    } finally {
      setActingOn(null);
    }
  };

  return (
    <Card>
      <SectionTitle sub="Review pending quotes IFA has sent you. Payment happens on Upwork after acceptance.">
        <span className="inline-flex items-center gap-2">
          <FileText size={16} className="text-accent-600" />
          Quotes
          {pending.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent-600 text-white text-[10px] font-semibold tabular">
              {pending.length}
            </span>
          )}
        </span>
      </SectionTitle>

      <AnimatePresence initial={false}>
        {pending.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mb-4"
          >
            <PaymentDisclaimer />
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="space-y-2.5">
        {pending.map((q) => (
          <li key={q.id} className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-900 dark:text-ink-50">{q.title}</div>
                <div className="text-[11px] text-ink-500 font-mono mt-0.5">
                  {q.code} · {q.service_name ?? "Custom"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-semibold tabular text-ink-900 dark:text-ink-50">
                  ₹{(q.amount_inr / 100).toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-ink-500 mt-0.5 uppercase tracking-wide">Total</div>
              </div>
            </div>
            {q.description && (
              <p className="mt-3 text-[12.5px] text-ink-600 dark:text-ink-300 leading-relaxed whitespace-pre-line">
                {q.description}
              </p>
            )}
            {q.valid_until && (
              <div className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-ink-500">
                <Clock size={10}/> Valid until {new Date(q.valid_until).toLocaleDateString()}
              </div>
            )}
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="accent"
                size="sm"
                icon={<CheckCircle2 size={13}/>}
                onClick={() => act(q, "accept")}
                disabled={actingOn === q.id}
              >
                {actingOn === q.id ? "Accepting…" : "Accept"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<XCircle size={13}/>}
                onClick={() => act(q, "reject")}
                disabled={actingOn === q.id}
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {history.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-800">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">Recent</div>
          <ul className="space-y-1.5">
            {history.slice(0, 5).map((q) => (
              <li key={q.id} className="flex items-center justify-between text-[11.5px] py-1">
                <div className="min-w-0 flex items-center gap-2">
                  <span className={`inline-block size-1.5 rounded-full ${
                    q.status === "accepted" ? "bg-emerald-500" :
                    q.status === "rejected" ? "bg-red-500" : "bg-ink-400"
                  }`}/>
                  <span className="text-ink-700 dark:text-ink-200 truncate">{q.title}</span>
                  <span className="text-ink-500 font-mono text-[10px]">{q.code}</span>
                </div>
                <span className="tabular text-ink-500">
                  ₹{(q.amount_inr / 100).toLocaleString("en-IN")} · {q.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
