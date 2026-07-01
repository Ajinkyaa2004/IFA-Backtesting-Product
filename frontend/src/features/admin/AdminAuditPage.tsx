import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Card, SectionTitle } from "../../components/ui";
import { downloadAdminCsv, fetchAuditLog, type AuditEntry } from "../../lib/api";

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchAuditLog(filter || undefined).then(setRows).catch(() => setRows([]));
  }, [filter]);

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
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-500">No entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
