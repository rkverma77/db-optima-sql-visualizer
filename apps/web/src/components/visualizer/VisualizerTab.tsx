"use client";

import { SQLEditor } from "@/components/ui/SQLEditor";

import { useState, useCallback, useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { parsePipeline, prefixRows, nestedLoopJoin, highlightSQL } from "@/lib/sql/engine";
import { runQuery } from "@/lib/sql/runner";
import type { TableRow, PipelineStep } from "@/types";
import {
  motion,
  AnimatePresence,
} from "framer-motion";

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

/* ─── Shared style fragments ────────────────────────────────── */
const glass: React.CSSProperties = {
  background: "var(--surface)",
  backdropFilter: "blur(16px)",
  border: "1px solid var(--border)",
};

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
  
  const outputRef = useRef<HTMLDivElement>(null);
  const framesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (framesContainerRef.current) {
      framesContainerRef.current.scrollTo({
        top: framesContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [frames]);

  useEffect(() => {
    if (queryResult && outputRef.current) {
      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }, [queryResult]);

  const hlRow = (id: string, idx: number, add: boolean) => {
    setHighlightedRows((prev) => {
      const next = { ...prev };
      const s = new Set(next[id] ?? []);
      add ? s.add(idx) : s.delete(idx);
      next[id] = s;
      return next;
    });
  };

  // `frames`/`highlightedRows` are local component state — they're not part
  // of the store, so loadDataset() (which resets queryResult, pipeline,
  // etc.) has no way to clear them. Without this, switching the sample
  // dataset left the last run's animation tables on screen even though
  // they belonged to the previous dataset. tableData's reference changes on
  // any dataset swap, CSV import, schema import, or manual row/col edit, so
  // this keeps the visualization in sync with whatever data is actually
  // loaded.
  useEffect(() => {
    setFrames([]);
    setHighlightedRows({});
  }, [tableData]);

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

      let cur: TableRow[] = [];
      let stepIdx = 0;
      const virtualTableData = { ...tableData };

      for (const step of steps) {
        if (step.type === "SELECT") break; // SELECT is handled outside the loop

        updateStepStatus(stepIdx, "active");

        if (step.type === "COMPLEX") {
          const complexTables = (step.tables || []).map((t, idx) => ({
            label: `Referenced: ${t}`,
            id: `vt-complex-${idx}`,
            rows: virtualTableData[t] ? virtualTableData[t].slice(0, 3) : [] 
          }));
          
          if (complexTables.length > 0) {
            setFrames([{ tables: complexTables }]);
            await wait(animSpeed * 1.5);
          } else {
            setFrames([{ tables: [{ label: "Execution Mode", id: "vt-complex", rows: [{ Status: "Executing Complex Query..." }] }] }]);
            await wait(animSpeed * 1.5);
            setFrames([{ tables: [{ label: "Execution Mode", id: "vt-complex", rows: [{ Status: "Execution Complete. Check Output tab." }] }] }]);
          }
        } else if (step.type === "CTE") {
          if (step.queryFragment) {
            const res = await runQuery(step.queryFragment, tableData);
            if (res && res.values.length > 0) {
              const rows = res.values.map(r => {
                const obj: any = {};
                res.columns.forEach((c, i) => obj[c] = r[i]);
                return obj;
              });
              virtualTableData[step.table!] = rows;
              setFrames(prev => [...prev, { tables: [{ label: `CTE: ${step.alias}`, id: `vt-cte-${stepIdx}`, rows }] }]);
            } else {
              setFrames(prev => [...prev, { tables: [{ label: `CTE: ${step.alias}`, id: `vt-cte-${stepIdx}`, rows: [{ Status: "Executing CTE..." }] }] }]);
            }
          }
          await wait(animSpeed * 0.8);
        } else if (step.type === "FROM") {
          cur = prefixRows(virtualTableData[step.table!] ?? [], step.alias!);
          setFrames([{ tables: [{ label: step.alias!, id: `vt-base-${stepIdx}`, rows: cur.length > 0 ? cur : [{ Status: "Empty Table" }] }] }]);
          await wait(animSpeed);
        } else if (step.type === "JOIN") {
          const jRows = prefixRows(virtualTableData[step.table!] ?? [], step.alias!);
          const joined: TableRow[] = [];

          setFrames((prev) => [
            ...prev,
            { tables: [{ label: step.alias!, id: `vt-join-${stepIdx}`, rows: jRows.length > 0 ? jRows : [{ Status: "Empty Table" }] }] },
          ]);
          await wait(animSpeed * 0.5);

          // animate nested loop join
          for (const match of nestedLoopJoin(cur, jRows, step.leftKey!, step.rightKey!)) {
            hlRow(`vt-base-${stepIdx - 1}`, match.aIdx, true);
            hlRow(`vt-join-${stepIdx}`, match.bIdx, true);
            await wait(animSpeed * 0.4);
            joined.push(match.merged);
            hlRow(`vt-base-${stepIdx - 1}`, match.aIdx, false);
            hlRow(`vt-join-${stepIdx}`, match.bIdx, false);
            await wait(animSpeed * 0.2);
          }

          cur = joined;
          setFrames((prev) => [
            ...prev,
            { tables: [{ label: "Intermediate", id: `vt-inter-${stepIdx}`, rows: joined.length > 0 ? joined : [{ Status: "No Matches" }] }] },
          ]);
        } else if (step.type === "WHERE") {
          await wait(animSpeed);
        } else if (step.type === "AGGREGATE" || step.type === "WINDOW") {
          await wait(animSpeed * 1.2);
        } else if (step.type === "SUBQUERY") {
          const sqRows = prefixRows(tableData[step.table!] ?? [], step.alias!);
          setFrames((prev) => [
            ...prev,
            { tables: [{ label: `Subquery → ${step.table}`, id: `vt-subq-${stepIdx}`, rows: sqRows.length > 0 ? sqRows : [{ Status: "Empty" }] }] },
          ]);
          await wait(animSpeed * 0.6);
        }

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
        {/* SQL Editor Card */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="rounded-2xl p-4 overflow-hidden"
          style={{
            ...glass,
            borderTop: "1px solid var(--accent)",
            boxShadow: "0 0 24px -8px rgba(56,189,248,0.08)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="panel-heading">
              <span
                className="panel-dot"
                style={{ background: "var(--accent)" }}
              />
              SQL Editor
            </h3>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.04, boxShadow: "0 0 16px rgba(56,189,248,0.25)" }}
                whileTap={{ scale: 0.96 }}
                onClick={run}
                disabled={isRunning}
                className="btn-primary !py-1.5 !px-3 !text-[13px]"
                style={{ position: "relative", overflow: "hidden" }}
              >
                {isRunning ? (
                  <span className="flex items-center gap-1.5">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                      style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "currentColor" }}
                    />
                    Running…
                  </span>
                ) : "▶ Run"}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setFrames([])}
                disabled={isRunning}
                className="btn-secondary !py-1.5 !px-3 !text-[13px]"
              >
                ↺ Reset
              </motion.button>
            </div>
          </div>

          {/* SQL EDITOR (syntax-highlighted) */}
          <SQLEditor
            value={visualizerSQL}
            onChange={setVisualizerSQL}
            placeholder="Write your SQL query here..."
            minHeight={520}
          />
        </motion.div>

        {/* Execution Plan Card */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
          className="rounded-2xl p-4 flex-shrink-0"
          style={{
            ...glass,
            borderTop: "1px solid var(--accent-violet)",
            boxShadow: "0 0 24px -8px rgba(139,92,246,0.08)",
          }}
        >
          <h3 className="panel-heading mb-3">
            <span
              className="panel-dot"
              style={{ background: "var(--accent-violet)" }}
            />
            Execution Plan
          </h3>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {pipeline.length === 0 ? (
              <p className="text-sm text-[var(--muted)] italic">Awaiting query…</p>
            ) : (
              pipeline.map((step, i) => (
                <div key={`step-${i}`} className="flex items-center gap-1.5">
                  <PipelineStepChip step={step} index={i} />
                  {i < pipeline.length - 1 && (
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="text-[var(--muted)] text-sm select-none"
                    >
                      →
                    </motion.span>
                  )}
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Right: animation stage + results ── */}
      <div className="flex flex-col gap-5 min-h-0">
        {/* Process Visualization Card */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.04, ease: "easeOut" }}
          className="rounded-2xl p-4 flex-1 min-h-[300px] flex flex-col"
          style={{
            ...glass,
            borderTop: "1px solid var(--accent-teal)",
            boxShadow: "0 0 24px -8px rgba(20,184,166,0.08)",
          }}
        >
          <h3 className="panel-heading mb-3 flex-shrink-0">
            <span
              className="panel-dot"
              style={{ background: "var(--accent-teal)" }}
            />
            Process Visualization
          </h3>
          <div ref={framesContainerRef} className="space-y-4 overflow-auto flex-1 min-h-0 pr-2">
            <AnimatePresence mode="wait">
              {frames.length === 0 ? (
                <EmptyStage key="empty" />
              ) : (
                <motion.div
                  key="frames"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {frames.map((frame, fi) => (
                    <motion.div
                      key={`frame-${fi}`}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: fi * 0.06 }}
                      className="space-y-2"
                    >
                      {frame.tables.map((t) => (
                        <VizTable
                          key={`${fi}-${t.id}`}
                          label={t.label}
                          rows={t.rows}
                          highlighted={highlightedRows[t.id] ?? new Set()}
                        />
                      ))}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Output Card */}
        <motion.div
          ref={outputRef}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12, ease: "easeOut" }}
          className="rounded-2xl p-4 flex-shrink-0"
          style={{
            ...glass,
            borderTop: "1px solid var(--accent-amber)",
            boxShadow: "0 0 24px -8px rgba(245,158,11,0.08)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="panel-heading">
              <span
                className="panel-dot"
                style={{ background: "var(--accent-amber)" }}
              />
              Output
            </h3>
            <motion.span
              key={queryResult ? queryResult.values.length : "empty"}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 350, damping: 22 }}
              className="text-xs font-semibold text-[var(--muted)] px-2.5 py-1 rounded-full"
              style={{ background: "var(--surface3)", border: "1px solid var(--border)" }}
            >
              {queryResult ? `${queryResult.values.length} rows` : "—"}
            </motion.span>
          </div>
          {/* Always mounted so the reveal/collapse animates (max-height +
              opacity transition) instead of the table just popping in or
              the card instantly snapping back to its empty size. */}
          <motion.div
            animate={{
              maxHeight: queryResult ? 260 : 0,
              opacity: queryResult ? 1 : 0,
            }}
            initial={{ maxHeight: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const }}
            className="overflow-hidden rounded-lg border"
            style={{
              borderColor: queryResult ? "var(--border)" : "transparent",
            }}
          >
            <div className="overflow-auto max-h-[260px]">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b border-[var(--border)]"
                    style={{ background: "var(--surface3)" }}
                  >
                    {(queryResult?.columns ?? []).map((c) => (
                      <th
                        key={c}
                        className="text-left p-2 font-semibold text-[var(--muted)]"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(queryResult?.values ?? []).map((row, i) => (
                    <motion.tr
                      key={`row-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.02 }}
                      className="border-b border-[var(--border)]/50 hover:bg-[var(--surface3)] transition-colors"
                    >
                      {row.map((v, j) => (
                        <td
                          key={`cell-${i}-${j}`}
                          className="p-2 font-mono text-xs"
                        >
                          {String(v ?? "")}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>

    {/* Error modal — centered, blurred backdrop, so a query error is
        impossible to miss instead of being one more card a new user has
        to scroll down to notice. */}
    <AnimatePresence>
      {error && (
        <motion.div
          key="error-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onClick={() => setError(null)}
        >
          <motion.div
            key="error-modal"
            initial={{ opacity: 0, scale: 0.88, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[480px] max-w-[90vw] p-5 rounded-2xl"
            style={{
              ...glass,
              borderTop: "3px solid var(--error)",
              boxShadow: "0 24px 64px -16px rgba(239,68,68,0.2), 0 0 0 1px var(--border)",
            }}
          >
            <div className="flex items-start gap-3">
              <motion.span
                initial={{ rotate: -15, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.1 }}
                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[16px]"
                style={{ background: "var(--error-soft)", color: "var(--error)" }}
              >
                ⚠
              </motion.span>
              <div className="flex-1 min-w-0">
                <h3
                  className="font-semibold text-[14px] mb-1"
                  style={{ color: "var(--error)" }}
                >
                  Query failed
                </h3>
                <p
                  className="text-[13px] font-mono break-words"
                  style={{ color: "var(--text)" }}
                >
                  {error}
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setError(null)}
                className="btn-primary !py-1.5 !px-4 !text-[13px]"
              >
                Dismiss
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PipelineStepChip({ step, index }: { step: PipelineStep; index: number }) {
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
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.05, type: "spring", stiffness: 400, damping: 25 }}
      whileHover={{
        scale: 1.06,
        boxShadow: step.status === "active"
          ? "0 0 16px rgba(56,189,248,0.2)"
          : step.status === "done"
            ? "0 0 16px rgba(34,197,94,0.15)"
            : "0 0 8px rgba(128,128,128,0.08)",
      }}
      className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-full border text-[12px] whitespace-nowrap cursor-default"
      style={{
        borderColor: borders[step.status],
        backgroundColor: step.status === "active" ? "var(--accent-violet-soft)" : "var(--surface3)",
        transition: "background-color 0.3s, border-color 0.3s",
      }}
    >
      {/* Animated status dot */}
      <motion.span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: colors[step.status] }}
        animate={step.status === "active" ? {
          scale: [1, 1.6, 1],
          opacity: [1, 0.5, 1],
        } : {}}
        transition={step.status === "active" ? {
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
        } : {}}
      />
      <span className="font-semibold" style={{ color: colors[step.status] }}>
        {step.type}
        {step.alias ? ` ${step.alias}` : ""}
      </span>
      <AnimatePresence>
        {step.status === "active" && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.25 }}
            className="text-[10px] font-medium overflow-hidden"
            style={{ color: colors[step.status] }}
          >
            running…
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function VizTable({ label, rows, highlighted }: { label: string; rows: TableRow[]; highlighted: Set<number> }) {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-xl overflow-hidden"
      style={{
        ...glass,
        boxShadow: "0 4px 24px -8px rgba(0,0,0,0.12)",
      }}
    >
      <div
        className="px-3 py-2 border-b text-xs font-semibold text-[var(--muted2)] uppercase tracking-wider"
        style={{
          background: "var(--surface3)",
          borderColor: "var(--border)",
        }}
      >
        {label}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {cols.map((c) => (
                <th
                  key={`h-${c}`}
                  className="text-left p-2 font-medium text-[var(--muted)] whitespace-nowrap"
                >
                  {c.includes(".") ? c.split(".")[1] : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <motion.tr
                key={`r-${ri}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  backgroundColor: highlighted.has(ri)
                    ? "rgba(56,189,248,0.15)"
                    : "transparent",
                  boxShadow: highlighted.has(ri)
                    ? "inset 0 0 20px rgba(56,189,248,0.08)"
                    : "inset 0 0 0px transparent",
                }}
                transition={{
                  opacity: { duration: 0.25, delay: ri * 0.02 },
                  x: { duration: 0.25, delay: ri * 0.02 },
                  backgroundColor: { duration: 0.25 },
                  boxShadow: { duration: 0.3 },
                }}
                className="border-b border-[var(--border)]/30"
              >
                {cols.map((c) => (
                  <td key={`d-${ri}-${c}`} className="p-2 whitespace-nowrap font-mono">
                    {String(row[c] ?? "")}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function EmptyStage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center h-48 text-[var(--muted)]"
    >
      <motion.svg
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="w-12 h-12 mb-3 opacity-30"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </motion.svg>
      <p className="text-sm">Run a query to visualize execution</p>
    </motion.div>
  );
}