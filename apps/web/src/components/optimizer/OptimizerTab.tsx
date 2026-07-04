"use client";

import { useEffect, useCallback } from "react";
import { useStore } from "@/store/useStore";
import { buildSchemaString } from "@/lib/sql/engine";
import { explainQueryPlan, verifyIndexImpact } from "@/lib/sql/runner";
import { OptimizerResult } from "./OptimizerResult";
import { highlightSQL } from "@/lib/sql/engine";

export function OptimizerTab() {
  const {
    aiSQL,
    setAiSQL,
    aiResult,
    setAiResult,
    aiLoading,
    setAiLoading,
    aiError,
    setAiError,
    tableData,
    demoTrigger,
    verifyResult,
    setVerifyResult,
    verifyLoading,
    setVerifyLoading,
    verifyError,
    setVerifyError,
  } = useStore();

  // ── Run AI Analysis ──
  const runOptimize = useCallback(async () => {
    if (!aiSQL.trim() || aiLoading) return;

    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
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
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }, [aiSQL, tableData, aiLoading, setAiLoading, setAiError, setAiResult, setVerifyResult, setVerifyError]);

  // ── Apply & Verify Indexes ──
  const runVerify = useCallback(async () => {
    if (!aiResult?.index_statements?.length || verifyLoading) return;

    setVerifyLoading(true);
    setVerifyError(null);

    try {
      const result = await verifyIndexImpact(aiSQL, tableData, aiResult.index_statements);
      setVerifyResult(result);
    } catch (e) {
      setVerifyError((e as Error).message);
    } finally {
      setVerifyLoading(false);
    }
  }, [aiResult, aiSQL, tableData, verifyLoading, setVerifyLoading, setVerifyError, setVerifyResult]);

  // ── Demo auto-run ──
  useEffect(() => {
    if (demoTrigger > 0 && !aiResult && !aiLoading) {
      const timer = setTimeout(runOptimize, 400);
      return () => clearTimeout(timer);
    }
  }, [demoTrigger, aiResult, aiLoading, runOptimize]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* ── Left: Editor + Controls ── */}
      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-[var(--muted)]">
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

          <textarea
            value={aiSQL}
            onChange={(e) => setAiSQL(e.target.value)}
            className="input font-mono text-sm min-h-[200px] resize-y"
            placeholder="Paste your SQL query here…"
            spellCheck={false}
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
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Analysis Failed
            </div>
            {aiError}
          </div>
        )}

        {/* Original query preview */}
        <div className="card p-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-[var(--muted)] mb-3">
            Original Query
          </h3>
          <pre className="code-block">
            <code dangerouslySetInnerHTML={{ __html: highlightSQL(aiSQL) }} />
          </pre>
        </div>
      </div>

      {/* ── Right: Results ── */}
      <div className="flex flex-col gap-4 overflow-auto">
        {!aiResult && !aiLoading && !aiError && (
          <div className="card p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
            <div className="w-16 h-16 rounded-full bg-[var(--surface3)] flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="card p-8 flex flex-col items-center justify-center min-h-[300px]">
            <div className="relative w-12 h-12 mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-[var(--border)]" />
              <div className="absolute inset-0 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
            </div>
            <p className="text-sm text-[var(--muted)] animate-pulse">Gemini is analyzing your query…</p>
          </div>
        )}

        {aiResult && (
          <>
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-[var(--muted)]">
                  AI Optimization Results
                </h3>
                <button
                  onClick={runVerify}
                  disabled={verifyLoading || !aiResult.index_statements?.length}
                  className="btn-secondary"
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

              <OptimizerResult result={aiResult} />
            </div>

            {/* Verify Results */}
            {verifyError && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                ⚠ {verifyError}
              </div>
            )}

            {verifyResult && (
              <div className="card p-4 animate-fade-in">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-[var(--muted)] mb-4">
                  Verification Results
                </h3>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                    <p className="text-xs text-[var(--muted)] mb-1">Before (no indexes)</p>
                    <p className="text-lg font-bold">{verifyResult.beforeMs.toFixed(2)}<span className="text-sm font-normal text-[var(--muted)] ml-1">ms</span></p>
                    <p className="text-xs text-[var(--muted)] mt-1">{verifyResult.before.summary}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--success)]/5 border border-[var(--success)]/30">
                    <p className="text-xs text-[var(--success)] mb-1">After (with indexes)</p>
                    <p className="text-lg font-bold text-[var(--success)]">{verifyResult.afterMs.toFixed(2)}<span className="text-sm font-normal ml-1">ms</span></p>
                    <p className="text-xs text-[var(--success)]/70 mt-1">{verifyResult.after.summary}</p>
                  </div>
                </div>

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
          </>
        )}
      </div>
    </div>
  );
}