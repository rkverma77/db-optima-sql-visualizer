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
import { Parser } from "node-sql-parser";

/**
 * Parses a SELECT statement into logical execution steps using an AST.
 * Supports FROM, one or more JOINs, WHERE, SELECT, CTEs, Aggregations, and Window Functions.
 */
function extractSubqueries(obj: any, steps: PipelineStep[]) {
  if (!obj || typeof obj !== "object") return;
  
  if (obj.ast && obj.ast.type === "select") {
    const subAST = obj.ast;
    if (subAST.from && Array.isArray(subAST.from)) {
      for (const f of subAST.from) {
        const tblName = f.table || (f.as || "subquery");
        steps.push({ type: "SUBQUERY", table: tblName, alias: f.as || tblName, status: "pending" });
      }
    }
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      extractSubqueries(obj[key], steps);
    }
  }
}

function extractCTEBody(sql: string, cteName: string): string {
  const regex = new RegExp(`\\b${cteName}\\s+AS\\s*\\(`, "i");
  const match = sql.match(regex);
  if (!match) return "";
  
  const startIndex = match.index! + match[0].length;
  let openParens = 1;
  let i = startIndex;
  for (; i < sql.length; i++) {
      if (sql[i] === '(') openParens++;
      else if (sql[i] === ')') openParens--;
      
      if (openParens === 0) break;
  }
  return sql.substring(startIndex, i).trim();
}

export function parsePipeline(sql: string): PipelineStep[] {
  const parser = new Parser();
  let ast: any;
  try {
    ast = parser.astify(sql);
  } catch (e) {
    // Fallback if parsing fails
    // Extract FROM tables via regex so we can show something
    const fallbackTables = [...new Set(Array.from(sql.matchAll(/FROM\s+([a-zA-Z0-9_]+)/gi)).map(m => m[1]))];
    return [
      { type: "COMPLEX", status: "pending", tables: fallbackTables.length > 0 ? fallbackTables : [] },
      { type: "SELECT", status: "pending" }
    ];
  }

  if (Array.isArray(ast)) ast = ast[0];

  const steps: PipelineStep[] = [];

  if (ast.with && Array.isArray(ast.with)) {
    for (const cte of ast.with) {
      let fragment = "";
      try {
        fragment = parser.sqlify(cte.stmt.ast ? cte.stmt.ast : cte.stmt);
      } catch (e) {
        fragment = extractCTEBody(sql, cte.name.value);
      }
      steps.push({ type: "CTE", table: cte.name.value, alias: cte.name.value, queryFragment: fragment, status: "pending" });
    }
  }

  if (ast.from && Array.isArray(ast.from)) {
    // Pre-evaluate subqueries in FROM clause as if they were CTEs
    for (let i = 0; i < ast.from.length; i++) {
      const f = ast.from[i];
      if (f.expr && f.expr.ast && f.expr.ast.type === "select") {
        let fragment = "";
        try {
          fragment = parser.sqlify(f.expr.ast);
        } catch (e) {}
        if (fragment) {
          const alias = f.as || `subquery_${i}`;
          steps.push({ type: "CTE", table: alias, alias: alias, queryFragment: fragment, status: "pending" });
        }
      }
    }

    for (let i = 0; i < ast.from.length; i++) {
      const f = ast.from[i];
      // `table` might be null if it's a subquery, fallback to dual or subquery
      const tblName = f.table || (f.as || "subquery");
      if (i === 0) {
        steps.push({ type: "FROM", table: tblName, alias: f.as || tblName, status: "pending" });
      } else {
        let leftKey = "", rightKey = "";
        if (f.on && f.on.type === "binary_expr" && f.on.operator === "=") {
          leftKey = f.on.left?.column || "";
          rightKey = f.on.right?.column || "";
        }
        steps.push({ type: "JOIN", table: tblName, alias: f.as || tblName, leftKey, rightKey, status: "pending" });
      }
    }
  }

  if (ast.where) {
    steps.push({ type: "WHERE", condition: "Condition", status: "pending" });
  }

  if (ast.groupby) {
    steps.push({ type: "AGGREGATE", status: "pending" });
  }

  // ── Extract Subqueries recursively ──
  extractSubqueries(ast.columns, steps);
  extractSubqueries(ast.where, steps);
  extractSubqueries(ast.groupby, steps);

  let hasWindow = false;
  if (ast.columns) {
    for (const col of ast.columns) {
      // Detect window functions
      if (col.expr && col.expr.over) {
        hasWindow = true;
      }
    }
  }
  if (hasWindow) {
    steps.push({ type: "WINDOW", status: "pending" });
  }

  steps.push({ type: "SELECT", status: "pending" });
  return steps;
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