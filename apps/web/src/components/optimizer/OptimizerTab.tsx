"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { SQLEditor } from "@/components/ui/SQLEditor";
import { buildSchemaString } from "@/lib/sql/engine";
import { explainQueryPlan, verifyIndexImpact } from "@/lib/sql/runner";
import type { OptimizationResult, QueryIssue, VerifyIndexResult } from "@/types";

export function OptimizerTab() {
  const {
    aiSQL, setAiSQL,
    tableData,
    aiResult, setAiResult,
    aiLoading, setAiLoading,
    aiError, setAiError,
    verifyResult, setVerifyResult,
    verifyLoading, setVerifyLoading,
    verifyError, setVerifyError,
    demoTrigger,
  } = useStore();

  const schemaBadges = Object.keys(tableData);

  const handleOptimize = async () => {
    if (!aiSQL.trim() || aiLoading) return;
    setAiLoading(true);
    setAiResult(null);
    setAiError(null);
    setVerifyResult(null);
    setVerifyError(null);

    try {
      // Get the REAL current query plan from SQLite (via sql.js) so Gemini's
      // "before" analysis is grounded in fact rather than a guess.
      let explainPlan: string | undefined;
      try {
        const plan = await explainQueryPlan(aiSQL, tableData);
        explainPlan = plan.summary;
      } catch {
        // Query may not be valid SQLite (e.g. uses Postgres-only syntax) — that's fine,
        // Gemini still gets the raw SQL and schema.
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: aiSQL, schema: buildSchemaString(tableData), explainPlan }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Request failed");
      }

      const data: OptimizationResult = await res.json();
      setAiResult(data);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  // Auto-run "Optimize with AI" when Header's "Run Demo" bumps demoTrigger.
  const lastDemoTrigger = useRef(0);
  useEffect(() => {
    if (demoTrigger > 0 && demoTrigger !== lastDemoTrigger.current) {
      lastDemoTrigger.current = demoTrigger;
      handleOptimize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoTrigger]);

  const handleVerify = async () => {
    if (!aiResult || verifyLoading) return;
    setVerifyLoading(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const result = await verifyIndexImpact(aiSQL, tableData, aiResult.index_statements);
      setVerifyResult(result);
    } catch (e) {
      setVerifyError((e as Error).message);
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left: input ── */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{ width: 340, borderRight: "1px solid var(--border)" }}
      >
        <div
          className="flex justify-between items-center px-3 py-2 flex-shrink-0"
          style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Your Query
          </span>
          <button
            onClick={handleOptimize}
            disabled={aiLoading}
            className="px-3 py-1 rounded text-[11.5px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--purple)" }}
          >
            {aiLoading ? "Analyzing…" : "✦ Optimize with AI"}
          </button>
        </div>

        <SQLEditor value={aiSQL} onChange={setAiSQL} />

        {/* Schema badges */}
        <div
          className="px-3 py-2 flex-shrink-0 flex flex-wrap gap-1"
          style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)" }}
        >
          <span className="text-[10px] w-full mb-1" style={{ color: "var(--muted)" }}>Active tables:</span>
          {schemaBadges.map((t) => (
            <span
              key={t}
              className="text-[9.5px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(0,212,255,0.08)",
                border: "1px solid rgba(0,212,255,0.2)",
                color: "var(--accent)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── Right: results ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="flex justify-between items-center px-3 py-2 flex-shrink-0"
          style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            AI Analysis
          </span>
          <span className="text-[10.5px]" style={{ color: "var(--muted)" }}>Powered by Gemini</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {aiLoading && <LoadingState />}
          {aiError && <ErrorState msg={aiError} />}
          {!aiLoading && !aiError && !aiResult && <PlaceholderState />}
          {aiResult && (
            <AIResults
              original={aiSQL}
              result={aiResult}
              onVerify={handleVerify}
              verifyLoading={verifyLoading}
              verifyError={verifyError}
              verifyResult={verifyResult}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Results renderer ──────────────────────────────────────────
function AIResults({
  original, result, onVerify, verifyLoading, verifyError, verifyResult,
}: {
  original: string;
  result: OptimizationResult;
  onVerify: () => void;
  verifyLoading: boolean;
  verifyError: string | null;
  verifyResult: VerifyIndexResult | null;
}) {
  const copySQL = () => navigator.clipboard.writeText(result.optimized_sql);

  return (
    <>
      {/* Issues */}
      <AICard title="⚠ Issues Detected" titleColor="var(--warn)" badge={`${result.issues.length} found`} badgeColor="warn">
        {result.issues.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--success)" }}>No issues found.</p>
        ) : (
          <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
            {result.issues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
          </div>
        )}
      </AICard>

      {/* Diff */}
      <AICard
        title="⬡ Query Comparison"
        titleColor="var(--accent)"
        action={<button onClick={copySQL} className="text-[10px] px-2 py-0.5 rounded" style={{ border: "1px solid var(--border2)", color: "var(--muted2)" }}>Copy optimized</button>}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--danger)" }}>Before</div>
            <CodeBlock text={original} borderColor="rgba(239,68,68,0.25)" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--success)" }}>After</div>
            <CodeBlock text={result.optimized_sql} borderColor="rgba(16,185,129,0.25)" />
          </div>
        </div>
      </AICard>

      {/* Indexes */}
      <AICard
        title="◈ Recommended Indexes"
        titleColor="var(--success)"
        action={
          result.index_statements.length > 0 && (
            <button
              onClick={onVerify}
              disabled={verifyLoading}
              className="text-[10px] px-2 py-0.5 rounded font-semibold disabled:opacity-50"
              style={{ border: "1px solid rgba(16,185,129,0.4)", color: "var(--success)" }}
            >
              {verifyLoading ? "Verifying…" : "▶ Apply & Verify"}
            </button>
          )
        }
      >
        {result.index_statements.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>No indexes suggested.</p>
        ) : (
          result.index_statements.map((stmt, i) => (
            <div
              key={i}
              className="font-mono text-[11.5px] px-3 py-2 rounded mb-1.5"
              style={{
                background: "var(--bg)",
                border: "1px solid rgba(16,185,129,0.3)",
                borderLeft: "3px solid var(--success)",
                color: "var(--success)",
              }}
            >
              {stmt}
            </div>
          ))
        )}
        {verifyError && (
          <p className="text-[11px] mt-2" style={{ color: "var(--danger)" }}>⚠ {verifyError}</p>
        )}
        {verifyResult && <VerifyResultView r={verifyResult} />}
      </AICard>

      {/* Explanation */}
      <AICard title="✦ Explanation" titleColor="#a78bfa">
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--muted2)" }}>
          {result.explanation}
        </p>
        {result.scan_type_before && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[
              { label: "BEFORE", val: result.scan_type_before, color: "var(--danger)", border: "rgba(239,68,68,0.2)" },
              { label: "AFTER",  val: result.scan_type_after,  color: "var(--success)", border: "rgba(16,185,129,0.2)" },
            ].map(({ label, val, color, border }) => (
              <div key={label} className="rounded px-3 py-2" style={{ background: "var(--bg)", border: `1px solid ${border}` }}>
                <div className="text-[9.5px] mb-1" style={{ color: "var(--muted)" }}>{label}</div>
                <div className="text-[12px] font-semibold" style={{ color }}>{val}</div>
              </div>
            ))}
          </div>
        )}
      </AICard>
    </>
  );
}

