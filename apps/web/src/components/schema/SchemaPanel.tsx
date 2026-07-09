"use client";

import { useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { SAMPLE_DATASETS } from "@/lib/data/datasets";
import { importSchemaFromSQL } from "@/lib/sql/schemaImport";
import { motion, AnimatePresence } from "framer-motion";

/* ── animation variants ─────────────────────────────────────── */

const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  }),
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 8,
    transition: { duration: 0.25, ease: "easeIn" as const },
  },
};

const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 12,
    transition: { duration: 0.2, ease: "easeIn" as const },
  },
};

/* ── micro-interaction presets ───────────────────────────────── */

const btnHover = { scale: 1.04, transition: { duration: 0.15 } };
const btnTap = { scale: 0.96 };
const subtleBtnHover = { scale: 1.02, transition: { duration: 0.12 } };
const subtleBtnTap = { scale: 0.97 };

export function SchemaPanel() {
  const {
    tableData, addTable, dropTable,
    addRow, dropRow, addColumn, dropColumn,
    updateCell, renameColumn, renameTable,
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

  const handleExportCSV = (tbl: string) => {
    const rows = tableData[tbl];
    if (!rows || !rows.length) return;
    const cols = Object.keys(rows[0]);

    const escape = (v: string | number | null) => {
      const s = v == null ? "" : String(v);
      // Quote any value containing a comma, quote, or newline; double up
      // embedded quotes per RFC 4180 so the CSV round-trips cleanly.
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [
      cols.map(escape).join(","),
      ...rows.map((r) => cols.map((c) => escape(r[c])).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tbl}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <aside
      style={{
        width: 420,
        background: "var(--bg)",
        borderRight: "1px solid var(--border)",
      }}
      className="flex flex-col flex-shrink-0 h-full min-h-0 overflow-hidden relative z-10"
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
        className="card card-accent-violet m-3 p-4 flex flex-col gap-2.5 flex-shrink-0"
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
          <motion.button
            whileHover={btnHover}
            whileTap={btnTap}
            onClick={handleAddTable}
            className="btn-primary !py-1.5 !px-2.5 !text-[11px]"
          >
            + Table
          </motion.button>
        </div>
        <div className="flex gap-1.5">
          <motion.label
            whileHover={subtleBtnHover}
            whileTap={subtleBtnTap}
            className="btn-secondary !py-1.5 !text-[11px] cursor-pointer flex-1 flex items-center justify-center whitespace-nowrap"
          >
            📂 Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleCSV} />
          </motion.label>

          <motion.button
            whileHover={subtleBtnHover}
            whileTap={subtleBtnTap}
            onClick={() => setShowSchemaImport(true)}
            className="btn-secondary !py-1.5 !text-[11px] flex-1 whitespace-nowrap"
          >
            🧬 Import SQL Schema
          </motion.button>
        </div>

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
      </motion.div>

      {/* Table list — the scrolling region. `min-h-0` is what lets this
          shrink and scroll instead of forcing the aside to grow. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3"
        style={{ background: "var(--bg)" }}
      >
        <AnimatePresence mode="popLayout">
          {Object.keys(tableData).map((tbl, idx) => {
            const rows = tableData[tbl];
            const cols = rows[0] ? Object.keys(rows[0]) : ["id"];

            return (
              <motion.div
                key={tbl}
                layout
                custom={idx}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="card overflow-hidden flex-shrink-0"
              >
                {/* Table header */}
                <div
                  className="flex items-center px-2.5 py-2"
                  style={{
                    background: "linear-gradient(135deg, var(--surface3), color-mix(in srgb, var(--accent) 8%, var(--surface3)))",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <input
                    defaultValue={tbl}
                    onBlur={(e) => renameTable(tbl, e.target.value)}
                    className="font-mono text-[11.5px] font-bold bg-transparent outline-none truncate w-32 focus:w-48 transition-all"
                    style={{ color: "var(--accent)" }}
                    title={tbl}
                  />
                  <div className="flex items-center gap-2 ml-auto">
                    <motion.button
                      whileHover={subtleBtnHover}
                      whileTap={subtleBtnTap}
                      onClick={() => handleExportCSV(tbl)}
                      title={`Download ${tbl} as CSV`}
                      className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md transition-colors hover:opacity-80"
                      style={{ color: "var(--accent)", background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      ⬇ Export CSV
                    </motion.button>
                    <span
                      className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md"
                      style={{ color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      {rows.length} rows
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.15, transition: { duration: 0.12 } }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => dropTable(tbl)}
                      title={`Delete table "${tbl}"`}
                      className="btn-danger-ghost w-[18px] h-[18px] flex items-center justify-center !text-[11px] !p-0 !rounded-full"
                      style={{ color: "var(--error)", borderColor: "color-mix(in srgb, var(--error) 40%, transparent)" }}
                    >
                      ✕
                    </motion.button>
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
                        className="flex items-center gap-1 pl-2 pr-1"
                        style={{ boxShadow: "inset -1px 0 0 var(--border), inset 0 -1px 0 var(--border)", background: "var(--surface)" }}
                      >
                        <input
                          defaultValue={col}
                          onBlur={(e) => renameColumn(tbl, col, e.target.value)}
                          className="flex-1 min-w-0 py-2 font-mono text-[11px] font-semibold outline-none truncate"
                          style={{ background: "transparent", color: "var(--muted2)" }}
                          title={col}
                        />
                      </div>
                    ))}
                    <div
                      className="sticky right-0 z-10"
                      style={{
                        boxShadow: "inset 1px 0 0 var(--border), inset 0 -1px 0 var(--border), -6px 0 8px -6px rgba(0,0,0,0.45)",
                        background: "var(--surface)",
                      }}
                    />
                  </div>

                  {/* Rows */}
                  {rows.slice(0, 30).map((row, ri) => {
                    const rowBg = ri % 2 === 1 ? "var(--surface3)" : "var(--surface2)";
                    return (
                    <div
                      key={ri}
                      className="grid group/row"
                      style={{
                        gridTemplateColumns: `repeat(${cols.length}, minmax(92px,1fr)) 26px`,
                        boxShadow: "inset 0 -1px 0 var(--border)",
                        background: rowBg,
                      }}
                    >
                      {cols.map((col) => (
                        <div
                          key={col}
                          className="group-hover/row:!bg-[var(--accent-soft)] transition-colors"
                          style={{ boxShadow: "inset -1px 0 0 var(--border)", background: rowBg }}
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
                          boxShadow: "inset 1px 0 0 var(--border), -6px 0 8px -6px rgba(0,0,0,0.45)",
                          background: rowBg,
                        }}
                      >
                        <motion.button
                          whileHover={{ scale: 1.15, transition: { duration: 0.1 } }}
                          whileTap={{ scale: 0.85 }}
                          onClick={() => dropRow(tbl, ri)}
                          title="Remove row"
                          className="btn-danger-ghost !text-[11px] w-[18px] h-[18px] rounded-full flex items-center justify-center opacity-40 hover:opacity-100"
                          style={{ color: "var(--error)" }}
                        >
                          ×
                        </motion.button>
                      </div>
                    </div>
                    );
                  })}

                  {/* Dedicated column-removal row — sits at the very bottom of
                      the scrollable grid, directly above the horizontal
                      scrollbar, mirroring the sticky row-removal column on the
                      right. Gives every column its own always-visible "×" here
                      instead of only on hover in the header, so adding/removing
                      columns is as easy as adding/removing rows. */}
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(${cols.length}, minmax(92px,1fr)) 26px`,
                      boxShadow: "inset 0 1px 0 var(--border)",
                      background: "var(--surface3)",
                    }}
                  >
                    {cols.map((col) => (
                      <div
                        key={col}
                        className="flex items-center justify-center py-0.5"
                        style={{ boxShadow: "inset -1px 0 0 var(--border)" }}
                      >
                        <div className="flex items-center justify-center" style={{ width: 20, height: 20 }}>
                          <motion.button
                            whileHover={{ scale: 1.15, transition: { duration: 0.1 } }}
                            whileTap={{ scale: 0.85 }}
                            onClick={() => dropColumn(tbl, col)}
                            disabled={cols.length <= 1}
                            title={cols.length <= 1 ? "A table needs at least one column" : `Remove column "${col}"`}
                            className="btn-danger-ghost !text-[11px] w-[18px] h-[18px] rounded-full flex items-center justify-center disabled:opacity-30"
                            style={{ color: cols.length <= 1 ? undefined : "var(--error)" }}
                          >
                            ×
                          </motion.button>
                        </div>
                      </div>
                    ))}
                    <div
                      className="sticky right-0 z-10"
                      style={{
                        boxShadow: "inset 1px 0 0 var(--border), -6px 0 8px -6px rgba(0,0,0,0.45)",
                        background: "var(--surface3)",
                      }}
                    />
                  </div>
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
                    <motion.button
                      key={label as string}
                      whileHover={{ backgroundColor: "var(--accent-soft)", transition: { duration: 0.15 } }}
                      whileTap={subtleBtnTap}
                      onClick={fn as () => void}
                      title={tip as string}
                      className="flex-1 flex items-center justify-center gap-1 py-2 text-[11.5px] font-bold transition-colors"
                      style={{
                        color: "var(--accent)",
                        borderRight: i === 0 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      {label as string}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </aside>

    <AnimatePresence>
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
    </AnimatePresence>
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
    <motion.div
      variants={modalOverlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <motion.div
        variants={modalContentVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="card card-accent-blue p-5 w-[520px] max-w-[90vw]"
        style={{
          boxShadow: "var(--shadow-lg), 0 0 60px -15px color-mix(in srgb, var(--accent) 25%, transparent)",
          background: "var(--surface)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="panel-heading !text-[13px] !normal-case !tracking-normal !font-semibold" style={{ color: "var(--text)" }}>
            <span className="panel-dot" style={{ background: "var(--accent)" }} />
            Import SQL Schema
          </h3>
          <motion.button
            whileHover={{ scale: 1.15, rotate: 90, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.85 }}
            onClick={onClose}
            className="btn-ghost !p-1.5"
          >
            ✕
          </motion.button>
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

        <AnimatePresence>
          {errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 text-[11px] p-2.5 rounded-lg"
              style={{ background: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--warning)", border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)" }}
            >
              {errors.map((e, i) => (
                <div key={i}>⚠ {e}</div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {importedNames && importedNames.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 text-[11px] p-2.5 rounded-lg"
              style={{ background: "color-mix(in srgb, var(--success) 10%, transparent)", color: "var(--success)", border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)" }}
            >
              ✓ Imported {importedNames.length} table{importedNames.length === 1 ? "" : "s"}: {importedNames.join(", ")}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 mt-4">
          <motion.button
            whileHover={btnHover}
            whileTap={btnTap}
            onClick={onImport}
            disabled={!ddlText.trim()}
            className="btn-primary flex-1 !py-2"
          >
            Parse & Import
          </motion.button>
          <motion.button
            whileHover={subtleBtnHover}
            whileTap={subtleBtnTap}
            onClick={onClose}
            className="btn-secondary !px-4 !py-2"
          >
            {importedNames ? "Done" : "Cancel"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}