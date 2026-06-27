import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { auth } from "../../lib/firebase";
import { classifyAuthGateError, fetchMe } from "../../lib/api";
import { friendlyAuthError } from "../../lib/authErrors";
import { useAuth } from "../../store/auth";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const setMe = useAuth((s) => s.setMe);
  const setAuthError = useAuth((s) => s.setAuthError);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // See LoginPage for the two-phase rationale — we must NOT signOut on
    // a pre-signIn failure or the next attempt's signIn races with the
    // stale signOut and the new session gets ripped out.
    let signedIn = false;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      signedIn = true;

      const me = await fetchMe();
      // Role-gate: admin console only accepts admins
      const isAdmin = me.role === "main_admin" || me.role === "sub_admin";
      if (!isAdmin) {
        await signOut(auth);
        setMe(null);
        setError("This sign-in is for IFA staff only. Clients, please sign in at /login.");
        return;
      }
      setMe(me);
      navigate("/admin");
    } catch (err: unknown) {
      if (signedIn) {
        // POST-signIn failure: route 5xx/403/404 to the dedicated
        // AuthErrorScreen via the auth store rather than dumping an
        // inline error on the admin login form. See LoginPage rationale.
        const reason = classifyAuthGateError(err);
        if (reason !== "unauthenticated" && reason !== "unknown") {
          setMe(null);
          setAuthError(reason);
          navigate("/admin");
          return;
        }
        try { await signOut(auth); } catch { /* ignore */ }
        setMe(null);
      }
      setError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ink-50 dark:bg-ink-950">
      <div className="w-full max-w-sm bg-white dark:bg-ink-900 rounded-2xl shadow-pop border border-ink-200 dark:border-ink-800 overflow-hidden">
        {/* Admin accent bar — visually distinct from client login */}
        <div className="h-1.5 bg-accent-600" />

        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="size-9 rounded-xl bg-accent-600 text-white flex items-center justify-center">
              <Shield size={16}/>
            </span>
            <div>
              <div className="text-base font-semibold tracking-tight">Backtest Engine</div>
              <div className="text-[11px] text-ink-500 uppercase tracking-wider">Admin Console</div>
            </div>
          </div>

          <h1 className="text-xl font-semibold tracking-tight mb-1">Staff sign in</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mb-6">
            For IFA team members only. Clients sign in at <a href="/login" className="text-accent-700 dark:text-accent-300 hover:underline">/login</a>.
          </p>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                placeholder="admin@insightfusionanalytics.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in to admin"}
            </button>
          </form>

          <p className="mt-6 text-[11px] text-ink-400 text-center">
            Access controlled by main admin. Contact ops if locked out.
          </p>
        </div>
      </div>
    </div>
  );
}
