import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { CheckCircle2, MailCheck } from "lucide-react";
import { auth } from "../../lib/firebase";
import { Button, Modal } from "../../components/ui";

/**
 * Forgot-password flow — Firebase's native passwordReset flow.
 *
 * We deliberately show the SAME success screen whether or not the address
 * exists in Firebase, so an attacker probing the login page can't
 * enumerate valid emails.
 */
export default function ForgotPasswordModal({
  open,
  onClose,
  initialEmail = "",
}: {
  open: boolean;
  onClose: () => void;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail(initialEmail);
    setBusy(false);
    setSent(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const send = async () => {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (e: any) {
      // Only expose "invalid-email" as a form error — every other error
      // (user-not-found included) shows the neutral success screen so we
      // don't enable email enumeration.
      if (e?.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        // Silently succeed to prevent enumeration.
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={sent ? "Check your inbox" : "Reset your password"}
      size="sm"
      footer={
        sent ? (
          <Button variant="accent" onClick={close}>
            Got it
          </Button>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="accent" onClick={send} disabled={!email || busy} icon={<MailCheck size={14} />}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </div>
        )
      }
    >
      {sent ? (
        <div className="text-center py-4">
          <div className="mx-auto size-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
            <CheckCircle2 size={20} />
          </div>
          <p className="text-sm text-ink-700 dark:text-ink-200">
            If <span className="font-semibold">{email}</span> is on our system,
            we've sent a password-reset link.
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-2">
            Check your inbox (and spam folder). The link expires in an hour.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-600 dark:text-ink-300 mb-4">
            Enter the email address you use to sign in. We'll send you a link
            to set a new password.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full h-10 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
            />
          </label>
          {error && (
            <div className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
