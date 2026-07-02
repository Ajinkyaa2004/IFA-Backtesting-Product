import { useCallback, useEffect, useState } from "react";
import { AlertCircle, BadgeCheck, ChevronRight, Cpu, Loader, Plus, ShieldCheck, X } from "lucide-react";
import { Button, Card, Modal, SectionTitle } from "../../components/ui";
import {
  createEngine,
  type Engine,
  type EngineStatus,
  fetchEngines,
  markEngineIsolationPassed,
  patchEngine,
  transitionEngineStatus,
} from "../../lib/api";
import { toast } from "../../store/toast";

/**
 * Engine registry (Chirag #3). Admin sees every engine in the platform,
 * their status, owner, family, and isolation state. Create a new engine
 * inline. Click a row to open the detail drawer where the admin can:
 *   * edit metadata
 *   * mark the isolation harness passed (Chirag #6)
 *   * transition status through the lifecycle
 *
 * Status transitions are gated:
 *   dev → isolation_pending → live → retired
 * with the hard block: cannot reach 'live' without isolation_passed_at.
 */

const STATUS_STYLES: Record<EngineStatus, string> = {
  dev:                "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
  isolation_pending:  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  live:               "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  retired:            "bg-ink-200 text-ink-500 dark:bg-ink-800 dark:text-ink-500",
};

const STATUS_ICON: Record<EngineStatus, React.ReactNode> = {
  dev:                <Cpu size={11}/>,
  isolation_pending:  <Loader size={11} className="animate-spin"/>,
  live:               <BadgeCheck size={11}/>,
  retired:            <X size={11}/>,
};

