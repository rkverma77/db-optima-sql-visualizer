"use client";

import type { Database, Statement } from "sql.js";
import initSqlJs from "sql.js";

let sqlJsModule: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/** Lazy-loads sql.js WASM once and caches it for the session. */
export async function getSqlJs() {
  if (sqlJsModule) return sqlJsModule;

  // The WASM file copied by scripts/copy-wasm.js is "sql-wasm.wasm"
  sqlJsModule = await initSqlJs({
    locateFile: (file: string) => {
      // sql.js asks for "sql-wasm.wasm" — serve from public/
      return `/${file}`;
    },
  });
  return sqlJsModule;
}

type Row = Record<string, CellValue>;
type Data = Record<string, Row[]>;
type CellValue = string | number | null;

/**
 * Build a fresh in-memory SQLite database seeded with `data`.
 * Inserts are parameterized (bound placeholders).
 */
function buildDatabase(SQL: Awaited<ReturnType<typeof initSqlJs>>, data: Data): Database {
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = OFF;");
  db.run("BEGIN TRANSACTION;");

  try {
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
    db.run("COMMIT;");
  } catch (err) {
    db.run("ROLLBACK;");
    throw err;
  }
  return db;
}

/**
 * Execute `sql` against a fresh DB built from `data`.
 */
export async function runQuery(
  sql: string,
  data: Data
): Promise<{ columns: string[]; values: CellValue[][] } | null> {
  const SQL = await getSqlJs();
  const db = buildDatabase(SQL, data);

  try {
    const results = db.exec(sql);
    if (!results.length) return null;
    return { columns: results[0].columns, values: results[0].values as CellValue[][] };
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
 * Runs `EXPLAIN QUERY PLAN <sql>` against SQLite (via sql.js).
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
    const usesIndex = /USING\s+(?:COVERING\s+)?INDEX/i.test(detailText);
    const usesSeqScan = /SCAN\s+/i.test(detailText) && !usesIndex;

    return { raw, usesIndex, usesSeqScan, summary: detailText || "(no plan rows returned)" };
  } finally {
    db.close();
  }
}

/**
 * Runs `sql` against `data`, applies `indexDdl`, then measures both
 * EXPLAIN QUERY PLAN and wall-clock time before vs after.
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

  // After: apply suggested indexes
  const dbAfter = buildDatabase(SQL, data);
  for (const ddl of indexDdl) {
    try { dbAfter.run(ddl); } catch { /* skip invalid DDL */ }
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
    const usesIndex = /USING\s+(?:COVERING\s+)?INDEX/i.test(detailText);
    return { raw, usesIndex, usesSeqScan: /SCAN\s+/i.test(detailText) && !usesIndex, summary: detailText || "(no plan rows returned)" };
  };

  return { before: toResult(beforePlanRes), after: toResult(afterPlanRes), beforeMs, afterMs };
}

// ── Benchmark helpers ───────────────────────────────────────────

/**
 * Hands control back to the browser for one tick.
 *
 * `await somePromise` alone only schedules a microtask — the browser does
 * NOT get a chance to paint, animate the spinner, or respond to input
 * between microtasks. Only macrotask boundaries (setTimeout, message events)
 * let rendering happen. Without this, a multi-second synchronous WASM loop
 * (building several databases with up to 100K rows each, across every
 * volume point) freezes the tab completely for its full duration.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function measureMedian(db: Database, sql: string, runs: number = 3): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    try { db.exec(sql); } catch { /* ignore */ }
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

/**
 * Real benchmark: runs `sql` against synthetic datasets of increasing row counts.
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
    // Let the browser paint (spinner, elapsed-time counter) and process
    // input before starting the next, potentially expensive, volume point.
    await yieldToBrowser();

    const data = buildData(rows);

    const dbSeq = buildDatabase(SQL, data);
    const seqMs = await measureMedian(dbSeq, sql);
    dbSeq.close();

    await yieldToBrowser();

    const dbIdx = buildDatabase(SQL, data);
    for (const ddl of indexDdl) {
      try { dbIdx.run(ddl); } catch { /* ignore */ }
    }
    const idxMs = await measureMedian(dbIdx, sql);
    dbIdx.close();

    out.push({ rows, seqMs, idxMs });
  }

  return out;
}