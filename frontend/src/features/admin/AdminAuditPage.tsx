import { useCallback, useEffect, useState } from "react";
import { Download, UserRound } from "lucide-react";
import { Card, SectionTitle } from "../../components/ui";
import { downloadAdminCsv, fetchAuditLog, type AuditEntry } from "../../lib/api";

const PAGE_SIZE = 100;

// Preset filter chips — one-click into common queries.
const CHIPS: { label: string; prefix: string; icon?: React.ReactNode }[] = [
  { label: "All",           prefix: "" },
  { label: "Impersonation", prefix: "admin.impersonate", icon: <UserRound size={11}/> },
  { label: "Backtests",     prefix: "backtest." },
  { label: "Strategies",    prefix: "strategy." },
  { label: "T&C",           prefix: "tnc." },
  { label: "Clients",       prefix: "client." },
  { label: "Exports",       prefix: "admin.export." },
];

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    fetchAuditLog(filter || undefined, { limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        setRows(page);
        setOffset(0);
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextOffset = offset + PAGE_SIZE;
      const page = await fetchAuditLog(filter || undefined, { limit: PAGE_SIZE, offset: nextOffset });
      setRows((prev) => [...prev, ...page]);
      setOffset(nextOffset);
      setHasMore(page.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="p-0">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
          <SectionTitle sub="Append-only — every sensitive action is recorded with actor, target, IP, and timestamp.">
            Audit log
          </SectionTitle>
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by action prefix (e.g. tnc., client.)"
              className="h-9 w-72 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
            />
            <button
              onClick={() => downloadAdminCsv("audit")}
              className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800 text-xs font-medium text-ink-700 dark:text-ink-200 inline-flex items-center gap-1.5"
              title="Download filtered audit log as CSV"
            >
              <Download size={12}/> CSV
            </button>
          </div>
        </div>

        {/* Quick-filter chips — one click into common categories. */}
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => {
            const active = filter === c.prefix;
            return (
              <button
                key={c.label}
                onClick={() => setFilter(c.prefix)}
                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors ${
                  active
                    ? "bg-ink-900 text-white border-ink-900 dark:bg-ink-50 dark:text-ink-900 dark:border-ink-50"
                    : "bg-white text-ink-600 border-ink-200 hover:border-ink-300 dark:bg-ink-900 dark:text-ink-300 dark:border-ink-700"
                }`}
              >
                {c.icon}
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400 border-b border-ink-100 dark:border-ink-800">
                <th className="text-left font-medium px-5 py-2.5">When</th>
                <th className="text-left font-medium px-5 py-2.5">Actor</th>
                <th className="text-left font-medium px-5 py-2.5">Action</th>
                <th className="text-left font-medium px-5 py-2.5">Target</th>
                <th className="text-left font-medium px-5 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2 tabular text-xs text-ink-500">{new Date(r.occurred_at).toLocaleString()}</td>
                  <td className="px-5 py-2 text-xs">{r.actor_email ?? <span className="text-ink-400">system</span>}</td>
                  <td className="px-5 py-2"><span className="font-mono text-xs text-accent-700 dark:text-accent-300">{r.action}</span></td>
                  <td className="px-5 py-2 text-xs text-ink-600">
                    {r.target_type ? `${r.target_type} · ${r.target_id?.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-5 py-2 text-xs text-ink-500 font-mono">{r.ip ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-500">No entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && hasMore && (
          <div className="p-3 flex justify-center border-t border-ink-100 dark:border-ink-800">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="h-8 px-4 rounded-lg border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800 text-xs font-medium text-ink-700 dark:text-ink-200 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : `Load more (${PAGE_SIZE})`}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
