"use client";

import { useState, Fragment } from "react";
import type { OptimizationResult } from "@/types";
import { highlightSQL } from "@/lib/sql/engine";

interface Props {
  result: OptimizationResult;
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

export function OptimizerResult({ result }: Props) {
  const [copied, setCopied] = useState(false);

  const copySQL = async () => {
    await navigator.clipboard.writeText(result.optimized_sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const severityColors: Record<string, string> = {
    high: "border-red-500 bg-red-500/10 text-red-400",
    medium: "border-yellow-500 bg-yellow-500/10 text-yellow-400",
    low: "border-blue-500 bg-blue-500/10 text-blue-400",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Issues */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
          Detected Issues
        </h3>
        <div className="space-y-2">
          {result.issues.map((issue, i) => (
            <div
              key={`issue-${i}`}
              className={`p-3 rounded-lg border-l-4 ${severityColors[issue.severity]}`}
            >
              <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                {issue.severity}
              </span>
              <p className="mt-1 text-sm leading-relaxed">{renderWithInlineCode(issue.description)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI self-check: does optimized_sql return the same result set? */}
      <section
        className={`p-4 rounded-lg border-l-4 ${
          result.result_equivalence.equivalent
            ? "border-[var(--success)] bg-[var(--success)]/10 text-[var(--success)]"
            : "border-red-500 bg-red-500/10 text-red-400"
        }`}
      >
        <p className="text-sm font-semibold flex items-center gap-2">
          {result.result_equivalence.equivalent ? "✓ Results should match original" : "⚠ Results may differ from original"}
        </p>
        <p className="mt-1 text-sm leading-relaxed opacity-90">
          {renderWithInlineCode(result.result_equivalence.reasoning)}
        </p>
      </section>

      {/* Optimized SQL */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
            Optimized SQL
          </h3>
          <button
            onClick={copySQL}
            className="text-xs px-2 py-1 rounded-md border border-[var(--border)] hover:bg-[var(--surface2)] transition flex items-center gap-1.5"
          >
            {copied ? "✓ Copied" : "📋 Copy"}
          </button>
        </div>
        <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed">
          <code dangerouslySetInnerHTML={{ __html: highlightSQL(result.optimized_sql) }} />
        </pre>
      </section>

      {/* Scan comparison */}
      <section className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--surface2)]">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1">Before</p>
          <p className="text-sm font-medium">{result.scan_type_before}</p>
        </div>
        <div className="p-4 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/5">
          <p className="text-xs uppercase tracking-wider text-[var(--success)] mb-1">After</p>
          <p className="text-sm font-medium text-[var(--success)]">{result.scan_type_after}</p>
        </div>
      </section>

      {/* Indexes */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
          Suggested Indexes
        </h3>
        <div className="space-y-2">
          {result.index_statements.map((ddl, i) => (
            <div
              key={`idx-${i}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-mono text-xs"
            >
              <span className="text-[var(--accent)] select-none">▸</span>
              <code className="break-all">{ddl}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Explanation */}
      <section className="p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
        <h3 className="text-sm font-semibold mb-2 text-[var(--muted)] uppercase tracking-wider">
          Explanation
        </h3>
        <p className="text-sm leading-relaxed text-[var(--text)]/90">{renderWithInlineCode(result.explanation)}</p>
      </section>
    </div>
  );
}