function VerifyResultView({ r }: { r: VerifyIndexResult }) {
  const speedup = r.afterMs > 0 ? (r.beforeMs / r.afterMs).toFixed(2) : "—";
  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
        Verified against real sql.js EXPLAIN QUERY PLAN + timing
      </div>
      <div className="grid grid-cols-2 gap-3 mb-2">
        <PlanBox label="BEFORE" ms={r.beforeMs} plan={r.before} bad />
        <PlanBox label="AFTER" ms={r.afterMs} plan={r.after} bad={false} />
      </div>
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        {r.after.usesIndex
          ? `Confirmed: SQLite's planner now uses an index (${speedup}× faster on this dataset).`
          : "SQLite's planner did not switch to an index scan — on small in-memory datasets a sequential scan can still be chosen even with an index present."}
      </p>
    </div>
  );
}

function PlanBox({ label, ms, plan, bad }: { label: string; ms: number; plan: VerifyIndexResult["before"]; bad: boolean }) {
  return (
    <div
      className="rounded px-3 py-2"
      style={{ background: "var(--bg)", border: `1px solid ${bad ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}` }}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="text-[9.5px] font-bold" style={{ color: bad ? "var(--danger)" : "var(--success)" }}>{label}</span>
        <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>{ms.toFixed(2)}ms</span>
      </div>
      <div className="text-[10px] font-mono leading-snug" style={{ color: "var(--muted2)" }}>
        {plan.summary}
      </div>
    </div>
  );
}

function AICard({
  title, titleColor, badge, badgeColor, action, children,
}: {
  title: string; titleColor: string; badge?: string; badgeColor?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div
        className="flex justify-between items-center px-3.5 py-2.5"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: titleColor }}>{title}</span>
        {badge && (
          <span
            className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: badgeColor === "warn" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
              color: badgeColor === "warn" ? "var(--warn)" : "var(--success)",
            }}
          >
            {badge}
          </span>
        )}
        {action}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

function IssueRow({ issue }: { issue: QueryIssue }) {
  const colors: Record<string, string> = { high: "var(--danger)", medium: "var(--warn)", low: "var(--success)" };
  return (
    <div className="flex gap-2 items-start py-2">
      <span
        className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
        style={{ background: "rgba(255,255,255,0.05)", color: colors[issue.severity] }}
      >
        {issue.severity}
      </span>
      <span className="text-[12px] leading-relaxed" style={{ color: "var(--muted2)" }}>{issue.description}</span>
    </div>
  );
}

function CodeBlock({ text, borderColor }: { text: string; borderColor: string }) {
  return (
    <pre
      className="font-mono text-[11.5px] leading-relaxed rounded px-3 py-2 whitespace-pre-wrap break-words min-h-[60px]"
      style={{ background: "var(--bg)", border: `1px solid ${borderColor}`, color: "var(--text)" }}
    >
      {text}
    </pre>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4" style={{ color: "var(--muted)" }}>
      <div className="spinner w-9 h-9" />
      <span className="text-[12px]">Analyzing query with Gemini…</span>
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center py-10 gap-2">
      <span className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>⚠ Analysis failed</span>
      <span className="text-[11.5px] font-mono" style={{ color: "var(--muted)" }}>{msg}</span>
    </div>
  );
}

function PlaceholderState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center" style={{ color: "var(--muted)", opacity: 0.5 }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
      <p className="text-[12.5px] max-w-xs leading-relaxed">
        Paste a query and click <strong style={{ color: "var(--text)" }}>Optimize with AI</strong> to get issues, a rewrite, and index recommendations.
      </p>
    </div>
  );
}
