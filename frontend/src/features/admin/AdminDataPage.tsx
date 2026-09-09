/**
 * Admin — Data Explorer.
 *
 * Read-only tabular browser for every table in the DB. Left rail lists
 * every table (with row counts); right pane shows the selected table in
 * a spreadsheet-style grid with sortable columns, a search box, and
 * page navigation.
 *
 * Design notes:
 *   - Read-only on purpose. Row edits would need per-table auth logic
 *     and an audit trail; safer to keep all writes flowing through the
 *     dedicated admin surfaces (Clients drawer, Content editor, etc.).
 *   - Search hits every column via ILIKE on the server. Cheap for the
 *     table sizes we're dealing with; if it starts to hurt, we swap in
 *     per-column search UI on tables that are too big.
 *   - JSON columns pretty-print with a truncation cap so the grid never
 *     turns into a 3000-line wall of text.
 */

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  Table as TableIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionTitle } from "../../components/ui";
import {
  adminListTables,
  adminReadTable,
  type AdminColumnType,
  type AdminTableInfo,
  type AdminTableRows,
} from "../../lib/api";
import { toast } from "../../store/toast";

const PAGE_SIZE = 50;

export default function AdminDataPage() {
  const [tables, setTables] = useState<AdminTableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const data = await adminListTables();
      setTables(data);
      // Pick a sensible default on first load — clients is the table
      // most admins want to see first.
      if (!selected && data.length > 0) {
        const preferred =
          data.find((t) => t.name === "clients") ??
          data.find((t) => t.name === "users") ??
          data[0];
        setSelected(preferred.name);
      }
    } catch (e) {
      toast.error("Load failed", (e as Error).message);
    } finally {
      setTablesLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  return (
    <div className="space-y-5">
      <SectionTitle
        sub="Read-only view of every table. Sort, search and paginate — writes still go through the dedicated admin pages."
        action={
          <button
            onClick={loadTables}
            className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        }
      >
        <span className="inline-flex items-center gap-2">
          <Database size={16} className="text-accent-600" /> Data explorer
        </span>
      </SectionTitle>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        <TableList
          tables={tables}
          loading={tablesLoading}
          selected={selected}
          onSelect={setSelected}
        />
        {selected ? (
          <TableView tableName={selected} tables={tables} />
        ) : (
          <div className="rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-8 text-sm text-ink-500 text-center">
            Pick a table on the left to see its rows.
          </div>
        )}
      </div>
    </div>
  );
}

