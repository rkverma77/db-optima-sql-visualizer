"use client";

import { useState, Fragment } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import type { OptimizationResult } from "@/types";
import { highlightSQL } from "@/lib/sql/engine";

interface Props {
  result: OptimizationResult;
  /** Re-runs the AI analysis from scratch (same query, fresh call to Gemini).
   *  Optional so this component still works anywhere it's used without it. */
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
}

// Gemini's free-text fields (issue descriptions, explanation) come back as
// markdown, and often use `backtick` spans to call out identifiers like
// column or table names. Rendered as plain text those backticks show up
// literally instead of turning into styled inline code, so split on them
// and wrap each code span in a <code> element.
function renderWithInlineCode(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[0.9em] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/* ── animation variants ── */
const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

const issueCardVariant: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

const severityGradients: Record<string, string> = {
  high: "linear-gradient(135deg, rgba(239,68,68,0.45), rgba(239,68,68,0.08))",
  medium: "linear-gradient(135deg, rgba(234,179,8,0.45), rgba(234,179,8,0.08))",
  low: "linear-gradient(135deg, rgba(99,102,241,0.45), rgba(99,102,241,0.08))",
};

const severityTextColors: Record<string, string> = {
  high: "var(--error)",
  medium: "var(--warning)",
  low: "var(--accent)",
};

export function OptimizerResult({ result, onReanalyze, isReanalyzing }: Props) {
  const [copied, setCopied] = useState(false);

  const copySQL = async () => {
    await navigator.clipboard.writeText(result.optimized_sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      className="space-y-6"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* ── Issues ── */}
      <motion.section variants={fadeSlideUp}>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
          Detected Issues
        </h3>
        <motion.div
          className="space-y-2"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {result.issues.map((issue, i) => (
            <motion.div
              key={`issue-${i}`}
              variants={issueCardVariant}
              whileHover={{ scale: 1.015, transition: { duration: 0.2 } }}
              className="relative p-3 rounded-xl overflow-hidden"
              style={{
                background: "var(--surface)",
                backdropFilter: "blur(16px)",
                border: "1px solid var(--border)",
              }}
            >
              {/* Gradient glow border overlay */}
              <div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                  background: severityGradients[issue.severity] || severityGradients.low,
                  opacity: 0.12,
                }}
              />
              <div className="relative z-10">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: severityTextColors[issue.severity] || "var(--accent)", opacity: 0.85 }}
                >
                  {issue.severity}
                </span>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">
                  {renderWithInlineCode(issue.description)}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* ── AI self-check: result equivalence ── */}
      <motion.section
        variants={fadeSlideUp}
        className="p-4 rounded-xl"
        style={{
          background: result.result_equivalence.equivalent
            ? "color-mix(in srgb, var(--success) 8%, var(--surface))"
            : "color-mix(in srgb, var(--error) 8%, var(--surface))",
          backdropFilter: "blur(16px)",
          borderLeft: `4px solid ${result.result_equivalence.equivalent ? "var(--success)" : "var(--error)"}`,
          border: `1px solid ${result.result_equivalence.equivalent ? "color-mix(in srgb, var(--success) 30%, transparent)" : "color-mix(in srgb, var(--error) 30%, transparent)"}`,
          borderLeftWidth: "4px",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold flex items-center gap-2" style={{ color: result.result_equivalence.equivalent ? "var(--success)" : "var(--error)" }}>
            {result.result_equivalence.equivalent ? "✓ Results should match original" : "⚠ Results may differ from original"}
          </p>
          {!result.result_equivalence.equivalent && onReanalyze && (
            <motion.button
              onClick={onReanalyze}
              disabled={isReanalyzing}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Send this query to the AI again for a fresh analysis"
              className="shrink-0 text-xs px-2.5 py-1 rounded-md border font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: "color-mix(in srgb, var(--error) 45%, transparent)", color: "var(--error)", background: "color-mix(in srgb, var(--error) 12%, transparent)" }}
            >
              {isReanalyzing ? "Re-analyzing…" : "↻ Re-analyze"}
            </motion.button>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed opacity-90 text-[var(--text)]">
          {renderWithInlineCode(result.result_equivalence.reasoning)}
        </p>
      </motion.section>

      {/* ── Optimized SQL ── */}
      <motion.section
        variants={fadeSlideUp}
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--surface)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}
        >
          <h3 className="font-semibold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
            Optimized SQL
          </h3>
          <motion.button
            onClick={copySQL}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            className="text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
            style={{
              background: copied ? "color-mix(in srgb, var(--success) 15%, transparent)" : "var(--surface2)",
              border: `1px solid ${copied ? "color-mix(in srgb, var(--success) 40%, transparent)" : "var(--border)"}`,
              color: copied ? "var(--success)" : "var(--text-secondary)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="check"
                  initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex items-center gap-1"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex items-center gap-1"
                >
                  📋 Copy
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
        <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed">
          <code dangerouslySetInnerHTML={{ __html: highlightSQL(result.optimized_sql) }} />
        </pre>
      </motion.section>

      {/* ── Scan comparison ── */}
      <motion.section variants={fadeSlideUp} className="grid grid-cols-2 gap-4">
        <div
          className="p-4 rounded-xl"
          style={{ background: "var(--surface)", backdropFilter: "blur(16px)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1">Before</p>
          <p className="text-sm font-medium text-[var(--text)]">{result.scan_type_before}</p>
        </div>
        <div
          className="p-4 rounded-xl"
          style={{ background: "color-mix(in srgb, var(--success) 5%, var(--surface))", backdropFilter: "blur(16px)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)" }}
        >
          <p className="text-xs uppercase tracking-wider text-[var(--success)] mb-1">After</p>
          <p className="text-sm font-medium text-[var(--success)]">{result.scan_type_after}</p>
        </div>
      </motion.section>

      {/* ── Indexes ── */}
      <motion.section variants={fadeSlideUp}>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
          Suggested Indexes
        </h3>
        <motion.div
          className="space-y-2"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {result.index_statements.map((ddl, i) => (
            <motion.div
              key={`idx-${i}`}
              variants={issueCardVariant}
              whileHover={{ scale: 1.01, x: 4, transition: { duration: 0.2 } }}
              className="flex items-center gap-3 p-3 rounded-xl font-mono text-xs"
              style={{
                background: "var(--surface)",
                backdropFilter: "blur(16px)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="text-[var(--accent)] select-none">▸</span>
              <code className="break-all">{ddl}</code>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* ── Explanation ── */}
      <motion.section
        variants={fadeSlideUp}
        className="p-4 rounded-xl"
        style={{
          background: "var(--surface)",
          backdropFilter: "blur(16px)",
          border: "1px solid var(--border)",
        }}
      >
        <h3 className="text-sm font-semibold mb-2 text-[var(--muted)] uppercase tracking-wider">
          Explanation
        </h3>
        <p className="text-sm leading-relaxed text-[var(--text)]/90">{renderWithInlineCode(result.explanation)}</p>
      </motion.section>
    </motion.div>
  );
}