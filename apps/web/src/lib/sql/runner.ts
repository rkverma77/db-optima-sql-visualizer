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

      // Baseline index on "id", mirroring the primary-key index virtually
      // every real table already has. Without this, `WHERE id = ...` —
      // exactly what a correlated subquery runs once per outer row — does
      // a full table scan every time, no matter how the query is written.
      // One unindexed "id" column turns a cheap point lookup into O(n),
      // and a query with several such lookups per row into effectively
      // O(n²): the actual reason subquery-heavy benchmarks used to take
      // forever (or get auto-skipped) at scale. This is on for both the
      // seq and idx passes — it's a baseline schema fact, not one of the
      // "suggested indexes" — so the before/after comparison still
      // isolates the effect of those suggested indexes specifically.
      // A plain (non-unique) index is used instead of PRIMARY KEY so a
      // hand-edited table with duplicate or non-numeric ids still builds
      // successfully instead of throwing a constraint error.
      const idCol = cols.find((c) => c.toLowerCase() === "id");
      if (idCol) {
        try { db.run(`CREATE INDEX IF NOT EXISTS "idx_${tbl}_${idCol}_baseline" ON "${tbl}"("${idCol}")`); }
        catch { /* non-critical — worst case this table falls back to a scan */ }
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
 * Same as `explainQueryPlan`, but applies `indexDdl` first — used for the
 * OPTIMIZED side of a comparison, since "optimized" bundles a rewritten
 * query with the indexes it's meant to run against.
 */
export async function explainQueryPlanWithIndexes(sql: string, data: Data, indexDdl: string[]): Promise<ExplainResult> {
  const SQL = await getSqlJs();
  const db = buildDatabase(SQL, data);
  for (const ddl of indexDdl) {
    try { db.run(ddl); } catch { /* skip invalid DDL */ }
  }

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

/**
 * Runs the ORIGINAL query (baseline indexes only) and the OPTIMIZED query
 * (with `indexDdl` applied) against the same `data`, capturing a real
 * EXPLAIN QUERY PLAN and wall-clock time for each — the dual-query
 * equivalent of `verifyIndexImpact`, used by the Performance tab's
 * Execution Plan Comparison panel to show two genuinely different plans
 * side by side instead of the same query with/without an index.
 */
export async function compareQueries(
  originalSql: string,
  optimizedSql: string,
  data: Data,
  indexDdl: string[]
): Promise<{
  before: ExplainResult;
  after: ExplainResult;
  beforeMs: number;
  afterMs: number;
}> {
  const SQL = await getSqlJs();

  const dbOriginal = buildDatabase(SQL, data);
  const beforePlanRes = dbOriginal.exec(`EXPLAIN QUERY PLAN ${originalSql}`);
  const t0 = performance.now();
  dbOriginal.exec(originalSql);
  const beforeMs = performance.now() - t0;
  dbOriginal.close();

  const dbOptimized = buildDatabase(SQL, data);
  for (const ddl of indexDdl) {
    try { dbOptimized.run(ddl); } catch { /* skip invalid DDL */ }
  }
  const afterPlanRes = dbOptimized.exec(`EXPLAIN QUERY PLAN ${optimizedSql}`);
  const t1 = performance.now();
  dbOptimized.exec(optimizedSql);
  const afterMs = performance.now() - t1;
  dbOptimized.close();

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

/**
 * Runs `sql` up to `runs` times and returns the median wall-clock time.
 *
 * Bails out after the *first* run if it already exceeds `maxMs` — there's
 * no point running two more equally-slow repeats just to compute a median
 * of three numbers that are all going to be roughly the same anyway, and
 * doing so is exactly what let a single pathological run cost 3x its own
 * time before `benchmarkAcrossVolumes`'s time-budget check ever saw it.
 */
async function measureMedian(db: Database, sql: string, runs: number, maxMs: number): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    try { db.exec(sql); } catch { /* ignore */ }
    const elapsed = performance.now() - t0;
    times.push(elapsed);
    if (elapsed > maxMs) break;
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

/** Fewer repeats at larger volumes — a median-of-3 at 100K rows costs 3x
 *  for barely more precision than a single run. Shared by the real
 *  benchmark and the time estimator below so their math can't drift. */
function runsForVolume(rows: number): number {
  return rows <= 10_000 ? 3 : rows <= 50_000 ? 2 : 1;
}

export interface BenchmarkPoint {
  rows: number;
  /** Wall-clock time for the Original Query at this volume, or -1 if it
   *  wasn't actually run (see `originalSkipped`). */
  originalMs: number;
  /** Wall-clock time for the Optimized Query (with `indexDdl` applied) at
   *  this volume, or -1 if it wasn't actually run (see `optimizedSkipped`). */
  optimizedMs: number;
  /** True if the ORIGINAL side was not run at this volume — either it
   *  failed validation (bad SQL) or a smaller volume on this side already
   *  blew past the time budget. Tracked independently of the optimized
   *  side since the two queries can fail or blow up at different points. */
  originalSkipped?: boolean;
  /** Same as `originalSkipped`, for the OPTIMIZED side. */
  optimizedSkipped?: boolean;
}

export interface DualBenchmarkResult {
  points: BenchmarkPoint[];
  /** Set if the Original Query failed to execute at all (e.g. references a
   *  dropped table) — checked once up front so a broken query surfaces as
   *  a clear error instead of silently producing near-zero timings for
   *  every volume. Null when the query ran fine. */
  originalError: string | null;
  /** Same as `originalError`, for the Optimized Query (checked with
   *  `indexDdl` already applied, since that's how it actually runs). */
  optimizedError: string | null;
}

/**
 * Real dual benchmark: runs the ORIGINAL query and the OPTIMIZED query
 * (with its suggested indexes applied) against identical synthetic
 * datasets of increasing row counts, so the two genuinely different SQL
 * strings can be compared head-to-head rather than the same query
 * before/after an index.
 *
 * Fairness: `buildData(rows)` is called exactly once per volume and that
 * same dataset is reused for both timings at that volume — the comparison
 * isn't skewed by regenerating (and thus reseeding) data between them.
 *
 * Each side is validated once up front (against the smallest volume) so a
 * broken query (e.g. references a dropped table) reports a clear error for
 * *that* editor without blocking the other query's full sweep — a failure
 * on one side never prevents the other from running to completion.
 *
 * Two safety valves — tracked independently per side — keep a pathological
 * query (e.g. correlated subqueries, which SQLite re-runs per outer row)
 * from freezing the tab for minutes on end:
 *
 *  - `maxMsPerRun`: once a side's execution at some volume takes longer
 *    than this, every *larger* volume is skipped for that side — we
 *    already know it'd be slower still.
 *  - `shouldCancel`: checked between every step, so a "Cancel" button can
 *    stop the sweep immediately, preserving whichever volumes already
 *    completed for both queries.
 */
export async function benchmarkAcrossVolumes(
  buildData: (rows: number) => Data,
  originalSql: string,
  optimizedSql: string,
  indexDdl: string[],
  volumes: number[],
  options?: { maxMsPerRun?: number; shouldCancel?: () => boolean }
): Promise<DualBenchmarkResult> {
  const SQL = await getSqlJs();
  const out: BenchmarkPoint[] = [];
  const maxMsPerRun = options?.maxMsPerRun ?? 4000;
  const shouldCancel = options?.shouldCancel ?? (() => false);

  // ── Up-front validation ──────────────────────────────────────────
  // A quick probe against the smallest volume catches parse/execution
  // errors (bad table/column references, syntax errors) before the sweep
  // starts, so they surface as a clean per-editor message instead of
  // measureMedian's per-run try/catch quietly turning a failing query
  // into a suspiciously fast "timing".
  const probeRows = volumes[0] ?? 1000;
  const probeData = buildData(probeRows);

  let originalError: string | null = null;
  let optimizedError: string | null = null;

  const dbProbeOriginal = buildDatabase(SQL, probeData);
  try { dbProbeOriginal.exec(originalSql); } catch (e) { originalError = (e as Error).message; }
  dbProbeOriginal.close();

  const dbProbeOptimized = buildDatabase(SQL, probeData);
  for (const ddl of indexDdl) { try { dbProbeOptimized.run(ddl); } catch { /* skip invalid DDL */ } }
  try { dbProbeOptimized.exec(optimizedSql); } catch (e) { optimizedError = (e as Error).message; }
  dbProbeOptimized.close();

  if (originalError && optimizedError) {
    // Nothing runnable on either side — nothing more to do.
    return { points: [], originalError, optimizedError };
  }

  let originalTooSlow = false;
  let optimizedTooSlow = false;

  for (const rows of volumes) {
    if (shouldCancel()) break;

    // Let the browser paint (spinner, elapsed-time counter) and process
    // input before starting the next, potentially expensive, volume point.
    await yieldToBrowser();
    if (shouldCancel()) break;

    // Fewer repeats at larger volumes — a median-of-3 at 100K rows costs
    // 3x for barely more precision than a single run.
    const runs = runsForVolume(rows);

    // Generated once, reused for BOTH timings at this volume — see the
    // fairness note above.
    const data = buildData(rows);

    let originalMs = -1;
    let originalSkipped = !!originalError;
    if (!originalError && !originalTooSlow) {
      const dbOriginal = buildDatabase(SQL, data);
      originalMs = await measureMedian(dbOriginal, originalSql, runs, maxMsPerRun);
      dbOriginal.close();
      if (originalMs > maxMsPerRun) originalTooSlow = true;
    } else if (originalTooSlow) {
      originalSkipped = true;
    }

    if (shouldCancel()) {
      out.push({ rows, originalMs, optimizedMs: -1, originalSkipped, optimizedSkipped: true });
      break;
    }
    await yieldToBrowser();
    if (shouldCancel()) {
      out.push({ rows, originalMs, optimizedMs: -1, originalSkipped, optimizedSkipped: true });
      break;
    }

    let optimizedMs = -1;
    let optimizedSkipped = !!optimizedError;
    if (!optimizedError && !optimizedTooSlow) {
      const dbOptimized = buildDatabase(SQL, data);
      for (const ddl of indexDdl) {
        try { dbOptimized.run(ddl); } catch { /* ignore */ }
      }
      optimizedMs = await measureMedian(dbOptimized, optimizedSql, runs, maxMsPerRun);
      dbOptimized.close();
      if (optimizedMs > maxMsPerRun) optimizedTooSlow = true;
    } else if (optimizedTooSlow) {
      optimizedSkipped = true;
    }

    out.push({ rows, originalMs, optimizedMs, originalSkipped, optimizedSkipped });

    // Both sides exhausted (errored or too slow) — no point continuing.
    if ((originalError || originalTooSlow) && (optimizedError || optimizedTooSlow)) break;
  }

  return { points: out, originalError, optimizedError };
}

export interface BenchmarkEstimate {
  /** Predicted total wall-clock time for the full sweep, in seconds. */
  estimatedSeconds: number;
  /** Empirical growth rate: ~1 means roughly linear in row count (typical
   *  of an indexed JOIN), ~2 means roughly quadratic (typical of a
   *  correlated subquery re-scanning a table per outer row). */
  scalingExponent: number;
  /** True if the model predicts the time budget will kick in and skip
   *  some of the larger volumes — i.e. the real run will likely finish
   *  faster than a naive "just keep scaling up" estimate would suggest. */
  willSkipSomeVolumes: boolean;
}

/**
 * Predicts how long `benchmarkAcrossVolumes` will actually take, *before*
 * running it, so the person can decide whether to wait.
 *
 * This isn't a guess based on eyeballing the SQL — it actually runs the
 * query twice at two small row counts (fast: a few hundred rows each),
 * measures the real time, and fits a power law (time ∝ rows^k) through
 * those two points. That exponent is what tells a correlated-subquery
 * query (k≈2, gets slow fast) apart from an indexed JOIN (k≈1, scales
 * gently) without needing to special-case either pattern by name.
 *
 * The prediction then walks the same volumes, run-counts, and time-budget
 * cutoff as the real benchmark, so "some larger volumes will be skipped"
 * shows up in the estimate too instead of wildly overstating the total.
 */
export async function estimateBenchmarkTime(
  buildData: (rows: number) => Data,
  sql: string,
  volumes: number[],
  options?: { maxMsPerRun?: number }
): Promise<BenchmarkEstimate> {
  const SQL = await getSqlJs();
  const maxMsPerRun = options?.maxMsPerRun ?? 4000;

  // Three probes instead of two: the third (larger) point both improves the
  // exponent fit and — more importantly — lets us measure *build* time
  // (buildData + insert) at two different sizes, so it can be extrapolated
  // per-volume instead of assumed flat. Capped at the smallest real volume
  // so the probe phase itself stays cheap.
  const probeSizes = [200, 900, Math.min(3000, volumes[0] ?? 3000)];
  const buildTimes: number[] = [];
  const execTimes: number[] = [];

  for (const size of probeSizes) {
    await yieldToBrowser();
    const tBuild0 = performance.now();
    const data = buildData(size);
    const db = buildDatabase(SQL, data);
    buildTimes.push(performance.now() - tBuild0);

    const t0 = performance.now();
    try { db.exec(sql); } catch { /* a probe failure just falls back to the default exponent below */ }
    execTimes.push(Math.max(performance.now() - t0, 0.5)); // avoid log(0)
    db.close();
  }

  const [, , r3] = probeSizes;
  const r2 = probeSizes[1];
  const [, t2, t3] = execTimes; // fit exponent off the two larger, less-noisy probes
  const rawExponent = Math.log(t3 / t2) / Math.log(r3 / r2);
  // Clamp to a sane range — tiny probe times are noisy and can otherwise
  // produce wild extrapolations (negative or >4 exponents) from timer jitter.
  const exponent = Number.isFinite(rawExponent) ? Math.min(Math.max(rawExponent, 0.5), 3) : 1.2;

  // Build/insert cost is roughly linear in row count regardless of query
  // shape (it's dominated by stmt.run() calls, not query planning), so a
  // slope fit — same approach as estimateSingleRunTime's buildSlope — is
  // far more accurate than a flat per-volume constant once volumes reach
  // 10K-100K rows, where insert cost stops being negligible.
  const buildSlope = (buildTimes[2] - buildTimes[1]) / (r3 - r2);
  const buildIntercept = buildTimes[2] - buildSlope * r3;
  const predictBuild = (rows: number) => Math.max(buildIntercept + buildSlope * rows, buildTimes[2]);

  let totalMs = buildTimes[0] + buildTimes[1] + buildTimes[2] + t2 + t3; // probes are part of the real cost too
  let willSkipSomeVolumes = false;
  let tooSlow = false;

  for (const rows of volumes) {
    if (tooSlow) { willSkipSomeVolumes = true; continue; }

    const runs = runsForVolume(rows);
    const predictedBuild = predictBuild(rows);
    const predictedSeq = t3 * Math.pow(rows / r3, exponent);

    // One build for the seq pass, one exec per run.
    totalMs += predictedBuild + predictedSeq * runs;

    if (predictedSeq > maxMsPerRun) { tooSlow = true; continue; }

    // No separate signal for how much the (not-yet-known) suggested
    // indexes would help, so the indexed pass is assumed comparable to
    // the sequential one — good enough for a wait-time estimate, even if
    // the real indexed pass usually comes in faster for JOIN-style queries.
    // Build cost is charged again since benchmarkAcrossVolumes builds a
    // second, separate database for the indexed pass.
    const predictedIdx = predictedSeq;
    totalMs += predictedBuild + predictedIdx * runs;
    if (predictedIdx > maxMsPerRun) tooSlow = true;
  }

  return { estimatedSeconds: totalMs / 1000, scalingExponent: exponent, willSkipSomeVolumes };
}

export interface SingleRunEstimate {
  /** Predicted total wall-clock time for one Apply & Verify pass, in seconds. */
  estimatedSeconds: number;
  /** Empirical growth rate — see `BenchmarkEstimate.scalingExponent`. */
  scalingExponent: number;
}

/**
 * Predicts how long `verifyIndexImpact` will take at a single target row
 * count — the Apply & Verify button's equivalent of `estimateBenchmarkTime`
 * above, just for one volume instead of a full sweep. Separately
 * extrapolates database build (insert) time, which is roughly linear in
 * row count regardless of query shape, from query execution time, which
 * is what actually blows up for a correlated-subquery query.
 */
export async function estimateSingleRunTime(
  buildData: (rows: number) => Data,
  sql: string,
  targetRows: number
): Promise<SingleRunEstimate> {
  const SQL = await getSqlJs();
  const probeSizes = [200, 900];
  const buildTimes: number[] = [];
  const execTimes: number[] = [];

  for (const size of probeSizes) {
    await yieldToBrowser();
    const data = buildData(size);

    const tBuild0 = performance.now();
    const db = buildDatabase(SQL, data);
    buildTimes.push(performance.now() - tBuild0);

    const tExec0 = performance.now();
    try { db.exec(sql); } catch { /* a probe failure just falls back to the default exponent below */ }
    execTimes.push(Math.max(performance.now() - tExec0, 0.5));

    db.close();
  }

  const [r1, r2] = probeSizes;
  const [b1, b2] = buildTimes;
  const [e1, e2] = execTimes;

  const rawExponent = Math.log(e2 / e1) / Math.log(r2 / r1);
  const exponent = Number.isFinite(rawExponent) ? Math.min(Math.max(rawExponent, 0.5), 3) : 1.2;

  const buildSlope = (b2 - b1) / (r2 - r1);
  const predictedBuild = Math.max(b2 + buildSlope * (targetRows - r2), b2);
  const predictedExec = e2 * Math.pow(targetRows / r2, exponent);

  // verifyIndexImpact builds the database and runs the query twice — once
  // "before" (no suggested indexes), once "after" — plus two cheap EXPLAIN
  // QUERY PLAN calls, small enough relative to a real run to ignore.
  const totalMs = 2 * (predictedBuild + predictedExec) + 100;

  return { estimatedSeconds: totalMs / 1000, scalingExponent: exponent };
}