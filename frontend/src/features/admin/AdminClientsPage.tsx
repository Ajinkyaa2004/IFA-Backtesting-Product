import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Download, FileText, LineChart, MessageSquare, Plus, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { Badge, Button, Card, Modal, SectionTitle } from "../../components/ui";
import {
  type AdminBacktestSummary,
  type AdminClient,
  type AdminStrategy,
  BACKTEST_STATUSES,
  type BacktestStatus,
  changeBacktestStatus,
  type ClientRequest,
  createAdminClient,
  deleteAdminClient,
  fetchAdminClients,
  fetchClientBacktests,
  fetchClientRequests,
  fetchClientStrategies,
  getStrategyDownloadUrl,
  startImpersonation,
  updateAdminClient,
} from "../../lib/api";
import { usePolling } from "../../lib/usePolling";
import { useImpersonate } from "../../store/impersonate";

export default function AdminClientsPage() {
  const [selected, setSelected] = useState<AdminClient | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const fetcher = useCallback(() => fetchAdminClients(), []);
  const { data, loading, refresh, lastUpdated } = usePolling<AdminClient[]>(fetcher, 15_000);
  const rows = data ?? [];
  const showSkeleton = loading && data === null;
  const showEmpty = !loading && data !== null && rows.length === 0;

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          sub={
            lastUpdated
              ? `Provision new clients, change tiers, suspend or soft-delete · auto-refreshes · last ${lastUpdated.toLocaleTimeString()}`
              : "Provision new clients, change tiers, suspend or soft-delete."
          }
          action={
            <div className="flex items-center gap-3">
              <button onClick={refresh} className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1">
                <RefreshCw size={12}/> Refresh
              </button>
              <Button variant="accent" icon={<Plus size={15}/>} onClick={() => setCreateOpen(true)}>New client</Button>
            </div>
          }
        >
          Clients
        </SectionTitle>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                <th className="text-left font-medium px-5 py-2.5">Name</th>
                <th className="text-left font-medium px-5 py-2.5">Primary contact</th>
                <th className="text-left font-medium px-5 py-2.5">Tier</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-left font-medium px-5 py-2.5">Joined</th>
                <th className="text-right font-medium px-5 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-ink-50/70 dark:hover:bg-ink-800/30 cursor-pointer" onClick={() => setSelected(c)}>
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-ink-600">{c.primary_contact ?? "—"}</td>
                  <td className="px-5 py-3 uppercase tracking-wider text-xs text-ink-500">{c.tier}</td>
                  <td className="px-5 py-3"><Badge status={c.status} dot>{c.status}</Badge></td>
                  <td className="px-5 py-3 text-ink-500 tabular">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(c); }}>Edit</Button>
                  </td>
                </tr>
              ))}
              {showSkeleton && [0, 1, 2].map((i) => (
                <tr key={`skel-${i}`} className="animate-pulse">
                  <td className="px-5 py-3"><div className="h-3 w-40 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-3 w-32 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-3 w-14 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"><div className="h-5 w-16 bg-ink-100 dark:bg-ink-800 rounded-full"/></td>
                  <td className="px-5 py-3"><div className="h-3 w-20 bg-ink-100 dark:bg-ink-800 rounded"/></td>
                  <td className="px-5 py-3"></td>
                </tr>
              ))}
              {showEmpty && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-500">No clients yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <ClientDrawer client={selected} onClose={() => { setSelected(null); refresh(); }} />}
      {createOpen && <CreateClientModal onClose={() => { setCreateOpen(false); refresh(); }} />}
    </div>
  );
}

