import { useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./features/auth/LoginPage";
import AdminLoginPage from "./features/auth/AdminLoginPage";
import OverviewPage from "./features/overview/OverviewPage";
import StrategiesPage from "./features/strategies/StrategiesPage";
import RequestsPage from "./features/requests/RequestsPage";
import BacktestsListPage from "./features/backtests/BacktestsListPage";
import BacktestDetailPage from "./features/backtests/BacktestDetailPage";
import ClientRunBacktestPage from "./features/vam/ClientRunBacktestPage";
import TermsAcceptPage from "./features/terms/TermsAcceptPage";
import AdminLayout from "./components/AdminLayout";
import AdminPulsePage from "./features/admin/AdminPulsePage";
import AdminClientsPage from "./features/admin/AdminClientsPage";
import AdminBacktestUploadPage from "./features/admin/AdminBacktestUploadPage";
import AdminNotificationsPage from "./features/admin/AdminNotificationsPage";
import AdminAuditPage from "./features/admin/AdminAuditPage";
import AdminTermsPage from "./features/admin/AdminTermsPage";
import { auth } from "./lib/firebase";
import { classifyAuthGateError, fetchMe } from "./lib/api";
import { useAuth } from "./store/auth";
import { useImpersonate } from "./store/impersonate";

function Protected({
  children,
  requireTncDone,
  requireAdmin,
  requireClient,
}: {
  children: React.ReactNode;
  requireTncDone?: boolean;
  requireAdmin?: boolean;
  requireClient?: boolean;
}) {
  const me = useAuth((s) => s.me);
  const loading = useAuth((s) => s.loading);
  const authError = useAuth((s) => s.authError);
  const impersonating = useImpersonate((s) => s.active);
  if (loading) return <div className="p-6 text-sm text-ink-500">Loading…</div>;

  if (authError && authError !== "unauthenticated") {
    return <AuthErrorScreen reason={authError} />;
  }
  if (!me) {
    const loginTarget = requireAdmin ? "/admin/login" : "/login";
    return <Navigate to={loginTarget} replace />;
  }

  const isAdmin = me.role === "main_admin" || me.role === "sub_admin";
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  // Admins with an active impersonation session are allowed into the client
  // area — that's the whole point of impersonation. The red banner stays
  // sticky so it's impossible to forget you're not seeing your own data.
  if (requireClient && isAdmin && !impersonating) return <Navigate to="/admin" replace />;
  // T&C check only applies to real clients — impersonating admins skip this
  // (client's own acceptance state is what matters and admins can't accept
  // T&C on behalf of a client anyway).
  if (requireTncDone && me.role === "client" && me.needs_tnc_acceptance)
    return <Navigate to="/terms" replace />;
  return <>{children}</>;
}

function AuthErrorScreen({ reason }: { reason: string }) {
  const setAuthError = useAuth((s) => s.setAuthError);
  const messages: Record<string, { title: string; body: string }> = {
    not_provisioned: {
      title: "Your account isn't set up yet",
      body: "Your sign-in worked, but your portal account hasn't been provisioned. Please contact your IFA account manager.",
    },
    suspended: {
      title: "Account suspended",
      body: "Your account has been suspended. Please contact your IFA account manager to re-activate it.",
    },
    backend_unavailable: {
      title: "We can't reach the server",
      body: "The backend is temporarily unavailable. Try again in a moment.",
    },
    unknown: {
      title: "Something went wrong",
      body: "Unexpected sign-in error. Try again, or contact support if this persists.",
    },
  };
  const m = messages[reason] ?? messages.unknown;
  const retry = async () => {
    setAuthError(null);
    // Sign the firebase session out so the user can re-authenticate cleanly.
    // The onAuthStateChanged listener picks up the null and lands them on
    // /login (or the area-specific login page).
    try { await signOut(auth); } catch { /* ignore */ }
    // Hard reload so any in-memory state from the failed boot is gone.
    window.location.reload();
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50 dark:bg-ink-950 p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold text-ink-900 dark:text-ink-50">{m.title}</h1>
        <p className="text-sm text-ink-600 dark:text-ink-300">{m.body}</p>
        <button
          onClick={retry}
          className="mt-2 inline-flex items-center px-4 h-9 rounded-lg bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const setMe = useAuth((s) => s.setMe);
  const setLoading = useAuth((s) => s.setLoading);
  const setAuthError = useAuth((s) => s.setAuthError);

  useEffect(() => {
    let cancelled = false;
    // Generation counter so a stale fetchMe (from an older auth-state event)
    // cannot overwrite the current one. See sweep finding #9 (race condition).
    let generation = 0;

    const resolve = async (user: typeof auth.currentUser) => {
      const myGen = ++generation;
      if (cancelled) return;
      if (!user) {
        setMe(null);
        setAuthError(null);
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (cancelled || myGen !== generation) return;  // newer event in flight; discard
        setMe(me);
      } catch (e) {
        if (cancelled || myGen !== generation) return;
        const reason = classifyAuthGateError(e);
        if (reason === "unauthenticated") {
          // 401 — token expired/revoked. Sign out so the listener fires again
          // with user=null, landing the user at /login cleanly.
          try { await signOut(auth); } catch { /* ignore */ }
          setMe(null);
        } else {
          // 403 (suspended), 404 (not provisioned), 5xx, network: keep the
          // firebase session intact and render the dedicated error screen so
          // the user can read why and choose to retry.
          setMe(null);
          setAuthError(reason);
        }
      }
      if (!cancelled && myGen === generation) setLoading(false);
    };

    // Subscribe for ongoing auth changes. authStateReady() handles persisted
    // sessions on first load; the listener handles every change after that.
    // We deliberately do NOT add a setTimeout failsafe — that used to fire on
    // slow networks and flash-redirect authenticated users to /login. See
    // sweep finding #10.
    const unsub = onAuthStateChanged(auth, (user) => resolve(user));
    auth.authStateReady().then(() => resolve(auth.currentUser));

    return () => {
      cancelled = true;
      unsub();
    };
  }, [setMe, setLoading, setAuthError]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public login pages — role-gated so a client can't sneak in via /admin/login */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />

        <Route path="/terms" element={<Protected><TermsAcceptPage /></Protected>} />

        {/* Client portal */}
        <Route element={<Protected requireClient requireTncDone><Layout /></Protected>}>
          <Route index element={<OverviewPage />} />
          <Route path="strategies" element={<StrategiesPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="backtests" element={<BacktestsListPage />} />
          <Route path="backtests/new" element={<ClientRunBacktestPage />} />
          <Route path="backtests/:id" element={<BacktestDetailPage />} />
        </Route>

        {/* Admin console */}
        <Route path="admin" element={<Protected requireAdmin><AdminLayout /></Protected>}>
          <Route index element={<AdminPulsePage />} />
          <Route path="clients" element={<AdminClientsPage />} />
          <Route path="backtests/upload" element={<AdminBacktestUploadPage />} />
          <Route path="terms" element={<AdminTermsPage />} />
          <Route path="notifications" element={<AdminNotificationsPage />} />
          <Route path="audit" element={<AdminAuditPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
