"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useStore } from "@/store/useStore";
import { buildSchemaString } from "@/lib/sql/engine";
import { explainQueryPlan, verifyIndexImpact, estimateSingleRunTime } from "@/lib/sql/runner";
import { generateSyntheticData } from "@/lib/data/datasets";
import { OptimizerResult } from "./OptimizerResult";
import { highlightSQL } from "@/lib/sql/engine";
import { SQLEditor } from "@/components/ui/SQLEditor";

function formatShortDuration(seconds: number): string {
  // A two-point probe extrapolation is a reasonable order-of-magnitude
  // signal but not precise enough to promise an exact number of seconds
  // and then be meaningfully wrong. A coarse bucket is honest about that.
  if (seconds < 5) return "well under 10 seconds";
  if (seconds < 20) return "under about 20 seconds";
  if (seconds < 55) return "under about a minute";
  return "more than a minute — this query gets slow fast at scale";
}

export function OptimizerTab() {
  const {
    aiSQL,
    setAiSQL,
    aiResult,
    setAiResult,
    setAiAnalyzedSQL,
    aiLoading,
    setAiLoading,
    aiError,
    setAiError,
    tableData,
    demoTrigger,
    dataVolume,
    verifyResult,
    setVerifyResult,
    verifyLoading,
    setVerifyLoading,
    verifyError,
    setVerifyError,
  } = useStore();

  // Snapshot of the query as it was when "Optimize with AI" was last clicked.
  // Deliberately NOT the live `aiSQL` value — this is what actually got
  // analyzed, so it stays put (for comparison against the AI's suggestions)
  // even if the user keeps editing the query above afterwards.
  const [submittedSQL, setSubmittedSQL] = useState<string | null>(null);

  // The right panel scrolls independently and Detected Issues / Optimized SQL
  // / Suggested Indexes above can already fill more than a screen's height —
  // so a newly-appended Verification Results card can render completely out
  // of view with zero visible feedback that the button did anything. Scroll
  // it into view whenever a result (or error) comes back.
  const verifySectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (verifyResult || verifyError) {
      verifySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [verifyResult, verifyError]);

  const [verifyEstimate, setVerifyEstimate] = useState<{ seconds: number; exponent: number } | null>(null);
  const [isEstimatingVerify, setIsEstimatingVerify] = useState(false);

  // If none of the suggested index names show up in the "after" EXPLAIN
  // plan, SQLite decided not to use them at all — usually because the
  // baseline index every table now has on its own "id" column (added so
  // subquery-heavy queries don't take forever to benchmark) already
  // covers the access pattern just as well. Surfacing that explicitly
  // avoids the confusing "before and after look identical" moment.
  const suggestedIndexActuallyUsed = useMemo(() => {
    if (!verifyResult || !aiResult?.index_statements?.length) return true;
    const names = aiResult.index_statements
      .map((ddl) => ddl.match(/INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/i)?.[1])
      .filter((n): n is string => !!n);
    if (!names.length) return true;
    return names.some((n) => verifyResult.after.summary.toLowerCase().includes(n.toLowerCase()));
  }, [verifyResult, aiResult]);

  // ── Run AI Analysis ──
  const runOptimize = useCallback(async () => {
    if (!aiSQL.trim() || aiLoading) return;

    setSubmittedSQL(aiSQL);
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiAnalyzedSQL(null);
    setVerifyResult(null);
    setVerifyError(null);

    try {
      const schema = buildSchemaString(tableData);
      const explain = await explainQueryPlan(aiSQL, tableData);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: aiSQL,
          schema,
          explainPlan: explain.summary,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Analysis failed");
      }

      const data = await res.json();
      setAiResult(data);
      setAiAnalyzedSQL(aiSQL);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }, [aiSQL, tableData, aiLoading, setAiLoading, setAiError, setAiResult, setAiAnalyzedSQL, setVerifyResult, setVerifyError]);

  // ── Apply & Verify Indexes ──
  const runVerify = useCallback(async () => {
    if (!aiResult?.index_statements?.length || verifyLoading) return;

    setVerifyLoading(true);
    setVerifyError(null);

    try {
      // The raw schema sample tables are only a handful of rows (3-5) —
      // an indexed vs. sequential scan over that few rows takes the same
      // sub-millisecond time either way, so verifying against them directly
      // produces a "no significant improvement" result no matter what,
      // which reads as the button not doing anything. Scale up to the same
      // volume used on the Performance tab so the difference is measurable.
      const scaled = generateSyntheticData(tableData, Math.max(dataVolume, 5_000));
      const result = await verifyIndexImpact(aiSQL, scaled, aiResult.index_statements);
      setVerifyResult(result);
    } catch (e) {
      setVerifyError((e as Error).message);
    } finally {
      setVerifyLoading(false);
    }
  }, [aiResult, aiSQL, tableData, dataVolume, verifyLoading, setVerifyLoading, setVerifyError, setVerifyResult]);

  // Predict how long Apply & Verify will take, the same way the
  // Performance tab estimates its full sweep — a couple of tiny real
  // probe runs, extrapolated to the actual target row count — so the
  // person sees a realistic wait time before clicking instead of just
  // "Verifying…" with no sense of whether that's 1 second or 30.
  useEffect(() => {
    if (!aiResult?.index_statements?.length || verifyLoading || verifyResult) return;
    let cancelled = false;
    setIsEstimatingVerify(true);
    setVerifyEstimate(null);

    const timer = setTimeout(async () => {
      try {
        const targetRows = Math.max(dataVolume, 5_000);
        const result = await estimateSingleRunTime(
          (rows) => generateSyntheticData(tableData, rows),
          aiSQL,
          targetRows
        );
        if (!cancelled) setVerifyEstimate({ seconds: result.estimatedSeconds, exponent: result.scalingExponent });
      } catch {
        if (!cancelled) setVerifyEstimate(null);
      } finally {
        if (!cancelled) setIsEstimatingVerify(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [aiResult, aiSQL, tableData, dataVolume, verifyLoading, verifyResult]);

  // ── Demo auto-run ──
  useEffect(() => {
    if (demoTrigger > 0 && !aiResult && !aiLoading) {
      const timer = setTimeout(runOptimize, 400);
      return () => clearTimeout(timer);
    }
  }, [demoTrigger, aiResult, aiLoading, runOptimize]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full min-h-0">
      {/* ── Left: Editor + Controls ── */}
      <div className="flex flex-col gap-5 min-h-0 h-full">
        <div className="card card-accent-blue p-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="panel-heading">
              <span className="panel-dot" style={{ background: "var(--accent)" }} />
              Query to Optimize
            </h3>
            <button
              onClick={runOptimize}
              disabled={aiLoading || !aiSQL.trim()}
              className="btn-primary"
            >
              {aiLoading ? (
                <>
                  <svg className="animate-spin-slow w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </>
              ) : (
                <>✦ Optimize with AI</>
              )}
            </button>
          </div>

          <SQLEditor
            value={aiSQL}
            onChange={setAiSQL}
            placeholder="Paste your SQL query here…"
            minHeight={200}
          />

          {/* Quick stats */}
          <div className="flex items-center gap-4 mt-3 text-xs text-[var(--muted)]">
            <span>{aiSQL.trim().split(/\s+/).filter(Boolean).length} tokens</span>
            <span>•</span>
            <span>{Object.keys(tableData).length} tables loaded</span>
          </div>
        </div>

        {/* Error banner */}
        {aiError && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm shrink-0">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Analysis Failed
            </div>
            {aiError}
          </div>
        )}

        {/* Original query preview — snapshot of what was actually analyzed,
            not a live mirror of the editor above. Only shown once there's
            something to compare against. Card frame (incl. its colored top
            border) stays fixed; only the SQL text inside scrolls. */}
        {submittedSQL !== null && (
          <div className="card card-accent-blue p-4 flex flex-col flex-1 min-h-0">
            <h3 className="panel-heading mb-3 shrink-0">
              <span className="panel-dot" style={{ background: "var(--accent)" }} />
              Original Query
              <span className="ml-2 normal-case font-normal text-[10px] text-[var(--muted)]/70">
                (as submitted — edit above and re-run to update)
              </span>
            </h3>
            <pre className="code-block flex-1 min-h-0 overflow-auto">
              <code dangerouslySetInnerHTML={{ __html: highlightSQL(submittedSQL) }} />
            </pre>
          </div>
        )}
      </div>

      {/* ── Right: Results ── */}
      <div className="flex flex-col gap-5 min-h-0 h-full">
        {!aiResult && !aiLoading && !aiError && (
          <div className="card card-accent-violet p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--accent-violet-soft)", border: "1px solid color-mix(in srgb, var(--accent-violet) 35%, transparent)" }}>
              <svg className="w-8 h-8 text-[var(--accent-violet)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Ready to Optimize</h3>
            <p className="text-sm text-[var(--muted)] max-w-sm">
              Paste a SQL query and click <strong>Optimize with AI</strong> to get anti-pattern detection, rewrites, and index suggestions.
            </p>
          </div>
        )}

        {aiLoading && !aiResult && (
          <div className="card card-accent-violet p-8 flex flex-col items-center justify-center min-h-[300px]">
            <div className="relative w-12 h-12 mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-[var(--border)]" />
              <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-violet)] border-t-transparent animate-spin" />
            </div>
            <p className="text-sm text-[var(--muted)] animate-pulse">Gemini is analyzing your query…</p>
          </div>
        )}

        {aiResult && (
          <div className="card card-accent-violet p-4 flex flex-col flex-1 min-h-0">
            {/* Fixed header — stays in place; only the body below scrolls */}
            <div className="flex items-center justify-between mb-1 shrink-0">
              <h3 className="panel-heading">
                <span className="panel-dot" style={{ background: "var(--accent-violet)" }} />
                AI Optimization Results
              </h3>
              <button
                onClick={runVerify}
                disabled={verifyLoading || !aiResult.index_statements?.length}
                title={
                  !aiResult.index_statements?.length
                    ? "No index suggestions to verify for this query"
                    : "Runs this query against a real SQLite database twice — once as-is, once with the suggested indexes applied — and measures the actual execution time difference."
                }
                className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {verifyLoading ? (
                  <>
                    <svg className="animate-spin-slow w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verifying…
                  </>
                ) : (
                  <>▶ Apply & Verify</>
                )}
              </button>
            </div>
            <p className="text-[10.5px] text-[var(--muted)] mb-1 shrink-0">
              Measures real execution time before vs. after applying the suggested indexes — result appears below.
            </p>
            {!verifyLoading && !verifyResult && (
              <p className="text-[10.5px] mb-1 shrink-0" style={{ color: "var(--accent)" }}>
                {isEstimatingVerify ? (
                  "⏱ Estimating wait time…"
                ) : verifyEstimate ? (
                  <>⏱ Should be ready <strong>{formatShortDuration(verifyEstimate.seconds)}</strong> at {Math.max(dataVolume, 5_000).toLocaleString()} rows — depends on query complexity{verifyEstimate.exponent >= 1.6 ? " (this one scales quadratically, e.g. subqueries)" : ""}</>
                ) : (
                  "Estimate unavailable — run to see real timing."
                )}
              </p>
            )}

            {/* Scrollable body — issues, optimized SQL, indexes, explanation,
                and the verify results all live here so the header/button
                and the card's colored top border never move. */}
            <div className="flex-1 min-h-0 overflow-y-auto mt-3 -mr-2 pr-2">
              <OptimizerResult result={aiResult} onReanalyze={runOptimize} isReanalyzing={aiLoading} />

              {/* Verify Results */}
              <div ref={verifySectionRef} className="flex flex-col gap-5 mt-6">
                {verifyError && (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    ⚠ {verifyError}
                  </div>
                )}

                {verifyResult && (
                  <div className="card card-accent-success p-4 animate-fade-in">
                    <h3 className="panel-heading mb-4">
                      <span className="panel-dot" style={{ background: "var(--success)" }} />
                      Verification Results
                    </h3>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                        <p className="text-xs text-[var(--muted)] mb-1">Before (no suggested indexes)</p>
                        <p className="text-lg font-bold">{verifyResult.beforeMs.toFixed(2)}<span className="text-sm font-normal text-[var(--muted)] ml-1">ms</span></p>
                        <p className="text-xs text-[var(--muted)] mt-1">{verifyResult.before.summary}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[var(--success)]/5 border border-[var(--success)]/30">
                        <p className="text-xs text-[var(--success)] mb-1">After (with suggested indexes)</p>
                        <p className="text-lg font-bold text-[var(--success)]">{verifyResult.afterMs.toFixed(2)}<span className="text-sm font-normal ml-1">ms</span></p>
                        <p className="text-xs text-[var(--success)]/70 mt-1">{verifyResult.after.summary}</p>
                      </div>
                    </div>

                    {!suggestedIndexActuallyUsed && (
                      <div className="mb-4 p-3 rounded-lg text-xs" style={{ color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)" }}>
                        ⚠ The Before/After plans above look identical because SQLite chose <em>not</em> to use the suggested index for this run.
                        Every table here already has a baseline index on its own <code>id</code> column (so subquery-heavy queries don't take forever to benchmark) —
                        for this particular query, that baseline index already covers the WHERE/ORDER BY access pattern just as well, so the additional suggested index made no real difference.
                      </div>
                    )}

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                      <span className="text-2xl">
                        {verifyResult.afterMs < verifyResult.beforeMs ? "🚀" : "⚠️"}
                      </span>
                      <div>
                        <p className="text-sm font-medium">
                          {verifyResult.afterMs < verifyResult.beforeMs
                            ? `Speedup: ${(verifyResult.beforeMs / verifyResult.afterMs).toFixed(2)}× faster`
                            : "No significant improvement — indexes may not cover this query"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {verifyResult.after.usesIndex
                            ? "Planner switched to index scan"
                            : "Planner still using sequential scan"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}