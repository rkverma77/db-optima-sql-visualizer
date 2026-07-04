"use client";

import { useTab } from "@/components/ui/Header";
import { VisualizerTab } from "@/components/visualizer/VisualizerTab";
import { OptimizerTab } from "@/components/optimizer/OptimizerTab";
import { PerformanceTab } from "@/components/performance/PerformanceTab";

export function Workbench() {
  const { tab } = useTab();
  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      {/* All three tabs stay mounted; only visibility toggles. Each tab
          (especially Performance) keeps meaningful local state — computed
          benchmarks, history, plan comparisons — that would otherwise be
          wiped every time the user switched away and back. */}
      <div className={tab === "visualize" ? "flex-1 flex flex-col overflow-hidden" : "hidden"}>
        <VisualizerTab />
      </div>
      <div className={tab === "ai" ? "flex-1 flex flex-col overflow-hidden" : "hidden"}>
        <OptimizerTab />
      </div>
      <div className={tab === "perf" ? "flex-1 flex flex-col overflow-hidden" : "hidden"}>
        <PerformanceTab />
      </div>
    </section>
  );
}