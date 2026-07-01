import { useCallback, useMemo, useState } from "react";
import { BadgeCheck, ChevronDown, ChevronRight, FileText, History, RefreshCw, Upload, UploadCloud } from "lucide-react";
import { Badge, Button, Card, Modal, SectionTitle } from "../../components/ui";
import { fetchStrategies, finalizeStrategyUpload, initStrategyUpload, type Strategy } from "../../lib/api";
import { usePolling } from "../../lib/usePolling";

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Group strategies by name; within each group, sort by descending version so
// v1 sits at the bottom and the current source-of-truth is on top.
type StrategyGroup = {
  name: string;
  versions: Strategy[];       // descending by version
  latest: Strategy;           // versions[0]
  sourceOfTruth: Strategy;    // usually === latest, but keep separate
};

function groupByName(rows: Strategy[]): StrategyGroup[] {
  const map = new Map<string, Strategy[]>();
  for (const s of rows) {
    if (!map.has(s.name)) map.set(s.name, []);
    map.get(s.name)!.push(s);
  }
  const groups: StrategyGroup[] = [];
  for (const [name, versions] of map) {
    versions.sort((a, b) => b.version - a.version);
    const latest = versions[0];
    const sot = versions.find((v) => v.is_source_of_truth) ?? latest;
    groups.push({ name, versions, latest, sourceOfTruth: sot });
  }
  // Newest strategy (by latest upload date) first
  groups.sort((a, b) => (a.latest.uploaded_at < b.latest.uploaded_at ? 1 : -1));
  return groups;
}

