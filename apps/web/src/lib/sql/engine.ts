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
  const tokens = sql.replace(/[\n\t]/g, " ").split(/\s+/).filter(Boolean);
  const steps: PipelineStep[] = [];

  const fi = tokens.findIndex((w) => w.toUpperCase() === "FROM");
  if (fi === -1) return [];

  // ── FROM clause ──
  const baseTbl = tokens[fi + 1];
  let pos = fi + 2;
  let baseAlias = baseTbl;

  if (tokens[pos]?.toUpperCase() === "AS") {
    baseAlias = tokens[pos + 1] ?? baseTbl;
    pos += 2;
  } else if (tokens[pos] && !isClauseKeyword(tokens[pos])) {
    baseAlias = tokens[pos];
    pos++;
  }

  steps.push({ type: "FROM", table: baseTbl, alias: baseAlias, status: "pending" });

  // ── JOIN / WHERE / etc. ──
  while (pos < tokens.length) {
    const w = tokens[pos].toUpperCase();

    // JOIN detection
    if (w === "JOIN" || (isJoinModifier(w) && tokens[pos + 1]?.toUpperCase() === "JOIN")) {
      const offset = w === "JOIN" ? 1 : 2;
      const jTbl = tokens[pos + offset];
      let jAlias = jTbl;
      let afterTable = pos + offset + 1;

      if (tokens[afterTable]?.toUpperCase() === "AS") {
        jAlias = tokens[afterTable + 1] ?? jTbl;
        afterTable += 2;
      } else if (tokens[afterTable] && !isClauseKeyword(tokens[afterTable]) && tokens[afterTable].toUpperCase() !== "ON") {
        jAlias = tokens[afterTable];
        afterTable++;
      }

      // Find ON that belongs to THIS join (before next JOIN or WHERE)
      let onIdx = -1;
      for (let j = afterTable; j < tokens.length; j++) {
        const t = tokens[j].toUpperCase();
        if (t === "ON") { onIdx = j; break; }
        if (isClauseKeyword(t) && t !== "ON") break;
      }

      let leftKey = "", rightKey = "";
      if (onIdx !== -1) {
        const clauseEnd = findNextClause(tokens, onIdx);
        const eqIdx = tokens.findIndex((t, idx) => idx > onIdx && idx < clauseEnd && t === "=");
        if (eqIdx !== -1) {
          leftKey = tokens[eqIdx - 1] ?? "";
          rightKey = tokens[eqIdx + 1] ?? "";
        }
      }

      steps.push({ type: "JOIN", table: jTbl, alias: jAlias, leftKey, rightKey, status: "pending" });
      if (offset === 2) pos++; // skip modifier (LEFT, RIGHT, etc.)
    }

    // WHERE clause
    if (w === "WHERE") {
      const condEnd = findNextClause(tokens, pos);
      const condition = tokens.slice(pos + 1, condEnd).join(" ");
      steps.push({ type: "WHERE", condition, status: "pending" });
    }

    pos++;
  }

  steps.push({ type: "SELECT", status: "pending" });
  return steps;
}

// ── Helpers ──
function isJoinModifier(token: string): boolean {
  return ["LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL"].includes(token.toUpperCase());
}

function isClauseKeyword(token: string): boolean {
  return ["SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL", "ON", "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET", "UNION", "EXCEPT", "INTERSECT"].includes(token.toUpperCase());
}

