"use client";

import { useTab } from "@/components/ui/Header";
import { VisualizerTab } from "@/components/visualizer/VisualizerTab";
import { OptimizerTab } from "@/components/optimizer/OptimizerTab";
import { PerformanceTab } from "@/components/performance/PerformanceTab";

export function Workbench() {
  const { tab } = useTab();
  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      {tab === "visualize" && <VisualizerTab />}
      {tab === "ai"        && <OptimizerTab />}
      {tab === "perf"      && <PerformanceTab />}
    </section>
  );
}
