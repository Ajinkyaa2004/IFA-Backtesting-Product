import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Eye, Play, RefreshCw } from "lucide-react";
import { Badge, Button, Card, SectionTitle } from "../../components/ui";
import { fetchBacktests, type BacktestListItem } from "../../lib/api";
import { usePolling } from "../../lib/usePolling";
import { useAuth } from "../../store/auth";

const FILTERS = ["all", "draft", "in_progress", "completed", "approved", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

export default function BacktestsListPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const fetcher = useCallback(
    () => fetchBacktests(filter === "all" ? undefined : filter),
    [filter],
  );
  const { data, loading, error, refresh, lastUpdated } = usePolling<BacktestListItem[]>(fetcher, 15_000);
  const rows = data ?? [];
  // Distinguish "still loading first fetch" from "got an empty list back".
  // Sweep findings #6, #7.
  const showSkeleton = loading && data === null;
  const showEmpty = !loading && data !== null && rows.length === 0;
  const showErrorBanner = error !== null && data === null;

  // "New backtest" is gated to clients whose IFA account has been granted access
  // to Ravi's engine (Client.vam_enabled on the backend). Other clients keep
  // seeing the list but not the CTA.
  const vamEnabled = useAuth((s) => s.me?.vam_enabled ?? false);

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          sub={
            lastUpdated
              ? `All runs submitted on behalf of your organisation · auto-refreshes · last ${lastUpdated.toLocaleTimeString()}`
              : "All runs submitted on behalf of your organisation."
          }
          action={
            <div className="flex items-center gap-3">
              <button
                onClick={refresh}
                className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1"
              >
                <RefreshCw size={12}/> Refresh
              </button>
              {vamEnabled && (
                <Link to="/backtests/new">
                  <Button variant="accent" icon={<Play size={14}/>}>New backtest</Button>
                </Link>
              )}
            </div>
          }
        >
          Backtests
        </SectionTitle>

        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                filter === f
                  ? "bg-ink-900 text-white border-ink-900 dark:bg-ink-50 dark:text-ink-900 dark:border-ink-50"
                  : "bg-white text-ink-600 border-ink-200 hover:border-ink-300 dark:bg-ink-900 dark:text-ink-300 dark:border-ink-700"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                <th className="text-left font-medium px-5 py-2.5">Backtest ID</th>
                <th className="text-left font-medium px-5 py-2.5">Strategy</th>
                <th className="text-left font-medium px-5 py-2.5">Date requested</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-right font-medium px-5 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {showSkeleton && [0, 1, 2].map((i) => (
                <tr key={`skel-${i}`} className="animate-pulse">
                  <td className="px-5 py-3"><div className="h-3 w-32 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-3 w-48 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-3 w-20 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-5 w-16 bg-ink-100 dark:bg-ink-800 rounded-full"/></td>
                  <td className="px-5 py-3"></td>
                </tr>
              ))}
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-ink-50/70 dark:hover:bg-ink-800/30">
                  <td className="px-5 py-3 font-mono text-xs text-ink-700 dark:text-ink-200 tabular">
                    {b.code}
                  </td>
                  <td className="px-5 py-3 font-medium text-ink-900 dark:text-ink-50">{b.name}</td>
                  <td className="px-5 py-3 text-ink-500 dark:text-ink-400 tabular">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3"><Badge status={b.status} dot>{b.status.replace("_", " ")}</Badge></td>
                  <td className="px-5 py-3 text-right">
                    <Link to={`/backtests/${b.id}`}>
                      <Button size="sm" variant="ghost" icon={<Eye size={13}/>}>View</Button>
                    </Link>
                  </td>
                </tr>
              ))}
              {showEmpty && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-500">No backtests match this filter.</td></tr>
              )}
              {showErrorBanner && (
                <tr><td colSpan={5} className="px-5 py-10 text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle size={14}/> Couldn't load backtests.
                  </div>
                  <button onClick={refresh} className="ml-3 text-xs underline text-ink-500 hover:text-ink-900">Retry</button>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
