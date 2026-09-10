/**
 * Admin — Pending Signups queue.
 *
 * Lists every user with signup_status='pending_approval'. Admin picks one,
 * fills in tier + engagement type + company name, and clicks Approve or
 * Reject. Backend creates the Client + Engagement rows and emails the client.
 *
 * Approvals + rejections are per-signup — no bulk operations, on purpose:
 * each signup is a business decision that deserves a look.
 */

import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  HelpCircle,
  Layers,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  User as UserIcon,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Modal, SectionTitle } from "../../components/ui";
import {
  adminApproveSignup,
  adminListSignups,
  adminRejectSignup,
  type PendingSignup,
} from "../../lib/api";
import { toast } from "../../store/toast";

type TabKey = "pending_approval" | "approved" | "rejected";

const TABS: { key: TabKey; label: string; tone: string }[] = [
  { key: "pending_approval", label: "Pending", tone: "text-amber-600 dark:text-amber-400" },
  { key: "approved", label: "Approved", tone: "text-emerald-600 dark:text-emerald-400" },
  { key: "rejected", label: "Rejected", tone: "text-red-600 dark:text-red-400" },
];

const TIER_OPTIONS = [
  { value: "tier1", label: "Tier 1 - Starter" },
  { value: "tier2", label: "Tier 2 - Growth" },
  { value: "tier3", label: "Tier 3 - Enterprise" },
] as const;

const ENGAGEMENT_TYPES = [
  { value: "manual", label: "Manual - hand-uploaded backtests" },
  { value: "existing", label: "Existing - reuse a live engine (e.g. VAM)" },
  { value: "bespoke", label: "Bespoke - build a new engine" },
] as const;

/**
 * Native relative-time formatter — no dependency needed. Same output shape
 * as date-fns' formatDistanceToNow (e.g. "3 minutes ago", "yesterday").
 */
