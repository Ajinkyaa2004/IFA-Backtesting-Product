import { useEffect, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button, Card, SectionTitle } from "../../components/ui";
import { fetchAdminTerms, publishTerms } from "../../lib/api";

type Clause = { id: string; title: string; body: string; required: boolean };
type TermsRow = { id: string; version: string; body: string; clauses: Clause[]; effective_from: string };

export default function AdminTermsPage() {
  const [history, setHistory] = useState<TermsRow[]>([]);
  const [version, setVersion] = useState("");
  const [body, setBody] = useState("IFA Backtest Engine - Engagement Terms");
  const [clauses, setClauses] = useState<Clause[]>([
    { id: "c1", title: "", body: "", required: true },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () =>
    fetchAdminTerms()
      .then((rows: any) => setHistory(rows as TermsRow[]))
      .catch(() => setHistory([]));
  useEffect(() => { refresh(); }, []);

  const addClause = () =>
    setClauses([...clauses, { id: `c${clauses.length + 1}`, title: "", body: "", required: true }]);
  const removeClause = (idx: number) => setClauses(clauses.filter((_, i) => i !== idx));
  const updateClause = (idx: number, patch: Partial<Clause>) =>
    setClauses(clauses.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const publish = async () => {
    setSubmitting(true);
    setMsg(null);
    try {
      await publishTerms({ version, body, clauses });
      setMsg(`Published ${version}`);
      setVersion("");
      refresh();
    } catch (e: any) {
      setMsg(e?.response?.data?.detail ?? "Failed to publish");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Publishing a new version flags all clients as needing to re-accept on next login.">
          Publish new T&C version
        </SectionTitle>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Version</label>
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.1" className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Document title</label>
              <input value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300">Clauses</label>
              <Button size="sm" variant="ghost" icon={<Plus size={13}/>} onClick={addClause}>Add clause</Button>
            </div>
            <div className="space-y-2 mt-2">
              {clauses.map((c, i) => (
                <div key={i} className="border border-ink-200 dark:border-ink-700 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={c.id}
                      onChange={(e) => updateClause(i, { id: e.target.value })}
                      className="w-16 h-8 px-2 text-xs font-mono rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
                      placeholder="c1"
                    />
                    <input
                      value={c.title}
                      onChange={(e) => updateClause(i, { title: e.target.value })}
                      className="flex-1 h-8 px-2 text-sm rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
                      placeholder="Clause title"
                    />
                    <label className="text-[11px] inline-flex items-center gap-1">
                      <input type="checkbox" checked={c.required} onChange={(e) => updateClause(i, { required: e.target.checked })} className="size-3.5" />
                      required
                    </label>
                    <button onClick={() => removeClause(i)} className="size-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded flex items-center justify-center">
                      <Trash2 size={13}/>
                    </button>
                  </div>
                  <textarea
                    value={c.body}
                    onChange={(e) => updateClause(i, { body: e.target.value })}
                    className="w-full min-h-[60px] px-2 py-1.5 text-xs rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
                    placeholder="Clause body"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-emerald-600">{msg}</span>
            {/*
              Audit PF3: publishing a version with an empty title or body
              on any clause silently propagates a blank required clause
              and forces every client to re-accept nothing. Disable the
              button until every clause has both fields filled.
            */}
            <Button
              variant="accent"
              icon={<Send size={15}/>}
              onClick={publish}
              disabled={
                !version ||
                clauses.length === 0 ||
                clauses.some((c) => !c.title.trim() || !c.body.trim()) ||
                submitting
              }
            >
              {submitting ? "Publishing…" : "Publish version"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Most recent first">Version history</SectionTitle>
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {history.map((t) => (
            <li key={t.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium font-mono">{t.version}</div>
                <div className="text-xs text-ink-500">{t.clauses.length} clauses · effective {new Date(t.effective_from).toLocaleDateString()}</div>
              </div>
            </li>
          ))}
          {history.length === 0 && <li className="py-8 text-center text-sm text-ink-500">No versions yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
