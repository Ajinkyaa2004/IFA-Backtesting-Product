import { useEffect, useState } from "react";
import { AlertCircle, Cpu, Plus, Save, X } from "lucide-react";
import { Button } from "../../components/ui";
import {
  type Engagement,
  fetchClientEngagement,
  patchClientEngagement,
} from "../../lib/api";
import { toast } from "../../store/toast";

/**
 * The admin's engagement editor. Renders inside the client drawer above
 * the status/tier controls so the admin sees the engagement as the primary
 * object (per Chirag Section 9).
 *
 * Editable fields: scope in/out (chips), engine assignment + engine_id,
 * canonical strategy (deferred to Item #3 once we have the strategy
 * picker), deliverable, status. Tier stays on the client drawer to keep
 * the enforcement path unchanged.
 *
 * Scope edits explicitly warn the admin that saving will bump
 * scope_version and force every user under this client to re-ack. That's
 * the intentional friction — scope changes are a big deal.
 */

const ENGINE_LABEL: Record<Engagement["engine_assignment"], string> = {
  existing: "Existing — engine ready today",
  bespoke:  "Bespoke — engineer will build",
  manual:   "Manual — no engine, hand-uploaded deliveries",
};

export default function EngagementEditor({ clientId }: { clientId: string }) {
  const [eng, setEng] = useState<Engagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Draft state — edits stay client-side until Save.
  const [scopeIn, setScopeIn] = useState<string[]>([]);
  const [scopeOut, setScopeOut] = useState<string[]>([]);
  const [engineAssignment, setEngineAssignment] = useState<Engagement["engine_assignment"]>("manual");
  const [deliverable, setDeliverable] = useState("");
  const [status, setStatus] = useState<Engagement["status"]>("pending");
  const [newInItem, setNewInItem] = useState("");
  const [newOutItem, setNewOutItem] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchClientEngagement(clientId)
      .then((e) => {
        setEng(e);
        setScopeIn(e.scope_in);
        setScopeOut(e.scope_out);
        setEngineAssignment(e.engine_assignment);
        setDeliverable(e.deliverable);
        setStatus(e.status);
      })
      .catch(() => setEng(null))
      .finally(() => setLoading(false));
  }, [clientId]);

  const scopeChanged =
    JSON.stringify(scopeIn) !== JSON.stringify(eng?.scope_in ?? []) ||
    JSON.stringify(scopeOut) !== JSON.stringify(eng?.scope_out ?? []);
  const otherChanged =
    engineAssignment !== eng?.engine_assignment ||
    deliverable !== (eng?.deliverable ?? "") ||
    status !== eng?.status;
  const dirty = scopeChanged || otherChanged;

  const save = async () => {
    if (!eng) return;
    if (scopeChanged) {
      const proceed = confirm(
        "Saving scope changes will bump the engagement scope_version and force every user under this client to re-acknowledge on their next login. Proceed?"
      );
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const updated = await patchClientEngagement(clientId, {
        scope_in: scopeIn,
        scope_out: scopeOut,
        engine_assignment: engineAssignment,
        deliverable,
        status,
      });
      setEng(updated);
      toast.success(
        "Engagement saved",
        scopeChanged
          ? `Scope now at v${updated.scope_version} — all users will re-ack on next login.`
          : undefined
      );
    } catch (e: any) {
      toast.error("Save failed", e?.response?.data?.detail ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-xs text-ink-500">Loading engagement…</div>;
  if (!eng) return <div className="text-xs text-ink-500 italic">No engagement found.</div>;

  return (
    <div className="pt-2 border-t border-ink-100 dark:border-ink-800 space-y-3">
      <div className="text-xs font-medium text-ink-600 dark:text-ink-300 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">Engagement · <span className="font-mono">{eng.code}</span></span>
        <span className="text-[10px] text-ink-500">scope v{eng.scope_version}</span>
      </div>

      <FormRow label="Status">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Engagement["status"])}
          className="w-full h-8 px-2 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
        >
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
      </FormRow>

      <FormRow label="Deliverable">
        <textarea
          value={deliverable}
          onChange={(e) => setDeliverable(e.target.value)}
          rows={2}
          placeholder="One-line summary of what this client is buying."
          className="w-full px-2 py-1.5 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 resize-y"
        />
      </FormRow>

      <FormRow label={<span className="inline-flex items-center gap-1"><Cpu size={11}/> Engine assignment</span>}>
        <select
          value={engineAssignment}
          onChange={(e) => setEngineAssignment(e.target.value as Engagement["engine_assignment"])}
          className="w-full h-8 px-2 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
        >
          {(Object.keys(ENGINE_LABEL) as Engagement["engine_assignment"][]).map((k) => (
            <option key={k} value={k}>{ENGINE_LABEL[k]}</option>
          ))}
        </select>
        {engineAssignment === "existing" && !eng.engine_id && (
          <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
            <AlertCircle size={10}/> Engine picker lands with Chirag Item #3.
          </div>
        )}
      </FormRow>

      <ScopeChipsEditor
        title="In scope"
        items={scopeIn}
        setItems={setScopeIn}
        newItem={newInItem}
        setNewItem={setNewInItem}
      />
      <ScopeChipsEditor
        title="Out of scope"
        items={scopeOut}
        setItems={setScopeOut}
        newItem={newOutItem}
        setNewItem={setNewOutItem}
      />

      {scopeChanged && (
        <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-200 inline-flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0"/>
          Scope edited — saving will bump v{eng.scope_version} → v{eng.scope_version + 1} and force every user to re-acknowledge.
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="accent" icon={<Save size={13}/>} onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save engagement"}
        </Button>
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function ScopeChipsEditor({
  title,
  items,
  setItems,
  newItem,
  setNewItem,
}: {
  title: string;
  items: string[];
  setItems: (v: string[]) => void;
  newItem: string;
  setNewItem: (v: string) => void;
}) {
  const add = () => {
    const v = newItem.trim();
    if (!v) return;
    setItems([...items, v]);
    setNewItem("");
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">{title}</div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {items.length === 0 && (
          <span className="text-[11px] text-ink-400 italic">Nothing here yet.</span>
        )}
        {items.map((s, i) => (
          <span
            key={`${title}-${i}-${s}`}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-ink-100 dark:bg-ink-800 text-[11px] text-ink-700 dark:text-ink-200"
          >
            {s}
            <button
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="size-4 rounded-full hover:bg-ink-200 dark:hover:bg-ink-700 flex items-center justify-center"
              aria-label={`Remove ${s}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add a line, hit Enter"
          className="flex-1 h-7 px-2 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
        />
        <button
          onClick={add}
          disabled={!newItem.trim()}
          className="h-7 px-2 rounded-md border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800 text-[11px] font-medium disabled:opacity-40 inline-flex items-center gap-1"
        >
          <Plus size={11}/> Add
        </button>
      </div>
    </div>
  );
}