export default function AdminEnginesPage() {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Engine | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchEngines()
      .then(setEngines)
      .catch(() => setEngines([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          sub="Every bespoke or existing engine we assign to a client engagement lives here. Status controls the lifecycle stepper and gates the tuning surface."
          action={
            <div className="flex items-center gap-2">
              <Button variant="accent" icon={<Plus size={15}/>} onClick={() => setCreateOpen(true)}>
                New engine
              </Button>
            </div>
          }
        >
          Engine registry
        </SectionTitle>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                <th className="text-left font-medium px-5 py-2.5">Code</th>
                <th className="text-left font-medium px-5 py-2.5">Name</th>
                <th className="text-left font-medium px-5 py-2.5">Family</th>
                <th className="text-left font-medium px-5 py-2.5">Owner</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-left font-medium px-5 py-2.5">Isolation</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {engines.map((e) => (
                <tr key={e.id} onClick={() => setSelected(e)} className="hover:bg-ink-50/70 dark:hover:bg-ink-800/30 cursor-pointer">
                  <td className="px-5 py-3 font-mono text-xs">{e.code}</td>
                  <td className="px-5 py-3 font-medium">{e.name}</td>
                  <td className="px-5 py-3 text-ink-500 text-xs">{e.strategy_family}</td>
                  <td className="px-5 py-3 text-ink-500 text-xs">{e.owner_email}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[e.status]}`}>
                      {STATUS_ICON[e.status]}{e.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {e.isolation_passed_at ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck size={11}/>
                        {new Date(e.isolation_passed_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertCircle size={11}/>
                        Not yet
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-400"><ChevronRight size={14}/></td>
                </tr>
              ))}
              {!loading && engines.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-ink-500">No engines yet.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-ink-500">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <EngineDrawer engine={selected} onClose={() => { setSelected(null); refresh(); }} />}
      {createOpen && <CreateEngineModal onClose={() => { setCreateOpen(false); refresh(); }} />}
    </div>
  );
}

// ─── Detail drawer ──────────────────────────────────────────────────────
function EngineDrawer({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const [e, setE] = useState<Engine>(engine);
  const [name, setName] = useState(engine.name);
  const [ownerEmail, setOwnerEmail] = useState(engine.owner_email);
  const [family, setFamily] = useState(engine.strategy_family);
  const [covers, setCovers] = useState(engine.covers);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== e.name || ownerEmail !== e.owner_email || family !== e.strategy_family || covers !== e.covers;

  const saveMeta = async () => {
    setSaving(true);
    try {
      const next = await patchEngine(e.id, { name, owner_email: ownerEmail, strategy_family: family, covers });
      setE(next);
      toast.success("Engine updated");
    } catch (err: any) {
      toast.error("Save failed", err?.response?.data?.detail);
    } finally { setSaving(false); }
  };

  const [isoOpen, setIsoOpen] = useState(false);
  const [isoNotes, setIsoNotes] = useState(e.isolation_notes || "");

  const markIsolationPass = async () => {
    if (!isoNotes.trim()) return toast.error("Notes required", "Describe what tests passed.");
    setSaving(true);
    try {
      const next = await markEngineIsolationPassed(e.id, isoNotes);
      setE(next);
      setIsoOpen(false);
      toast.success("Isolation recorded", "This engine can now transition to live.");
    } catch (err: any) { toast.error("Failed", err?.response?.data?.detail); }
    finally { setSaving(false); }
  };

  const transition = async (target: EngineStatus) => {
    setSaving(true);
    try {
      const next = await transitionEngineStatus(e.id, target);
      setE(next);
      toast.success(`Status → ${target.replace("_", " ")}`);
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      toast.error("Transition blocked", typeof d === "string" ? d : "See detail.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-ink-900 border-l border-ink-200 dark:border-ink-800 shadow-pop h-full overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
        <div className="px-6 py-4 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold font-mono">{e.code}</div>
            <div className="text-xs text-ink-500">{e.strategy_family}</div>
          </div>
          <button onClick={onClose} className="size-8 rounded-md text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center">
            <X size={15}/>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status controls */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-1.5">Status</div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold uppercase ${STATUS_STYLES[e.status]}`}>
                {STATUS_ICON[e.status]}{e.status.replace("_", " ")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["dev","isolation_pending","live","retired"] as EngineStatus[]).filter(s => s !== e.status).map(s => (
                <button
                  key={s}
                  onClick={() => transition(s)}
                  disabled={saving}
                  className="h-7 px-2.5 rounded-md border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800 text-[11px] font-medium disabled:opacity-50"
                >
                  → {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Isolation gate */}
          <div className="p-3 rounded-lg border border-ink-200 dark:border-ink-700">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck size={14} className={e.isolation_passed_at ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}/>
              <span className="text-sm font-medium">Isolation harness</span>
            </div>
            {e.isolation_passed_at ? (
              <>
                <div className="text-[11px] text-ink-500">Passed on {new Date(e.isolation_passed_at).toLocaleString()}.</div>
                <details className="mt-2 text-[11px]">
                  <summary className="cursor-pointer text-ink-500 hover:text-ink-900 dark:hover:text-ink-100">Show notes</summary>
                  <div className="mt-1 p-2 rounded bg-ink-50 dark:bg-ink-950/60 text-ink-600 dark:text-ink-300 whitespace-pre-wrap">{e.isolation_notes}</div>
                </details>
                <button onClick={() => setIsoOpen(true)} className="mt-2 text-[11px] text-accent-700 dark:text-accent-300 hover:underline">Re-record</button>
              </>
            ) : (
              <>
                <div className="text-[11px] text-ink-500">Not yet passed. Engine cannot go live until you record this.</div>
                <button onClick={() => setIsoOpen(true)} className="mt-2 h-7 px-2.5 rounded-md bg-accent-600 hover:bg-accent-700 text-white text-[11px] font-semibold">
                  Record isolation pass
                </button>
              </>
            )}
          </div>

          <hr className="border-ink-100 dark:border-ink-800"/>

          <FormField label="Name">
            <input value={name} onChange={(ev) => setName(ev.target.value)} className="w-full h-8 px-2 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"/>
          </FormField>
          <FormField label="Owner (engineer email)">
            <input value={ownerEmail} onChange={(ev) => setOwnerEmail(ev.target.value)} className="w-full h-8 px-2 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"/>
          </FormField>
          <FormField label="Strategy family">
            <input value={family} onChange={(ev) => setFamily(ev.target.value)} className="w-full h-8 px-2 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"/>
          </FormField>
          <FormField label="Covers (scope description)">
            <textarea value={covers} onChange={(ev) => setCovers(ev.target.value)} rows={3} className="w-full px-2 py-1.5 text-sm rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 resize-y"/>
          </FormField>

          <div className="flex justify-end">
            <Button variant="accent" onClick={saveMeta} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>

          {/* Param schema preview */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-1.5">Parameter schema</div>
            <pre className="p-3 rounded-md bg-ink-50 dark:bg-ink-950/60 text-[10px] font-mono text-ink-600 dark:text-ink-300 overflow-x-auto max-h-40 overflow-y-auto">
              {JSON.stringify(e.param_schema, null, 2)}
            </pre>
            <div className="text-[10px] text-ink-500 mt-1 italic">
              Chirag Section 3.3 · consumed by the schema-driven form renderer (Item #4). Edit via PATCH engine param_schema.
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={isoOpen}
        onClose={() => setIsoOpen(false)}
        title="Record isolation harness pass"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsoOpen(false)}>Cancel</Button>
            <Button variant="accent" onClick={markIsolationPass} disabled={saving || !isoNotes.trim()}>{saving ? "Recording…" : "Record"}</Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300 mb-3">
          Describe which tests passed. This is stored on the engine row and audit-logged.
          The engine can transition to <b>live</b> only after this pass is recorded.
        </p>
        <textarea
          value={isoNotes}
          onChange={(ev) => setIsoNotes(ev.target.value)}
          rows={6}
          className="w-full px-3 py-2 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 resize-y font-mono text-xs"
          placeholder="e.g.\n1. Confirmed no writes outside tenant scope\n2. Confirmed no cross-tenant reads\n3. Verified deterministic reruns on frozen seed data"
        />
      </Modal>
    </div>
  );
}

function CreateEngineModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [family, setFamily] = useState("");
  const [covers, setCovers] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!code || !name || !owner || !family) return;
    setBusy(true);
    try {
      await createEngine({ code, name, owner_email: owner, strategy_family: family, covers });
      toast.success("Engine created", `${code} · status: dev`);
      onClose();
    } catch (e: any) {
      toast.error("Create failed", e?.response?.data?.detail);
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New engine"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={create} disabled={busy || !code || !name || !owner || !family}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <FormField label="Code (e.g. ENG-EMARSI-001)">
          <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 font-mono"/>
        </FormField>
        <FormField label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"/>
        </FormField>
        <FormField label="Owner (engineer email)">
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. ravi@ifa.com" className="w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"/>
        </FormField>
        <FormField label="Strategy family (e.g. ema_cross_rsi)">
          <input value={family} onChange={(e) => setFamily(e.target.value)} className="w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 font-mono"/>
        </FormField>
        <FormField label="Covers (scope description)">
          <textarea value={covers} onChange={(e) => setCovers(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 resize-y"/>
        </FormField>
        <p className="text-[11px] text-ink-500">Status starts as <b>dev</b>. Add the param schema after creating via the drawer.</p>
      </div>
    </Modal>
  );
}

function FormField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">{label}</div>
      {children}
    </div>
  );
}
