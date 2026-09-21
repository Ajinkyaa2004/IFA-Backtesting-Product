/**
 * Client quotes card — pending quotes with accept/reject actions.
 * (Meeting 2026-07-09 — replaces tier-fixed pricing UX.)
 *
 * Placed on the client Overview page below the LifecycleStepper. Hides
 * entirely when there are no non-draft quotes. Sent quotes are actionable
 * (Accept / Reject buttons); accepted / rejected quotes are shown as
 * history for a short trail.
 *
 * A quote can carry a proposal document. The card shows the latest revision
 * with a download button, IFA's "what changed" note, and every earlier
 * revision so the client can compare. Accept sends the revision the client
 * is looking at; the server refuses if a newer one was sent in the meantime.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Download, FileText, Paperclip, XCircle } from "lucide-react";
import { Button, Card, SectionTitle } from "../../components/ui";
import PaymentDisclaimer from "../../components/PaymentDisclaimer";
import { acceptQuote, errorDetail, fetchMyQuotes, getQuoteFileDownloadUrl, rejectQuote, type Quote, type QuoteFile } from "../../lib/api";
import { formatFileSize, formatMoney } from "../../lib/format";
import { toast } from "../../store/toast";

async function openProposal(quote: Quote, file: QuoteFile) {
  try {
    const url = await getQuoteFileDownloadUrl(quote.id, file.id);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    toast.error("Download failed", errorDetail(e, "Could not open the proposal."));
  }
}

function ProposalFiles({ quote }: { quote: Quote }) {
  const [showOlder, setShowOlder] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [latest, ...older] = quote.files;
  if (!latest) return null;

  const open = async (f: QuoteFile) => {
    setBusy(f.id);
    await openProposal(quote, f);
    setBusy(null);
  };

  return (
    <div className="mt-3 rounded-lg border border-ink-200/70 dark:border-ink-700 bg-white/70 dark:bg-ink-900/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-ink-500">
            <Paperclip size={11} />
            Proposal · Revision {latest.revision}
            {latest.revision > 1 && (
              <span className="px-1.5 h-4 inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[9px] font-semibold">
                Updated
              </span>
            )}
          </div>
          <div className="mt-1 text-[13px] font-medium text-ink-900 dark:text-ink-50 truncate">{latest.filename}</div>
          <div className="text-[11px] text-ink-500">
            {formatFileSize(latest.size_bytes)} · sent {new Date(latest.sent_at).toLocaleDateString()}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download size={13} />}
          onClick={() => open(latest)}
          disabled={busy === latest.id}
        >
          {busy === latest.id ? "Opening…" : "Download"}
        </Button>
      </div>

      {latest.note && (
        <p className="mt-2 text-[12px] text-ink-600 dark:text-ink-300 leading-relaxed whitespace-pre-line">
          <span className="font-medium">What changed:</span> {latest.note}
        </p>
      )}

      {older.length > 0 && (
        <div className="mt-2.5">
          <button
            onClick={() => setShowOlder((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
          >
            {showOlder ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Earlier revisions ({older.length})
          </button>
          {showOlder && (
            <ul className="mt-1.5 space-y-2 pl-3 border-l border-ink-100 dark:border-ink-800">
              {older.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-[11.5px]">
                    <div className="text-ink-700 dark:text-ink-200 truncate">
                      Revision {f.revision} · {f.filename}
                    </div>
                    <div className="text-[10.5px] text-ink-500">
                      {formatFileSize(f.size_bytes)} · sent {new Date(f.sent_at).toLocaleDateString()}
                    </div>
                    {f.note && <div className="text-[10.5px] italic text-ink-500">"{f.note}"</div>}
                  </div>
                  <button
                    onClick={() => open(f)}
                    disabled={busy === f.id}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-accent-700 dark:text-accent-300 hover:underline disabled:opacity-50"
                  >
                    <Download size={11} /> {busy === f.id ? "Opening…" : "Download"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

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
        // Tell the server which proposal revision is on screen (0 = none) so a
        // newer one that landed meanwhile is refused instead of silently accepted.
        await acceptQuote(q.id, q.files[0]?.revision ?? 0);
        toast.success("Quote accepted", `${q.code} - IFA will invoice you on Upwork.`);
      } else {
        await rejectQuote(q.id);
        toast.success("Quote declined", `${q.code}`);
      }
      refresh();
    } catch (e: any) {
      toast.error("Action failed", e?.response?.data?.detail ?? "Unknown error");
      // A stale-revision refusal means the card is out of date; reload it.
      refresh();
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
                  {formatMoney(q.amount_inr, q.currency)}
                </div>
                <div className="text-[10px] text-ink-500 mt-0.5 uppercase tracking-wide">Total · {q.currency}</div>
              </div>
            </div>
            {q.description && (
              <p className="mt-3 text-[12.5px] text-ink-600 dark:text-ink-300 leading-relaxed whitespace-pre-line">
                {q.description}
              </p>
            )}
            <ProposalFiles quote={q} />
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
                  {q.files[0] && (
                    <button
                      onClick={() => openProposal(q, q.files[0])}
                      title={`Download proposal, revision ${q.files[0].revision}`}
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-accent-700 dark:text-accent-300 hover:underline"
                    >
                      <Paperclip size={10} /> Rev {q.files[0].revision}
                    </button>
                  )}
                </div>
                <span className="tabular text-ink-500">
                  {formatMoney(q.amount_inr, q.currency)} · {q.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