function findNextClause(tokens: string[], start: number): number {
  for (let i = start + 1; i < tokens.length; i++) {
    const t = tokens[i].toUpperCase();
    if (["JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "NATURAL", "WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET", "UNION", "EXCEPT", "INTERSECT"].includes(t)) {
      return i;
    }
  }
  return tokens.length;
}

// ── Index suggestions from parsed JOIN keys + WHERE columns ──
/**
 * Derives simple `CREATE INDEX` statements from the JOIN keys and WHERE columns
 * found by parsePipeline. This is a fallback used by the Performance tab so it has
 * *some* real index to benchmark before the user has run the AI Optimizer.
 */
export function deriveIndexSuggestions(steps: PipelineStep[]): string[] {
  const ddl: string[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    if (step.type === "JOIN" && step.table && step.leftKey && step.rightKey) {
      const col = step.rightKey.includes(".") ? step.rightKey.split(".")[1] : step.rightKey;
      const stmt = `CREATE INDEX IF NOT EXISTS idx_${step.table}_${col} ON "${step.table}"("${col}")`;
      if (!seen.has(stmt)) { ddl.push(stmt); seen.add(stmt); }
    }
    if (step.type === "WHERE" && step.condition) {
      // Naive: extract table.column patterns like "o.customer_id = ..."
      const matches = step.condition.match(/(\w+)\.(\w+)\s*[=<>]/g) ?? [];
      for (const m of matches) {
        const parts = m.match(/(\w+)\.(\w+)/);
        if (parts) {
          const [, tbl, col] = parts;
          const stmt = `CREATE INDEX IF NOT EXISTS idx_${tbl}_${col} ON "${tbl}"("${col}")`;
          if (!seen.has(stmt)) { ddl.push(stmt); seen.add(stmt); }
        }
      }
    }
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

/**
 * Resolves a join key against a row's actual keys:
 *  1. Exact match (handles alias-qualified keys like "o.customer_id").
 *  2. Suffix match on the unprefixed column name (handles an *unqualified*
 *     ON clause, e.g. `ON customer_id = id`, against rows that prefixKeys()
 *     has already turned into "o.customer_id" / "c.id" — this is the common
 *     real-world case the regex-based ON-clause parser can't always resolve).
 *  3. First column on the row, as a last-resort fallback so the animation
 *     still finds *something* rather than silently matching nothing.
 */
function resolveJoinKey(row: TableRow, key: string): string {
  if (key in row) return key;
  const suffixMatch = Object.keys(row).find((k) => k.split(".").pop() === key);
  if (suffixMatch) return suffixMatch;
  return Object.keys(row)[0];
}

export function* nestedLoopJoin(
  left: TableRow[],
  right: TableRow[],
  leftKey: string,
  rightKey: string
): Generator<JoinMatch> {
  for (let a = 0; a < left.length; a++) {
    const rowA = left[a];
    const resolvedLeftKey = resolveJoinKey(rowA, leftKey);

    for (let b = 0; b < right.length; b++) {
      const rowB = right[b];
      const resolvedRightKey = resolveJoinKey(rowB, rightKey);

      const vA = rowA[resolvedLeftKey];
      const vB = rowB[resolvedRightKey];

      // Strict: both keys must exist and match
      if (vA != null && vB != null && String(vA) === String(vB)) {
        yield { merged: { ...rowA, ...rowB }, aIdx: a, bIdx: b };
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
    .replace(/(--[^\n]*)/g, '<span style="color:#6b7280;font-style:italic">$1</span>')
    .replace(/('(?:[^'\\]|\\.)*')/g, '<span style="color:#22c55e">$1</span>')
    // Numeric literals are highlighted before any keyword/function spans are
    // injected below. Those spans carry CSS values (e.g. font weights) that
    // are themselves bare digit runs bounded by non-word characters — if
    // this ran after them, it would match and wrap digits inside a style
    // attribute, corrupting the tag (this previously leaked literal
    // `600">` text into the rendered output).
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#f472b6">$1</span>')
    .replace(
      /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|AS|WITH|UNION|EXCEPT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INDEX|TABLE|INTO|VALUES|SET|AND|OR|NOT|NULL|IS|IN|EXISTS|BETWEEN|LIKE|DISTINCT|CASE|WHEN|THEN|ELSE|END)\b/gi,
      '<span style="color:#38bdf8;font-weight:bold">$1</span>'
    )
    .replace(
      /\b(COUNT|SUM|AVG|MAX|MIN|COALESCE|NULLIF|CAST|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|OVER|PARTITION\s+BY|DATE_TRUNC)\b/gi,
      '<span style="color:#a78bfa">$1</span>'
    );
}