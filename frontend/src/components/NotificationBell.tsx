import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../lib/api";

const POLL_MS = 30_000;

/**
 * Bell + dropdown for the top nav. Polls every 30s so newly-broadcast
 * items appear without a manual refresh, and shows an unread count
 * badge when > 0.
 *
 * Behaviour:
 *   - Click bell → open dropdown, list latest 50 notifications
 *   - Click a notification → mark read (personal or broadcast handled server-side)
 *   - Click 'Mark all as read' → batch mark read + close
 *   - Click outside → close dropdown
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchNotifications();
      setItems(r.items);
      setUnread(r.unread_count);
    } catch {
      /* leave stale data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const clickItem = async (n: NotificationItem) => {
    if (n.is_read) return;
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await markNotificationRead(n.id);
    } catch {
      // Revert on failure
      refresh();
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      refresh();
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative size-9 rounded-lg text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center px-1 shadow-sm">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-[360px] max-w-[calc(100vw-2rem)] bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl shadow-pop overflow-hidden z-30">
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-ink-100 dark:border-ink-800">
            <div className="text-sm font-semibold">Notifications</div>
            {items.length > 0 && unread > 0 && (
              <button
                onClick={markAll}
                className="text-[11px] text-accent-700 dark:text-accent-300 hover:underline inline-flex items-center gap-1"
              >
                <Check size={11}/> Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="px-4 py-6 text-xs text-ink-500 text-center">Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-4 py-8 text-center">
                <BellOff size={20} className="mx-auto text-ink-300 dark:text-ink-600 mb-2"/>
                <div className="text-xs text-ink-500">No notifications yet.</div>
              </div>
            )}
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {items.map((n) => (
                <li
                  key={n.id}
                  onClick={() => clickItem(n)}
                  className={`px-4 py-3 cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-800/40 ${
                    n.is_read ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-1 size-2 rounded-full shrink-0 ${
                        n.is_read ? "bg-ink-300 dark:bg-ink-700" : "bg-accent-600"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink-900 dark:text-ink-50 truncate">
                          {n.title}
                        </span>
                        {n.is_broadcast && (
                          <span className="text-[9px] px-1 h-4 rounded bg-ink-100 dark:bg-ink-800 text-ink-500 uppercase tracking-wider">
                            all
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 line-clamp-2">
                        {n.body}
                      </div>
                      <div className="text-[10px] text-ink-400 tabular mt-1">
                        {relTime(n.created_at)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.round(s / 86400)}d ago`;
  return d.toLocaleDateString();
}
