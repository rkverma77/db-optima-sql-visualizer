"use client";

import type { Database, Statement } from "sql.js";
import initSqlJs from "sql.js";

let sqlJsModule: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/** Lazy-loads sql.js WASM once and caches it for the session. */
export async function getSqlJs() {
  if (sqlJsModule) return sqlJsModule;
  sqlJsModule = await initSqlJs({
    // Served from public/ (see scripts/copy-wasm.js) so the wasm binary is
    // always the exact version matching the installed sql.js npm package,
    // and same-origin so it works with this app's COOP/COEP headers. A
    // hardcoded CDN URL pinned to a different sql.js version is a common
    // source of "both async and sync fetching of the wasm failed" errors.
    locateFile: (file: string) => `/${file}`,
  });
  return sqlJsModule;
}

type Row = Record<string, string | number | null>;
type Data = Record<string, Row[]>;

/**
 * Build a fresh in-memory SQLite database seeded with `data`.
 * Inserts are parameterized (bound placeholders) rather than
 * string-interpolated, so values containing quotes, SQL keywords,
 * or injection payloads can never alter the statement structure.
 */
function buildDatabase(SQL: Awaited<ReturnType<typeof initSqlJs>>, data: Data): Database {
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = OFF;");

  for (const [tbl, rows] of Object.entries(data)) {
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    db.run(`CREATE TABLE IF NOT EXISTS "${tbl}" (${cols.map((c) => `"${c}"`).join(",")})`);

    const placeholders = cols.map(() => "?").join(",");
    const stmt: Statement = db.prepare(
      `INSERT INTO "${tbl}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders})`
    );
    try {
      for (const row of rows) {
        stmt.run(cols.map((c) => row[c] ?? null));
      }
    } finally {
      stmt.free();
    }
  }
  return db;
}

/**
 * Execute `sql` against a fresh DB built from `data` and return the
 * first result set. Uses parameterized inserts internally (see buildDatabase).
 */
export async function runQuery(
  sql: string,
  data: Data
): Promise<{ columns: string[]; values: (string | number | null)[][] } | null> {
  const SQL = await getSqlJs();
  const db = buildDatabase(SQL, data);

  try {
    const results = db.exec(sql);
    if (!results.length) return null;
    return { columns: results[0].columns, values: results[0].values as (string | number | null)[][] };
  } finally {
    db.close();
  }
}

// ── Real EXPLAIN QUERY PLAN ─────────────────────────────────────
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

/**
 * Runs `EXPLAIN QUERY PLAN <sql>` against SQLite (via sql.js) and returns
 * the real planner output — not a simulated/hand-authored plan.
 */
export async function explainQueryPlan(sql: string, data: Data): Promise<ExplainResult> {
  const SQL = await getSqlJs();
  const db = buildDatabase(SQL, data);

  try {
    const res = db.exec(`EXPLAIN QUERY PLAN ${sql}`);
    const raw: PlanRow[] = res.length
      ? (res[0].values as (string | number)[][]).map((v) => ({
          id: Number(v[0]),
          parent: Number(v[1]),
          detail: String(v[3]),
        }))
      : [];

    const detailText = raw.map((r) => r.detail).join(" | ");
    const usesIndex = /USING (?:COVERING )?INDEX/i.test(detailText);
    const usesSeqScan = /SCAN\b(?! .*USING INDEX)/i.test(detailText) && !usesIndex
      ? true
      : /SCAN\b/i.test(detailText) && !usesIndex;

    return { raw, usesIndex, usesSeqScan, summary: detailText || "(no plan rows returned)" };
  } finally {
    db.close();
  }
}

/**
 * Runs `sql` against `data` and applies `indexDdl` (CREATE INDEX statements)
 * first, then measures both the real EXPLAIN QUERY PLAN and wall-clock time
 * before vs after — used to *verify* AI-suggested indexes actually change
 * the planner's chosen strategy, instead of trusting the AI's claim.
 */
export async function verifyIndexImpact(
  sql: string,
  data: Data,
  indexDdl: string[]
): Promise<{
  before: ExplainResult;
  after: ExplainResult;
  beforeMs: number;
  afterMs: number;
}> {
  const SQL = await getSqlJs();

  // Before: no indexes
  const dbBefore = buildDatabase(SQL, data);
  const beforePlanRes = dbBefore.exec(`EXPLAIN QUERY PLAN ${sql}`);
  const t0 = performance.now();
  dbBefore.exec(sql);
  const beforeMs = performance.now() - t0;
  dbBefore.close();

  // After: apply suggested indexes, then re-plan/re-time
  const dbAfter = buildDatabase(SQL, data);
  for (const ddl of indexDdl) {
    try {
      dbAfter.run(ddl);
    } catch {
      // Skip statements that don't apply to the in-memory schema (e.g. wrong column name)
    }
  }
  const afterPlanRes = dbAfter.exec(`EXPLAIN QUERY PLAN ${sql}`);
  const t1 = performance.now();
  dbAfter.exec(sql);
  const afterMs = performance.now() - t1;
  dbAfter.close();

  const toResult = (res: ReturnType<Database["exec"]>): ExplainResult => {
    const raw: PlanRow[] = res.length
      ? (res[0].values as (string | number)[][]).map((v) => ({
          id: Number(v[0]),
          parent: Number(v[1]),
          detail: String(v[3]),
        }))
      : [];
    const detailText = raw.map((r) => r.detail).join(" | ");
    const usesIndex = /USING (?:COVERING )?INDEX/i.test(detailText);
    return { raw, usesIndex, usesSeqScan: /SCAN\b/i.test(detailText) && !usesIndex, summary: detailText || "(no plan rows returned)" };
  };

  return { before: toResult(beforePlanRes), after: toResult(afterPlanRes), beforeMs, afterMs };
}

/**
 * Real (not simulated) benchmark: runs `sql` against synthetic datasets of
 * increasing row counts and measures actual sql.js execution time, both
 * without and with the given indexes applied.
 */
export async function benchmarkAcrossVolumes(
  buildData: (rows: number) => Data,
  sql: string,
  indexDdl: string[],
  volumes: number[]
): Promise<{ rows: number; seqMs: number; idxMs: number }[]> {
  const SQL = await getSqlJs();
  const out: { rows: number; seqMs: number; idxMs: number }[] = [];

  for (const rows of volumes) {
    const data = buildData(rows);

    const dbSeq = buildDatabase(SQL, data);
    const t0 = performance.now();
    try {
      dbSeq.exec(sql);
    } catch {
      /* ignore — some volumes may not satisfy the query */
    }
    const seqMs = performance.now() - t0;
    dbSeq.close();

    const dbIdx = buildDatabase(SQL, data);
    for (const ddl of indexDdl) {
      try {
        dbIdx.run(ddl);
      } catch {
        /* index may not apply cleanly to synthetic schema */
      }
    }
    const t1 = performance.now();
    try {
      dbIdx.exec(sql);
    } catch {
      /* ignore */
    }
    const idxMs = performance.now() - t1;
    dbIdx.close();

    out.push({ rows, seqMs, idxMs });
  }

  return out;
}
