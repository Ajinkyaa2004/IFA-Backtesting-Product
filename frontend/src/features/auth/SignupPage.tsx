/**
 * Self-serve signup page.
 *
 * Flow:
 *   1. Client fills name/email/company/phone/password
 *   2. Firebase createUserWithEmailAndPassword mints a fresh account
 *   3. We POST the resulting ID token + profile fields to /auth/signup
 *   4. Backend creates a User row with signup_status='pending_approval'
 *   5. On success we navigate to /pending — the client waits there until an
 *      admin approves (they receive an email when it happens).
 *
 * We deliberately DO NOT set the freshly-signed-up user on the auth store —
 * they should NOT reach the dashboard until admin approves. If the user
 * closes the tab and comes back later, LoginPage handles the "already
 * signed up, still pending" case by routing them to /pending.
 */

import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { Building2, CheckCircle2, Loader2, Mail, Phone, Sparkles, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchMe, submitSignup } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../store/auth";

const MIN_PASSWORD_LENGTH = 8;

function friendlySignupError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/email-already-in-use":
        return "An account with this email already exists. Try signing in instead.";
      case "auth/weak-password":
        return `Your password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      case "auth/invalid-email":
        return "That email address doesn't look valid.";
      case "auth/network-request-failed":
        return "Network trouble. Check your connection and try again.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a minute and try again.";
      default:
        return err.message.replace(/^Firebase:\s*/i, "");
    }
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Something went wrong. Please try again.";
}

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const setMe = useAuth((s) => s.setMe);

  const canSubmit =
    name.trim().length >= 2 &&
    email.trim().length > 3 &&
    company.trim().length >= 1 &&
    phone.trim().length >= 4 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirmPassword &&
    !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setSubmitting(true);

    let firebaseUserCreated = false;
    try {
      // 1. Create the Firebase user. This also signs the user in so we can
      //    mint an ID token to send to the backend.
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      firebaseUserCreated = true;

      // 2. Set displayName so the Firebase console shows something useful.
      //    Best-effort — a failure here doesn't block the signup.
      try {
        await updateProfile(cred.user, { displayName: name.trim() });
      } catch {
        /* ignore */
      }

      // 3. Hand the ID token to the backend. It verifies + creates a
      //    pending User row and fires the admin notification email.
      const idToken = await cred.user.getIdToken();
      await submitSignup({
        id_token: idToken,
        name: name.trim(),
        company: company.trim(),
        phone: phone.trim(),
        purpose: purpose.trim() || null,
      });

      // 4. Load /me so the auth store carries their pending status. This
      //    lets /pending render "waiting on approval for [Company]" without
      //    a second network round-trip.
      try {
        const me = await fetchMe();
        setMe(me);
      } catch {
        /* If /me fails, /pending will retry via App.tsx onAuthStateChanged */
      }

      navigate("/pending", { replace: true });
    } catch (err: unknown) {
      // If Firebase user creation succeeded but the backend call failed we
      // sign the user out so they can retry with the same email later.
      // (The Firebase account persists — a retry will hit "already in use".
      // Handling that requires a rare cleanup path we skip for MVP.)
      if (firebaseUserCreated) {
        try {
          await signOut(auth);
        } catch {
          /* ignore */
        }
        setMe(null);
      }
      setError(friendlySignupError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-white via-white to-accent-50/30 dark:from-ink-950 dark:via-ink-950 dark:to-accent-950/20">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-pop border border-ink-200 dark:border-ink-800 p-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="size-9 rounded-xl bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 flex items-center justify-center font-semibold text-sm">
              IFA
            </span>
            <div>
              <div className="text-base font-semibold tracking-tight">Backtest Engine</div>
              <div className="text-[11px] text-ink-500 uppercase tracking-wider">
                Request access
              </div>
            </div>
          </div>

          <h1 className="text-xl font-semibold tracking-tight mb-1">
            Create your account
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mb-6">
            Tell us who you are. An IFA admin will review and approve you within one business day.
          </p>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
                <UserIcon size={12} /> Full name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                autoComplete="name"
                placeholder="Ravi Kumar"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
                <Mail size={12} /> Work email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                autoComplete="email"
                placeholder="you@yourfirm.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
                <Building2 size={12} /> Company
              </label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                autoComplete="organization"
                placeholder="Sterling Capital Advisors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
                <Phone size={12} /> Phone
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                autoComplete="tel"
                placeholder="+91 98xxx xxxxx"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
                <Sparkles size={12} /> What are you looking for? (optional)
              </label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={2}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40 resize-y"
                placeholder="Swing-trading backtests on Nifty midcaps…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink-600 dark:text-ink-300">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-600 dark:text-ink-300">
                  Confirm
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </div>
            </div>
            <p className="text-[11px] text-ink-400">
              At least {MIN_PASSWORD_LENGTH} characters. Choose something you don't use elsewhere.
            </p>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-1 w-full h-10 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Creating account…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Request access
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-[11px] text-ink-400 text-center">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-accent-700 dark:text-accent-300 hover:underline font-medium"
            >
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
