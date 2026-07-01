import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Eye, Info, MonitorSmartphone, RotateCcw, Save } from "lucide-react";
import { Button, Card, SectionTitle } from "../../components/ui";
import {
  fetchAdminContent,
  patchAdminContent,
  resetAdminContent,
} from "../../lib/api";
import { CONTENT_DEFAULTS, type ContentDoc } from "../../lib/contentDefaults";
import { toast } from "../../store/toast";

/**
 * Admin content editor.
 *
 * Split-screen: form on the left, iframe preview on the right. Every keystroke
 * posts the current draft to the iframe via postMessage; the iframe's
 * useContent store (in ?admin-preview=1 mode) applies the patch live without
 * hitting the backend. When the admin clicks Save on a category, we PATCH
 * that category's value and the live client dashboard picks it up on next load.
 */

const CATEGORIES = [
  { key: "welcome",           label: "Welcome banner" },
  { key: "tier_card",         label: "Tier card" },
  { key: "onboarding",        label: "Onboarding checklist" },
  { key: "placeholder_tiles", label: "Coming-soon tiles" },
  { key: "support_footer",    label: "Support footer" },
  { key: "announcement",      label: "Announcement banner" },
  { key: "sections",          label: "Section visibility" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export default function AdminContentPage() {
  const [draft, setDraft] = useState<ContentDoc>(CONTENT_DEFAULTS);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CategoryKey>("welcome");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeReady = useRef(false);

  // Load initial state
  useEffect(() => {
    fetchAdminContent()
      .then((r) => {
        setDraft(r.content as unknown as ContentDoc);
        setOverrides(new Set(r.overridden_keys));
      })
      .catch(() => toast.error("Failed to load content settings"))
      .finally(() => setLoading(false));
  }, []);

  // Push draft to iframe whenever it changes (and iframe is ready).
  const pushToPreview = useCallback((payload: Partial<ContentDoc>) => {
    if (!iframeReady.current || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "ifa-content-preview", content: payload },
      "*",
    );
  }, []);

  useEffect(() => {
    pushToPreview(draft);
  }, [draft, pushToPreview]);

  // Wait for the iframe to signal it's ready + listen for that ping.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "ifa-content-preview-ready") {
        iframeReady.current = true;
        pushToPreview(draft);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [draft, pushToPreview]);

  const updateDraft = <K extends keyof ContentDoc>(key: K, value: ContentDoc[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = async (key: CategoryKey) => {
    setSavingKey(key);
    try {
      await patchAdminContent(key, draft[key] as Record<string, unknown>);
      setOverrides((prev) => new Set([...prev, key]));
      toast.success(`Saved · ${CATEGORIES.find((c) => c.key === key)?.label}`, "Live clients will see the change on next page load.");
    } catch (e: any) {
      toast.error("Save failed", e?.response?.data?.detail ?? "Unknown error");
    } finally {
      setSavingKey(null);
    }
  };

  const reset = async (key: CategoryKey) => {
    if (!confirm(`Reset "${CATEGORIES.find((c) => c.key === key)?.label}" to the built-in defaults? This drops your admin overrides.`)) return;
    setSavingKey(key);
    try {
      await resetAdminContent(key);
      // Re-fetch to see the merged default
      const r = await fetchAdminContent();
      setDraft(r.content as unknown as ContentDoc);
      setOverrides(new Set(r.overridden_keys));
      toast.success("Reset to defaults");
    } catch (e: any) {
      toast.error("Reset failed", e?.response?.data?.detail);
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <div className="p-6 text-sm text-ink-500">Loading content settings…</div>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_620px] gap-6">
      {/* Left column — form */}
      <div className="space-y-4">
        <Card>
          <SectionTitle sub="Everything you edit here reflects on the live client dashboard once you Save. Changes are audit-logged.">
            <span className="inline-flex items-center gap-2">
              <MonitorSmartphone size={16} className="text-accent-600"/>
              Content editor
            </span>
          </SectionTitle>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelected(c.key)}
                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border ${
                  selected === c.key
                    ? "bg-ink-900 text-white border-ink-900 dark:bg-ink-50 dark:text-ink-900 dark:border-ink-50"
                    : "bg-white text-ink-600 border-ink-200 hover:border-ink-300 dark:bg-ink-900 dark:text-ink-300 dark:border-ink-700"
                }`}
              >
                {c.label}
                {overrides.has(c.key) && (
                  <span className="ml-1 size-1.5 rounded-full bg-amber-500" title="Has admin override"/>
                )}
              </button>
            ))}
          </div>

          <div className="mb-3 p-2 rounded-lg bg-ink-50 dark:bg-ink-800/50 text-[11px] text-ink-600 dark:text-ink-300 inline-flex items-start gap-2">
            <Info size={12} className="mt-0.5 text-ink-500 shrink-0"/>
            <span>
              <span className="inline-block size-1.5 rounded-full bg-amber-500 mx-1 align-middle"/>
              dot means this category has an admin override active. Use "Reset to default" to remove it.
            </span>
          </div>

          <CategoryForm
            category={selected}
            draft={draft}
            updateDraft={updateDraft}
          />

          <div className="mt-5 pt-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between">
            <Button
              variant="ghost"
              icon={<RotateCcw size={13}/>}
              onClick={() => reset(selected)}
              disabled={savingKey === selected || !overrides.has(selected)}
            >
              Reset to default
            </Button>
            <Button
              variant="accent"
              icon={<Save size={14}/>}
              onClick={() => save(selected)}
              disabled={savingKey === selected}
            >
              {savingKey === selected ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>

        <Card>
          <div className="text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5 inline-flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-amber-500"/>
            Things to know
          </div>
          <ul className="text-[11px] text-ink-500 dark:text-ink-400 space-y-1 list-disc pl-4">
            <li>Same content is served to every client — this MVP has no per-client overrides.</li>
            <li>Saving is instant — every client sees the change on their next page load.</li>
            <li>Every save is audit-logged with the before/after diff.</li>
            <li>Section visibility toggles hide the entire card; useful for temporary announcements or A/B tests.</li>
          </ul>
        </Card>
      </div>

      {/* Right column — live preview iframe */}
      <div className="xl:sticky xl:top-4 space-y-2">
        <div className="text-xs text-ink-500 dark:text-ink-400 flex items-center gap-1.5">
          <Eye size={12}/> Live preview · updates on every edit · not saved yet
        </div>
        <div className="rounded-2xl border border-ink-200 dark:border-ink-800 overflow-hidden shadow-pop bg-white dark:bg-ink-900">
          <iframe
            ref={iframeRef}
            title="Client dashboard preview"
            src="/?admin-preview=1"
            className="w-full h-[720px] block"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Per-category forms ────────────────────────────────────────────────
function CategoryForm({
  category,
  draft,
  updateDraft,
}: {
  category: CategoryKey;
  draft: ContentDoc;
  updateDraft: <K extends keyof ContentDoc>(key: K, value: ContentDoc[K]) => void;
}) {
  if (category === "welcome") {
    const v = draft.welcome;
    return (
      <div className="space-y-3">
        <TextField label="Headline" value={v.headline} onChange={(x) => updateDraft("welcome", { ...v, headline: x })} />
        <TextArea  label="Body"     value={v.body}     onChange={(x) => updateDraft("welcome", { ...v, body: x })} />
        <TextField label="Primary CTA label"   value={v.primary_cta_label}   onChange={(x) => updateDraft("welcome", { ...v, primary_cta_label: x })} />
        <TextField label="Secondary CTA label" value={v.secondary_cta_label} onChange={(x) => updateDraft("welcome", { ...v, secondary_cta_label: x })} />
      </div>
    );
  }

  if (category === "tier_card") {
    const v = draft.tier_card;
    return (
      <div className="space-y-4">
        {(["tier1", "tier2", "tier3"] as const).map((t) => (
          <div key={t} className="p-3 rounded-lg border border-ink-200 dark:border-ink-700">
            <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-2">
              {t === "tier1" ? "Starter" : t === "tier2" ? "Growth" : "Enterprise"}
            </div>
            <TextField
              label="Tagline"
              value={v[t].tagline}
              onChange={(x) => updateDraft("tier_card", { ...v, [t]: { ...v[t], tagline: x } })}
            />
            <StringList
              label="Included features (one per line)"
              value={v[t].features_included}
              onChange={(x) => updateDraft("tier_card", { ...v, [t]: { ...v[t], features_included: x } })}
            />
          </div>
        ))}
        <TextField
          label="Upgrade CTA label"
          value={v.upgrade_cta_label}
          onChange={(x) => updateDraft("tier_card", { ...v, upgrade_cta_label: x })}
        />
      </div>
    );
  }

  if (category === "onboarding") {
    const v = draft.onboarding;
    return (
      <div className="space-y-3">
        {v.steps.map((s, i) => (
          <div key={s.key} className="p-3 rounded-lg border border-ink-200 dark:border-ink-700">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2 font-mono">
              step {i + 1} · id: {s.key}
            </div>
            <TextField
              label="Title"
              value={s.title}
              onChange={(x) => {
                const next = [...v.steps];
                next[i] = { ...s, title: x };
                updateDraft("onboarding", { steps: next });
              }}
            />
            <TextField
              label="Hint (when not done)"
              value={s.hint_todo}
              onChange={(x) => {
                const next = [...v.steps];
                next[i] = { ...s, hint_todo: x };
                updateDraft("onboarding", { steps: next });
              }}
            />
            <TextField
              label="Hint (when done)"
              value={s.hint_done}
              onChange={(x) => {
                const next = [...v.steps];
                next[i] = { ...s, hint_done: x };
                updateDraft("onboarding", { steps: next });
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (category === "placeholder_tiles") {
    const v = draft.placeholder_tiles;
    return (
      <div className="space-y-3">
        {(["ai", "optimiser", "billing"] as const).map((k) => (
          <div key={k} className="p-3 rounded-lg border border-ink-200 dark:border-ink-700">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2 font-mono">tile · {k}</div>
            <TextField label="Title"    value={v[k].title}    onChange={(x) => updateDraft("placeholder_tiles", { ...v, [k]: { ...v[k], title: x } })} />
            <TextField label="Subtitle" value={v[k].subtitle} onChange={(x) => updateDraft("placeholder_tiles", { ...v, [k]: { ...v[k], subtitle: x } })} />
            <TextField label="Badge (e.g. Growth / Enterprise / Soon)" value={v[k].badge} onChange={(x) => updateDraft("placeholder_tiles", { ...v, [k]: { ...v[k], badge: x } })} />
          </div>
        ))}
      </div>
    );
  }

  if (category === "support_footer") {
    const v = draft.support_footer;
    return (
      <div className="space-y-3">
        <TextField label="Support hours"   value={v.hours}     onChange={(x) => updateDraft("support_footer", { ...v, hours: x })} />
        <TextField label="Contact email"   value={v.email}     onChange={(x) => updateDraft("support_footer", { ...v, email: x })} />
        <TextField label="Copyright line"  value={v.copyright} onChange={(x) => updateDraft("support_footer", { ...v, copyright: x })} />
      </div>
    );
  }

  if (category === "announcement") {
    const v = draft.announcement;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <ToggleField
            label="Visible"
            value={v.visible}
            onChange={(x) => updateDraft("announcement", { ...v, visible: x })}
          />
          <select
            value={v.kind}
            onChange={(e) => updateDraft("announcement", { ...v, kind: e.target.value as "info" | "warning" | "success" })}
            className="h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
          >
            <option value="info">Info (blue)</option>
            <option value="warning">Warning (amber)</option>
            <option value="success">Success (green)</option>
          </select>
        </div>
        <TextField label="Headline"        value={v.headline}   onChange={(x) => updateDraft("announcement", { ...v, headline: x })} />
        <TextArea  label="Body"            value={v.body}       onChange={(x) => updateDraft("announcement", { ...v, body: x })} />
        <TextField label="CTA label"       value={v.cta_label}  onChange={(x) => updateDraft("announcement", { ...v, cta_label: x })} />
        <TextField label="CTA URL"         value={v.cta_url}    onChange={(x) => updateDraft("announcement", { ...v, cta_url: x })} />
      </div>
    );
  }

  if (category === "sections") {
    const v = draft.sections;
    const SECTION_LABELS: Record<keyof typeof v, string> = {
      welcome_banner:       "Welcome banner",
      onboarding_checklist: "Onboarding checklist",
      tier_card:            "Tier card",
      stat_tiles:           "Stat tiles (4-up)",
      placeholder_tiles:    "Coming-soon tiles",
      latest_backtests:     "Latest backtests list",
      support_footer:       "Support footer",
      announcement:         "Announcement banner",
    };
    return (
      <div className="space-y-1">
        {(Object.keys(v) as (keyof typeof v)[]).map((k) => (
          <ToggleField
            key={k}
            label={SECTION_LABELS[k]}
            value={v[k]}
            onChange={(x) => updateDraft("sections", { ...v, [k]: x })}
          />
        ))}
      </div>
    );
  }

  return null;
}

// ─── Small form helpers ────────────────────────────────────────────────
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block mb-2">
      <span className="text-[11px] font-medium text-ink-600 dark:text-ink-300">{label}</span>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950"
      />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block mb-2">
      <span className="text-[11px] font-medium text-ink-600 dark:text-ink-300">{label}</span>
      <textarea
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 resize-y"
      />
    </label>
  );
}

function StringList({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const text = (value ?? []).join("\n");
  return (
    <label className="block mb-2">
      <span className="text-[11px] font-medium text-ink-600 dark:text-ink-300">{label}</span>
      <textarea
        rows={4}
        value={text}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s).filter((s, i, arr) => s.trim().length > 0 || i < arr.length - 1))}
        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 resize-y font-mono text-xs"
      />
    </label>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-800/40">
      <span className="text-sm text-ink-700 dark:text-ink-200">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
          value ? "bg-emerald-500" : "bg-ink-300 dark:bg-ink-700"
        }`}
        aria-pressed={value}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            value ? "left-4" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
