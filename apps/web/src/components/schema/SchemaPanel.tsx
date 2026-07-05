"use client";

import { useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { SAMPLE_DATASETS } from "@/lib/data/datasets";
import { importSchemaFromSQL } from "@/lib/sql/schemaImport";

export function SchemaPanel() {
  const {
    tableData, addTable, dropTable,
    addRow, dropRow, addColumn, dropColumn,
    updateCell, renameColumn,
    activeDataset, loadDataset,
  } = useStore();

  const newTblRef = useRef<HTMLInputElement>(null);
  const [showSchemaImport, setShowSchemaImport] = useState(false);
  const [ddlText, setDdlText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importedNames, setImportedNames] = useState<string[] | null>(null);

  const handleImportSchema = () => {
    const result = importSchemaFromSQL(ddlText);
    setImportErrors(result.errors);
    if (result.tableNames.length > 0) {
      useStore.getState().setTableData({ ...tableData, ...result.tables });
      setImportedNames(result.tableNames);
    } else {
      setImportedNames(null);
    }
  };

  const closeSchemaImport = () => {
    setShowSchemaImport(false);
    setDdlText("");
    setImportErrors([]);
    setImportedNames(null);
  };

  const handleAddTable = () => {
    const name = newTblRef.current?.value.trim();
    if (name && !tableData[name]) {
      addTable(name);
      if (newTblRef.current) newTblRef.current.value = "";
    }
  };

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      const sep = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
      const name = file.name.replace(".csv", "").replace(/\W/g, "_");
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(sep).map((v) => v.trim().replace(/^"|"$/g, ""));
        const r: Record<string, string | number | null> = {};
        headers.forEach((h, i) => {
          const v = vals[i] ?? null;
          r[h] = v !== null && !isNaN(Number(v)) ? Number(v) : v;
        });
        return r;
      });
      useStore.getState().setTableData({ ...tableData, [name]: rows });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <>
    {/* `h-full min-h-0` on the aside, plus `min-h-0` on the scrolling child
        below, is the actual fix. Flex items default to `min-height: auto`,
        which means a flex child refuses to shrink below its own content
        height no matter what you put on it — so adding a row just grew this
        whole panel downward instead of ever triggering `overflow-y-auto`.
        `min-h-0` overrides that default and lets the child actually clip
        and scroll within the space the flex parent gives it. */}
    <aside
      style={{ width: 328, background: "var(--surface)", borderRight: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
      className="flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden relative z-10"
    >
      {/* Header */}
      <div
        className="p-3 flex flex-col gap-2.5 flex-shrink-0"
        style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="panel-heading">
          <span className="panel-dot" style={{ background: "var(--accent)" }} />
          Schema Explorer
        </span>
        <div className="flex gap-1.5">
          <input
            ref={newTblRef}
            placeholder="Table name…"
            onKeyDown={(e) => e.key === "Enter" && handleAddTable()}
            className="input flex-1 !py-1.5 !text-[11.5px]"
          />
          <button onClick={handleAddTable} className="btn-primary !py-1.5 !px-2.5 !text-[11px]">
            + Table
          </button>
        </div>
        <label className="btn-secondary !py-1.5 !text-[11px] cursor-pointer w-full">
          📂 Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleCSV} />
        </label>

        <button
          onClick={() => setShowSchemaImport(true)}
          className="btn-secondary !py-1.5 !text-[11px] w-full"
        >
          🧬 Import SQL Schema
        </button>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium" style={{ color: "var(--muted)" }}>Sample dataset:</span>
          <select
            value={activeDataset ?? ""}
            onChange={(e) => e.target.value && loadDataset(e.target.value as keyof typeof SAMPLE_DATASETS)}
            className="input !py-1.5 !text-[11px]"
          >
            <option value="" disabled>Load a sample…</option>
            {Object.entries(SAMPLE_DATASETS).map(([key, ds]) => (
              <option key={key} value={key}>{ds.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table list — the scrolling region. `min-h-0` is what lets this
          shrink and scroll instead of forcing the aside to grow. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3"
        style={{ background: "var(--bg)" }}
      >
        {Object.keys(tableData).map((tbl) => {
          const rows = tableData[tbl];
          const cols = rows[0] ? Object.keys(rows[0]) : ["id"];

          return (
            <div
              key={tbl}
              className="rounded-xl overflow-hidden flex-shrink-0"
              style={{ border: "1px solid var(--border)", background: "var(--surface2)", boxShadow: "var(--shadow)" }}
            >
              {/* Table header */}
              <div
                className="flex justify-between items-center px-2.5 py-2"
                style={{ background: "var(--surface3)", borderBottom: "1px solid var(--border)" }}
              >
                <span className="font-mono text-[11.5px] font-bold" style={{ color: "var(--accent)" }}>
                  {tbl}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    {rows.length} rows
                  </span>
                  <button
                    onClick={() => dropTable(tbl)}
                    className="btn-danger-ghost"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Grid — this scrolls horizontally when columns are added
                  (overflow-x-auto), same idea as the vertical fix above.
                  Data columns get a real 92px minimum and the trailing
                  row-action column is a fixed 26px so it never stretches
                  wider than its "×" button needs. */}
              <div className="overflow-x-auto">
                {/* Column headers */}
                <div
                  className="grid"
                  style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(92px,1fr)) 26px` }}
                >
                  {cols.map((col) => (
                    <div
                      key={col}
                      className="group flex items-center gap-1 pl-2 pr-1"
                      style={{ borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
                    >
                      <input
                        defaultValue={col}
                        onBlur={(e) => renameColumn(tbl, col, e.target.value)}
                        className="flex-1 min-w-0 py-2 font-mono text-[11px] font-semibold outline-none truncate"
                        style={{ background: "transparent", color: "var(--muted2)" }}
                        title={col}
                      />
                      {/* Remove-column button — hidden until you hover the
                          header so column names stay readable at rest, and
                          disabled once a table is down to its last column. */}
                      <button
                        onClick={() => dropColumn(tbl, col)}
                        disabled={cols.length <= 1}
                        title={cols.length <= 1 ? "A table needs at least one column" : `Remove column "${col}"`}
                        className="btn-danger-ghost !text-[9px] !px-1 !py-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-0"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div
                    className="sticky right-0 z-10"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      borderLeft: "1px solid var(--border)",
                      background: "var(--surface)",
                      boxShadow: "-6px 0 8px -6px rgba(0,0,0,0.45)",
                    }}
                  />
                </div>

                {/* Rows */}
                {rows.slice(0, 30).map((row, ri) => (
                  <div
                    key={ri}
                    className="grid group/row"
                    style={{
                      gridTemplateColumns: `repeat(${cols.length}, minmax(92px,1fr)) 26px`,
                      borderBottom: "1px solid var(--border)",
                      background: ri % 2 === 1 ? "var(--surface3)" : "transparent",
                    }}
                  >
                    {cols.map((col) => (
                      <div
                        key={col}
                        className="group-hover/row:bg-[var(--accent-soft)] transition-colors"
                        style={{ borderRight: "1px solid var(--border)" }}
                      >
                        <input
                          defaultValue={row[col] ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value;
                            updateCell(tbl, ri, col, !isNaN(Number(v)) && v !== "" ? Number(v) : v || null);
                          }}
                          title={String(row[col] ?? "")}
                          className="w-full px-2 py-1.5 font-mono text-[11.5px] outline-none truncate"
                          style={{ background: "transparent", color: "var(--text)" }}
                        />
                      </div>
                    ))}
                    {/* Sticky delete-row cell — pinned to the right edge of
                        the card (not the page) so removing a row never
                        requires scrolling all the way across the table
                        first. Needs its own opaque background matching the
                        row's stripe, otherwise scrolled columns would show
                        through behind it; the `!` on the hover class forces
                        it to win over that inline background-color. */}
                    <div
                      className="sticky right-0 z-10 flex items-center justify-center group-hover/row:!bg-[var(--accent-soft)] transition-colors"
                      style={{
                        borderLeft: "1px solid var(--border)",
                        background: ri % 2 === 1 ? "var(--surface3)" : "var(--surface2)",
                        boxShadow: "-6px 0 8px -6px rgba(0,0,0,0.45)",
                      }}
                    >
                      <button
                        onClick={() => dropRow(tbl, ri)}
                        className="btn-danger-ghost !text-[10px] opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions — always visible below the table's rows */}
              <div
                className="flex flex-shrink-0"
                style={{ borderTop: "1px solid var(--border)", background: "var(--surface3)" }}
              >
                {[
                  ["＋ Row", () => addRow(tbl), "Add a new row to this table"],
                  ["＋ Col", () => addColumn(tbl), "Add a new column to this table"],
                ].map(([label, fn, tip], i) => (
                  <button
                    key={label as string}
                    onClick={fn as () => void}
                    title={tip as string}
                    className="flex-1 flex items-center justify-center gap-1 py-2 text-[11.5px] font-bold transition-colors hover:bg-[var(--accent-soft)]"
                    style={{
                      color: "var(--accent)",
                      borderRight: i === 0 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>

    {showSchemaImport && (
      <SchemaImportModal
        ddlText={ddlText}
        setDdlText={setDdlText}
        errors={importErrors}
        importedNames={importedNames}
        onImport={handleImportSchema}
        onClose={closeSchemaImport}
      />
    )}
    </>
  );
}

function SchemaImportModal({
  ddlText,
  setDdlText,
  errors,
  importedNames,
  onImport,
  onClose,
}: {
  ddlText: string;
  setDdlText: (v: string) => void;
  errors: string[];
  importedNames: string[] | null;
  onImport: () => void;
  onClose: () => void;
}) {
  const EXAMPLE = `CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  country CHAR(2)
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER,
  quantity INTEGER,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);`;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card card-accent-blue p-5 w-[520px] max-w-[90vw]"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="panel-heading !text-[13px] !normal-case !tracking-normal !font-semibold" style={{ color: "var(--text)" }}>
            <span className="panel-dot" style={{ background: "var(--accent)" }} />
            Import SQL Schema
          </h3>
          <button onClick={onClose} className="btn-ghost !p-1.5">
            ✕
          </button>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
          Paste one or more <code>CREATE TABLE</code> statements from your own database.
          Each table gets {5} generated sample rows so you can start visualizing and
          optimizing queries against it right away.
        </p>

        <textarea
          value={ddlText}
          onChange={(e) => setDdlText(e.target.value)}
          placeholder={EXAMPLE}
          spellCheck={false}
          className="input w-full h-52 !p-2.5 !text-[11.5px] font-mono resize-none"
        />

        {errors.length > 0 && (
          <div
            className="mt-3 text-[11px] p-2.5 rounded-lg"
            style={{ background: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--warning)", border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)" }}
          >
            {errors.map((e, i) => (
              <div key={i}>⚠ {e}</div>
            ))}
          </div>
        )}

        {importedNames && importedNames.length > 0 && (
          <div
            className="mt-3 text-[11px] p-2.5 rounded-lg"
            style={{ background: "color-mix(in srgb, var(--success) 10%, transparent)", color: "var(--success)", border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)" }}
          >
            ✓ Imported {importedNames.length} table{importedNames.length === 1 ? "" : "s"}: {importedNames.join(", ")}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onImport}
            disabled={!ddlText.trim()}
            className="btn-primary flex-1 !py-2"
          >
            Parse & Import
          </button>
          <button onClick={onClose} className="btn-secondary !px-4 !py-2">
            {importedNames ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}