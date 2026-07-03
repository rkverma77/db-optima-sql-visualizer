"use client";

import { useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { SQLEditor } from "@/components/ui/SQLEditor";
import { parsePipeline, prefixRows, nestedLoopJoin, buildSchemaString } from "@/lib/sql/engine";
import { runQuery } from "@/lib/sql/runner";
import type { TableRow, PipelineStep } from "@/types";

// ── types for animation frames ────────────────────────────────
interface AnimFrame {
  tables: { label: string; id: string; rows: TableRow[] }[];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function VisualizerTab() {
  const {
    visualizerSQL, setVisualizerSQL,
    tableData, animSpeed,
    pipeline, setPipeline, updateStepStatus,
    queryResult, setQueryResult,
    isRunning, setIsRunning,
    error, setError,
  } = useStore();

  const [frames, setFrames] = useState<AnimFrame[]>([]);
  const [highlightedRows, setHighlightedRows] = useState<Record<string, Set<number>>>({});

  const hlRow = (id: string, idx: number, add: boolean) => {
    setHighlightedRows((prev) => {
      const next = { ...prev };
      const s = new Set(next[id] ?? []);
      add ? s.add(idx) : s.delete(idx);
      next[id] = s;
      return next;
    });
  };

  const run = async () => {
    if (isRunning) return;
    setFrames([]);
    setHighlightedRows({});
    setQueryResult(null);
    setError(null);
    setIsRunning(true);

    try {
      const steps = parsePipeline(visualizerSQL);
      if (!steps.length) throw new Error("Could not parse query. Ensure it has a FROM clause.");
      setPipeline(steps);

      // ── Step 0: FROM ──
      updateStepStatus(0, "active");
      const base = steps[0];
      const baseRows = prefixRows(tableData[base.table!] ?? [], base.alias!);
      setFrames([{ tables: [{ label: base.alias!, id: "vt-base", rows: baseRows }] }]);
      await wait(animSpeed);
      updateStepStatus(0, "done");

      let cur = baseRows;
      let stepIdx = 1;

      for (const step of steps.slice(1)) {
        if (step.type !== "JOIN") continue;
        updateStepStatus(stepIdx, "active");
        const jRows = prefixRows(tableData[step.table!] ?? [], step.alias!);
        const joined: TableRow[] = [];

        // Add join table to frame
        setFrames((prev) => [
          ...prev,
          { tables: [{ label: step.alias!, id: `vt-join-${stepIdx}`, rows: jRows }] },
        ]);
        await wait(animSpeed * 0.5);

        for (const match of nestedLoopJoin(cur, jRows, step.leftKey!, step.rightKey!)) {
          hlRow("vt-base", match.aIdx, true);
          hlRow(`vt-join-${stepIdx}`, match.bIdx, true);
          await wait(animSpeed * 0.4);
          joined.push(match.merged);
          hlRow("vt-base", match.aIdx, false);
          hlRow(`vt-join-${stepIdx}`, match.bIdx, false);
          await wait(animSpeed * 0.2);
        }

        cur = joined;
        setFrames((prev) => [
          ...prev,
          { tables: [{ label: "Intermediate", id: `vt-inter-${stepIdx}`, rows: joined }] },
        ]);
        updateStepStatus(stepIdx, "done");
        stepIdx++;
      }

      // Final SQL execution
      updateStepStatus(steps.length - 1, "active");
      const result = await runQuery(visualizerSQL, tableData);
      if (result) setQueryResult(result);
      updateStepStatus(steps.length - 1, "done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left: editor + pipeline ── */}
      <div
        className="flex flex-col flex-shrink-0 overflow-hidden"
        style={{ width: 340, borderRight: "1px solid var(--border)" }}
      >
        <div
          className="flex justify-between items-center px-3 py-2 flex-shrink-0"
          style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            SQL Editor
          </span>
          <button
            onClick={run}
            disabled={isRunning}
            className="px-3 py-1 rounded text-[11.5px] font-semibold text-black disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {isRunning ? "Running…" : "▶ Run & Visualize"}
          </button>
        </div>
        <SQLEditor value={visualizerSQL} onChange={setVisualizerSQL} />

        {/* Pipeline */}
        <div
          className="p-3 flex-shrink-0"
          style={{ background: "var(--surface2)", borderTop: "1px solid var(--border)" }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
            Execution Plan
          </div>
          <div className="flex flex-col gap-1.5">
            {pipeline.length === 0 ? (
              <div className="text-[11px] py-1" style={{ color: "var(--muted)" }}>Awaiting query…</div>
            ) : (
              pipeline.map((step, i) => <PipelineStepRow key={i} step={step} />)
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="px-3 py-2 text-[11.5px] font-mono flex-shrink-0"
            style={{
              background: "rgba(239,68,68,0.08)",
              borderTop: "1px solid rgba(239,68,68,0.2)",
              color: "var(--danger)",
            }}
          >
            ⚠ {error}
          </div>
        )}
      </div>

      {/* ── Right: animation stage + results ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="flex justify-between items-center px-3 py-2 flex-shrink-0"
          style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Process Visualization
          </span>
        </div>

        {/* Animation stage */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-5" style={{ background: "var(--bg)" }}>
          {frames.length === 0 ? (
            <EmptyStage />
          ) : (
            frames.map((frame, fi) =>
              frame.tables.map((t) => (
                <VizTable key={t.id} label={t.label} rows={t.rows} highlighted={highlightedRows[t.id] ?? new Set()} />
              ))
            )
          )}
        </div>

        {/* Result pane */}
        <div
          className="flex-shrink-0 flex flex-col"
          style={{ height: 160, borderTop: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <div
            className="flex justify-between items-center px-3 py-1.5 flex-shrink-0"
            style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              Output
            </span>
            <span className="text-[11px]" style={{ color: "var(--muted)" }}>
              {queryResult ? `${queryResult.values.length} rows` : "—"}
            </span>
          </div>
          <div className="overflow-auto flex-1">
            {queryResult && (
              <table className="w-full border-collapse text-[11.5px]">
                <thead>
                  <tr>
                    {queryResult.columns.map((c) => (
                      <th
                        key={c}
                        className="sticky top-0 px-2.5 py-1.5 text-left uppercase text-[10.5px] tracking-wide font-semibold"
                        style={{
                          background: "var(--surface2)",
                          borderBottom: "1px solid var(--border)",
                          color: "var(--muted)",
                        }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.values.map((row, i) => (
                    <tr key={i} className="flash-row">
                      {row.map((v, j) => (
                        <td
                          key={j}
                          className="px-2.5 py-1 font-mono"
                          style={{ borderBottom: "1px solid var(--border)" }}
                        >
                          {String(v ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PipelineStepRow({ step }: { step: PipelineStep }) {
  const colors: Record<PipelineStep["status"], string> = {
    pending: "var(--muted)",
    active:  "var(--accent)",
    done:    "var(--success)",
  };
  const borders: Record<PipelineStep["status"], string> = {
    pending: "var(--border)",
    active:  "var(--accent)",
    done:    "var(--success)",
  };

  return (
    <div
      className="flex justify-between items-center px-2.5 py-1.5 rounded text-[11px] font-mono transition-all"
      style={{
        background: step.status === "active" ? "rgba(0,212,255,0.05)" : "var(--bg)",
        border: `1px solid ${borders[step.status]}`,
        color: colors[step.status],
      }}
    >
      <span>
        {step.type}
        {step.alias ? ` ${step.alias}` : ""}
      </span>
      <span
        className="text-[9px] px-1.5 py-0.5 rounded-full"
        style={{ background: "rgba(255,255,255,0.05)" }}
      >
        {step.status}
      </span>
    </div>
  );
}

function VizTable({ label, rows, highlighted }: { label: string; rows: TableRow[]; highlighted: Set<number> }) {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
        {label}
      </span>
      <div
        className="overflow-auto rounded"
        style={{ border: "1px solid var(--border)", background: "var(--surface)", maxHeight: 280 }}
      >
        {/* Header */}
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(60px, 1fr))` }}
        >
          {cols.map((c) => (
            <div
              key={c}
              className="px-2 py-1 text-[10px] font-semibold font-mono truncate"
              style={{
                borderRight: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--muted2)",
              }}
            >
              {c.includes(".") ? c.split(".")[1] : c}
            </div>
          ))}
        </div>
        {/* Rows */}
        {rows.map((row, ri) => (
          <div
            key={ri}
            className={`grid transition-colors ${highlighted.has(ri) ? "row-match" : ""}`}
            style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(60px, 1fr))`, borderBottom: "1px solid var(--border)" }}
          >
            {cols.map((c) => (
              <div
                key={c}
                className="px-2 py-1.5 text-[11px] font-mono truncate v-cell"
                style={{ borderRight: "1px solid var(--border)", maxWidth: 120 }}
              >
                {String(row[c] ?? "")}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyStage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-30">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3h18v4H3z" /><path d="M3 9h18v4H3z" /><path d="M3 15h18v4H3z" />
      </svg>
      <span className="text-sm" style={{ color: "var(--muted)" }}>Run a query to visualize execution</span>
    </div>
  );
}
