"use client";

import { useStore } from "@/store/useStore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { PerfDataPoint } from "@/types";
import { benchmarkAcrossVolumes, explainQueryPlan } from "@/lib/sql/runner";
import { generateSyntheticData } from "@/lib/data/datasets";
import { parsePipeline, deriveIndexSuggestions } from "@/lib/sql/engine";

function formatRows(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

const VOLUME_POINTS = [1_000, 5_000, 25_000, 100_000, 500_000, 1_000_000];

export function PerformanceTab() {
  const { dataVolume, setDataVolume, tableData, visualizerSQL, aiResult } = useStore();

  const [chartData, setChartData] = useState<PerfDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [planBefore, setPlanBefore] = useState<string>("");
  const [planAfter, setPlanAfter] = useState<string>("");
  const [runError, setRunError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const indexDdl = useMemo(() => {
    if (aiResult?.index_statements?.length) return aiResult.index_statements;
    const steps = parsePipeline(visualizerSQL);
    return deriveIndexSuggestions(steps);
  }, [aiResult, visualizerSQL]);

  const volumes = useMemo(
    () => VOLUME_POINTS.filter((v) => v <= Math.max(dataVolume, VOLUME_POINTS[0])),
    [dataVolume]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setRunError(null);
      try {
        const points = await benchmarkAcrossVolumes(
          (rows) => generateSyntheticData(tableData, rows),
          visualizerSQL,
          indexDdl,
          volumes.length ? volumes : [dataVolume]
        );
        setChartData(points);

        const scaled = generateSyntheticData(tableData, dataVolume);
        const before = await explainQueryPlan(visualizerSQL, scaled);
        setPlanBefore(before.summary);
        // "after" plan reuses the same explain call but we can't easily apply
        // indexDdl through explainQueryPlan's throwaway db, so approximate by
        // reporting whether the suggested indexes exist for this query's keys.
        setPlanAfter(indexDdl.length ? indexDdl.join(" | ") : "(no index suggestions yet — run AI Optimizer)");
      } catch (e) {
        setRunError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVolume, tableData, visualizerSQL, indexDdl]);

  const last = chartData[chartData.length - 1];
  const speedup = last && last.idxMs > 0 ? (last.seqMs / last.idxMs).toFixed(1) : "—";

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
      {/* Chart card */}
      <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--muted)" }}>Data Volume:</span>
          <input
            type="range"
            min={1_000}
            max={1_000_000}
            step={1_000}
            value={dataVolume}
            onChange={(e) => setDataVolume(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)] cursor-pointer"
          />
          <span className="font-mono text-[12px] min-w-[90px] text-right" style={{ color: "var(--accent)" }}>
            {dataVolume.toLocaleString()} rows
          </span>
          {loading && <span className="text-[10px] animate-pulse" style={{ color: "var(--accent)" }}>benchmarking…</span>}
        </div>

        <div className="px-4 pt-2 text-[10.5px]" style={{ color: "var(--muted)" }}>
          Real measurements: sql.js (SQLite/WASM) executes <span className="font-mono">{visualizerSQL.trim().split("\n")[0].slice(0, 60)}…</span> against synthetic
          data at each volume — this is not a simulated curve.
        </div>

        {runError && (
          <div className="px-4 py-2 text-[11px]" style={{ color: "var(--danger)" }}>
            ⚠ {runError} — the query may not be valid SQLite syntax for the current schema.
          </div>
        )}

        <div className="p-4" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="rows"
                tickFormatter={formatRows}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                stroke="var(--border)"
              />
              <YAxis
                tickFormatter={(v: number) => `${v.toFixed(1)}ms`}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                stroke="var(--border)"
                label={{ value: "Exec Time (ms)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 10, dy: 50 }}
              />
              <Tooltip
                contentStyle={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6 }}
                labelStyle={{ color: "var(--muted2)", fontSize: 11 }}
                itemStyle={{ fontSize: 11 }}
                labelFormatter={(v: number) => `${formatRows(v)} rows`}
                formatter={(v: number) => [`${v.toFixed(2)} ms`]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted2)" }} />
              <Line type="monotone" dataKey="seqMs" name="Without suggested indexes" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="idxMs" name="With suggested indexes" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="No-Index Time" value={last ? `${last.seqMs.toFixed(1)} ms` : "—"} color="var(--danger)" sub="measured, current volume" />
        <MetricCard label="Indexed Time" value={last ? `${last.idxMs.toFixed(1)} ms` : "—"} color="var(--success)" sub="measured, current volume" />
        <MetricCard label="Speedup Factor" value={`${speedup}×`} color="var(--accent)" sub="measured, not simulated" />
      </div>

      {/* Real EXPLAIN QUERY PLAN */}
      <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
        <div className="px-4 py-2.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Real SQLite EXPLAIN QUERY PLAN
          </span>
        </div>
        <div className="grid grid-cols-2 gap-5 p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--danger)" }}>Current plan (no suggested indexes)</div>
            <pre className="text-[10.5px] font-mono rounded px-3 py-2 whitespace-pre-wrap" style={{ background: "var(--bg)", border: "1px solid rgba(239,68,68,0.25)", color: "var(--muted2)" }}>
              {planBefore || "—"}
            </pre>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--success)" }}>Suggested indexes to apply</div>
            <pre className="text-[10.5px] font-mono rounded px-3 py-2 whitespace-pre-wrap" style={{ background: "var(--bg)", border: "1px solid rgba(16,185,129,0.25)", color: "var(--muted2)" }}>
              {planAfter || "—"}
            </pre>
            <p className="text-[10px] mt-2" style={{ color: "var(--muted)" }}>
              For a full verified before/after plan diff, use <strong>Apply &amp; Verify</strong> in the AI Optimizer tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>{sub}</div>
    </div>
  );
}
