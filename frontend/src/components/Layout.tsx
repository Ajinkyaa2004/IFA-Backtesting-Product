import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  BarChart3,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { auth } from "../lib/firebase";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { useSidebarOverride } from "../store/sidebarOverride";
import ImpersonationBanner from "./ImpersonationBanner";
import NotificationBell from "./NotificationBell";

const NAV_CLIENT = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/strategies", label: "Strategies", icon: FileText },
  { to: "/requests", label: "Requests", icon: MessageSquare },
  { to: "/backtests", label: "Backtests", icon: BarChart3 },
];

export default function Layout() {
  const me = useAuth((s) => s.me);
  const setMe = useAuth((s) => s.setMe);
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // Sidebar override is set by pages that want to commandeer the left rail
  // (e.g. a backtest result page swaps the nav for a param-tweak panel).
  const sidebarOverride = useSidebarOverride((s) => s.override);
  const showOverride = useSidebarOverride((s) => s.showOverride);
  const toggleShowOverride = useSidebarOverride((s) => s.toggleShowOverride);
  // Show override iff the page registered one AND the user hasn't toggled
  // back to the workspace nav.
  const inOverrideMode = sidebarOverride !== null && showOverride;

  const toggleDark = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark", !dark);
  };

  const logout = async () => {
    // Ask the backend to revoke our refresh token FIRST so any captured ID
    // token can't outlive the click. Sweep finding #18. Don't block the
    // local-signout flow if the network call fails (offline, server down).
    try { await api.post("/auth/logout"); } catch { /* best-effort */ }
    try { await signOut(auth); } catch { /* best-effort */ }
    setMe(null);
    navigate("/login");
  };

  const initials = me?.client?.name
    ?.split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "IFA";

  return (
    <div className="min-h-screen flex flex-col bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100">
      <ImpersonationBanner />
      <div className="flex-1 flex min-h-0">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-white dark:bg-ink-900 border-r border-ink-200 dark:border-ink-800">
        <div className="h-14 px-5 flex items-center gap-2.5 border-b border-ink-200 dark:border-ink-800">
          <span className="size-7 rounded-lg flex items-center justify-center font-semibold text-[11px] bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900">
            IFA
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight leading-tight truncate">
              Backtest Engine
            </div>
            <div className="text-[10px] text-ink-500 dark:text-ink-400 tracking-wide uppercase">
              Client Portal
            </div>
          </div>
        </div>

        {/*
          The flex-1 div below holds EITHER the standard workspace nav OR a
          page-supplied override (e.g. the param-tweak panel on a backtest
          result page). When an override is registered, a small toggle button
          appears in the section header so the user can flip between the two.
          The opacity transition gives a soft crossfade rather than a hard cut.
        */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Section header — labels "Workspace" or "Parameters" depending on mode */}
          <div className="px-3 pt-4 pb-1 flex items-center justify-between">
            <div
              key={inOverrideMode ? "params-label" : "workspace-label"}
              className="px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-400 dark:text-ink-500 transition-opacity duration-200"
            >
              {inOverrideMode ? "Parameters" : "Workspace"}
            </div>
            {sidebarOverride !== null && (
              <button
                type="button"
                onClick={toggleShowOverride}
                className="mr-2 size-7 rounded-md text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 inline-flex items-center justify-center"
                aria-label={inOverrideMode ? "Show workspace nav" : "Show parameters panel"}
                title={inOverrideMode ? "Show workspace nav" : "Show parameters panel"}
              >
                {inOverrideMode ? <Menu size={14} /> : <X size={14} />}
              </button>
            )}
          </div>

          {/* Body — single scroll region; content swaps with opacity fade */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
            <div
              key={inOverrideMode ? "override" : "nav"}
              className="animate-fadeIn"
            >
              {inOverrideMode ? (
                sidebarOverride
              ) : (
                <nav className="space-y-0.5">
                  {NAV_CLIENT.map((n) => (
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
              )}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-ink-200 dark:border-ink-800">
          <div className="px-3 py-2.5 rounded-lg bg-ink-50 dark:bg-ink-950/60 border border-ink-100 dark:border-ink-800">
            <div className="flex items-center gap-2">
              <span className="size-7 rounded-full bg-accent-600/15 text-accent-700 dark:text-accent-300 flex items-center justify-center text-[11px] font-semibold">
                {initials}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">
                  {me?.client?.name ?? me?.email}
                </div>
                <div className="text-[10px] text-ink-500 dark:text-ink-400 truncate">
                  Tier {me?.client?.tier?.replace("tier", "") ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="h-14 sticky top-0 z-30 bg-white/85 dark:bg-ink-900/85 backdrop-blur border-b border-ink-200 dark:border-ink-800">
          <div className="h-full max-w-[1440px] mx-auto px-4 lg:px-8 flex items-center gap-3">
            <div className="lg:hidden flex items-center gap-2.5">
              <span className="size-7 rounded-lg flex items-center justify-center font-semibold text-[11px] bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900">
                IFA
              </span>
              <span className="text-sm font-semibold">Backtest Engine</span>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-1">
              <button
                onClick={toggleDark}
                className="size-9 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <NotificationBell />

              <div className="relative">
                <button
                  onClick={() => setAvatarOpen(!avatarOpen)}
                  className="ml-1 h-9 pl-1 pr-2.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center gap-2"
                >
                  <span className="size-7 rounded-full bg-accent-600 text-white flex items-center justify-center text-[11px] font-semibold">
                    {initials}
                  </span>
                  <ChevronDown size={13} className="text-ink-400" />
                </button>
                {avatarOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setAvatarOpen(false)} />
                    <div className="absolute right-0 top-11 z-40 w-60 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-xl shadow-pop overflow-hidden">
                      <div className="px-3.5 py-3 border-b border-ink-100 dark:border-ink-800">
                        <div className="text-sm font-medium">{me?.client?.name ?? "—"}</div>
                        <div className="text-[11px] text-ink-500 dark:text-ink-400 truncate">
                          {me?.email}
                        </div>
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
    </div>
  );
}
