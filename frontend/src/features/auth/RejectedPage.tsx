/**
 * Shown to a user whose signup_status = 'rejected'.
 * Displays the admin-supplied rejection reason so the client understands
 * why. From here they can only sign out — they cannot reach the dashboard.
 * Anmol's call: transparent rejection > vague "not approved".
 */

import { signOut } from "firebase/auth";
import { LogOut, Mail, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../store/auth";

export default function RejectedPage() {
  const me = useAuth((s) => s.me);
  const setMe = useAuth((s) => s.setMe);
  const navigate = useNavigate();

  const meta = me?.signup_metadata ?? {};
  const displayName = meta.name || me?.email?.split("@")[0] || "there";
  const reason =
    me?.signup_rejection_reason ??
    "The admin didn't leave a specific reason. Please reach out to us if you'd like to discuss.";

  const onSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
    setMe(null);
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-white via-white to-red-50/40 dark:from-ink-950 dark:via-ink-950 dark:to-red-950/10">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-pop border border-ink-200 dark:border-ink-800 p-8 text-center">
          <div className="mx-auto size-14 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center mb-4">
            <XCircle size={24} />
          </div>

          <h1 className="text-xl font-semibold tracking-tight mb-2">
            Hey {displayName},
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mb-5">
            After reviewing your request we're not able to approve access at
            this time.
          </p>

          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 text-left mb-6">
            <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 font-semibold mb-1">
              Reason
            </div>
            <div className="text-sm text-ink-800 dark:text-ink-100">
              {reason}
            </div>
          </div>

          <div className="bg-ink-50 dark:bg-ink-950/60 border border-ink-100 dark:border-ink-800 rounded-lg p-4 text-left mb-6">
            <div className="flex items-start gap-2 text-xs text-ink-600 dark:text-ink-300">
              <Mail size={14} className="mt-0.5 shrink-0" />
              <div>
                Want to discuss? Reply to the rejection email we just sent to{" "}
                <span className="font-medium">{me?.email ?? "your inbox"}</span> and we'll get back to you.
              </div>
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="w-full h-10 bg-ink-900 dark:bg-ink-100 hover:bg-ink-800 dark:hover:bg-white text-white dark:text-ink-900 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-400">
          Signed in as {me?.email ?? "-"}
        </p>
      </div>
    </div>
  );
}
