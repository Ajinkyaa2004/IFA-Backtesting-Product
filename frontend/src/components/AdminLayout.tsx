import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  FileText,
  Inbox,
  LogOut,
  Megaphone,
  Moon,
  ScrollText,
  Shield,
  Sun,
  Users,
} from "lucide-react";
import { auth } from "../lib/firebase";
import { api, fetchAdminInbox, type AdminInbox } from "../lib/api";
import { useAuth } from "../store/auth";

const NAV_ADMIN = [
  { to: "/admin", label: "Pulse", icon: Activity, end: true },
  { to: "/admin/clients", label: "Clients", icon: Users },
  { to: "/admin/backtests/upload", label: "Upload backtest", icon: BarChart3 },
  { to: "/admin/terms", label: "T&C editor", icon: FileText },
  { to: "/admin/notifications", label: "Notifications", icon: Megaphone },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export default function AdminLayout() {
  const me = useAuth((s) => s.me);
  const setMe = useAuth((s) => s.setMe);
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [inbox, setInbox] = useState<AdminInbox | null>(null);
  const pollRef = useRef<number | null>(null);

  // Poll the admin inbox every 30s so the badge stays fresh without a manual refresh.
  useEffect(() => {
    const load = () => fetchAdminInbox().then(setInbox).catch(() => {});
    load();
    pollRef.current = window.setInterval(load, 30_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const toggleDark = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark", !dark);
  };

  const logout = async () => {
    // Revoke refresh token server-side first (sweep #18) so any captured ID
    // token can't outlive the click.
    try { await api.post("/auth/logout"); } catch { /* best-effort */ }
    try { await signOut(auth); } catch { /* best-effort */ }
    setMe(null);
    navigate("/admin/login");
  };

  const unread = inbox?.total ?? 0;

  return (
    <div className="min-h-screen flex bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-white dark:bg-ink-900 border-r border-ink-200 dark:border-ink-800">
        {/* admin accent bar */}
        <div className="h-1.5 bg-accent-600" />

        <div className="h-14 px-5 flex items-center gap-2.5 border-b border-ink-200 dark:border-ink-800">
          <span className="size-7 rounded-lg flex items-center justify-center font-semibold text-[11px] bg-accent-600 text-white">
            IFA
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight leading-tight truncate">
              Backtest Engine
            </div>
            <div className="text-[10px] text-ink-500 dark:text-ink-400 tracking-wide uppercase">
              Admin Console
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-400 dark:text-ink-500">
            Operations
          </div>
          {NAV_ADMIN.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-ink-900 text-white dark:bg-ink-50 dark:text-ink-900"
                    : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                }`
              }
            >
              <n.icon size={15} />
              <span className="flex-1 text-left truncate">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-ink-200 dark:border-ink-800">
          <div className="px-3 py-2.5 rounded-lg bg-ink-50 dark:bg-ink-950/60 border border-ink-100 dark:border-ink-800">
            <div className="flex items-center gap-2">
              <span className="size-7 rounded-full bg-accent-600 text-white flex items-center justify-center text-[11px] font-semibold">
                <Shield size={12}/>
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{me?.email}</div>
                <div className="text-[10px] text-ink-500 dark:text-ink-400 truncate capitalize">
                  {me?.role?.replace("_", " ")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sticky top-0 z-30 bg-white/85 dark:bg-ink-900/85 backdrop-blur border-b border-ink-200 dark:border-ink-800">
          <div className="h-full max-w-[1440px] mx-auto px-4 lg:px-8 flex items-center gap-3">
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <button
                onClick={toggleDark}
                className="size-9 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <div className="relative">
                <button
                  onClick={() => setBellOpen(!bellOpen)}
                  className="relative size-9 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
                  aria-label={`${unread} items need attention`}
                >
                  <Bell size={15} />
                  {unread > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-600 text-white text-[9px] font-semibold flex items-center justify-center ring-2 ring-white dark:ring-ink-900 tabular">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
                    <div className="absolute right-0 top-11 z-40 w-96 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-xl shadow-pop overflow-hidden">
                      <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold">Needs attention</div>
                          <div className="text-[11px] text-ink-500">
                            {inbox
                              ? `${inbox.unread_strategies} strategies waiting · ${inbox.unread_requests} open requests`
                              : "Loading…"}
                          </div>
                        </div>
                        <Inbox size={14} className="text-ink-400" />
                      </div>
                      <div className="max-h-[420px] overflow-y-auto">
                        {!inbox || inbox.items.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-ink-500">
                            Inbox zero — nothing waiting on you.
                          </div>
                        ) : (
                          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {inbox.items.map((it) => (
                              <li
                                key={`${it.type}-${it.id}`}
                                onClick={() => {
                                  setBellOpen(false);
                                  navigate(it.href);
                                }}
                                className="px-4 py-3 cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-800/30"
                              >
                                <div className="flex items-start gap-2.5">
                                  <span className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    it.type === "strategy_uploaded"
                                      ? "bg-accent-600/10 text-accent-700 dark:text-accent-300"
                                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                  }`}>
                                    {it.type === "strategy_uploaded" ? <FileText size={13}/> : <Megaphone size={13}/>}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">{it.title}</div>
                                    <div className="text-xs text-ink-500 truncate">{it.subtitle}</div>
                                    <div className="text-[10px] text-ink-400 tabular mt-0.5">
                                      {new Date(it.occurred_at).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => setAvatarOpen(!avatarOpen)}
                  className="ml-1 h-9 pl-1 pr-2.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center gap-2"
                >
                  <span className="size-7 rounded-full bg-accent-600 text-white flex items-center justify-center">
                    <Shield size={12}/>
                  </span>
                  <ChevronDown size={13} className="text-ink-400" />
                </button>
                {avatarOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setAvatarOpen(false)} />
                    <div className="absolute right-0 top-11 z-40 w-60 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-xl shadow-pop overflow-hidden">
                      <div className="px-3.5 py-3 border-b border-ink-100 dark:border-ink-800">
                        <div className="text-sm font-medium">{me?.email}</div>
                        <div className="text-[11px] text-ink-500 capitalize">{me?.role?.replace("_", " ")}</div>
                      </div>
                      <div className="p-1.5">
                        <button
                          onClick={logout}
                          className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <LogOut size={14} /> Log out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