function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const seconds = Math.round((now - then) / 1000);
  if (Number.isNaN(seconds)) return "-";
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return `${minutes} minutes ago`;
  if (minutes < 90) return "an hour ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  if (hours < 42) return "yesterday";
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} days ago`;
  if (days < 45) return "a month ago";
  const months = Math.round(days / 30);
  if (months < 12) return `${months} months ago`;
  const years = Math.round(months / 12);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

export default function AdminSignupsPage() {
  const [tab, setTab] = useState<TabKey>("pending_approval");
  const [rows, setRows] = useState<PendingSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingSignup | null>(null);
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListSignups(tab);
      setRows(data);
    } catch (e) {
      toast.error("Load failed", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const counts = useMemo(
    () => ({
      pending: tab === "pending_approval" ? rows.length : "-",
    }),
    [rows, tab],
  );

  return (
    <div className="space-y-5">
      <SectionTitle
        sub="Clients who registered themselves and are waiting on your review."
        action={
          <button
            onClick={refresh}
            className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        }
      >
        Signup requests
      </SectionTitle>

      <div className="flex items-center gap-2 border-b border-ink-100 dark:border-ink-800">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? `${t.tone} border-current`
                  : "text-ink-500 hover:text-ink-800 dark:hover:text-ink-200 border-transparent"
              }`}
            >
              {t.label}
              {active && tab === "pending_approval" && (
                <span className="ml-2 inline-flex items-center px-1.5 h-4 rounded-full bg-amber-500/15 text-[10px] font-semibold">
                  {counts.pending}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-ink-500">Loading signups…</div>
      ) : rows.length === 0 ? (
        <Card className="text-center py-10 text-sm text-ink-500">
          {tab === "pending_approval" ? (
            <>
              <BadgeCheck className="mx-auto mb-2 text-emerald-500" size={28} />
              No pending signups. You're all caught up.
            </>
          ) : (
            <>No {tab.replace("_", " ")} signups yet.</>
          )}
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <SignupRow
              key={row.id}
              row={row}
              onApprove={() => {
                setSelected(row);
                setMode("approve");
              }}
              onReject={() => {
                setSelected(row);
                setMode("reject");
              }}
            />
          ))}
        </div>
      )}

      {selected && mode === "approve" && (
        <ApproveModal
          signup={selected}
          onClose={() => {
            setSelected(null);
            setMode(null);
          }}
          onDone={() => {
            setSelected(null);
            setMode(null);
            refresh();
          }}
        />
      )}
      {selected && mode === "reject" && (
        <RejectModal
          signup={selected}
          onClose={() => {
            setSelected(null);
            setMode(null);
          }}
          onDone={() => {
            setSelected(null);
            setMode(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function SignupRow({
  row,
  onApprove,
  onReject,
}: {
  row: PendingSignup;
  onApprove: () => void;
  onReject: () => void;
}) {
  const meta = row.metadata ?? {};
  const requestedAgo = row.signup_requested_at
    ? formatRelative(row.signup_requested_at)
    : "-";
  const isPending = row.signup_status === "pending_approval";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="size-8 rounded-full bg-accent-500/10 text-accent-700 dark:text-accent-300 flex items-center justify-center text-xs font-semibold">
              {(meta.name || row.email)[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink-900 dark:text-ink-100 truncate">
                {meta.name || row.email}
              </div>
              <div className="text-[11px] text-ink-500 flex items-center gap-1">
                <Mail size={10} /> {row.email}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
            <MetaItem icon={<Building2 size={11} />} label="Company" value={meta.company || "-"} />
            <MetaItem icon={<Phone size={11} />} label="Phone" value={meta.phone || "-"} />
            <MetaItem
              icon={<HelpCircle size={11} />}
              label="Purpose"
              value={meta.purpose || "-"}
              span2
            />
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-500">
            <span>Requested {requestedAgo}</span>
            {row.signup_status === "approved" && (
              <Badge status="approved">
                <BadgeCheck size={10} className="inline mr-0.5" /> Approved
              </Badge>
            )}
            {row.signup_status === "rejected" && (
              <Badge status="cancelled">
                <XCircle size={10} className="inline mr-0.5" /> Rejected
              </Badge>
            )}
          </div>

          {row.signup_status === "rejected" && row.signup_rejection_reason && (
            <div className="mt-2 text-[11px] px-2.5 py-1.5 rounded-md bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-400">
              <span className="font-semibold">Reason:</span> {row.signup_rejection_reason}
            </div>
          )}
        </div>

        {isPending && (
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              icon={<XCircle size={12} />}
              onClick={onReject}
            >
              Reject
            </Button>
            <Button size="sm" variant="accent" icon={<CheckCircle2 size={12} />} onClick={onApprove}>
              Approve
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function MetaItem({
  icon,
  label,
  value,
  span2,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "sm:col-span-2" : ""}>
      <span className="inline-flex items-center gap-1 text-ink-500">
        {icon} {label}
      </span>
      <span className="ml-1.5 text-ink-800 dark:text-ink-100 font-medium">{value}</span>
    </div>
  );
}

function ApproveModal({
  signup,
  onClose,
  onDone,
}: {
  signup: PendingSignup;
  onClose: () => void;
  onDone: () => void;
}) {
  const meta = signup.metadata ?? {};
  const [tier, setTier] = useState<"tier1" | "tier2" | "tier3">("tier2");
  const [engagementType, setEngagementType] = useState<"manual" | "existing" | "bespoke">("manual");
  const [companyName, setCompanyName] = useState(meta.company || "");
  const [whatsappLink, setWhatsappLink] = useState("");
  const [deliverable, setDeliverable] = useState(
    "One backtest + tunable rerun once engine reaches live",
  );
  const [saving, setSaving] = useState(false);

  const canSave = companyName.trim().length > 0 && !saving;

  const submit = async () => {
    setSaving(true);
    try {
      await adminApproveSignup(signup.id, {
        tier,
        engagement_type: engagementType,
        deliverable: deliverable.trim(),
        company_name: companyName.trim(),
        whatsapp_group_link: whatsappLink.trim() || null,
      });
      toast.success("Signup approved", `${meta.name || signup.email} is now active.`);
      onDone();
    } catch (e: any) {
      toast.error("Approval failed", e?.response?.data?.detail ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Approve ${meta.name || signup.email}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} disabled={!canSave} icon={<CheckCircle2 size={14} />}>
            {saving ? "Approving…" : "Approve & create engagement"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <p className="text-xs text-ink-500">
          Approving creates a Client row + Engagement, links this user to it,
          and emails them at <span className="font-medium">{signup.email}</span>.
        </p>

        <div>
          <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
            <Building2 size={12} /> Company name
          </label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 w-full h-9 px-2.5 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
            placeholder="Company name"
          />
          <div className="mt-1 text-[10.5px] text-ink-500">
            Pre-filled from signup; edit if it needs a friendlier form.
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
            <UserIcon size={12} /> Tier
          </label>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as any)}
            className="mt-1 w-full h-9 px-2 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
          >
            {TIER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
            <Layers size={12} /> Engagement type
          </label>
          <select
            value={engagementType}
            onChange={(e) => setEngagementType(e.target.value as any)}
            className="mt-1 w-full h-9 px-2 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
          >
            {ENGAGEMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Deliverable</label>
          <input
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            className="mt-1 w-full h-9 px-2.5 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
          />
          <div className="mt-1 text-[10.5px] text-ink-500">
            One-liner shown on client's scope panel. Editable later from the client drawer.
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
            <MessageSquare size={12} /> WhatsApp group (optional)
          </label>
          <input
            value={whatsappLink}
            onChange={(e) => setWhatsappLink(e.target.value)}
            className="mt-1 w-full h-9 px-2.5 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
            placeholder="https://chat.whatsapp.com/…"
          />
        </div>
      </div>
    </Modal>
  );
}

function RejectModal({
  signup,
  onClose,
  onDone,
}: {
  signup: PendingSignup;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = reason.trim().length >= 3 && !saving;

  const submit = async () => {
    setSaving(true);
    try {
      await adminRejectSignup(signup.id, reason.trim());
      toast.success("Signup rejected", "The client has been notified.");
      onDone();
    } catch (e: any) {
      toast.error("Rejection failed", e?.response?.data?.detail ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${signup.metadata?.name || signup.email}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={!canSave} icon={<XCircle size={14} />}>
            {saving ? "Rejecting…" : "Reject & notify"}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-ink-500 mb-3">
        The reason is visible to the client on their /rejected screen and included in the
        rejection email. Be specific - vague rejections cause reply-back questions.
      </p>
      <label className="text-xs font-medium text-ink-600 dark:text-ink-300">
        Reason for rejection
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        className="mt-1 w-full px-2.5 py-2 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 resize-y"
        placeholder="e.g. Your requested engagement type is outside the scope of services we currently offer…"
      />
    </Modal>
  );
}
