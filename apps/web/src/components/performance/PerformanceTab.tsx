"use client";

import { useStore } from "@/store/useStore";
import { useTab } from "@/components/ui/Header";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import type { PerfDataPoint } from "@/types";
import {
  benchmarkAcrossVolumes, explainQueryPlan, explainQueryPlanWithIndexes, compareQueries, compareResultSets, yieldToBrowser,
} from "@/lib/sql/runner";
import type { ResultSetComparison } from "@/lib/sql/runner";
import { generateSyntheticData } from "@/lib/data/datasets";
import { parsePipeline, deriveIndexSuggestions, highlightSQL } from "@/lib/sql/engine";
import { SQLEditor } from "@/components/ui/SQLEditor";

function formatRows(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

const ALL_VOLUMES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
const MAX_VOLUME = 100_000;
// After this many consecutive AI re-optimize rounds still fail the measured
// results check, stop offering another automatic retry — the AI is likely
// stuck making the same category of mistake, and burning more Gemini calls
// won't help. Point the user at manual editing instead.
const MAX_AI_REOPTIMIZE_ATTEMPTS = 3;

// ── Animation Variants ────────────────────────────────────────
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 30 },
  },
};

// ── Complexity Analyzer ───────────────────────────────────────
function analyzeComplexity(sql: string): {
  score: number;
  label: string;
  factors: string[];
  color: string;
} {
  const factors: string[] = [];
  let score = 0;
  const upper = sql.toUpperCase();

  if (upper.includes("JOIN")) { score += 2; factors.push("JOIN operations"); }
  if ((upper.match(/JOIN/g) || []).length > 1) { score += 3; factors.push("Multiple JOINs"); }
  if (upper.includes("WHERE")) { score += 1; factors.push("WHERE clause"); }
  if (upper.includes("GROUP BY")) { score += 2; factors.push("GROUP BY"); }
  if (upper.includes("ORDER BY")) { score += 1; factors.push("ORDER BY"); }
  if (upper.includes("SUBQUERY") || upper.includes("SELECT") && upper.lastIndexOf("SELECT") > 0) { score += 3; factors.push("Subquery"); }
  if (upper.includes("UNION")) { score += 2; factors.push("UNION"); }
  if (upper.includes("LIKE")) { score += 1; factors.push("LIKE pattern"); }
  if (upper.includes("EXISTS")) { score += 2; factors.push("EXISTS clause"); }
  if (upper.includes("HAVING")) { score += 2; factors.push("HAVING filter"); }

  let label = "Simple";
  let color = "var(--success)";
  if (score > 3) { label = "Moderate"; color = "var(--warning)"; }
  if (score > 7) { label = "Complex"; color = "var(--error)"; }
  if (score > 10) { label = "Very Complex"; color = "#dc2626"; }

  return { score, label, factors, color };
}

// ── Memory Estimator ────────────────────────────────────────
function estimateMemory(rows: number, tableData: Record<string, any[]>): string {
  const avgRowSize = Object.values(tableData).reduce((sum, rows) => {
    if (!rows.length) return sum;
    const sample = rows[0];
    const size = JSON.stringify(sample).length;
    return sum + size;
  }, 0) / Math.max(1, Object.values(tableData).filter(r => r.length > 0).length);

  const totalBytes = rows * avgRowSize * Object.keys(tableData).length;
  if (totalBytes > 1_000_000_000) return (totalBytes / 1_000_000_000).toFixed(2) + " GB";
  if (totalBytes > 1_000_000) return (totalBytes / 1_000_000).toFixed(2) + " MB";
  if (totalBytes > 1_000) return (totalBytes / 1_000).toFixed(2) + " KB";
  return totalBytes.toFixed(0) + " B";
}

