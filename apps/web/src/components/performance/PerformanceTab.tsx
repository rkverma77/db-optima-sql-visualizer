"use client";

import { useStore } from "@/store/useStore";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import type { PerfDataPoint } from "@/types";
import { benchmarkAcrossVolumes, explainQueryPlan, verifyIndexImpact, yieldToBrowser } from "@/lib/sql/runner";
import { generateSyntheticData } from "@/lib/data/datasets";
import { parsePipeline, deriveIndexSuggestions, highlightSQL } from "@/lib/sql/engine";

function formatRows(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

const ALL_VOLUMES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000];
const MAX_VOLUME = 100_000;

// ── Complexity Analyzer ───────────────────────────────────────
function analyzeComplexity(sql: string): {
  score: number;
  label: string;
  factors: string[];
  color: string;
} {
  const factors: string[] = [];
  let score = 0;
  const upper = sql.toUpperCase();

  if (upper.includes("JOIN")) { score += 2; factors.push("JOIN operations"); }
  if ((upper.match(/JOIN/g) || []).length > 1) { score += 3; factors.push("Multiple JOINs"); }
  if (upper.includes("WHERE")) { score += 1; factors.push("WHERE clause"); }
  if (upper.includes("GROUP BY")) { score += 2; factors.push("GROUP BY"); }
  if (upper.includes("ORDER BY")) { score += 1; factors.push("ORDER BY"); }
  if (upper.includes("SUBQUERY") || upper.includes("SELECT") && upper.lastIndexOf("SELECT") > 0) { score += 3; factors.push("Subquery"); }
  if (upper.includes("UNION")) { score += 2; factors.push("UNION"); }
  if (upper.includes("LIKE")) { score += 1; factors.push("LIKE pattern"); }
  if (upper.includes("EXISTS")) { score += 2; factors.push("EXISTS clause"); }
  if (upper.includes("HAVING")) { score += 2; factors.push("HAVING filter"); }

  let label = "Simple";
  let color = "var(--success)";
  if (score > 3) { label = "Moderate"; color = "var(--warning)"; }
  if (score > 7) { label = "Complex"; color = "var(--error)"; }
  if (score > 10) { label = "Very Complex"; color = "#dc2626"; }

  return { score, label, factors, color };
}

// ── Memory Estimator ────────────────────────────────────────
function estimateMemory(rows: number, tableData: Record<string, any[]>): string {
  const avgRowSize = Object.values(tableData).reduce((sum, rows) => {
    if (!rows.length) return sum;
    const sample = rows[0];
    const size = JSON.stringify(sample).length;
    return sum + size;
  }, 0) / Math.max(1, Object.values(tableData).filter(r => r.length > 0).length);
  
  const totalBytes = rows * avgRowSize * Object.keys(tableData).length;
  if (totalBytes > 1_000_000_000) return (totalBytes / 1_000_000_000).toFixed(2) + " GB";
  if (totalBytes > 1_000_000) return (totalBytes / 1_000_000).toFixed(2) + " MB";
  if (totalBytes > 1_000) return (totalBytes / 1_000).toFixed(2) + " KB";
  return totalBytes.toFixed(0) + " B";
}

