// ── Database / Schema ─────────────────────────────────────────
export type CellValue = string | number | null;

export interface TableRow {
  [column: string]: CellValue;
}

export interface TableData {
  [tableName: string]: TableRow[];
}

// ── SQL Execution Pipeline ─────────────────────────────────────
export type PipelineStepType = "FROM" | "JOIN" | "WHERE" | "SUBQUERY" | "SELECT";
export type PipelineStepStatus = "pending" | "active" | "done";

export interface PipelineStep {
  type: PipelineStepType;
  table?: string;
  alias?: string;
  leftKey?: string;
  rightKey?: string;
  condition?: string;
  status: PipelineStepStatus;
}

export interface QueryResult {
  columns: string[];
  values: CellValue[][];
}

// ── AI / Gemini ────────────────────────────────────────────────
export type IssueSeverity = "high" | "medium" | "low";

export interface QueryIssue {
  severity: IssueSeverity;
  description: string;
}

export interface OptimizationResult {
  issues: QueryIssue[];
  optimized_sql: string;
  explanation: string;
  index_statements: string[];
  scan_type_before: string;
  scan_type_after: string;
}

// ── API Request / Response shapes (validated with Zod) ────────
export interface AnalyzeRequestBody {
  sql: string;
  schema: string; // human-readable schema string sent to Gemini
  explainPlan?: string; // real EXPLAIN QUERY PLAN output from sql.js, if available
}

export interface SuggestIndexesRequestBody {
  sql: string;
  schema: string;
}

// ── Performance Chart ──────────────────────────────────────────
export interface PerfDataPoint {
  rows: number;
  /** Wall-clock time for the Original Query (Editor A) at this volume. */
  originalMs: number;
  /** Wall-clock time for the Optimized Query (Editor B), with the AI's
   *  suggested indexes applied, at this volume. */
  optimizedMs: number;
  /** -1 / true when the ORIGINAL side wasn't actually run at this volume —
   *  either it failed validation (bad SQL) or a smaller volume on this
   *  side already exceeded the time budget. Tracked independently from
   *  the optimized side since the two queries can fail or blow up at
   *  different points. */
  originalSkipped?: boolean;
  /** Same as `originalSkipped`, for the OPTIMIZED side. */
  optimizedSkipped?: boolean;
}

// ── Index verification (real sql.js EXPLAIN QUERY PLAN before/after) ──
export interface PlanRow {
  id: number;
  parent: number;
  detail: string;
}

export interface ExplainResult {
  raw: PlanRow[];
  usesIndex: boolean;
  usesSeqScan: boolean;
  summary: string;
}

export interface VerifyIndexResult {
  before: ExplainResult;
  after: ExplainResult;
  beforeMs: number;
  afterMs: number;
}

// ── Saved / shared queries ─────────────────────────────────────
export interface SavedQuery {
  id: number;
  name: string;
  sql: string;
  schemaJson: TableData;
  createdAt?: string;
}