export function PerformanceTab() {
  const {
    dataVolume, setDataVolume, tableData,
    perfOriginalSQL, setPerfOriginalSQL,
    perfOptimizedSQL, setPerfOptimizedSQL,
    perfOptimizedSource, sendAiResultToPerformance,
    aiReoptimizeAttempts, requestAiReoptimize,
    aiResult,
  } = useStore();
  const { setTab } = useTab();

  const [allBenchmarks, setAllBenchmarks] = useState<PerfDataPoint[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [hasComputed, setHasComputed] = useState(false);
  const [computeTime, setComputeTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  // Set when the user clicks "Re-analyze": we deliberately do NOT re-run the
  // benchmark right away. Instead we clear the results so they're back in the
  // edit view, and surface a banner asking them to revise the queries before
  // pressing "Run Comparison Benchmark" again. Keeps the expensive compute a
  // deliberate, user-initiated step instead of a one-click repeat.
  const [awaitingQueryEdit, setAwaitingQueryEdit] = useState(false);

  const [planBefore, setPlanBefore] = useState<string>("");
  const [planAfter, setPlanAfter] = useState<string>("");
  const [planBeforeRaw, setPlanBeforeRaw] = useState<any[]>([]);
  const [planAfterRaw, setPlanAfterRaw] = useState<any[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  // Per-editor errors — a broken query on one side (e.g. references a
  // dropped table) never blocks the other side's run or its results.
  const [originalError, setOriginalError] = useState<string | null>(null);
  const [optimizedError, setOptimizedError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<any>(null);
  // Lightweight row-count/column-set/value equivalence check between what
  // the two queries actually return — catches an "optimized" query that's
  // faster but subtly wrong (dropped filter, wrong JOIN, etc).
  const [resultsComparison, setResultsComparison] = useState<ResultSetComparison | null>(null);

  const [history, setHistory] = useState<{ id: number; time: string; query: string; speedup: string }[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const cancelRef = useRef(false);
  const [wasCancelled, setWasCancelled] = useState(false);

  // "Optimized" bundles a rewritten query with new indexes, so the AI's
  // suggested indexes are applied to the optimized side whenever they
  // exist — Editor B is explicitly "the optimized side", so there's no
  // cross-tab ambiguity here (unlike the old single-query flow, there's no
  // risk of borrowing suggestions meant for an unrelated query).
  const usingAiSuggestedIndexes = !!(aiResult?.index_statements?.length);

  const indexDdl = useMemo(() => {
    if (usingAiSuggestedIndexes && aiResult?.index_statements?.length) {
      return aiResult.index_statements;
    }
    if (!perfOptimizedSQL.trim()) return [];
    const steps = parsePipeline(perfOptimizedSQL);
    return deriveIndexSuggestions(steps);
  }, [usingAiSuggestedIndexes, aiResult, perfOptimizedSQL]);

  // Complexity / radar / tips are about the raw query someone's trying to
  // improve, so they stay anchored to Editor A (the original).
  const complexity = useMemo(() => analyzeComplexity(perfOriginalSQL), [perfOriginalSQL]);

  const canUseAiSuggestion = !!(
    aiResult?.optimized_sql &&
    aiResult.optimized_sql.trim() &&
    aiResult.optimized_sql.trim() !== perfOptimizedSQL.trim()
  );

  const canRun = perfOptimizedSQL.trim().length > 0;
  const queriesIdentical = canRun && perfOriginalSQL.trim() === perfOptimizedSQL.trim();

  // This check only tells you something useful when Editor A and Editor B
  // hold the *same* SQL (the "sanity check" case from the acceptance
  // criteria) — there, the only variable is the index, so if none of the
  // suggested index names show up in the "after" plan, SQLite decided not
  // to use them (usually because the baseline `id` index every table has
  // already covers the access pattern just as well). When the two queries
  // actually differ, the plans are *expected* to differ from the rewrite
  // itself, so this specific "index unused" signal isn't meaningful on its
  // own — the measured speedup already tells that story.
  const suggestedIndexActuallyUsed = useMemo(() => {
    if (!compareResult || !indexDdl.length) return true;
    const names = indexDdl
      .map((ddl) => ddl.match(/INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/i)?.[1])
      .filter((n): n is string => !!n);
    if (!names.length) return true;
    return names.some((n) => (compareResult.after?.summary ?? "").toLowerCase().includes(n.toLowerCase()));
  }, [compareResult, indexDdl]);

  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const total = (Date.now() - startTimeRef.current) / 1000;
    setComputeTime(total);
    return total;
  };

  const computeBenchmarks = useCallback(async () => {
    if (isComputing || !canRun) return;
    setIsComputing(true);
    setRunError(null);
    setOriginalError(null);
    setOptimizedError(null);
    setHasComputed(false);
    setComputeTime(null);
    setWasCancelled(false);
    setCompareResult(null);
    setResultsComparison(null);
    setPlanBefore("");
    setPlanAfter("");
    setPlanBeforeRaw([]);
    setPlanAfterRaw([]);
    cancelRef.current = false;
    startTimer();

    try {
      const result = await benchmarkAcrossVolumes(
        (rows) => generateSyntheticData(tableData, rows),
        perfOriginalSQL,
        perfOptimizedSQL,
        indexDdl,
        ALL_VOLUMES,
        { maxMsPerRun: 4000, shouldCancel: () => cancelRef.current }
      );

      if (cancelRef.current) setWasCancelled(true);

      stopTimer();
      setAllBenchmarks(result.points);
      setOriginalError(result.originalError);
      setOptimizedError(result.optimizedError);
      setHasComputed(true);

      // Save to history (based on the last volume where both sides ran)
      const lastComplete = [...result.points].reverse().find((p) => p.originalMs >= 0 && p.optimizedMs >= 0);
      const speedupVal = lastComplete ? (lastComplete.originalMs / lastComplete.optimizedMs).toFixed(1) : "—";
      setHistory(prev => [...prev.slice(-4), {
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        query: perfOriginalSQL.slice(0, 50) + "...",
        speedup: speedupVal
      }]);

      // Get EXPLAIN plans and a single-volume timing comparison — skip if
      // cancelled, since these also execute the (possibly slow) queries
      // against a scaled dataset and there's no point starting more work
      // after a cancel.
      if (!cancelRef.current) {
        await yieldToBrowser();
        const scaled = generateSyntheticData(tableData, dataVolume);

        if (!result.originalError && !result.optimizedError) {
          const compare = await compareQueries(perfOriginalSQL, perfOptimizedSQL, scaled, indexDdl);
          setCompareResult(compare);
          setPlanBefore(compare.before.summary);
          setPlanBeforeRaw(compare.before.raw);
          setPlanAfter(compare.after.summary);
          setPlanAfterRaw(compare.after.raw);

          await yieldToBrowser();
          const resultCheck = await compareResultSets(perfOriginalSQL, perfOptimizedSQL, scaled, indexDdl);
          setResultsComparison(resultCheck);
        } else {
          // At least one side is broken — still show a real plan for
          // whichever side works, without blocking on the other.
          if (!result.originalError) {
            await yieldToBrowser();
            const before = await explainQueryPlan(perfOriginalSQL, scaled);
            setPlanBefore(before.summary);
            setPlanBeforeRaw(before.raw);
          }
          if (!result.optimizedError) {
            await yieldToBrowser();
            const after = await explainQueryPlanWithIndexes(perfOptimizedSQL, scaled, indexDdl);
            setPlanAfter(after.summary);
            setPlanAfterRaw(after.raw);
          }
        }
      }
    } catch (e) {
      stopTimer();
      setRunError((e as Error).message);
    } finally {
      setIsComputing(false);
    }
  }, [tableData, perfOriginalSQL, perfOptimizedSQL, indexDdl, dataVolume, isComputing, canRun]);

  // "Re-analyze" intentionally does NOT compute. It clears the previous
  // results and puts the user back into the edit view, where they can tweak
  // the original and/or optimized queries. Computing only happens once they
  // click "Run Comparison Benchmark" — so a re-analysis never silently burns
  // the (expensive, several-second) benchmark on unchanged queries.
  const reanalyze = useCallback(() => {
    if (isComputing) return;
    setHasComputed(false);
    setAllBenchmarks([]);
    setComputeTime(null);
    setResultsComparison(null);
    setCompareResult(null);
    setRunError(null);
    setOriginalError(null);
    setOptimizedError(null);
    setPlanBefore("");
    setPlanAfter("");
    setPlanBeforeRaw([]);
    setPlanAfterRaw([]);
    setWasCancelled(false);
    setAwaitingQueryEdit(true);
  }, [isComputing]);

  useEffect(() => {
    setHasComputed(false);
    setAllBenchmarks([]);
    setComputeTime(null);
    setResultsComparison(null);
    // Editing either query (or the underlying tables/indexes) counts as the
    // "change the queries" step we asked for, so clear the nudge banner.
    setAwaitingQueryEdit(false);
  }, [perfOriginalSQL, perfOptimizedSQL, tableData, indexDdl]);

  // Only offer an automatic AI retry when Editor B's contents actually came
  // from the AI Optimizer (see perfOptimizedSource) — a hand-written query
  // that mismatches has no "previous AI attempt" to send back to Gemini.
  const canAiReoptimize = perfOptimizedSource === "ai" && aiReoptimizeAttempts < MAX_AI_REOPTIMIZE_ATTEMPTS;

  // Builds the empirical mismatch evidence and sends it back to the AI
  // Optimizer as a retry, then jumps to that tab so the person sees the
  // new attempt land. This is a real Gemini call, not a client-side guess —
  // so it's only ever reachable when the current optimized query actually
  // is the AI's own output (see canAiReoptimize).
  const reoptimizeWithAi = useCallback(() => {
    if (!resultsComparison || resultsComparison.matches) return;
    const feedback = [
      `Previous optimized_sql attempt: ${perfOptimizedSQL}`,
      `Measured mismatch: ${resultsComparison.reason ?? "results differ"}`,
      `Original row count: ${resultsComparison.originalRowCount} vs optimized row count: ${resultsComparison.optimizedRowCount}`,
      `Original columns: [${resultsComparison.originalColumns.join(", ")}] vs optimized columns: [${resultsComparison.optimizedColumns.join(", ")}]`,
      ...(resultsComparison.mismatchExamples.length
        ? [`Example value mismatches: ${resultsComparison.mismatchExamples.join(" | ")}`]
        : []),
    ].join("\n");
    requestAiReoptimize(feedback);
    setTab("ai");
  }, [resultsComparison, perfOptimizedSQL, requestAiReoptimize, setTab]);

  const chartData = useMemo(() => {
    return allBenchmarks
      .filter((p) => p.rows <= dataVolume)
      .map((p) => ({
        ...p,
        originalMs: p.originalMs >= 0 ? p.originalMs : null,
        optimizedMs: p.optimizedMs >= 0 ? p.optimizedMs : null,
      }));
  }, [allBenchmarks, dataVolume]);

  const yAxisMax = useMemo(() => {
    if (chartData.length === 0) return 100;
    const maxVal = Math.max(...chartData.map((d) => Math.max(d.originalMs ?? 0, d.optimizedMs ?? 0)));
    return Math.ceil(maxVal * 1.2 / 10) * 10 || 100;
  }, [chartData]);

  const last = chartData[chartData.length - 1];
  const speedup = last && last.originalMs != null && last.optimizedMs != null && last.optimizedMs > 0
    ? (last.originalMs / last.optimizedMs).toFixed(1)
    : "—";

  // Radar chart data for complexity (anchored to the original query)
  const radarData = useMemo(() => [
    { subject: "JOINs", A: Math.min((perfOriginalSQL.match(/JOIN/gi) || []).length * 20, 100), fullMark: 100 },
    { subject: "Conditions", A: perfOriginalSQL.includes("WHERE") ? 60 : 0, fullMark: 100 },
    { subject: "Aggregation", A: perfOriginalSQL.includes("GROUP BY") ? 80 : 0, fullMark: 100 },
    { subject: "Sorting", A: perfOriginalSQL.includes("ORDER BY") ? 50 : 0, fullMark: 100 },
    { subject: "Subqueries", A: (perfOriginalSQL.match(/SELECT/gi) || []).length > 1 ? 90 : 0, fullMark: 100 },
    { subject: "Length", A: Math.min(perfOriginalSQL.length / 3, 100), fullMark: 100 },
  ], [perfOriginalSQL]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 min-h-0 pb-20">
      {/* ── Dual-Query Benchmark Comparison ── This tab has its own two
          editors: both are independent of Visualize/AI Optimizer's
          editors, though all tabs read from the same shared tables (left
          sidebar). Editor B pulls from the AI Optimizer's output only on
          explicit request ("Use AI suggestion"), never automatically. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="card card-accent-amber p-4 shrink-0"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="panel-heading">
            <span className="panel-dot" style={{ background: "var(--accent-amber)" }} />
            Original vs. Optimized Query
          </h3>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={hasComputed ? reanalyze : computeBenchmarks}
            disabled={isComputing || !canRun}
            className="btn-primary"
            title={!canRun ? "Add an optimized query to compare against." : (hasComputed ? "Go back to edit mode so you can revise the queries before re-running." : undefined)}
          >
            {isComputing ? (
              <>
                <svg className="animate-spin-slow w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Computing… {formatTime(elapsedTime)}
              </>
            ) : hasComputed ? (
              <>↻ Re-analyze</>
            ) : (
              <>▶ Run Comparison Benchmark</>
            )}
          </motion.button>
        </div>

        <AnimatePresence initial={false}>
          {!hasComputed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5 text-[var(--muted)]">Original Query (unoptimized)</div>
                  <SQLEditor
                    value={perfOriginalSQL}
                    onChange={setPerfOriginalSQL}
                    placeholder="Paste a SQL query to benchmark…"
                    minHeight={340}
                  />
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--muted)]">
                    <span>{perfOriginalSQL.trim().split(/\s+/).filter(Boolean).length} tokens</span>
                    <span>•</span>
                    <span>{Object.keys(tableData).length} tables loaded</span>
                  </div>
                  {originalError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-2 p-2 rounded-lg text-[11px]"
                      style={{ color: "var(--error)", background: "var(--error-soft)", border: "1px solid rgba(248,113,113,0.3)" }}
                    >
                      ⚠ {originalError}
                    </motion.div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Optimized Query</div>
                    {canUseAiSuggestion && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={sendAiResultToPerformance}
                        className="text-[10px] px-2 py-0.5 rounded-full border"
                        style={{ color: "var(--success)", borderColor: "rgba(52,211,153,0.3)", background: "var(--success-soft)" }}
                        title="Fills in BOTH editors — the exact query the AI analyzed, and its optimized rewrite — so they're always a matching pair."
                      >
                        ↓ Use AI Optimizer&apos;s suggestion
                      </motion.button>
                    )}
                  </div>
                  <SQLEditor
                    value={perfOptimizedSQL}
                    onChange={setPerfOptimizedSQL}
                    placeholder="Paste your own optimized query, or run AI Optimizer and click 'Use AI suggestion' to fill this in."
                    minHeight={340}
                  />
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--muted)]">
                    <span>{perfOptimizedSQL.trim().split(/\s+/).filter(Boolean).length} tokens</span>
                    <span>•</span>
                    <span>{Object.keys(tableData).length} tables loaded</span>
                  </div>
                  {optimizedError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-2 p-2 rounded-lg text-[11px]"
                      style={{ color: "var(--error)", background: "var(--error-soft)", border: "1px solid rgba(248,113,113,0.3)" }}
                    >
                      ⚠ {optimizedError}
                    </motion.div>
                  )}
                </div>
              </div>

              {!canRun && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-[11px] px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--warning)", background: "var(--warning-soft)", border: "1px solid rgba(251,191,36,0.25)" }}
                >
                  Add an optimized query to compare against.
                </motion.div>
              )}
              {queriesIdentical && (
                <div className="mt-3 text-[11px] px-3 py-1.5 rounded-lg" style={{ color: "var(--muted)", background: "var(--surface3)", border: "1px solid var(--border2)" }}>
                  Both queries are identical — no difference expected.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4 mt-3 text-xs text-[var(--muted)]">
          {isComputing && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { cancelRef.current = true; }}
              className="btn-secondary text-xs px-3 py-1 ml-auto"
            >
              ✕ Cancel
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* ── Compute Button / Status ── */}
      {!hasComputed && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 30 }}
          className="card card-accent-amber p-4 flex flex-col items-center justify-center text-center gap-2.5 min-h-[160px] shrink-0"
        >
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--border-glow)" }}
          >
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </motion.div>

          <div>
            <h3 className="text-sm font-semibold mb-0.5">Performance Benchmark</h3>
            <p className="text-xs text-[var(--muted)] max-w-md">
              Run both queries across {ALL_VOLUMES.length} volume points (1K → 100K rows) against identical synthetic data to generate comparison curves.
            </p>
          </div>

          {awaitingQueryEdit && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 text-[11px] px-3 py-1 rounded-lg font-medium"
              style={{ color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--border-glow)" }}
            >
              <span>✎</span>
              <span>
                Edit the queries above (original and/or optimized), then press <strong>Run Comparison Benchmark</strong> to re-compute. The benchmark runs only when you start it — not automatically.
              </span>
            </motion.div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <div
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border"
              style={{ color: "var(--success)", borderColor: "rgba(52,211,153,0.25)", background: "var(--success-soft)" }}
            >
              <span>●</span>
              <span>Every number below comes from a real SQLite (WASM) engine actually running your queries — not a simulation or an estimate.</span>
            </div>

            <div
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border"
              style={{ color: "var(--muted)", borderColor: "var(--border2)", background: "var(--surface3)" }}
            >
              <span>⏱</span>
              <span>If a run takes longer than 4s, larger volumes are skipped automatically for that query — and you can cancel at any time.</span>
            </div>
          </div>

          {complexity.factors.includes("Subquery") && !isComputing && (
            <div className="text-[10px] px-3 py-1 rounded-lg" style={{ color: "var(--warning)", background: "var(--warning-soft)", border: "1px solid rgba(251,191,36,0.25)" }}>
              ⚠ The original query uses subqueries in the SELECT list. SQLite re-runs a correlated subquery once per outer row, so cost grows much faster than a JOIN as row counts increase — this benchmark may hit the time budget above and stop early at a smaller volume.
            </div>
          )}

          {!isComputing && (
            <div
              className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-full border font-medium"
              style={{ color: "var(--error)", borderColor: "rgba(248,113,113,0.25)", background: "var(--error-soft)" }}
            >
              <span>⚠</span>
              <span>
                Results are shown in under a minute — the page may briefly freeze or show &quot;Not Responding&quot; while it calculates. Please stay tuned.
              </span>
            </div>
          )}
          {isComputing && (
            <div className="w-64 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface3)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-cyan))" }}
                animate={{ width: ["20%", "80%", "40%", "90%", "60%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          )}

          {runError && (
            <div className="text-sm px-4 py-2 rounded-lg" style={{ color: "var(--error)", background: "var(--error-soft)" }}>
              ⚠ {runError}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Results ── */}
      <AnimatePresence>
        {hasComputed && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-5"
          >
            {/* Success banner */}
            <motion.div
              variants={itemVariants}
              className="card card-accent-success p-3 flex items-center justify-between flex-shrink-0"
              style={{ background: "var(--success-soft)", borderColor: "rgba(52,211,153,0.2)" }}
            >
              <div className="flex items-center gap-2 text-sm">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="text-[var(--success)]"
                >✓</motion.span>
                <span>Benchmarks computed in <strong>{computeTime?.toFixed(1)}s</strong> — real SQLite execution, not simulated</span>
              </div>

            </motion.div>

            {(wasCancelled || allBenchmarks.some((p) => p.originalSkipped || p.optimizedSkipped)) && (
              <motion.div variants={itemVariants} className="text-[11px] px-3 py-2 rounded-lg flex-shrink-0" style={{ color: "var(--warning)", background: "var(--warning-soft)", border: "1px solid rgba(251,191,36,0.25)" }}>
                {wasCancelled
                  ? "⚠ Benchmark cancelled — showing whatever volumes finished before you stopped it."
                  : "⚠ Some larger volumes were skipped for one or both queries because a smaller one already exceeded the 4s time budget — common with correlated subqueries."}
              </motion.div>
            )}

            {/* Result-Set Equivalence — is the "optimized" query actually
                returning the same data as the original, or just faster and
                wrong? Row count / column set / value check, run once at the
                current data-volume slider position. */}
            {resultsComparison && (
              <motion.div variants={itemVariants} className="flex-shrink-0">
                {resultsComparison.matches ? (
                  <div className="flex items-center gap-2 text-[11px] px-3 py-2 rounded-lg" style={{ color: "var(--success)", background: "var(--success-soft)", border: "1px solid rgba(52,211,153,0.25)" }}>
                    <span>✓</span>
                    <span>
                      Results match — both queries returned the same {resultsComparison.originalRowCount.toLocaleString()} row{resultsComparison.originalRowCount === 1 ? "" : "s"} at {formatRows(dataVolume)} rows.
                    </span>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg text-[11px]" style={{ color: "var(--error)", background: "var(--error-soft)", border: "1px solid rgba(248,113,113,0.25)" }}>
                    <div className="flex items-center justify-between gap-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span>⚠</span>
                        <span>Results differ — the optimized query may not be equivalent to the original.</span>
                      </div>
                      {canAiReoptimize ? (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={reoptimizeWithAi}
                          disabled={isComputing}
                          className="shrink-0 text-[11px] px-3 py-1 rounded-lg border font-medium"
                          style={{ color: "var(--error)", borderColor: "rgba(248,113,113,0.3)", background: "var(--error-soft)" }}
                          title="Sends this exact mismatch (measured against real SQLite execution) back to the AI Optimizer and asks it to correct the rewrite."
                        >
                          ↻ Re-optimize with AI ({aiReoptimizeAttempts}/{MAX_AI_REOPTIMIZE_ATTEMPTS})
                        </motion.button>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={reanalyze}
                          disabled={isComputing}
                          className="shrink-0 text-[11px] px-3 py-1 rounded-lg border font-medium"
                          style={{ color: "var(--error)", borderColor: "rgba(248,113,113,0.3)", background: "var(--error-soft)" }}
                          title="Go back to the editors so you can fix the optimized query, then re-run the benchmark."
                        >
                          ↻ Recheck Optimized Query &amp; Re-analyze
                        </motion.button>
                      )}
                    </div>
                    {perfOptimizedSource === "ai" && !canAiReoptimize && (
                      <div className="mt-1 pl-5 opacity-90">
                        AI couldn&apos;t produce a verified-equivalent rewrite after {MAX_AI_REOPTIMIZE_ATTEMPTS} attempts — try adjusting the optimized query manually instead.
                      </div>
                    )}
                    <div className="mt-1 pl-5">{resultsComparison.reason}</div>
                    {resultsComparison.mismatchExamples.length > 0 && (
                      <div className="mt-2 pl-5 space-y-1 font-mono text-[10px] opacity-90">
                        {resultsComparison.mismatchExamples.map((ex, i) => (
                          <div key={i}>{ex}</div>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 pl-5 text-[10px] opacity-75">
                      Checked at {formatRows(dataVolume)} rows — original: {resultsComparison.originalColumns.join(", ") || "—"} · optimized: {resultsComparison.optimizedColumns.join(", ") || "—"}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Query Details */}
            <motion.div variants={itemVariants} className="card overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border)]">
                <div>
                  <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Original Query</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: complexity.color + "15", color: complexity.color, border: `1px solid ${complexity.color}30` }}>
                      {complexity.label} • Score: {complexity.score}/15
                    </span>
                  </div>
                  <div className="p-4">
                    <pre className="code-block text-xs" dangerouslySetInnerHTML={{ __html: highlightSQL(perfOriginalSQL) }} />
                    {complexity.factors.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {complexity.factors.map((f, i) => (
                          <span key={i} className="badge badge-info text-[10px]">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Optimized Query</span>
                    {indexDdl.length > 0 && (
                      <span className="text-[10px]" style={{ color: usingAiSuggestedIndexes ? "var(--success)" : "var(--muted)" }}>
                        {usingAiSuggestedIndexes ? "✓ AI-suggested indexes applied" : "Auto-derived indexes applied"}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <pre className="code-block text-xs" dangerouslySetInnerHTML={{ __html: highlightSQL(perfOptimizedSQL) }} />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Complexity Radar + Table Stats */}
            <motion.div variants={itemVariants} className="card overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border)]">
                <div>
                  <div className="px-4 py-2.5 border-b" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Query Complexity Profile (Original)</span>
                  </div>
                  <div className="p-4" style={{ height: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="var(--border2)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "var(--muted)", fontSize: 9 }} />
                        <Radar name="Complexity" dataKey="A" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <div className="px-4 py-2.5 border-b" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Table Statistics</span>
                  </div>
                  <div className="p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border2)" }}>
                          <th className="text-left p-2 text-[var(--muted)]">Table</th>
                          <th className="text-right p-2 text-[var(--muted)]">Rows</th>
                          <th className="text-right p-2 text-[var(--muted)]">Columns</th>
                          <th className="text-right p-2 text-[var(--muted)]">Est. Memory</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(tableData).map(([name, rows]) => (
                          <tr key={name} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td className="p-2 font-medium">{name}</td>
                            <td className="p-2 text-right font-mono">{rows.length.toLocaleString()}</td>
                            <td className="p-2 text-right font-mono">{rows[0] ? Object.keys(rows[0]).length : 0}</td>
                            <td className="p-2 text-right font-mono text-[var(--muted)]">{estimateMemory(rows.length, { [name]: rows })}</td>
                          </tr>
                        ))}
                        <tr style={{ background: "var(--surface3)" }} className="font-semibold">
                          <td className="p-2">Total (at {formatRows(dataVolume)})</td>
                          <td className="p-2 text-right font-mono">{formatRows(dataVolume * Object.keys(tableData).length)}</td>
                          <td className="p-2 text-right font-mono">—</td>
                          <td className="p-2 text-right font-mono text-[var(--accent)]">{estimateMemory(dataVolume, tableData)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Chart */}
            <motion.div variants={itemVariants} className="card overflow-hidden flex-shrink-0">
              <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
                <span className="text-[11px] whitespace-nowrap text-[var(--muted)]">Data Volume:</span>
                <input
                  type="range"
                  min={1000}
                  max={MAX_VOLUME}
                  step={1000}
                  value={dataVolume}
                  onChange={(e) => setDataVolume(Number(e.target.value))}
                  className="flex-1 accent-[var(--accent)] cursor-pointer"
                />
                <span className="font-mono text-[12px] min-w-[90px] text-right text-[var(--accent)]">
                  {dataVolume.toLocaleString()} rows
                </span>
              </div>

              <div className="px-4 pt-2 text-[10.5px] text-[var(--muted)]">
                Pre-computed benchmarks across {ALL_VOLUMES.length} volume points. Move slider to explore performance at any volume.
                <span className="block mt-1 text-[var(--warning)]">⚠ Max 100K rows</span>
              </div>

              <div className="p-4" style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border2)" />
                    <XAxis dataKey="rows" tickFormatter={formatRows} tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--border)" type="number" domain={[0, dataVolume]} allowDataOverflow />
                    <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}ms`} tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--border)" domain={[0, yAxisMax]} allowDataOverflow label={{ value: "Exec Time (ms)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 10, dy: 50 }} />
                    <Tooltip contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--border2)", borderRadius: 10, backdropFilter: "blur(16px)", boxShadow: "var(--shadow-lg)" }} labelStyle={{ color: "var(--muted)", fontSize: 11 }} itemStyle={{ fontSize: 11 }} labelFormatter={(v: number) => `${formatRows(v)} rows`} formatter={(v: number) => [`${v.toFixed(2)} ms`]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                    <Line type="monotone" dataKey="originalMs" name="Original" stroke="#f87171" strokeWidth={2.5} dot={{ r: 3, fill: "#f87171" }} activeDot={{ r: 6, fill: "#f87171", stroke: "rgba(248,113,113,0.3)", strokeWidth: 4 }} />
                    <Line type="monotone" dataKey="optimizedMs" name="Optimized" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: "#34d399" }} activeDot={{ r: 6, fill: "#34d399", stroke: "rgba(52,211,153,0.3)", strokeWidth: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Metrics */}
            <motion.div variants={itemVariants} className="card overflow-hidden flex-shrink-0">
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border)]">
                <MetricCard label="Original Time" value={last && last.originalMs != null ? `${last.originalMs.toFixed(1)} ms` : "—"} color="var(--error)" sub={`at ${formatRows(dataVolume)} rows`} />
                <MetricCard label="Optimized Time" value={last && last.optimizedMs != null ? `${last.optimizedMs.toFixed(1)} ms` : "—"} color="var(--success)" sub={`at ${formatRows(dataVolume)} rows`} />
                <MetricCard label="Speedup Factor" value={`${speedup}×`} color="var(--accent)" sub="measured, not simulated" />
                <MetricCard label="Est. Memory" value={estimateMemory(dataVolume, tableData)} color="var(--warning)" sub="for synthetic dataset" />
              </div>
            </motion.div>

            {/* Benchmark Results Table */}
            <motion.div variants={itemVariants} className="card overflow-hidden flex-shrink-0">
              <div className="px-4 py-2.5 border-b" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Benchmark Results</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border2)", background: "var(--surface2)" }}>
                      <th className="text-left p-3 text-[var(--muted)]">Rows</th>
                      <th className="text-right p-3 text-[var(--error)]">Original Query (ms)</th>
                      <th className="text-right p-3 text-[var(--success)]">Optimized Query (ms)</th>
                      <th className="text-right p-3 text-[var(--accent)]">Speedup</th>
                      <th className="text-right p-3 text-[var(--muted)]">Rows/Sec</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allBenchmarks.map((point, i) => {
                      if (point.originalSkipped && point.optimizedSkipped) {
                        return (
                          <tr key={i} className="opacity-50" style={{ borderBottom: "1px solid var(--border)" }}>
                            <td className="p-3 font-mono">{formatRows(point.rows)}</td>
                            <td colSpan={4} className="p-3 text-[var(--muted)] italic">
                              Skipped — a smaller volume already exceeded the time budget (or the query errored)
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: point.rows === dataVolume ? "var(--accent-soft)" : undefined }}>
                          <td className="p-3 font-mono">{formatRows(point.rows)}</td>
                          <td className="p-3 text-right font-mono text-[var(--error)]">
                            {point.originalMs >= 0 ? point.originalMs.toFixed(2) : <span className="italic text-[var(--muted)]">skipped</span>}
                          </td>
                          <td className="p-3 text-right font-mono text-[var(--success)]">
                            {point.optimizedMs >= 0 ? point.optimizedMs.toFixed(2) : <span className="italic text-[var(--muted)]">skipped</span>}
                          </td>
                          <td className="p-3 text-right font-mono text-[var(--accent)]">
                            {point.originalMs >= 0 && point.optimizedMs > 0 ? (point.originalMs / point.optimizedMs).toFixed(2) + "×" : "—"}
                          </td>
                          <td className="p-3 text-right font-mono text-[var(--muted)]">
                            {point.originalMs > 0 ? ((point.rows / point.originalMs) * 1000).toFixed(0) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Plan Comparison */}
            <motion.div variants={itemVariants} className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Execution Plan Comparison</span>
              </div>
              <div className="grid grid-cols-2 gap-4 p-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[var(--error)] flex items-center justify-between">
                    <span>Original Query</span>
                    {compareResult && <span className="font-mono">{compareResult.beforeMs.toFixed(1)}ms</span>}
                  </div>
                  <pre className="text-[10px] font-mono rounded-lg px-3 py-2 whitespace-pre-wrap border text-[var(--muted)] max-h-[200px] overflow-y-auto" style={{ background: "var(--surface-solid)", borderColor: "rgba(248,113,113,0.15)" }}>
                    {originalError ? `⚠ ${originalError}` : (planBefore || "—")}
                  </pre>
                  {planBeforeRaw.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {planBeforeRaw.map((r: any, i: number) => (
                        <div key={i} className="text-[9px] font-mono text-[var(--muted)] pl-2" style={{ borderLeft: "2px solid rgba(248,113,113,0.2)" }}>
                          {r.detail}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[var(--success)] flex items-center justify-between">
                    <span>Optimized Query</span>
                    {compareResult && <span className="font-mono">{compareResult.afterMs.toFixed(1)}ms</span>}
                  </div>
                  <pre className="text-[10px] font-mono rounded-lg px-3 py-2 whitespace-pre-wrap border text-[var(--muted)] max-h-[200px] overflow-y-auto" style={{ background: "var(--surface-solid)", borderColor: "rgba(52,211,153,0.15)" }}>
                    {optimizedError ? `⚠ ${optimizedError}` : (planAfter || "—")}
                  </pre>
                  {planAfterRaw.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {planAfterRaw.map((r: any, i: number) => (
                        <div key={i} className="text-[9px] font-mono text-[var(--muted)] pl-2" style={{ borderLeft: "2px solid rgba(52,211,153,0.2)" }}>
                          {r.detail}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {compareResult && queriesIdentical && !suggestedIndexActuallyUsed && (
                <div className="px-4 pb-2">
                  <div className="p-3 rounded-lg text-xs" style={{ color: "var(--warning)", background: "var(--warning-soft)", border: "1px solid rgba(251,191,36,0.25)" }}>
                    ⚠ The plans above look identical because SQLite chose <em>not</em> to use the suggested index for this run.
                    Every table here already has a baseline index on its own <code>id</code> column (so subquery-heavy queries don't take forever to benchmark) —
                    for this particular query, that baseline index already covers the WHERE/ORDER BY access pattern just as well, so the additional suggested index made no real difference.
                  </div>
                </div>
              )}
              {compareResult && (
                <div className="px-4 pb-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3 rounded-lg flex items-center gap-3"
                    style={{
                      background: compareResult.afterMs < compareResult.beforeMs ? "var(--success-soft)" : "var(--warning-soft)",
                      border: `1px solid ${compareResult.afterMs < compareResult.beforeMs ? "rgba(52,211,153,0.2)" : "rgba(251,191,36,0.2)"}`,
                    }}
                  >
                    <span className="text-lg">{compareResult.afterMs < compareResult.beforeMs ? '🚀' : '⚠️'}</span>
                    <div>
                      <p className="text-sm font-medium">
                        {compareResult.afterMs < compareResult.beforeMs
                          ? `Speedup: ${(compareResult.beforeMs / compareResult.afterMs).toFixed(2)}× faster with the optimized query`
                          : "No significant improvement — the optimized query may not be better suited to this access pattern"}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">
                        Original: {compareResult.beforeMs.toFixed(2)}ms → Optimized: {compareResult.afterMs.toFixed(2)}ms
                      </p>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>

            {/* Index Analysis */}
            <motion.div variants={itemVariants} className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Index Analysis</span>
                {indexDdl.length > 0 && (
                  <span className="text-[10px]" style={{ color: usingAiSuggestedIndexes ? "var(--success)" : "var(--muted)" }}>
                    {usingAiSuggestedIndexes
                      ? "✓ From AI Optimizer analysis"
                      : "Auto-derived from the optimized query's pattern — run AI Optimizer for tailored suggestions"}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-3">
                {indexDdl.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No indexes suggested. Run the AI Optimizer to generate index recommendations.</p>
                ) : (
                  indexDdl.map((ddl, i) => {
                    const match = ddl.match(/ON\s+["'`]?(\w+)["'`]?\s*\(([^)]+)\)/i);
                    const table = match?.[1] || "unknown";
                    const columns = match?.[2]?.replace(/["'`]/g, "") || "";
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-start gap-3 p-3 rounded-lg border"
                        style={{ background: "var(--surface-solid)", borderColor: "var(--border2)" }}
                      >
                        <span className="text-[var(--accent)] mt-0.5">▸</span>
                        <div className="flex-1">
                          <code className="text-xs font-mono block mb-1">{ddl}</code>
                          <div className="flex gap-2 text-[10px] text-[var(--muted)]">
                            <span className="badge badge-info">Table: {table}</span>
                            <span className="badge badge-success">Columns: {columns}</span>
                            <span className="badge badge-warning">Type: B-Tree</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>

            {/* Optimization Tips */}
            <motion.div variants={itemVariants} className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Optimization Tips</span>
              </div>
              <div className="p-4 space-y-2">
                {complexity.factors.includes("Multiple JOINs") && (
                  <TipCard icon="🔗" title="Multiple JOINs Detected" text="Consider denormalizing frequently joined tables or using covering indexes on join columns." type="warning" />
                )}
                {complexity.factors.includes("LIKE pattern") && (
                  <TipCard icon="🔍" title="LIKE with Leading Wildcard" text="LIKE '%text' cannot use indexes. Consider full-text search or trigram indexes." type="error" />
                )}
                {!perfOriginalSQL.includes("WHERE") && (
                  <TipCard icon="⚠️" title="No WHERE Clause" text="Missing WHERE clause causes full table scans. Add filters to reduce rows scanned." type="error" />
                )}
                {perfOriginalSQL.includes("SELECT *") && (
                  <TipCard icon="📋" title="SELECT * Detected" text="Selecting all columns increases I/O. Specify only needed columns." type="warning" />
                )}
                {speedup !== "—" && parseFloat(speedup) < 1.2 && (
                  <TipCard icon="💡" title="Limited Speedup" text="The optimized query shows minimal improvement over the original. Consider a different rewrite or composite indexes." type="info" />
                )}
                {parseFloat(speedup) > 2 && (
                  <TipCard icon="🚀" title="Great Optimization" text={`${speedup}x speedup achieved! The optimized query is well-matched to this access pattern.`} type="success" />
                )}
                <TipCard icon="📊" title="Synthetic Data Note" text="Benchmarks use randomly generated data. Real-world performance may vary based on data distribution." type="info" />
              </div>
            </motion.div>

            {/* Historical Comparison */}
            {history.length > 1 && (
              <motion.div variants={itemVariants} className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Benchmark History</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border2)", background: "var(--surface2)" }}>
                        <th className="text-left p-3 text-[var(--muted)]">Time</th>
                        <th className="text-left p-3 text-[var(--muted)]">Original Query</th>
                        <th className="text-right p-3 text-[var(--accent)]">Speedup</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice().reverse().map((h) => (
                        <tr key={h.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="p-3 font-mono text-[var(--muted)]">{h.time}</td>
                          <td className="p-3 truncate max-w-[300px]" title={h.query}>{h.query}</td>
                          <td className="p-3 text-right font-mono text-[var(--accent)]">{h.speedup}×</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* EXPLAIN QUERY PLAN */}
            <motion.div variants={itemVariants} className="card overflow-hidden flex-shrink-0 mb-10">
              <div className="px-4 py-2.5 border-b" style={{ background: "var(--surface2)", borderColor: "var(--border)" }}>
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Real SQLite EXPLAIN QUERY PLAN</span>
              </div>
              <div className="grid grid-cols-2 gap-5 p-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[var(--error)]">Original query plan</div>
                  <pre className="text-[10.5px] font-mono rounded-lg px-3 py-2 whitespace-pre-wrap border text-[var(--muted)]" style={{ background: "var(--surface-solid)", borderColor: "var(--border2)" }}>
                    {originalError ? `⚠ ${originalError}` : (planBefore || "—")}
                  </pre>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[var(--success)]">Optimized query plan (with suggested indexes)</div>
                  <pre className="text-[10.5px] font-mono rounded-lg px-3 py-2 whitespace-pre-wrap border text-[var(--muted)]" style={{ background: "var(--surface-solid)", borderColor: "var(--border2)" }}>
                    {optimizedError ? `⚠ ${optimizedError}` : (planAfter || "—")}
                  </pre>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className="p-4 hover:bg-[var(--surface2)] transition-colors">
      <div className="text-[10px] uppercase tracking-wide mb-1.5 text-[var(--muted)]">{label}</div>
      <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-1 text-[var(--muted)]">{sub}</div>
    </div>
  );
}

function TipCard({ icon, title, text, type }: { icon: string; title: string; text: string; type: "error" | "warning" | "info" | "success" }) {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    error: { bg: "var(--error-soft)", border: "rgba(248,113,113,0.25)", color: "var(--error)" },
    warning: { bg: "var(--warning-soft)", border: "rgba(251,191,36,0.25)", color: "var(--warning)" },
    info: { bg: "var(--accent-soft)", border: "rgba(129,140,248,0.25)", color: "var(--accent)" },
    success: { bg: "var(--success-soft)", border: "rgba(52,211,153,0.25)", color: "var(--success)" },
  };

  const s = styles[type];

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="p-3 rounded-lg"
      style={{ background: s.bg, borderLeft: `3px solid ${s.color}`, color: s.color }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="text-[11px] leading-relaxed opacity-90">{text}</p>
    </motion.div>
  );
}