// ── Export to CSV ───────────────────────────────────────────
function exportToCSV(benchmarks: PerfDataPoint[], query: string) {
  const headers = ["Rows", "No Index (ms)", "With Index (ms)", "Speedup"];
  const rows = benchmarks.map(b => [
    b.rows,
    b.seqMs.toFixed(3),
    b.idxMs.toFixed(3),
    b.idxMs > 0 ? (b.seqMs / b.idxMs).toFixed(3) : "N/A"
  ]);
  
  const csv = [
    `# Query: ${query.replace(/\n/g, " ")}`,
    `# Generated: ${new Date().toISOString()}`,
    headers.join(","),
    ...rows.map(r => r.join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `benchmark-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToJSON(benchmarks: PerfDataPoint[], query: string, tableData: Record<string, any[]>) {
  const data = {
    query,
    generatedAt: new Date().toISOString(),
    tableStats: Object.fromEntries(
      Object.entries(tableData).map(([k, v]) => [k, { rows: v.length, columns: v[0] ? Object.keys(v[0]) : [] }])
    ),
    benchmarks,
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `benchmark-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PerformanceTab() {
  const { dataVolume, setDataVolume, tableData, visualizerSQL, aiResult } = useStore();

  const [allBenchmarks, setAllBenchmarks] = useState<PerfDataPoint[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [hasComputed, setHasComputed] = useState(false);
  const [computeTime, setComputeTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const [planBefore, setPlanBefore] = useState<string>("");
  const [planAfter, setPlanAfter] = useState<string>("");
  const [planBeforeRaw, setPlanBeforeRaw] = useState<any[]>([]);
  const [planAfterRaw, setPlanAfterRaw] = useState<any[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  
  const [history, setHistory] = useState<{ id: number; time: string; query: string; speedup: string }[]>([]);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const indexDdl = useMemo(() => {
    if (aiResult?.index_statements?.length) return aiResult.index_statements;
    const steps = parsePipeline(visualizerSQL);
    return deriveIndexSuggestions(steps);
  }, [aiResult, visualizerSQL]);

  const complexity = useMemo(() => analyzeComplexity(visualizerSQL), [visualizerSQL]);

  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const total = (Date.now() - startTimeRef.current) / 1000;
    setComputeTime(total);
    return total;
  };

  const computeBenchmarks = useCallback(async () => {
    if (isComputing) return;
    setIsComputing(true);
    setRunError(null);
    setHasComputed(false);
    setComputeTime(null);
    startTimer();

    try {
      const points = await benchmarkAcrossVolumes(
        (rows) => generateSyntheticData(tableData, rows),
        visualizerSQL,
        indexDdl,
        ALL_VOLUMES
      );
      
      const totalTime = stopTimer();
      setAllBenchmarks(points);
      setHasComputed(true);

      // Save to history
      const lastPoint = points[points.length - 1];
      const speedup = lastPoint && lastPoint.idxMs > 0 ? (lastPoint.seqMs / lastPoint.idxMs).toFixed(1) : "—";
      setHistory(prev => [...prev.slice(-4), {
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        query: visualizerSQL.slice(0, 50) + "...",
        speedup
      }]);

      // Get EXPLAIN and verify
      await yieldToBrowser();
      const scaled = generateSyntheticData(tableData, dataVolume);
      const before = await explainQueryPlan(visualizerSQL, scaled);
      setPlanBefore(before.summary);
      setPlanBeforeRaw(before.raw);

      // Run verifyIndexImpact for detailed comparison
      if (indexDdl.length > 0) {
        await yieldToBrowser();
        const verify = await verifyIndexImpact(visualizerSQL, scaled, indexDdl);
        setVerifyResult(verify);
        setPlanAfterRaw(verify.after.raw);
        setPlanAfter(verify.after.summary);
      } else {
        setPlanAfter("(no index suggestions yet — run AI Optimizer)");
      }
    } catch (e) {
      stopTimer();
      setRunError((e as Error).message);
    } finally {
      setIsComputing(false);
    }
  }, [tableData, visualizerSQL, indexDdl, dataVolume, isComputing]);

  useEffect(() => {
    setHasComputed(false);
    setAllBenchmarks([]);
    setComputeTime(null);
  }, [visualizerSQL, tableData, indexDdl]);

  const chartData = useMemo(() => {
    return allBenchmarks.filter((p) => p.rows <= dataVolume);
  }, [allBenchmarks, dataVolume]);

  const yAxisMax = useMemo(() => {
    if (chartData.length === 0) return 100;
    const maxVal = Math.max(...chartData.map((d) => Math.max(d.seqMs, d.idxMs)));
    return Math.ceil(maxVal * 1.2 / 10) * 10 || 100;
  }, [chartData]);

  const last = chartData[chartData.length - 1];
  const speedup = last && last.idxMs > 0 ? (last.seqMs / last.idxMs).toFixed(1) : "—";

  // Radar chart data for complexity
  const radarData = useMemo(() => [
    { subject: "JOINs", A: Math.min((visualizerSQL.match(/JOIN/gi) || []).length * 20, 100), fullMark: 100 },
    { subject: "Conditions", A: visualizerSQL.includes("WHERE") ? 60 : 0, fullMark: 100 },
    { subject: "Aggregation", A: visualizerSQL.includes("GROUP BY") ? 80 : 0, fullMark: 100 },
    { subject: "Sorting", A: visualizerSQL.includes("ORDER BY") ? 50 : 0, fullMark: 100 },
    { subject: "Subqueries", A: (visualizerSQL.match(/SELECT/gi) || []).length > 1 ? 90 : 0, fullMark: 100 },
    { subject: "Length", A: Math.min(visualizerSQL.length / 3, 100), fullMark: 100 },
  ], [visualizerSQL]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 min-h-0 pb-20">
      {/* ── Compute Button / Status ── */}
      {!hasComputed && (
        <div className="card p-6 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
          <div className="w-16 h-16 rounded-full bg-[var(--surface3)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-1">Performance Benchmark</h3>
            <p className="text-sm text-[var(--muted)] max-w-md">
              Run SQLite benchmarks across {ALL_VOLUMES.length} volume points (1K → 100K rows) to generate performance curves.
            </p>
          </div>

          <button onClick={computeBenchmarks} disabled={isComputing} className="btn-primary px-6 py-2.5 text-sm">
            {isComputing ? (
              <>
                <svg className="animate-spin-slow w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Computing… {formatTime(elapsedTime)}
              </>
            ) : (
              <>▶ Compute Benchmarks</>
            )}
          </button>

          {isComputing && (
            <div className="w-64 h-1.5 bg-[var(--surface3)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--accent)] animate-pulse rounded-full" style={{ width: "60%" }} />
            </div>
          )}

          {runError && (
            <div className="text-sm text-[var(--error)] bg-[var(--error)]/10 px-4 py-2 rounded-lg">
              ⚠ {runError}
            </div>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {hasComputed && (
        <div className="flex flex-col gap-5">
          {/* Success banner */}
          <div className="card p-3 flex items-center justify-between bg-[var(--success)]/5 border-[var(--success)]/20 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--success)]">✓</span>
              <span>Benchmarks computed in <strong>{computeTime?.toFixed(1)}s</strong></span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportToCSV(allBenchmarks, visualizerSQL)} className="btn-secondary text-xs px-3 py-1.5">
                📥 CSV
              </button>
              <button onClick={() => exportToJSON(allBenchmarks, visualizerSQL, tableData)} className="btn-secondary text-xs px-3 py-1.5">
                📥 JSON
              </button>
              <button onClick={computeBenchmarks} disabled={isComputing} className="btn-secondary text-xs px-3 py-1.5">
                ↻ Re-compute
              </button>
            </div>
          </div>

          {/* Query Details */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Query Being Benchmarked</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: complexity.color + "20", color: complexity.color, border: `1px solid ${complexity.color}40` }}>
                {complexity.label} • Score: {complexity.score}/15
              </span>
            </div>
            <div className="p-4">
              <pre className="code-block text-xs" dangerouslySetInnerHTML={{ __html: highlightSQL(visualizerSQL) }} />
              {complexity.factors.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {complexity.factors.map((f, i) => (
                    <span key={i} className="badge badge-info text-[10px]">{f}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Complexity Radar + Table Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Query Complexity Profile</span>
              </div>
              <div className="p-4" style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "var(--muted)", fontSize: 9 }} />
                    <Radar name="Complexity" dataKey="A" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Table Statistics</span>
              </div>
              <div className="p-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left p-2 text-[var(--muted)]">Table</th>
                      <th className="text-right p-2 text-[var(--muted)]">Rows</th>
                      <th className="text-right p-2 text-[var(--muted)]">Columns</th>
                      <th className="text-right p-2 text-[var(--muted)]">Est. Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(tableData).map(([name, rows]) => (
                      <tr key={name} className="border-b border-[var(--border)]/30">
                        <td className="p-2 font-medium">{name}</td>
                        <td className="p-2 text-right font-mono">{rows.length.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono">{rows[0] ? Object.keys(rows[0]).length : 0}</td>
                        <td className="p-2 text-right font-mono text-[var(--muted)]">{estimateMemory(rows.length, { [name]: rows })}</td>
                      </tr>
                    ))}
                    <tr className="bg-[var(--surface3)] font-semibold">
                      <td className="p-2">Total (at {formatRows(dataVolume)})</td>
                      <td className="p-2 text-right font-mono">{formatRows(dataVolume * Object.keys(tableData).length)}</td>
                      <td className="p-2 text-right font-mono">—</td>
                      <td className="p-2 text-right font-mono text-[var(--accent)]">{estimateMemory(dataVolume, tableData)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="card overflow-hidden flex-shrink-0">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
              <span className="text-[11px] whitespace-nowrap text-[var(--muted)]">Data Volume:</span>
              <input
                type="range"
                min={1000}
                max={MAX_VOLUME}
                step={1000}
                value={dataVolume}
                onChange={(e) => setDataVolume(Number(e.target.value))}
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <span className="font-mono text-[12px] min-w-[90px] text-right text-[var(--accent)]">
                {dataVolume.toLocaleString()} rows
              </span>
            </div>

            <div className="px-4 pt-2 text-[10.5px] text-[var(--muted)]">
              Pre-computed benchmarks across {ALL_VOLUMES.length} volume points. Move slider to explore performance at any volume.
              <span className="block mt-1 text-[var(--warning)]">⚠ Max 100K rows</span>
            </div>

            <div className="p-4" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="rows" tickFormatter={formatRows} tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--border)" type="number" domain={[0, dataVolume]} allowDataOverflow />
                  <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}ms`} tick={{ fill: "var(--muted)", fontSize: 10 }} stroke="var(--border)" domain={[0, yAxisMax]} allowDataOverflow label={{ value: "Exec Time (ms)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 10, dy: 50 }} />
                  <Tooltip contentStyle={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6 }} labelStyle={{ color: "var(--muted)", fontSize: 11 }} itemStyle={{ fontSize: 11 }} labelFormatter={(v: number) => `${formatRows(v)} rows`} formatter={(v: number) => [`${v.toFixed(2)} ms`]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                  <Line type="monotone" dataKey="seqMs" name="Without suggested indexes" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="idxMs" name="With suggested indexes" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-4 gap-4 flex-shrink-0">
            <MetricCard label="No-Index Time" value={last ? `${last.seqMs.toFixed(1)} ms` : "—"} color="var(--error)" sub={`at ${formatRows(dataVolume)} rows`} />
            <MetricCard label="Indexed Time" value={last ? `${last.idxMs.toFixed(1)} ms` : "—"} color="var(--success)" sub={`at ${formatRows(dataVolume)} rows`} />
            <MetricCard label="Speedup Factor" value={`${speedup}×`} color="var(--accent)" sub="measured, not simulated" />
            <MetricCard label="Est. Memory" value={estimateMemory(dataVolume, tableData)} color="var(--warning)" sub="for synthetic dataset" />
          </div>

          {/* Benchmark Results Table */}
          <div className="card overflow-hidden flex-shrink-0">
            <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Benchmark Results</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                    <th className="text-left p-3 text-[var(--muted)]">Rows</th>
                    <th className="text-right p-3 text-[var(--error)]">No Index (ms)</th>
                    <th className="text-right p-3 text-[var(--success)]">With Index (ms)</th>
                    <th className="text-right p-3 text-[var(--accent)]">Speedup</th>
                    <th className="text-right p-3 text-[var(--muted)]">Rows/Sec</th>
                  </tr>
                </thead>
                <tbody>
                  {allBenchmarks.map((point, i) => (
                    <tr key={i} className={`border-b border-[var(--border)]/30 ${point.rows === dataVolume ? 'bg-[var(--accent)]/5' : ''}`}>
                      <td className="p-3 font-mono">{formatRows(point.rows)}</td>
                      <td className="p-3 text-right font-mono text-[var(--error)]">{point.seqMs.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-[var(--success)]">{point.idxMs.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-[var(--accent)]">{point.idxMs > 0 ? (point.seqMs / point.idxMs).toFixed(2) + "×" : "—"}</td>
                      <td className="p-3 text-right font-mono text-[var(--muted)]">{((point.rows / point.seqMs) * 1000).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Plan Comparison */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Execution Plan Comparison</span>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[var(--error)] flex items-center justify-between">
                  <span>Before (No Indexes)</span>
                  {verifyResult && <span className="font-mono">{verifyResult.beforeMs.toFixed(1)}ms</span>}
                </div>
                <pre className="text-[10px] font-mono rounded-lg px-3 py-2 whitespace-pre-wrap bg-[var(--surface3)] border border-[var(--error)]/20 text-[var(--muted)] max-h-[200px] overflow-y-auto">
                  {planBefore || "—"}
                </pre>
                {planBeforeRaw.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {planBeforeRaw.map((r: any, i: number) => (
                      <div key={i} className="text-[9px] font-mono text-[var(--muted)] pl-2 border-l-2 border-[var(--error)]/30">
                        {r.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[var(--success)] flex items-center justify-between">
                  <span>After (With Indexes)</span>
                  {verifyResult && <span className="font-mono">{verifyResult.afterMs.toFixed(1)}ms</span>}
                </div>
                <pre className="text-[10px] font-mono rounded-lg px-3 py-2 whitespace-pre-wrap bg-[var(--surface3)] border border-[var(--success)]/20 text-[var(--muted)] max-h-[200px] overflow-y-auto">
                  {planAfter || "—"}
                </pre>
                {planAfterRaw.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {planAfterRaw.map((r: any, i: number) => (
                      <div key={i} className="text-[9px] font-mono text-[var(--muted)] pl-2 border-l-2 border-[var(--success)]/30">
                        {r.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {verifyResult && (
              <div className="px-4 pb-4">
                <div className={`p-3 rounded-lg flex items-center gap-3 ${verifyResult.afterMs < verifyResult.beforeMs ? 'bg-[var(--success)]/5 border border-[var(--success)]/20' : 'bg-[var(--warning)]/5 border border-[var(--warning)]/20'}`}>
                  <span className="text-lg">{verifyResult.afterMs < verifyResult.beforeMs ? '🚀' : '⚠️'}</span>
                  <div>
                    <p className="text-sm font-medium">
                      {verifyResult.afterMs < verifyResult.beforeMs
                        ? `Speedup: ${(verifyResult.beforeMs / verifyResult.afterMs).toFixed(2)}× faster with indexes`
                        : "No significant improvement — indexes may not cover this query"}
                    </p>
                    <p className="text-[10px] text-[var(--muted)]">
                      Before: {verifyResult.beforeMs.toFixed(2)}ms → After: {verifyResult.afterMs.toFixed(2)}ms
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Index Analysis */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Index Analysis</span>
            </div>
            <div className="p-4 space-y-3">
              {indexDdl.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No indexes suggested. Run the AI Optimizer to generate index recommendations.</p>
              ) : (
                indexDdl.map((ddl, i) => {
                  const match = ddl.match(/ON\s+(\w+)\s*\(([^)]+)\)/i);
                  const table = match?.[1] || "unknown";
                  const columns = match?.[2] || "";
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--surface3)] border border-[var(--border)]">
                      <span className="text-[var(--accent)] mt-0.5">▸</span>
                      <div className="flex-1">
                        <code className="text-xs font-mono block mb-1">{ddl}</code>
                        <div className="flex gap-2 text-[10px] text-[var(--muted)]">
                          <span className="badge badge-info">Table: {table}</span>
                          <span className="badge badge-success">Columns: {columns}</span>
                          <span className="badge badge-warning">Type: B-Tree</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Optimization Tips */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Optimization Tips</span>
            </div>
            <div className="p-4 space-y-2">
              {complexity.factors.includes("Multiple JOINs") && (
                <TipCard icon="🔗" title="Multiple JOINs Detected" text="Consider denormalizing frequently joined tables or using covering indexes on join columns." type="warning" />
              )}
              {complexity.factors.includes("LIKE pattern") && (
                <TipCard icon="🔍" title="LIKE with Leading Wildcard" text="LIKE '%text' cannot use indexes. Consider full-text search or trigram indexes." type="error" />
              )}
              {!visualizerSQL.includes("WHERE") && (
                <TipCard icon="⚠️" title="No WHERE Clause" text="Missing WHERE clause causes full table scans. Add filters to reduce rows scanned." type="error" />
              )}
              {visualizerSQL.includes("SELECT *") && (
                <TipCard icon="📋" title="SELECT * Detected" text="Selecting all columns increases I/O. Specify only needed columns." type="warning" />
              )}
              {speedup !== "—" && parseFloat(speedup) < 1.2 && (
                <TipCard icon="💡" title="Limited Index Benefit" text="Current indexes show minimal improvement. Consider composite indexes or query restructuring." type="info" />
              )}
              {parseFloat(speedup) > 2 && (
                <TipCard icon="🚀" title="Great Index Performance" text={`${speedup}x speedup achieved! Indexes are well-matched to this query pattern.`} type="success" />
              )}
              <TipCard icon="📊" title="Synthetic Data Note" text="Benchmarks use randomly generated data. Real-world performance may vary based on data distribution." type="info" />
            </div>
          </div>

          {/* Historical Comparison */}
          {history.length > 1 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Benchmark History</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                      <th className="text-left p-3 text-[var(--muted)]">Time</th>
                      <th className="text-left p-3 text-[var(--muted)]">Query</th>
                      <th className="text-right p-3 text-[var(--accent)]">Speedup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice().reverse().map((h) => (
                      <tr key={h.id} className="border-b border-[var(--border)]/30">
                        <td className="p-3 font-mono text-[var(--muted)]">{h.time}</td>
                        <td className="p-3 truncate max-w-[300px]" title={h.query}>{h.query}</td>
                        <td className="p-3 text-right font-mono text-[var(--accent)]">{h.speedup}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EXPLAIN QUERY PLAN */}
          <div className="card overflow-hidden flex-shrink-0 mb-10">
            <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Real SQLite EXPLAIN QUERY PLAN</span>
            </div>
            <div className="grid grid-cols-2 gap-5 p-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[var(--error)]">Current plan (no suggested indexes)</div>
                <pre className="text-[10.5px] font-mono rounded-lg px-3 py-2 whitespace-pre-wrap bg-[var(--surface3)] border border-[var(--border)] text-[var(--muted)]">
                  {planBefore || "—"}
                </pre>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-2 text-[var(--success)]">Suggested indexes to apply</div>
                <pre className="text-[10.5px] font-mono rounded-lg px-3 py-2 whitespace-pre-wrap bg-[var(--surface3)] border border-[var(--border)] text-[var(--muted)]">
                  {planAfter || "—"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wide mb-1.5 text-[var(--muted)]">{label}</div>
      <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-1 text-[var(--muted)]">{sub}</div>
    </div>
  );
}

function TipCard({ icon, title, text, type }: { icon: string; title: string; text: string; type: "error" | "warning" | "info" | "success" }) {
  const colors = {
    error: "border-red-500 bg-red-500/10 text-red-400",
    warning: "border-yellow-500 bg-yellow-500/10 text-yellow-400",
    info: "border-blue-500 bg-blue-500/10 text-blue-400",
    success: "border-green-500 bg-green-500/10 text-green-400",
  };
  
  return (
    <div className={`p-3 rounded-lg border-l-4 ${colors[type]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="text-[11px] leading-relaxed opacity-90">{text}</p>
    </div>
  );
}