function TableList({
  tables,
  loading,
  selected,
  onSelect,
}: {
  tables: AdminTableInfo[];
  loading: boolean;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-ink-100 dark:border-ink-800 text-[10.5px] uppercase tracking-wider text-ink-500 font-semibold">
        Tables ({tables.length})
      </div>
      {loading ? (
        <div className="p-4 text-xs text-ink-500 italic">Loading…</div>
      ) : (
        <ul className="max-h-[calc(100vh-260px)] overflow-y-auto">
          {tables.map((t) => {
            const active = t.name === selected;
            return (
              <li key={t.name}>
                <button
                  onClick={() => onSelect(t.name)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                    active
                      ? "bg-accent-500/10 text-accent-700 dark:text-accent-300"
                      : "hover:bg-ink-50 dark:hover:bg-ink-800/60 text-ink-700 dark:text-ink-200"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <TableIcon size={11} className="opacity-70 shrink-0" />
                    <span className="font-mono truncate">{t.name}</span>
                  </span>
                  <span
                    className={`text-[10px] tabular font-medium shrink-0 ${
                      active
                        ? "text-accent-700 dark:text-accent-300"
                        : "text-ink-400"
                    }`}
                  >
                    {t.row_count.toLocaleString()}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TableView({
  tableName,
  tables,
}: {
  tableName: string;
  tables: AdminTableInfo[];
}) {
  const [data, setData] = useState<AdminTableRows | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search input so we don't hit the server on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Reset paging + sort when the selected table changes.
  useEffect(() => {
    setOffset(0);
    setOrderBy(null);
    setOrderDir("desc");
    setSearchInput("");
    setSearch("");
  }, [tableName]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminReadTable({
        table: tableName,
        limit: PAGE_SIZE,
        offset,
        order_by: orderBy,
        order_dir: orderDir,
        search: search || null,
      });
      setData(res);
    } catch (e) {
      toast.error("Load failed", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tableName, offset, orderBy, orderDir, search]);

  useEffect(() => {
    load();
  }, [load]);

  const meta = useMemo(
    () => tables.find((t) => t.name === tableName),
    [tables, tableName],
  );

  const toggleSort = (colName: string) => {
    if (orderBy !== colName) {
      setOrderBy(colName);
      setOrderDir("asc");
    } else if (orderDir === "asc") {
      setOrderDir("desc");
    } else {
      // Third click clears the sort — falls back to server default
      // (created_at desc if present).
      setOrderBy(null);
      setOrderDir("desc");
    }
    setOffset(0);
  };

  const columns = data?.columns ?? meta?.columns ?? [];
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 overflow-hidden flex flex-col min-w-0">
      <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-semibold text-ink-900 dark:text-ink-50">
            {tableName}
          </div>
          <div className="text-[10.5px] text-ink-500 mt-0.5">
            {total.toLocaleString()} rows · {columns.length} columns
          </div>
        </div>
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search any column…"
            className="h-8 pl-7 pr-3 text-xs rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 w-48 sm:w-64 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
          />
        </div>
      </div>

      <div className="overflow-x-auto min-w-0">
        {loading && !data ? (
          <div className="p-10 text-center text-sm text-ink-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-500">
            {search ? `No rows match "${search}"` : "Empty table"}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-ink-50 dark:bg-ink-950/50 sticky top-0">
              <tr>
                {columns.map((c) => {
                  const isSorted = orderBy === c.name;
                  return (
                    <th
                      key={c.name}
                      onClick={() => toggleSort(c.name)}
                      className="px-3 py-2 text-left font-medium text-ink-600 dark:text-ink-300 cursor-pointer hover:bg-ink-100/70 dark:hover:bg-ink-800/60 select-none whitespace-nowrap"
                      title={`${c.type}${c.nullable ? " (nullable)" : ""}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono">{c.name}</span>
                        {isSorted &&
                          (orderDir === "asc" ? (
                            <ArrowUp size={10} className="text-accent-600" />
                          ) : (
                            <ArrowDown size={10} className="text-accent-600" />
                          ))}
                        <span className="text-[9px] uppercase tracking-wider text-ink-400 font-semibold ml-1">
                          {c.type}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-ink-50/70 dark:hover:bg-ink-800/30"
                >
                  {columns.map((c) => (
                    <td
                      key={c.name}
                      className="px-3 py-2 text-ink-800 dark:text-ink-100 align-top max-w-[320px]"
                    >
                      <CellRenderer value={row[c.name]} type={c.type} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between gap-3 text-xs text-ink-500">
        <div>
          Page{" "}
          <span className="text-ink-800 dark:text-ink-100 font-medium tabular">
            {currentPage}
          </span>{" "}
          of{" "}
          <span className="text-ink-800 dark:text-ink-100 font-medium tabular">
            {totalPages}
          </span>{" "}
          · showing{" "}
          <span className="tabular">
            {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length}
          </span>{" "}
          of {total.toLocaleString()}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || loading}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-40 disabled:pointer-events-none"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CellRenderer({
  value,
  type,
}: {
  value: unknown;
  type: AdminColumnType;
}) {
  if (value === null || value === undefined) {
    return <span className="text-ink-400 italic">null</span>;
  }
  if (type === "json") {
    let pretty: string;
    try {
      pretty = JSON.stringify(value, null, 2);
    } catch {
      pretty = String(value);
    }
    if (pretty.length > 400) {
      return (
        <details className="cursor-pointer">
          <summary className="font-mono text-[10.5px] text-accent-700 dark:text-accent-300">
            JSON ({pretty.length} chars) — expand
          </summary>
          <pre className="mt-1 text-[10.5px] font-mono bg-ink-50 dark:bg-ink-950 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {pretty}
          </pre>
        </details>
      );
    }
    return (
      <pre className="text-[10.5px] font-mono bg-ink-50 dark:bg-ink-950 rounded-md p-1.5 overflow-x-auto whitespace-pre-wrap break-all">
        {pretty}
      </pre>
    );
  }
  if (type === "datetime" || type === "date") {
    if (typeof value !== "string") return <span>{String(value)}</span>;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return <span>{value}</span>;
    return (
      <span className="font-mono text-[10.5px] tabular whitespace-nowrap">
        {d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    );
  }
  if (type === "bool") {
    return value ? (
      <span className="inline-flex items-center px-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        true
      </span>
    ) : (
      <span className="inline-flex items-center px-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-ink-200/70 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
        false
      </span>
    );
  }
  if (type === "uuid") {
    const s = String(value);
    return (
      <span
        className="font-mono text-[10.5px] text-ink-500 whitespace-nowrap"
        title={s}
      >
        {s.slice(0, 8)}…
      </span>
    );
  }
  if (type === "int" || type === "float") {
    return <span className="font-mono tabular">{String(value)}</span>;
  }
  const s = String(value);
  if (s.length > 200) {
    return (
      <details className="cursor-pointer">
        <summary className="text-accent-700 dark:text-accent-300">
          {s.slice(0, 80)}… ({s.length} chars)
        </summary>
        <div className="mt-1 whitespace-pre-wrap break-words">{s}</div>
      </details>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{s}</span>;
}