function ClientDrawer({ client, onClose }: { client: AdminClient; onClose: () => void }) {
  const [tier, setTier] = useState<AdminClient["tier"]>(client.tier);
  const [status, setStatus] = useState<AdminClient["status"]>(client.status);
  const [vamEnabled, setVamEnabled] = useState<boolean>(client.vam_enabled);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<AdminStrategy[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [backtests, setBacktests] = useState<AdminBacktestSummary[]>([]);
  const [stratsLoading, setStratsLoading] = useState(true);
  const [reqsLoading, setReqsLoading] = useState(true);
  const [btsLoading, setBtsLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [statusPending, setStatusPending] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadBacktests = useCallback(() => {
    setBtsLoading(true);
    fetchClientBacktests(client.id)
      .then(setBacktests)
      .catch(() => setBacktests([]))
      .finally(() => setBtsLoading(false));
  }, [client.id]);

  useEffect(() => {
    setStratsLoading(true);
    fetchClientStrategies(client.id)
      .then(setStrategies)
      .catch(() => setStrategies([]))
      .finally(() => setStratsLoading(false));
    setReqsLoading(true);
    fetchClientRequests(client.id)
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setReqsLoading(false));
    loadBacktests();
  }, [client.id, loadBacktests]);

  const flipStatus = async (bt: AdminBacktestSummary, target: BacktestStatus) => {
    setStatusPending(bt.id);
    setStatusError(null);
    try {
      await changeBacktestStatus(bt.id, target);
      loadBacktests();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      // Backend returns a hint about illegal transitions — offer override
      if (typeof detail === "string" && detail.includes("Illegal transition")) {
        const proceed = confirm(`${detail}\n\nForce this change anyway?`);
        if (proceed) {
          try {
            await changeBacktestStatus(bt.id, target, { override: true });
            loadBacktests();
          } catch (e2: any) {
            setStatusError(e2?.response?.data?.detail ?? "Status change failed");
          }
        }
      } else {
        setStatusError(typeof detail === "string" ? detail : "Status change failed");
      }
    } finally {
      setStatusPending(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateAdminClient(client.id, { tier, status, vam_enabled: vamEnabled });
      setMsg("Saved");
      setTimeout(onClose, 600);
    } catch (e: any) {
      setMsg(e?.response?.data?.detail ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Soft-delete ${client.name}? Data retained 30 days.`)) return;
    await deleteAdminClient(client.id);
    onClose();
  };

  const openDownload = async (s: AdminStrategy) => {
    setDownloading(s.id);
    try {
      const url = await getStrategyDownloadUrl(s.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Failed to generate download link");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-ink-900 border-l border-ink-200 dark:border-ink-800 shadow-pop h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{client.name}</div>
            <div className="text-xs text-ink-500 font-mono">{client.id.slice(0, 8)}…</div>
          </div>
          <button onClick={onClose} className="size-8 rounded-md text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center">
            <X size={15}/>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as AdminClient["tier"])}
              className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
            >
              <option value="tier1">Tier 1 — Starter</option>
              <option value="tier2">Tier 2 — Growth</option>
              <option value="tier3">Tier 3 — Enterprise</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AdminClient["status"])}
              className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* VAM engine access — separate from tier so we can hand Enterprise
              features to a Starter client for a demo, or hold VAM back for a
              Growth client whose contract doesn't include it yet. */}
          <div>
            <label className="text-xs font-medium text-ink-600 dark:text-ink-300">VAM engine access</label>
            <div className="mt-1 flex items-center gap-3 p-2.5 rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950">
              <button
                type="button"
                onClick={() => setVamEnabled(!vamEnabled)}
                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                  vamEnabled ? "bg-emerald-500" : "bg-ink-300 dark:bg-ink-700"
                }`}
                aria-pressed={vamEnabled}
                aria-label="Toggle VAM engine access"
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
                    vamEnabled ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
              <div className="text-xs text-ink-500 dark:text-ink-400">
                {vamEnabled
                  ? "Client can run VAM backtests directly (subject to tier limits)."
                  : "Client sees VAM UI hidden. Only tier-based enforcement is skipped."}
              </div>
            </div>
          </div>

          {/* Requests submitted by this client */}
          <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
            <div className="text-xs font-medium text-ink-600 dark:text-ink-300 mb-2 flex items-center justify-between">
              <span>Requests</span>
              {requests.filter((r) => r.status === "open").length > 0 && (
                <span className="text-[10px] px-1.5 h-4 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 inline-flex items-center font-semibold">
                  {requests.filter((r) => r.status === "open").length} open
                </span>
              )}
            </div>
            {reqsLoading ? (
              <div className="text-xs text-ink-500">Loading…</div>
            ) : requests.length === 0 ? (
              <div className="text-xs text-ink-500 italic">No requests yet.</div>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {requests.map((r) => {
                  const summary = (r.payload.summary as string) || (r.payload.question as string) || (r.payload.details as string) || "(no summary)";
                  return (
                    <li key={r.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-ink-200 dark:border-ink-700">
                      <span className="size-8 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-500 shrink-0">
                        <MessageSquare size={14}/>
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium capitalize">{r.type.replace("_", " ")}</span>
                          <Badge status={r.status} dot>{r.status.replace("_", " ")}</Badge>
                        </div>
                        <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 break-words">{summary.slice(0, 200)}</div>
                        <div className="text-[10px] text-ink-400 tabular mt-1">{new Date(r.submitted_at).toLocaleString()}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Strategies submitted by this client */}
          <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
            <div className="text-xs font-medium text-ink-600 dark:text-ink-300 mb-2">
              Strategy documents
            </div>
            {stratsLoading ? (
              <div className="text-xs text-ink-500">Loading…</div>
            ) : strategies.length === 0 ? (
              <div className="text-xs text-ink-500 italic">No strategies uploaded yet.</div>
            ) : (
              <ul className="space-y-2">
                {strategies.map((s) => (
                  <li key={s.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800/30">
                    <span className="size-8 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-500 shrink-0">
                      <FileText size={14}/>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{s.name}</span>
                        {s.is_source_of_truth && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-accent-700 dark:text-accent-300">
                            <BadgeCheck size={11}/> SoT
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-500 tabular">
                        v{s.version} · {s.size_bytes ? `${(s.size_bytes / 1024).toFixed(0)} KB` : "—"} · {new Date(s.uploaded_at).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-ink-400 font-mono truncate" title={s.checksum ?? ""}>
                        {s.checksum ? `sha256:${s.checksum.slice(0, 16)}…` : "checksum pending"}
                      </div>
                    </div>
                    <button
                      onClick={() => openDownload(s)}
                      disabled={downloading === s.id || s.status !== "active"}
                      className="shrink-0 text-xs font-medium text-accent-700 dark:text-accent-300 hover:underline disabled:opacity-40 disabled:no-underline inline-flex items-center gap-1"
                    >
                      <Download size={12}/>
                      {downloading === s.id ? "Opening…" : "Open"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Backtests submitted for this client + per-row status dropdown */}
          <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
            <div className="text-xs font-medium text-ink-600 dark:text-ink-300 mb-2 flex items-center justify-between">
              <span>Backtests</span>
              {backtests.filter((b) => b.status === "completed").length > 0 && (
                <span className="text-[10px] px-1.5 h-4 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 inline-flex items-center font-semibold">
                  {backtests.filter((b) => b.status === "completed").length} completed
                </span>
              )}
            </div>
            {btsLoading ? (
              <div className="text-xs text-ink-500">Loading…</div>
            ) : backtests.length === 0 ? (
              <div className="text-xs text-ink-500 italic">No backtests yet.</div>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {backtests.map((b) => (
                  <li key={b.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-ink-200 dark:border-ink-700">
                    <span className="size-8 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-500 shrink-0">
                      <LineChart size={14}/>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{b.name}</div>
                      <div className="text-[11px] text-ink-500 tabular">
                        {b.code} · {b.engine} · {new Date(b.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <select
                      value={b.status}
                      disabled={statusPending === b.id}
                      onChange={(e) => flipStatus(b, e.target.value as BacktestStatus)}
                      className="text-xs h-7 px-2 rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 shrink-0"
                      title="Change status"
                    >
                      {BACKTEST_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
            {statusError && (
              <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-2 py-1">
                {statusError}
              </div>
            )}
          </div>

          <ImpersonateCta client={client} onDone={onClose} />

          <div className="pt-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between">
            <Button variant="danger" icon={<Trash2 size={14}/>} onClick={remove}>Soft delete</Button>
            <div className="flex items-center gap-3">
              {msg && <span className="text-xs text-emerald-600">{msg}</span>}
              <Button variant="accent" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImpersonateCta({ client, onDone }: { client: AdminClient; onDone: () => void }) {
  const start = useImpersonate((s) => s.start);
  const active = useImpersonate((s) => s.active);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  const impersonate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const resp = await startImpersonation(client.id);
      start({
        clientId: resp.client_id,
        clientName: resp.client_name,
        tier: resp.tier,
        startedAt: resp.started_at,
      });
      onDone();
      // Land on the client dashboard so the admin sees exactly what the
      // client sees. Red banner at the top prevents any confusion.
      nav("/");
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Impersonation failed");
    } finally {
      setBusy(false);
    }
  };

  const isThisClient = active?.clientId === client.id;
  return (
    <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
      <div className="text-xs font-medium text-ink-600 dark:text-ink-300 mb-2">Support tools</div>
      <div className="p-2.5 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50/40 dark:bg-red-500/5">
        <div className="flex items-start gap-2.5">
          <span className="size-8 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0">
            <UserRound size={14}/>
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink-900 dark:text-ink-50">
              View as {client.name}
            </div>
            <div className="text-[11px] text-ink-500 dark:text-ink-400 mt-0.5">
              Loads their dashboard so you can reproduce what they're seeing.
              Read-only — every write is blocked. Audit-logged.
            </div>
          </div>
          <button
            onClick={impersonate}
            disabled={busy || isThisClient}
            className="shrink-0 h-7 px-3 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold"
          >
            {busy ? "Starting…" : isThisClient ? "Active" : "Impersonate"}
          </button>
        </div>
        {err && <div className="mt-2 text-[11px] text-red-700 dark:text-red-300">{err}</div>}
      </div>
    </div>
  );
}

function CreateClientModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [tier, setTier] = useState<AdminClient["tier"]>("tier1");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await createAdminClient({
        name,
        primary_contact: contact,
        tier,
        user_email: email,
        user_password: password,
      });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New client"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <span className="text-xs text-red-600 mr-auto">{error}</span>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={submit} disabled={!name || !email || !password || submitting}>
            {submitting ? "Creating…" : "Create client"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client name" full>
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950" placeholder="e.g. Northbridge Asset Mgmt." />
        </Field>
        <Field label="Primary contact">
          <input value={contact} onChange={(e) => setContact(e.target.value)} className="h-9 w-full px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950" placeholder="Person of contact" />
        </Field>
        <Field label="Tier">
          <select value={tier} onChange={(e) => setTier(e.target.value as AdminClient["tier"])} className="h-9 w-full px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950">
            <option value="tier1">Tier 1 — Starter</option>
            <option value="tier2">Tier 2 — Growth</option>
            <option value="tier3">Tier 3 — Enterprise</option>
          </select>
        </Field>
        <Field label="User email" full>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="h-9 w-full px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950" placeholder="login@client.com" />
        </Field>
        <Field label="Initial password" full>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="text" className="h-9 w-full px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950" placeholder="Share with client out-of-band" />
        </Field>
      </div>
    </Modal>
  );
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-xs font-medium text-ink-600 dark:text-ink-300">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
