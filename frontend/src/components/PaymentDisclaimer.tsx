import { ShieldAlert } from "lucide-react";

/**
 * Legal disclaimer — payments are processed exclusively through Upwork.
 * Required per Anmol (meeting 2026-07-09): protects IFA from any claim
 * that money was taken "outside" the platform.
 *
 * Two variants:
 *   - subtle:    single line, sits inside a footer / support strip
 *   - prominent: full card, used on any page where quote / payment
 *                intent could plausibly form (Requests, T&C, dashboard)
 */
export default function PaymentDisclaimer({
  variant = "prominent",
  className = "",
}: {
  variant?: "subtle" | "prominent";
  className?: string;
}) {
  if (variant === "subtle") {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-ink-500 dark:text-ink-400 ${className}`}>
        <ShieldAlert size={10} className="text-amber-500" />
        Payments are processed exclusively through Upwork.
      </span>
    );
  }

  return (
    <div
      className={`flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-200 ${className}`}
      role="note"
    >
      <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div>
        <span className="font-semibold">Payments are processed exclusively through Upwork.</span>{" "}
        Insight Fusion Analytics does not accept payment through this platform. Any quote you accept here becomes payable via your Upwork contract with us.
      </div>
    </div>
  );
}
