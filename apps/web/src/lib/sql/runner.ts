"use client";

export type CellValue = string | number | null;
export type Row = Record<string, CellValue>;
export type Data = Record<string, Row[]>;

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

export interface ResultSetComparison {
  matches: boolean;
  originalRowCount: number;
  optimizedRowCount: number;
  originalColumns: string[];
  optimizedColumns: string[];
  reason: string | null;
  mismatchExamples: string[];
}

export interface BenchmarkEstimate {
  estimatedSeconds: number;
  scalingExponent: number;
  willSkipSomeVolumes: boolean;
}

export interface SingleRunEstimate {
  estimatedSeconds: number;
  scalingExponent: number;
}

// ── Web Worker Proxy ──
let generalWorker: Worker | null = null;
let benchmarkWorker: Worker | null = null;
let msgId = 0;
const callbacks = new Map<number, { resolve: Function; reject: Function }>();

function createWorker() {
  const w = new Worker(new URL('./worker.ts', import.meta.url));
  w.onmessage = (e) => {
    const { id, error, result } = e.data;
    const cb = callbacks.get(id);
    if (cb) {
      callbacks.delete(id);
      if (error) cb.reject(new Error(error));
      else cb.resolve(result);
    }
  };
  return w;
}

function getGeneralWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (!generalWorker) {
    generalWorker = createWorker();
  }
  return generalWorker;
}

function getBenchmarkWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (!benchmarkWorker) {
    benchmarkWorker = createWorker();
  }
  return benchmarkWorker;
}

function sendToWorker(type: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    // Route heavy tasks to the benchmark worker to avoid blocking UI queries
    const isHeavy = ["benchmarkAcrossVolumes", "estimateBenchmarkTime", "compareQueries"].includes(type);
    const w = isHeavy ? getBenchmarkWorker() : getGeneralWorker();
    
    if (!w) return reject(new Error("No worker available"));
    
    const id = ++msgId;
    callbacks.set(id, { resolve, reject });
    w.postMessage({ id, type, payload });
  });
}

// ── Proxied Functions ──

export async function runQuery(sql: string, data: Data): Promise<{ columns: string[]; values: CellValue[][] } | null> {
  return sendToWorker("runQuery", { sql, data });
}

export async function explainQueryPlan(sql: string, data: Data): Promise<ExplainResult> {
  return sendToWorker("explainQueryPlan", { sql, data });
}

export async function explainQueryPlanWithIndexes(sql: string, data: Data, indexDdl: string[]): Promise<ExplainResult> {
  return sendToWorker("explainQueryPlanWithIndexes", { sql, data, indexDdl });
}

export async function verifyIndexImpact(
  sql: string,
  data: Data,
  indexDdl: string[]
): Promise<{ before: ExplainResult; after: ExplainResult; beforeMs: number; afterMs: number }> {
  return sendToWorker("verifyIndexImpact", { sql, data, indexDdl });
}

export async function compareQueries(
  originalSql: string,
  optimizedSql: string,
  data: Data,
  indexDdl: string[]
): Promise<{ before: ExplainResult; after: ExplainResult; beforeMs: number; afterMs: number }> {
  return sendToWorker("compareQueries", { originalSql, optimizedSql, data, indexDdl });
}

export async function compareResultSets(
  originalSql: string,
  optimizedSql: string,
  data: Data,
  indexDdl: string[]
): Promise<ResultSetComparison> {
  return sendToWorker("compareResultSets", { originalSql, optimizedSql, data, indexDdl });
}



export interface BenchmarkPoint {
  rows: number;
  originalMs: number;
  optimizedMs: number;
  originalSkipped?: boolean;
  optimizedSkipped?: boolean;
}

export interface DualBenchmarkResult {
  points: BenchmarkPoint[];
  originalError: string | null;
  optimizedError: string | null;
}

export async function benchmarkAcrossVolumes(
  buildData: (rows: number) => Data,
  originalSql: string,
  optimizedSql: string,
  indexDdl: string[],
  volumes: number[],
  options?: { maxMsPerRun?: number; shouldCancel?: () => boolean }
): Promise<DualBenchmarkResult> {
  const data = buildData(100);
  const safeOptions = { maxMsPerRun: options?.maxMsPerRun };
  return sendToWorker("benchmarkAcrossVolumes", { 
    originalSql, 
    optimizedSql, 
    data, 
    indexDdl, 
    volumes, 
    options: safeOptions 
  });
}

export async function estimateBenchmarkTime(
  buildData: (rows: number) => Data,
  sql: string,
  volumes: number[],
  options?: { maxMsPerRun?: number }
): Promise<BenchmarkEstimate> {
  const data = buildData(100); 
  return sendToWorker("estimateBenchmarkTime", { sql, data, volumes, options });
}

export async function estimateSingleRunTime(
  buildData: (rows: number) => Data,
  sql: string,
  targetRows: number
): Promise<SingleRunEstimate> {
  const data = buildData(100);
  return sendToWorker("estimateSingleRunTime", { sql, data, targetRows });
}

export async function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}