"use client";

import { SQLEditor } from "@/components/ui/SQLEditor";

import { useState, useCallback } from "react";
import { useStore } from "@/store/useStore";
import { parsePipeline, prefixRows, nestedLoopJoin, highlightSQL } from "@/lib/sql/engine";
import { runQuery } from "@/lib/sql/runner";
import type { TableRow, PipelineStep } from "@/types";

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface FrameTable {
  label: string;
  id: string;
  rows: TableRow[];
}

interface Frame {
  tables: FrameTable[];
}

export function VisualizerTab() {
  const {
    visualizerSQL,
    setVisualizerSQL,
    tableData,
    pipeline,
    setPipeline,
    updateStepStatus,
    queryResult,
    setQueryResult,
    error,
    setError,
    isRunning,
    setIsRunning,
    animSpeed,
  } = useStore();

  const [frames, setFrames] = useState<Frame[]>([]);
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

  const run = useCallback(async () => {
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
        if (step.type === "WHERE") {
          updateStepStatus(stepIdx, "active");
          await wait(animSpeed);
          updateStepStatus(stepIdx, "done");
          stepIdx++;
          continue;
        }

        if (step.type === "SUBQUERY") {
          // Correlated subqueries re-run once per outer row inside SQLite
          // itself — there's no two-table nested-loop match to animate the
          // way a JOIN has. The best we can show is *which* table each
          // per-row lookup hits, so the pipeline doesn't look like it
          // jumps straight from WHERE to the final result.
          updateStepStatus(stepIdx, "active");
          const sqRows = prefixRows(tableData[step.table!] ?? [], step.alias!);
          setFrames((prev) => [
            ...prev,
            { tables: [{ label: `Subquery → ${step.table}`, id: `vt-subq-${stepIdx}`, rows: sqRows }] },
          ]);
          await wait(animSpeed * 0.6);
          updateStepStatus(stepIdx, "done");
          stepIdx++;
          continue;
        }

        if (step.type !== "JOIN") continue;
        updateStepStatus(stepIdx, "active");
        const jRows = prefixRows(tableData[step.table!] ?? [], step.alias!);
        const joined: TableRow[] = [];

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
  }, [visualizerSQL, tableData, animSpeed, isRunning, setPipeline, updateStepStatus, setQueryResult, setError, setIsRunning]);

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">
      {/* ── Left: editor + pipeline ── */}
      <div className="flex flex-col gap-5 min-h-0 overflow-y-auto pr-1">
        <div className="card card-accent-blue p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="panel-heading">
              <span className="panel-dot" style={{ background: "var(--accent)" }} />
              SQL Editor
            </h3>
            <div className="flex gap-2">
              <button onClick={run} disabled={isRunning} className="btn-primary !py-1.5 !px-3 !text-[13px]">
                {isRunning ? "Running…" : "▶ Run"}
              </button>
              <button
                onClick={() => setFrames([])}
                disabled={isRunning}
                className="btn-secondary !py-1.5 !px-3 !text-[13px]"
              >
                ↺ Reset
              </button>
            </div>
          </div>

          {/* SQL EDITOR (syntax-highlighted) */}
          <SQLEditor
            value={visualizerSQL}
            onChange={setVisualizerSQL}
            placeholder="Write your SQL query here..."
            minHeight={520}
          />
        </div>

        <div className="card card-accent-violet p-4 flex-shrink-0">
          <h3 className="panel-heading mb-3">
            <span className="panel-dot" style={{ background: "var(--accent-violet)" }} />
            Execution Plan
          </h3>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {pipeline.length === 0 ? (
              <p className="text-sm text-[var(--muted)] italic">Awaiting query…</p>
            ) : (
              pipeline.map((step, i) => (
                <div key={`step-${i}`} className="flex items-center gap-1.5">
                  <PipelineStepChip step={step} />
                  {i < pipeline.length - 1 && (
                    <span className="text-[var(--muted)] text-sm select-none">→</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Right: animation stage + results ── */}
      <div className="flex flex-col gap-5 min-h-0">
        <div className="card card-accent-teal p-4 flex-1 min-h-[300px] flex flex-col">
          <h3 className="panel-heading mb-3 flex-shrink-0">
            <span className="panel-dot" style={{ background: "var(--accent-teal)" }} />
            Process Visualization
          </h3>
          <div className="space-y-4 overflow-auto flex-1 min-h-0">
            {frames.length === 0 ? (
              <EmptyStage />
            ) : (
              frames.map((frame, fi) => (
                <div key={`frame-${fi}`} className="space-y-2">
                  {frame.tables.map((t) => (
                    <VizTable
                      key={`${fi}-${t.id}`}
                      label={t.label}
                      rows={t.rows}
                      highlighted={highlightedRows[t.id] ?? new Set()}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card card-accent-amber p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="panel-heading">
              <span className="panel-dot" style={{ background: "var(--accent-amber)" }} />
              Output
            </h3>
            <span className="text-xs font-semibold text-[var(--muted)] px-2 py-0.5 rounded-full" style={{ background: "var(--surface3)", border: "1px solid var(--border)" }}>
              {queryResult ? `${queryResult.values.length} rows` : "—"}
            </span>
          </div>
          {/* Always mounted so the reveal/collapse animates (max-height +
              opacity transition) instead of the table just popping in or
              the card instantly snapping back to its empty size. */}
          <div
            className="overflow-hidden rounded-lg border border-[var(--border)] transition-[max-height,opacity] duration-500 ease-in-out"
            style={{
              maxHeight: queryResult ? 260 : 0,
              opacity: queryResult ? 1 : 0,
              borderColor: queryResult ? "var(--border)" : "transparent",
            }}
          >
            <div className="overflow-auto max-h-[260px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]" style={{ background: "var(--surface3)" }}>
                    {(queryResult?.columns ?? []).map((c) => (
                      <th key={c} className="text-left p-2 font-semibold text-[var(--muted)]">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(queryResult?.values ?? []).map((row, i) => (
                    <tr key={`row-${i}`} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface3)] transition-colors">
                      {row.map((v, j) => (
                        <td key={`cell-${i}-${j}`} className="p-2 font-mono text-xs">{String(v ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Error modal — centered, blurred backdrop, so a query error is
        impossible to miss instead of being one more card a new user has
        to scroll down to notice. */}
    {error && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        onClick={() => setError(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="card w-[480px] max-w-[90vw] p-5"
          style={{ borderTop: "3px solid var(--error)", boxShadow: "var(--shadow-lg)" }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[16px]"
              style={{ background: "var(--error-soft)", color: "var(--error)" }}
            >
              ⚠
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[14px] mb-1" style={{ color: "var(--error)" }}>
                Query failed
              </h3>
              <p className="text-[13px] font-mono break-words" style={{ color: "var(--text)" }}>
                {error}
              </p>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={() => setError(null)} className="btn-primary !py-1.5 !px-4 !text-[13px]">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PipelineStepChip({ step }: { step: PipelineStep }) {
  const colors: Record<PipelineStep["status"], string> = {
    pending: "var(--muted)",
    active: "var(--accent)",
    done: "var(--success)",
  };
  const borders: Record<PipelineStep["status"], string> = {
    pending: "var(--border)",
    active: "var(--accent)",
    done: "var(--success)",
  };

  return (
    <div
      className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-full border text-[12px] whitespace-nowrap transition-colors duration-300"
      style={{
        borderColor: borders[step.status],
        backgroundColor: step.status === "active" ? "var(--accent-violet-soft)" : "var(--surface3)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: colors[step.status] }}
      />
      <span className="font-semibold" style={{ color: colors[step.status] }}>
        {step.type}
        {step.alias ? ` ${step.alias}` : ""}
      </span>
      {step.status === "active" && (
        <span className="text-[10px] font-medium animate-pulse" style={{ color: colors[step.status] }}>
          running…
        </span>
      )}
    </div>
  );
}

function VizTable({ label, rows, highlighted }: { label: string; rows: TableRow[]; highlighted: Set<number> }) {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);

  return (
    <div className="rounded-lg border border-[var(--border2)] bg-[var(--surface)] overflow-hidden shadow-[var(--shadow)]">
      <div className="px-3 py-2 bg-[var(--surface3)] border-b border-[var(--border)] text-xs font-semibold text-[var(--muted2)] uppercase tracking-wider">
        {label}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {cols.map((c) => (
                <th key={`h-${c}`} className="text-left p-2 font-medium text-[var(--muted)] whitespace-nowrap">
                  {c.includes(".") ? c.split(".")[1] : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={`r-${ri}`}
                className="border-b border-[var(--border)]/30 transition-colors"
                style={{
                  backgroundColor: highlighted.has(ri) ? "rgba(56,189,248,0.15)" : "transparent",
                }}
              >
                {cols.map((c) => (
                  <td key={`d-${ri}-${c}`} className="p-2 whitespace-nowrap font-mono">
                    {String(row[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyStage() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-[var(--muted)]">
      <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm">Run a query to visualize execution</p>
    </div>
  );
}