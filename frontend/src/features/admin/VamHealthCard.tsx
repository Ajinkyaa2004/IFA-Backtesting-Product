import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, SectionTitle } from "../../components/ui";
import { fetchVamHealth, type VamHealth } from "../../lib/api";

/**
 * Live VAM engine health probe. Auto-refreshes every 60s and displays a
 * green/red status pill + round-trip latency + last error string.
 *
 * Rendered on the AdminPulsePage so ops can spot outages before the client
 * complains. Backend probe hits VAM's /api/auth/profile as the canary call
 * (see admin/vam.py health endpoint).
 */
const POLL_MS = 60_000;

export default function VamHealthCard() {
  const [health, setHealth] = useState<VamHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchVamHealth();
      setHealth(r);
      setLastChecked(new Date());
    } catch {
      // fetchVamHealth is server-side non-throwing, so this is only a
      // network / auth failure at the layer above.
      setHealth({ ok: false, latency_ms: 0, error: "Could not reach backend", checked_at: 0 });
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
    const t = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(t);
  }, [check]);

  return (
    <Card>
      <SectionTitle
        sub="Round-trip to VAM's /auth/profile every 60s. Circuit breaker sits in front."
        action={
          <button
            onClick={check}
            disabled={loading}
            className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "Checking…" : "Recheck"}
          </button>
        }
      >
        VAM engine health
      </SectionTitle>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
        <StatusCell health={health} />
        <div className="p-3 rounded-lg border border-ink-100 dark:border-ink-800">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
            Latency
          </div>
          <div className="text-lg font-semibold text-ink-900 dark:text-ink-50 mt-1 tabular">
            {health ? `${Math.round(health.latency_ms)} ms` : "—"}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-ink-100 dark:border-ink-800">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
            Last check
          </div>
          <div className="text-sm font-medium text-ink-900 dark:text-ink-50 mt-1 tabular">
            {lastChecked ? lastChecked.toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>

      {health && !health.ok && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="text-xs text-red-800 dark:text-red-200">
              <div className="font-semibold">Engine unreachable</div>
              <div className="mt-1 font-mono break-all">{health.error ?? "(no detail)"}</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusCell({ health }: { health: VamHealth | null }) {
  if (!health) {
    return (
      <div className="p-3 rounded-lg border border-ink-100 dark:border-ink-800">
        <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
          Status
        </div>
        <div className="text-sm font-medium text-ink-500 dark:text-ink-400 mt-1">Checking…</div>
      </div>
    );
  }
  if (health.ok) {
    return (
      <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/5">
        <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
          Status
        </div>
        <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mt-1 inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          Healthy
        </div>
      </div>
    );
  }
  return (
    <div className="p-3 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50/40 dark:bg-red-500/5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-red-700 dark:text-red-400">
        Status
      </div>
      <div className="text-sm font-semibold text-red-800 dark:text-red-200 mt-1 inline-flex items-center gap-1.5">
        <AlertTriangle size={14} />
        Down
      </div>
    </div>
  );
}
