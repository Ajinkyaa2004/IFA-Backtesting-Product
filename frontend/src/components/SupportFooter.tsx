import { Clock, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../store/auth";
import { useContent } from "../store/content";

/**
 * Persistent footer on the client-facing layout. Communicates support
 * hours, first-response SLA (tier-based), and how to reach us. Sits
 * below the main content, doesn't stick to the viewport.
 *
 * SLA number reads from the tier config in /me — same source as the
 * TierCard's SLA badge, so it stays consistent if we tune numbers later.
 */
export default function SupportFooter() {
  const me = useAuth((s) => s.me);
  const footer = useContent((s) => s.content.support_footer);
  const sectionsVisible = useContent((s) => s.content.sections.support_footer);
  const sla = me?.client?.tier_usage?.support_response_hours ?? 24;
  const tierLabel = me?.client?.tier_usage?.tier_label ?? "Starter";

  if (!sectionsVisible) return null;

  return (
    <footer className="mt-8 border-t border-ink-100 dark:border-ink-800 pt-5 pb-3">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-500 dark:text-ink-400">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={12} className="text-ink-400 dark:text-ink-500"/>
          Support hours: <span className="font-medium text-ink-700 dark:text-ink-200">{footer.hours}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={12} className="text-ink-400 dark:text-ink-500"/>
          Your first-response SLA on {tierLabel}: <span className="font-medium text-ink-700 dark:text-ink-200">{sla}h</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Mail size={12} className="text-ink-400 dark:text-ink-500"/>
          <a
            href={`mailto:${footer.email}`}
            className="font-medium text-accent-700 dark:text-accent-300 hover:underline"
          >
            {footer.email}
          </a>
        </span>
        <span className="ml-auto text-[10px] text-ink-400 dark:text-ink-500">
          {footer.copyright}
        </span>
      </div>
    </footer>
  );
}
