"use client";

import { useRef } from "react";
import { useStore } from "@/store/useStore";
import { SAMPLE_DATASETS } from "@/lib/data/datasets";

export function SchemaPanel() {
  const {
    tableData, addTable, dropTable,
    addRow, dropRow, addColumn,
    updateCell, renameColumn,
    activeDataset, loadDataset,
  } = useStore();

  const newTblRef = useRef<HTMLInputElement>(null);

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
    <aside
      style={{ width: 264, background: "var(--surface)", borderRight: "1px solid var(--border)" }}
      className="flex flex-col flex-shrink-0 overflow-hidden"
    >
      {/* Header */}
      <div
        className="p-2 flex flex-col gap-2 flex-shrink-0"
        style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          Schema Explorer
        </span>
        <div className="flex gap-1.5">
          <input
            ref={newTblRef}
            placeholder="Table name…"
            onKeyDown={(e) => e.key === "Enter" && handleAddTable()}
            className="flex-1 px-2 py-1 text-[11.5px] rounded outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--border2)", color: "var(--text)" }}
          />
          <button
            onClick={handleAddTable}
            className="px-2 py-1 rounded text-[11px] font-semibold text-black"
            style={{ background: "var(--accent)" }}
          >
            + Table
          </button>
        </div>
        <label
          className="text-center py-1 rounded text-[11px] cursor-pointer"
          style={{ border: "1px solid var(--border2)", color: "var(--muted2)" }}
        >
          📂 Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleCSV} />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>Sample dataset:</span>
          <select
            value={activeDataset ?? ""}
            onChange={(e) => e.target.value && loadDataset(e.target.value as keyof typeof SAMPLE_DATASETS)}
            className="px-2 py-1 text-[11px] rounded outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--border2)", color: "var(--text)" }}
          >
            <option value="" disabled>Load a sample…</option>
            {Object.entries(SAMPLE_DATASETS).map(([key, ds]) => (
              <option key={key} value={key}>{ds.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {Object.keys(tableData).map((tbl) => {
          const rows = tableData[tbl];
          const cols = rows[0] ? Object.keys(rows[0]) : ["id"];
          const colCount = cols.length + 1; // +1 for delete btn

          return (
            <div
              key={tbl}
              className="rounded overflow-hidden"
              style={{ border: "1px solid var(--border)", background: "var(--surface2)" }}
            >
              {/* Table header */}
              <div
                className="flex justify-between items-center px-2.5 py-1.5"
                style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
              >
                <span className="font-mono text-[11.5px] font-semibold" style={{ color: "var(--accent)" }}>
                  {tbl}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>{rows.length} rows</span>
                  <button
                    onClick={() => dropTable(tbl)}
                    className="text-[10px] px-1 rounded hover:bg-red-900/30 transition-colors"
                    style={{ color: "var(--muted)" }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Grid */}
              <div className="overflow-x-auto">
                {/* Column headers */}
                <div
                  className="grid"
                  style={{ gridTemplateColumns: `repeat(${colCount}, minmax(48px,1fr))` }}
                >
                  {cols.map((col) => (
                    <div key={col} style={{ borderRight: "1px solid var(--border)" }}>
                      <input
                        defaultValue={col}
                        onBlur={(e) => renameColumn(tbl, col, e.target.value)}
                        className="w-full px-1.5 py-1 font-mono text-[10.5px] font-semibold outline-none"
                        style={{
                          background: "var(--surface)",
                          color: "var(--muted2)",
                          borderBottom: "1px solid var(--border)",
                        }}
                      />
                    </div>
                  ))}
                  <div style={{ borderBottom: "1px solid var(--border)" }} />
                </div>

                {/* Rows */}
                {rows.slice(0, 30).map((row, ri) => (
                  <div
                    key={ri}
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${colCount}, minmax(48px,1fr))`, borderBottom: "1px solid var(--border)" }}
                  >
                    {cols.map((col) => (
                      <div key={col} style={{ borderRight: "1px solid var(--border)" }}>
                        <input
                          defaultValue={row[col] ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value;
                            updateCell(tbl, ri, col, !isNaN(Number(v)) && v !== "" ? Number(v) : v || null);
                          }}
                          className="w-full px-1.5 py-1 font-mono text-[11px] outline-none"
                          style={{ background: "transparent", color: "var(--text)" }}
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => dropRow(tbl, ri)}
                        className="text-[9px] px-1 rounded hover:bg-red-900/30"
                        style={{ color: "var(--muted)" }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex" style={{ borderTop: "1px solid var(--border)" }}>
                {[["+ Row", () => addRow(tbl)], ["+ Col", () => addColumn(tbl)]].map(
                  ([label, fn]) => (
                    <button
                      key={label as string}
                      onClick={fn as () => void}
                      className="flex-1 py-1 text-[11px] transition-colors hover:bg-[var(--surface)]"
                      style={{ color: "var(--muted)", borderRight: "1px solid var(--border)" }}
                    >
                      {label as string}
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
