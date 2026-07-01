import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, BarChart3, CheckCircle2, FileText, Inbox, Megaphone, RefreshCw, Users } from "lucide-react";
import { Badge, Card, SectionTitle, StatTile } from "../../components/ui";
import {
  fetchAdminClients,
  fetchAdminInbox,
  fetchPlatformStats,
  type AdminClient,
  type AdminInbox,
  type PlatformStats,
} from "../../lib/api";
import ArchitectureDiagram from "./ArchitectureDiagram";

const POLL_INTERVAL_MS = 20_000;

export default function AdminPulsePage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [inbox, setInbox] = useState<AdminInbox | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollRef = useRef<number | null>(null);

  const refresh = async () => {
    try {
      const [s, cs, ib] = await Promise.all([fetchPlatformStats(), fetchAdminClients(), fetchAdminInbox()]);
      setStats(s);
      setClients(cs);
      setInbox(ib);
      setLastUpdated(new Date());
    } catch {
      /* leave previous values */
    }
  };

  useEffect(() => {
    refresh();
    pollRef.current = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  if (!stats) return <div className="text-sm text-ink-500">Loading platform stats…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-ink-500">Platform pulse</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Operations dashboard</h1>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1.5"
        >
          <RefreshCw size={12}/>
          {lastUpdated ? `auto · last ${lastUpdated.toLocaleTimeString()}` : "refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatTile label="Clients" value={String(stats.n_clients)} icon={<Users size={14}/>} delta={`${stats.n_clients_active} active`} />
        <StatTile label="Backtests" value={String(stats.n_backtests)} icon={<BarChart3 size={14}/>} delta="all-time" />
        <StatTile label="Completed" value={String(stats.n_backtests_completed)} icon={<CheckCircle2 size={14}/>} tone="pos" />
        <StatTile label="Open requests" value={String(stats.n_requests_open)} icon={<Inbox size={14}/>} delta="awaiting reply" />
        <StatTile label="Tiers" value={Object.entries(stats.tier_distribution).map(([k, v]) => `${k.replace("tier", "T")}:${v}`).join(" ") || "—"} icon={<Activity size={14}/>} />
      </div>

      {/* Needs-attention panel — surfaces things the admin should act on */}
      {inbox && inbox.items.length > 0 && (
        <Card>
          <SectionTitle
            sub={`${inbox.unread_strategies} strategies awaiting backtest · ${inbox.unread_requests} open requests`}
          >
            <span className="inline-flex items-center gap-2">
              Needs your attention
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent-600 text-white text-[10px] font-semibold tabular">
                {inbox.total}
              </span>
            </span>
          </SectionTitle>
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {inbox.items.slice(0, 10).map((it) => (
              <li key={`${it.type}-${it.id}`} className="py-3 flex items-start gap-3">
                <span className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${
                  it.type === "strategy_uploaded"
                    ? "bg-accent-600/10 text-accent-700 dark:text-accent-300"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}>
                  {it.type === "strategy_uploaded" ? <FileText size={15}/> : <Megaphone size={15}/>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{it.title}</div>
                  <div className="text-xs text-ink-500 truncate">{it.subtitle}</div>
                  <div className="text-[11px] text-ink-400 tabular mt-0.5">
                    {new Date(it.occurred_at).toLocaleString()}
                  </div>
                </div>
                <Link
                  to={it.href}
                  className="text-xs font-medium text-accent-700 dark:text-accent-300 hover:underline inline-flex items-center gap-1 shrink-0"
                >
                  Open <ArrowRight size={12}/>
                </Link>
              </li>
            ))}
          </ul>
          {inbox.items.length > 10 && (
            <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800 text-xs text-ink-500 text-center">
              +{inbox.items.length - 10} more — open the bell to see all
            </div>
          )}
        </Card>
      )}

      <Card>
        <SectionTitle sub="Most recent first">All clients</SectionTitle>
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {clients.map((c) => (
            <li key={c.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-xs text-ink-500 tabular">
                  {c.primary_contact ?? "—"} · joined {new Date(c.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge status={c.status} dot>{c.status}</Badge>
                <span className="text-xs uppercase tracking-wider text-ink-500">{c.tier}</span>
              </div>
            </li>
          ))}
          {clients.length === 0 && (
            <li className="py-8 text-center text-sm text-ink-500">No clients yet.</li>
          )}
        </ul>
      </Card>

      <ArchitectureDiagram />
    </div>
  );
}
