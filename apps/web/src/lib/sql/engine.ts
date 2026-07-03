import type { TableData, TableRow, PipelineStep, CellValue } from "@/types";

// ── Schema string builder (sent to Gemini) ────────────────────
export function buildSchemaString(data: TableData): string {
  return Object.entries(data)
    .map(([tbl, rows]) => {
      const cols = rows[0] ? Object.keys(rows[0]).join(", ") : "—";
      return `Table ${tbl}(${cols}) — ${rows.length} rows`;
    })
    .join("\n");
}

// ── SQL Pipeline Parser ───────────────────────────────────────
/**
 * Parses a SELECT statement into logical execution steps.
 * Supports FROM, one or more JOINs, WHERE, SELECT.
 */
export function parsePipeline(sql: string): PipelineStep[] {
  const words = sql.replace(/[\n\t]/g, " ").split(/\s+/).filter(Boolean);
  const steps: PipelineStep[] = [];

  const fi = words.findIndex((w) => w.toUpperCase() === "FROM");
  if (fi === -1) return [];

  const baseTbl = words[fi + 1];
  const skip = ["JOIN","LEFT","RIGHT","INNER","WHERE","GROUP","ORDER","LIMIT","HAVING"];
  const baseAlias =
    words[fi + 2] && !skip.includes(words[fi + 2].toUpperCase())
      ? words[fi + 2]
      : baseTbl;

  steps.push({ type: "FROM", table: baseTbl, alias: baseAlias, status: "pending" });

  let ci = fi + 2;
  while (ci < words.length) {
    const w = words[ci].toUpperCase();
    const isJoin =
      w === "JOIN" ||
      (["LEFT", "RIGHT", "INNER", "CROSS"].includes(w) &&
        words[ci + 1]?.toUpperCase() === "JOIN");

    if (isJoin) {
      const offset = w === "JOIN" ? 1 : 2;
      const jTbl = words[ci + offset];
      const jAlias =
        words[ci + offset + 1] &&
        words[ci + offset + 1].toUpperCase() !== "ON"
          ? words[ci + offset + 1]
          : jTbl;

      const oi = words.findIndex((w2, idx) => idx > ci && w2.toUpperCase() === "ON");
      let leftKey = "",
        rightKey = "";
      if (oi !== -1) {
        const cond = words.slice(oi + 1, oi + 4).join("");
        const parts = cond.split("=");
        if (parts.length === 2) {
          leftKey = parts[0].trim();
          rightKey = parts[1].trim();
        }
      }
      steps.push({ type: "JOIN", table: jTbl, alias: jAlias, leftKey, rightKey, status: "pending" });

      // The modifier form ("LEFT JOIN") spans two tokens (LEFT, JOIN). Without
      // skipping the extra token, the next loop iteration would land on the
      // bare "JOIN" token and count the same join a second time.
      if (offset === 2) ci++;
    }

    if (w === "WHERE") steps.push({ type: "WHERE", status: "pending" });
    ci++;
  }

  steps.push({ type: "SELECT", status: "pending" });
  return steps;
}

// ── Naive index suggestions from parsed JOIN keys ─────────────
/**
 * Derives simple `CREATE INDEX` statements from the JOIN keys found by
 * parsePipeline. This is a fallback used by the Performance tab so it has
 * *some* real index to benchmark before the user has run the AI Optimizer;
 * it is intentionally naive (no cost model) — the AI Optimizer's suggestions
 * take precedence whenever they're available.
 */
export function deriveIndexSuggestions(steps: PipelineStep[]): string[] {
  const ddl: string[] = [];
  for (const step of steps) {
    if (step.type !== "JOIN" || !step.table || !step.leftKey || !step.rightKey) continue;
    const col = step.rightKey.includes(".") ? step.rightKey.split(".")[1] : step.rightKey;
    if (col) ddl.push(`CREATE INDEX IF NOT EXISTS idx_${step.table}_${col} ON "${step.table}"("${col}")`);
  }
  return ddl;
}

// ── Row prefixing (alias.column) ──────────────────────────────
export function prefixRows(rows: TableRow[], alias: string): TableRow[] {
  return rows.map((r) => {
    const n: TableRow = {};
    Object.keys(r).forEach((k) => (n[`${alias}.${k}`] = r[k]));
    return n;
  });
}

// ── Nested-loop join (used by the animation engine) ──────────
export interface JoinMatch {
  merged: TableRow;
  aIdx: number;
  bIdx: number;
}

export function* nestedLoopJoin(
  left: TableRow[],
  right: TableRow[],
  leftKey: string,
  rightKey: string
): Generator<JoinMatch> {
  for (let a = 0; a < left.length; a++) {
    for (let b = 0; b < right.length; b++) {
      const vA: CellValue =
        (left[a][leftKey] ?? left[a][rightKey] ?? Object.values(left[a])[0]) as CellValue;
      const vB: CellValue =
        (right[b][leftKey] ?? right[b][rightKey] ?? Object.values(right[b])[0]) as CellValue;

      if (vA != null && vB != null && String(vA) === String(vB)) {
        yield { merged: { ...left[a], ...right[b] }, aIdx: a, bIdx: b };
      }
    }
  }
}

// ── Syntax highlighter (returns HTML string) ─────────────────
export function highlightSQL(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(--[^\n]*)/g, '<span class="sql-com">$1</span>')
    .replace(/('(?:[^'\\]|\\.)*')/g, '<span class="sql-str">$1</span>')
    .replace(
      /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|AS|WITH|UNION|EXCEPT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INDEX|TABLE|INTO|VALUES|SET|AND|OR|NOT|NULL|IS|IN|EXISTS|BETWEEN|LIKE|DISTINCT|CASE|WHEN|THEN|ELSE|END)\b/gi,
      '<span class="sql-kw">$1</span>'
    )
    .replace(
      /\b(COUNT|SUM|AVG|MAX|MIN|COALESCE|NULLIF|CAST|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|OVER|PARTITION\s+BY|DATE_TRUNC)\b/gi,
      '<span class="sql-fn">$1</span>'
    )
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="sql-num">$1</span>');
}