export default function StrategiesPage() {
  const [modal, setModal] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fetcher = useCallback(() => fetchStrategies(), []);
  const { data, loading, refresh, lastUpdated } = usePolling<Strategy[]>(fetcher, 15_000);
  const rows = data ?? [];
  const groups = useMemo(() => groupByName(rows), [rows]);
  const showSkeleton = loading && data === null;
  const showEmpty = !loading && data !== null && rows.length === 0;

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          sub={
            lastUpdated
              ? `Each upload becomes a new version · auto-refreshes · last ${lastUpdated.toLocaleTimeString()}`
              : "Strategy documents you've submitted. Each upload becomes a new version. Latest = source of truth."
          }
          action={
            <div className="flex items-center gap-3">
              <button onClick={refresh} className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1">
                <RefreshCw size={12}/> Refresh
              </button>
              <Button variant="accent" icon={<Upload size={15}/>} onClick={() => setModal(true)}>Upload strategy</Button>
            </div>
          }
        >
          Strategy library
        </SectionTitle>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                <th className="text-left font-medium px-5 py-2.5 w-8"></th>
                <th className="text-left font-medium px-5 py-2.5">Strategy</th>
                <th className="text-left font-medium px-5 py-2.5">Latest version</th>
                <th className="text-left font-medium px-5 py-2.5">Uploaded</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-left font-medium px-5 py-2.5">Source of Truth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {groups.map((g) => {
                const isOpen = expanded.has(g.name);
                const hasHistory = g.versions.length > 1;
                return (
                  <>
                    <tr
                      key={g.name}
                      className={`hover:bg-ink-50/70 dark:hover:bg-ink-800/30 ${hasHistory ? "cursor-pointer" : ""}`}
                      onClick={hasHistory ? () => toggle(g.name) : undefined}
                    >
                      <td className="px-5 py-3 text-ink-400">
                        {hasHistory ? (isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>) : <span className="inline-block w-3.5"/>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="size-8 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-500">
                            <FileText size={14} />
                          </span>
                          <div>
                            <div className="font-medium text-ink-900 dark:text-ink-50">{g.name}</div>
                            {hasHistory && (
                              <div className="text-[11px] text-ink-500 dark:text-ink-400 inline-flex items-center gap-1 mt-0.5">
                                <History size={11}/>
                                {g.versions.length} versions
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-600 dark:text-ink-300">v{g.latest.version}</td>
                      <td className="px-5 py-3 text-ink-500 dark:text-ink-400 tabular">
                        {new Date(g.latest.uploaded_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3"><Badge status={g.latest.status} dot>{g.latest.status}</Badge></td>
                      <td className="px-5 py-3">
                        {g.sourceOfTruth.is_source_of_truth ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 dark:text-accent-300">
                            <BadgeCheck size={14}/> v{g.sourceOfTruth.version}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${g.name}-history`} className="bg-ink-50/40 dark:bg-ink-900/30">
                        <td></td>
                        <td colSpan={5} className="px-5 py-3">
                          <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-2">Version history</div>
                          <div className="space-y-1.5">
                            {g.versions.map((v) => (
                              <div key={v.id} className="flex items-center justify-between gap-4 text-xs">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="font-mono text-ink-700 dark:text-ink-200 shrink-0 w-8">v{v.version}</span>
                                  <span className="text-ink-500 tabular shrink-0">
                                    {new Date(v.uploaded_at).toLocaleDateString()}
                                  </span>
                                  <span className="text-ink-500 truncate">
                                    by {v.uploaded_by_email ?? "unknown"}
                                  </span>
                                  {v.checksum && (
                                    <span className="font-mono text-ink-400 text-[10px] shrink-0">
                                      {v.checksum.slice(0, 8)}…
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge status={v.status} dot>{v.status}</Badge>
                                  {v.is_source_of_truth && (
                                    <span className="inline-flex items-center gap-1 text-accent-700 dark:text-accent-300 font-medium">
                                      <BadgeCheck size={11}/> SoT
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 text-[11px] text-ink-500 dark:text-ink-400 italic">
                            The current source-of-truth version is the one used for every new backtest. Older versions are kept as an immutable record for dispute defence.
                          </p>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {showSkeleton && [0, 1].map((i) => (
                <tr key={`skel-${i}`} className="animate-pulse">
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3"><div className="h-3 w-40 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-3 w-12 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-3 w-20 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-5 w-16 bg-ink-100 dark:bg-ink-800 rounded-full"/></td>
                  <td className="px-5 py-3"><div className="h-3 w-8 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                </tr>
              ))}
              {showEmpty && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-500">No strategies uploaded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <UploadModal open={modal} onClose={() => { setModal(false); refresh(); }} />
    </div>
  );
}

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setName(""); setFile(null); setProgress(null); setError(null); setUploading(false); };
  const close = () => { reset(); onClose(); };

  const upload = async () => {
    if (!file || !name) return;
    setUploading(true);
    setError(null);
    try {
      setProgress("Requesting signed URL…");
      const init = await initStrategyUpload({
        name,
        filename: file.name,
        size_bytes: file.size,
        mime_type: file.type || "application/octet-stream",
      });

      setProgress("Uploading to storage…");
      const put = await fetch(init.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed: ${put.status} ${put.statusText}`);

      setProgress("Computing checksum…");
      const checksum = await sha256(file);

      setProgress("Finalising…");
      await finalizeStrategyUpload(init.upload_id, checksum);

      setProgress("Done");
      setTimeout(close, 400);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload strategy document"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-ink-500">{progress ?? ""}</div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="accent" icon={<Upload size={15}/>} onClick={upload} disabled={!file || !name || uploading}>
              {uploading ? "Uploading…" : "Upload & submit"}
            </Button>
          </div>
        </div>
      }
    >
      <p className="text-sm text-ink-600 dark:text-ink-300 mb-4">
        Attach a PDF or DOCX (max 25MB) describing your strategy. We'll review and reach out within one business day.
        If a strategy with the same name already exists, this creates a new version — history is preserved.
      </p>

      <label className="block">
        <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          file ? "border-accent-400 bg-accent-50/40 dark:bg-accent-900/10" : "border-ink-200 dark:border-ink-700 hover:border-accent-400"
        }`}>
          <span className="size-11 mx-auto mb-3 rounded-xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-600 dark:text-ink-300">
            <UploadCloud size={20}/>
          </span>
          <div className="text-sm font-medium text-ink-900 dark:text-ink-50">
            {file ? file.name : "Drop your file here, or browse"}
          </div>
          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">
            {file ? `${(file.size / 1024).toFixed(0)} KB · ${file.type || "unknown"}` : "PDF, DOCX, TXT · up to 25 MB"}
          </div>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </label>

      <div className="mt-4">
        <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Strategy name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
          placeholder="e.g. EMA 20/50 Crossover"
        />
      </div>

      {error && (
        <div className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </Modal>
  );
}
