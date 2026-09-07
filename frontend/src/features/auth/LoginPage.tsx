import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { CheckCircle2, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../../lib/firebase";
import { classifyAuthGateError, fetchMe } from "../../lib/api";
import { friendlyAuthError } from "../../lib/authErrors";
import { useAuth } from "../../store/auth";
import ForgotPasswordModal from "./ForgotPasswordModal";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  // Post-signup banner. SignupPage sends the user here with
  // ?just_signed_up=1&email=xxx after successfully submitting the signup form.
  // We pre-fill the email input so they don't have to retype it on their
  // eventual return visit.
  const justSignedUp = searchParams.get("just_signed_up") === "1";
  const signupEmailParam = useMemo(
    () => searchParams.get("email") ?? "",
    [searchParams],
  );

  const [email, setEmail] = useState(signupEmailParam);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const navigate = useNavigate();
  const setMe = useAuth((s) => s.setMe);
  const setAuthError = useAuth((s) => s.setAuthError);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Two-phase try/catch so signOut(auth) only fires when there IS a session
    // to tear down. Calling signOut unconditionally on a failed Firebase
    // signIn caused a race: the in-flight signOut from a wrong-password
    // attempt would resolve AFTER the next good signIn, ripping out the
    // freshly-minted session. Selenium caught this — see VAM-suite finding.
    let signedIn = false;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      signedIn = true;

      const me = await fetchMe();
      // Role-gate: client portal only accepts clients
      const isAdmin = me.role === "main_admin" || me.role === "sub_admin";
      if (isAdmin) {
        await signOut(auth);
        setMe(null);
        setError("This is the client portal. Admins, please sign in at /admin/login.");
        return;
      }
      setMe(me);
      // Self-serve signup gate — a returning client whose approval is still
      // pending (or was rejected) needs to land on the correct waiting/
      // rejected screen instead of the dashboard.
      if (me.signup_status === "pending_approval") {
        navigate("/pending");
        return;
      }
      if (me.signup_status === "rejected") {
        navigate("/rejected");
        return;
      }
      if (me.needs_tnc_acceptance) navigate("/terms");
      else navigate("/dashboard");
    } catch (err: unknown) {
      // Only tear down the Firebase session if we actually established one
      // (i.e. signIn succeeded but a downstream call — fetchMe, role check —
      // failed). For pre-signIn failures (wrong password, network error)
      // there's nothing to sign out and calling signOut unconditionally
      // races with the next submit's signIn. Sweep finding #16 + selenium.
      if (signedIn) {
        // POST-signIn failure: classify so we route to the dedicated
        // AuthErrorScreen instead of dumping a confusing "Internal server
        // error" on the login form. The App.tsx listener has also seen this
        // failure via its own fetchMe and set authError to the same reason —
        // we just need to navigate off /login so Protected can render the
        // AuthErrorScreen. Deployment-smoke caught this regression.
        const reason = classifyAuthGateError(err);
        if (reason !== "unauthenticated" && reason !== "unknown") {
          // 403 suspended, 404 not-provisioned, 5xx, network: keep the
          // Firebase session intact (the screen's "Try again" handles cleanup)
          // and navigate so Protected sees authError → AuthErrorScreen.
          setMe(null);
          setAuthError(reason);
          navigate("/");
          return;
        }
        // 401 / unknown — sign out + show inline error
        try { await signOut(auth); } catch { /* ignore */ }
        setMe(null);
      }
      setError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white dark:bg-ink-900 rounded-2xl shadow-pop border border-ink-200 dark:border-ink-800 p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="size-9 rounded-xl bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 flex items-center justify-center font-semibold text-sm">
            IFA
          </span>
          <div>
            <div className="text-base font-semibold tracking-tight">Backtest Engine</div>
            <div className="text-[11px] text-ink-500 uppercase tracking-wider">Client Portal</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight mb-1">Sign in</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-6">
          Use the credentials shared by your account manager.
        </p>

        {justSignedUp && (
          <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-2.5">
              <CheckCircle2
                size={18}
                className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Signup received — you're on the list
                </div>
                <div className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-200/80 leading-relaxed">
                  Our team is reviewing your request and will get back to you
                  within one business day.
                  {signupEmailParam ? (
                    <>
                      {" "}Watch{" "}
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Mail size={11} /> {signupEmailParam}
                      </span>{" "}
                      for the approval email.
                    </>
                  ) : (
                    " Check your inbox — we'll email you the moment access is unlocked."
                  )}
                  {" "}Come back and sign in below once you receive it.
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              placeholder="you@company.com"
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
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 text-right">
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-xs text-accent-700 dark:text-accent-300 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <p className="mt-4 text-[11px] text-ink-400 text-center">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="text-accent-700 dark:text-accent-300 hover:underline font-medium"
          >
            Request access →
          </Link>
        </p>
        <p className="mt-3 text-[11px] text-ink-400 text-center">
          IFA team member? <a href="/admin/login" className="text-accent-700 dark:text-accent-300 hover:underline">Sign in to admin console →</a>
        </p>
      </div>
      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} initialEmail={email} />
    </div>
  );
}
