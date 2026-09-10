import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PageTransition } from "./motion";
import { signOut } from "firebase/auth";
import {
  Activity,
  BarChart3,
  ChevronDown,
  Cpu,
  Database,
  FileText,
  Inbox,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Palette,
  ScrollText,
  Shield,
  Sun,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { auth } from "../lib/firebase";
import { api, fetchAdminInbox, type AdminInbox } from "../lib/api";
import { initialDarkMode, setDarkMode } from "../lib/darkMode";
import { useAuth } from "../store/auth";
import { useImpersonate } from "../store/impersonate";
import ImpersonationBanner from "./ImpersonationBanner";
import NotificationBell from "./NotificationBell";

const NAV_ADMIN = [
  { to: "/admin", label: "Pulse", icon: Activity, end: true },
  { to: "/admin/signups", label: "Pending signups", icon: UserPlus },
  { to: "/admin/clients", label: "Clients", icon: Users },
  { to: "/admin/data", label: "Data", icon: Database },
  { to: "/admin/engines", label: "Engine registry", icon: Cpu },
  { to: "/admin/backtests/upload", label: "Upload backtest", icon: BarChart3 },
  { to: "/admin/content", label: "Content editor", icon: Palette },
  { to: "/admin/terms", label: "T&C editor", icon: FileText },
  { to: "/admin/notifications", label: "Notifications", icon: Megaphone },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export default function AdminLayout() {
  const me = useAuth((s) => s.me);
  const setMe = useAuth((s) => s.setMe);
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState<boolean>(() => initialDarkMode());
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inbox, setInbox] = useState<AdminInbox | null>(null);
  const pollRef = useRef<number | null>(null);

  // Close the mobile drawer when the route changes (a NavLink click closes it).
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

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
    const next = !dark;
    setDark(next);
    setDarkMode(next);
  };

  const logout = async () => {
    // Impersonation must not survive across sign-outs. Clear the client-side
    // state first — if the admin logs in as a different user next, they'd
    // otherwise inherit the stale impersonation header.
    useImpersonate.getState().stop();
    // Revoke refresh token server-side first (sweep #18) so any captured ID
    // token can't outlive the click.
    try { await api.post("/auth/logout"); } catch { /* best-effort */ }
    try { await signOut(auth); } catch { /* best-effort */ }
    setMe(null);
    navigate("/admin/login");
  };

  const unread = inbox?.total ?? 0;

  // Same-source-of-truth sidebar body — desktop rail (>= lg) and mobile
  // off-canvas drawer render this. Mirrors the client Layout.tsx pattern.
  const sidebarBody = (
    <>
      <div className="h-1.5 bg-accent-600 shrink-0" />
      <div className="h-14 px-5 flex items-center justify-between gap-2.5 border-b border-ink-200 dark:border-ink-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="size-7 rounded-lg flex items-center justify-center font-semibold text-[11px] bg-accent-600 text-white shrink-0">
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
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden size-8 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
          aria-label="Close menu"
        >
          <X size={16}/>
        </button>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-0.5">
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
      <div className="p-3 border-t border-ink-200 dark:border-ink-800 shrink-0">
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
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100">
      <ImpersonationBanner />
      <div className="flex-1 flex min-h-0">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-white dark:bg-ink-900 border-r border-ink-200 dark:border-ink-800">
        {sidebarBody}
      </aside>

      {/* Mobile off-canvas drawer - slides in from the left with a backdrop */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              key="admin-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-black/50"
              aria-hidden
            />
            <motion.aside
              key="admin-drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
              className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] flex flex-col bg-white dark:bg-ink-900 border-r border-ink-200 dark:border-ink-800 shadow-2xl"
              role="dialog"
              aria-label="Admin navigation"
            >
              {sidebarBody}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sticky top-0 z-30 bg-white/85 dark:bg-ink-900/85 backdrop-blur border-b border-ink-200 dark:border-ink-800">
          <div className="h-full max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-8 flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden size-9 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
              aria-label="Open navigation menu"
            >
              <Menu size={17} />
            </button>
            <div className="lg:hidden flex items-center gap-2.5 min-w-0">
              <span className="size-7 rounded-lg flex items-center justify-center font-semibold text-[11px] bg-accent-600 text-white shrink-0">
                IFA
              </span>
              <span className="text-sm font-semibold truncate hidden sm:inline">Admin</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <button
                onClick={toggleDark}
                className="size-9 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              {/* System notifications (broadcasts + personal) - mirrors the
                  bell on the client side. Distinct from the InboxBell below
                  which shows client-work waiting on the admin. */}
              <NotificationBell />
              <div className="relative">
                <button
                  onClick={() => setBellOpen(!bellOpen)}
                  className="relative size-9 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
                  aria-label={`${unread} items need attention`}
                  title="Client work waiting on you"
                >
                  <Inbox size={15} />
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
                            Inbox zero - nothing waiting on you.
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

        <main className="flex-1 px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-[1440px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>
      </div>
    </div>
  );
}
