"use client";

import { useTab } from "@/components/ui/Header";
import { VisualizerTab } from "@/components/visualizer/VisualizerTab";
import { OptimizerTab } from "@/components/optimizer/OptimizerTab";
import { PerformanceTab } from "@/components/performance/PerformanceTab";

export function Workbench() {
  const { tab } = useTab();
  return (
    <section
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* All three tabs stay mounted; only visibility toggles. Each tab
          (especially Performance) keeps meaningful local state — computed
          benchmarks, history, plan comparisons — that would otherwise be
          wiped every time the user switched away and back. */}
      <div className={tab === "visualize" ? "flex-1 flex flex-col overflow-hidden p-5" : "hidden"}>
        <VisualizerTab />
      </div>
      <div className={tab === "ai" ? "flex-1 flex flex-col overflow-hidden p-5" : "hidden"}>
        <OptimizerTab />
      </div>
      <div className={tab === "perf" ? "flex-1 flex flex-col overflow-hidden p-5" : "hidden"}>
        <PerformanceTab />
      </div>
    </section>
  );
}