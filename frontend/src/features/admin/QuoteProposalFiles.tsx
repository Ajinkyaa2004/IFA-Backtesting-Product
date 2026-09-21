/**
 * Proposal files on a quote - admin side. Sits under each quote in the
 * QuoteComposer list.
 *
 * Rules (enforced by the backend, mirrored here so the UI never offers
 * something that will be refused):
 *   - Quote is a draft: an upload is an internal "working copy". The client
 *     can't see it. Sending the quote publishes it as revision 1.
 *   - Quote is sent: an upload is the next revision. The client sees it
 *     immediately and is notified. Earlier revisions stay available to them.
 *   - Accepted / rejected / expired: files are frozen.
 * Nothing is ever deleted, so this panel doubles as the proposal history.
 */

import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileText, Paperclip, Upload } from "lucide-react";
import { Button } from "../../components/ui";
import {
  errorDetail,
  getAdminQuoteFileDownloadUrl,
  uploadQuoteFile,
  type QuoteAdmin,
  type QuoteFileAdmin,
} from "../../lib/api";
import { formatFileSize } from "../../lib/format";
import { PROPOSAL_ACCEPT, validateProposalFile } from "../../lib/proposalFile";
import { toast } from "../../store/toast";

export function ProposalFilePicker({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={PROPOSAL_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = ""; // allow re-picking the same file after Remove
          if (!f) return;
          const err = validateProposalFile(f);
          if (err) {
            toast.error("Can't attach that file", err);
            return;
          }
          onChange(f);
        }}
      />
      {file ? (
        <div className="flex items-center justify-between gap-2 h-8 px-2 rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 text-[11px]">
          <span className="min-w-0 truncate inline-flex items-center gap-1.5">
            <Paperclip size={11} className="shrink-0 text-accent-600" />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 text-ink-500">{formatFileSize(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="shrink-0 text-ink-500 hover:text-ink-800 dark:hover:text-ink-200 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-dashed border-ink-300 dark:border-ink-700 text-[11px] text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800/50 disabled:opacity-50"
        >
          <Paperclip size={11} /> Attach proposal file
        </button>
      )}
    </div>
  );
}

export default function QuoteProposal({
  quote,
  onChanged,
}: {
  quote: QuoteAdmin;
  onChanged: () => void;
}) {
  const [showUploader, setShowUploader] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const working = quote.files.find((f) => f.is_working_copy);
  const revisions = quote.files.filter((f) => !f.is_working_copy);
  const latest = revisions[0];
  const older = revisions.slice(1);
  const isSent = quote.status === "sent";
  const editable = quote.status === "draft" || isSent;
  const nextRevision = (latest?.revision ?? 0) + 1;

  if (quote.files.length === 0 && !editable) return null;

  const open = async (f: QuoteFileAdmin) => {
    setOpening(f.id);
    try {
      const url = await getAdminQuoteFileDownloadUrl(f.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Download failed", errorDetail(e, "Could not open the file."));
    } finally {
      setOpening(null);
    }
  };

  const cancel = () => {
    setShowUploader(false);
    setFile(null);
    setNote("");
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const saved = await uploadQuoteFile(quote.id, file, note);
      if (saved.is_working_copy) {
        toast.success("Working copy saved", "It goes to the client when you send the quote.");
      } else {
        toast.success(`Revision ${saved.revision} sent`, `${quote.code} - client notified.`);
      }
      cancel();
      onChanged();
    } catch (e) {
      toast.error("Upload failed", errorDetail(e, "Could not upload the file."));
    } finally {
      setUploading(false);
    }
  };

  const row = (f: QuoteFileAdmin, tag: string, accepted = false) => (
    <div key={f.id} className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-800 dark:text-ink-100">
          <FileText size={11} className="shrink-0 text-accent-600" />
          <span className="truncate">{f.filename}</span>
          {accepted && (
            <span className="shrink-0 px-1.5 h-4 inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[9px] font-semibold uppercase tracking-wide">
              Accepted
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] text-ink-500">
          {tag} · {formatFileSize(f.size_bytes)} · {new Date(f.sent_at ?? f.created_at).toLocaleDateString()}
          {f.uploaded_by_email ? ` · ${f.uploaded_by_email}` : ""}
        </div>
        {f.note && <div className="mt-0.5 text-[10px] italic text-ink-500">"{f.note}"</div>}
      </div>
      <button
        onClick={() => open(f)}
        disabled={opening === f.id}
        title="Open in a new tab"
        className="shrink-0 text-[10.5px] font-medium text-accent-700 dark:text-accent-300 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
      >
        <Download size={10} /> {opening === f.id ? "Opening…" : "Open"}
      </button>
    </div>
  );

  return (
    <div className="mt-2 pt-2 border-t border-ink-100 dark:border-ink-800 space-y-2">
      {working && row(working, "Working copy, not sent yet")}
      {latest && row(latest, `Revision ${latest.revision}`, quote.status === "accepted")}

      {older.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="inline-flex items-center gap-1 text-[10.5px] text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
          >
            {showHistory ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Earlier revisions ({older.length})
          </button>
          {showHistory && (
            <div className="mt-1.5 pl-3 space-y-2 border-l border-ink-100 dark:border-ink-800">
              {older.map((f) => row(f, `Revision ${f.revision}`))}
            </div>
          )}
        </div>
      )}

      {editable &&
        (showUploader ? (
          <div className="p-2 rounded-md border border-accent-500/30 bg-accent-500/5 space-y-1.5">
            <ProposalFilePicker file={file} onChange={setFile} disabled={uploading} />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder={isSent ? "What changed? (shown to the client)" : "Note (optional)"}
              className="w-full h-8 px-2 text-[11px] rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
            />
            <p className="text-[10px] text-ink-500 leading-snug">
              {isSent
                ? `Goes to the client immediately as revision ${nextRevision} and they are notified. Earlier revisions stay available to them.`
                : "Not visible to the client until you send the quote. Uploading again replaces this working copy."}
            </p>
            <div className="flex items-center justify-between">
              <button onClick={cancel} disabled={uploading} className="text-[11px] text-ink-500 hover:text-ink-800 dark:hover:text-ink-200">
                Cancel
              </button>
              <Button size="sm" variant="accent" icon={<Upload size={11} />} onClick={submit} disabled={!file || uploading}>
                {uploading ? "Uploading…" : isSent ? `Send revision ${nextRevision}` : working ? "Replace working copy" : "Attach"}
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowUploader(true)}
            className="inline-flex items-center gap-1 text-[10.5px] font-medium text-accent-700 dark:text-accent-300 hover:underline"
          >
            <Paperclip size={10} />
            {isSent ? "Upload new revision" : working ? "Replace working copy" : "Attach proposal file"}
          </button>
        ))}
    </div>
  );
}
