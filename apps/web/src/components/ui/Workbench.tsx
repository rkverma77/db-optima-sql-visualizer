"use client";

import { useTab } from "@/components/ui/Header";
import { VisualizerTab } from "@/components/visualizer/VisualizerTab";
import { OptimizerTab } from "@/components/optimizer/OptimizerTab";
import { PerformanceTab } from "@/components/performance/PerformanceTab";
import { motion, Variants } from "framer-motion";

/* Smooth fade-up for the active tab pane */
const paneVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

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
      <motion.div
        className={
          tab === "visualize"
            ? "flex-1 flex flex-col overflow-hidden p-5"
            : "hidden"
        }
        key="visualize-pane"
        variants={paneVariants}
        initial="hidden"
        animate={tab === "visualize" ? "visible" : "hidden"}
      >
        <VisualizerTab />
      </motion.div>
      <motion.div
        className={
          tab === "ai"
            ? "flex-1 flex flex-col overflow-hidden p-5"
            : "hidden"
        }
        key="ai-pane"
        variants={paneVariants}
        initial="hidden"
        animate={tab === "ai" ? "visible" : "hidden"}
      >
        <OptimizerTab />
      </motion.div>
      <motion.div
        className={
          tab === "perf"
            ? "flex-1 flex flex-col overflow-hidden p-5"
            : "hidden"
        }
        key="perf-pane"
        variants={paneVariants}
        initial="hidden"
        animate={tab === "perf" ? "visible" : "hidden"}
      >
        <PerformanceTab />
      </motion.div>
    </section>
  );
}