/**
 * Schema-driven generic parameter form. Chirag Item #4 — every future engine
 * gets a tuning UI for free by declaring a schema of the shape defined in
 * services/param_schema.py.
 *
 * Currently reference-only: VAM's real form (VamParamForm) is still the
 * canonical UI for VAM because it renders the exact same shape from VAM's
 * schema endpoint. GenericParamForm is what a NEW engine (EMA+RSI etc.)
 * plugs into with zero custom code.
 *
 * Supported field types:
 *   int, number  → number input with min/max
 *   date         → date input
 *   enum         → select (from options)
 *   bool         → toggle
 *   string       → text input
 */

export type FieldSpec = {
  type: "int" | "number" | "date" | "enum" | "bool" | "string";
  default?: unknown;
  min?: number;
  max?: number;
  options?: string[];
  required?: boolean;
  label?: string;
  help?: string;
};

export type GroupSchema = Record<string, FieldSpec>;

export type ParamSchema = {
  family?: string;
  variants?: string[];
  params?: Record<string, GroupSchema>;
  constraints?: string[];
  holdout?: { enforced?: boolean; reserve_tail_months?: number };
};

export default function GenericParamForm({
  schema,
  value,
  onChange,
}: {
  schema: ParamSchema;
  value: Record<string, Record<string, unknown>>;
  onChange: (next: Record<string, Record<string, unknown>>) => void;
}) {
  const groups = schema.params ?? {};

  const updateField = (group: string, field: string, next: unknown) => {
    onChange({
      ...value,
      [group]: {
        ...(value[group] ?? {}),
        [field]: next,
      },
    });
  };

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([groupName, groupFields]) => (
        <div key={groupName} className="p-3 rounded-lg border border-ink-200 dark:border-ink-700">
          <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-2">
            {humaniseGroup(groupName)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(groupFields).map(([fieldName, spec]) => (
              <FieldRenderer
                key={fieldName}
                label={spec.label ?? humaniseField(fieldName)}
                spec={spec}
                value={value[groupName]?.[fieldName] ?? spec.default}
                onChange={(v) => updateField(groupName, fieldName, v)}
              />
            ))}
          </div>
        </div>
      ))}
      {schema.constraints && schema.constraints.length > 0 && (
        <div className="text-[10px] text-ink-500 italic">
          Constraints: {schema.constraints.join(" · ")}
        </div>
      )}
      {schema.holdout?.enforced && (
        <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">
          Holdout enforced · last {schema.holdout.reserve_tail_months} months
          are reserved from tuning.
        </div>
      )}
    </div>
  );
}

function FieldRenderer({
  label,
  spec,
  value,
  onChange,
}: {
  label: string;
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1 block">
        {label}
        {spec.required && <span className="text-red-500 ml-1">*</span>}
      </span>
      <FieldInput spec={spec} value={value} onChange={onChange}/>
      {spec.help && (
        <span className="text-[10px] text-ink-500 dark:text-ink-400 mt-0.5 block">{spec.help}</span>
      )}
    </label>
  );
}

function FieldInput({
  spec,
  value,
  onChange,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const cls = "w-full h-9 px-3 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950";

  if (spec.type === "int" || spec.type === "number") {
    return (
      <input
        type="number"
        step={spec.type === "int" ? 1 : "any"}
        min={spec.min}
        max={spec.max}
        value={value === null || value === undefined ? "" : (value as number)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const parsed = spec.type === "int" ? parseInt(raw, 10) : parseFloat(raw);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        className={cls}
      />
    );
  }
  if (spec.type === "date") {
    return (
      <input
        type="date"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      />
    );
  }
  if (spec.type === "bool") {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-10 h-6 rounded-full relative transition-colors ${value ? "bg-emerald-500" : "bg-ink-300 dark:bg-ink-700"}`}
        aria-pressed={!!value}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${value ? "left-4" : "left-0.5"}`}/>
      </button>
    );
  }
  if (spec.type === "enum") {
    return (
      <select
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      >
        <option value="">— pick —</option>
        {(spec.options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={cls}
    />
  );
}

function humaniseGroup(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humaniseField(k: string): string {
  return k.replace(/_/g, " ");
}

/** Build the initial value bag from a schema's defaults. */
export function defaultsFromParamSchema(schema: ParamSchema): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [g, fields] of Object.entries(schema.params ?? {})) {
    out[g] = {};
    for (const [name, spec] of Object.entries(fields)) {
      if (spec.default !== undefined) out[g][name] = spec.default;
    }
  }
  return out;
}
