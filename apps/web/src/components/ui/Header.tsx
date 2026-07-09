"use client";

import { create } from "zustand";
import { useStore } from "@/store/useStore";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { motion } from "framer-motion";

const TABS = [
  { id: "visualize", label: "⬡ Visualize" },
  { id: "ai",        label: "✦ AI Optimizer" },
  { id: "perf",      label: "◈ Performance" },
] as const;

type TabId = typeof TABS[number]["id"];

export const useTab = create<{ tab: TabId; setTab: (t: TabId) => void }>((set) => ({
  tab: "visualize",
  setTab: (tab) => set({ tab }),
}));

export function Header() {
  const { tab, setTab } = useTab();
  const {
    isRunning,
    error,
    animSpeed,
    setAnimSpeed,
  } = useStore();

  const statusState = isRunning ? "running" : error ? "error" : "idle";
  const statusLabel = isRunning ? "Running…" : error ? "Error" : "Idle";
  const dotColor =
    statusState === "running"
      ? "var(--accent)"
      : statusState === "error"
      ? "var(--error)"
      : "var(--success)";

  return (
    <header
      className="h-16 flex items-center justify-between px-5 gap-3 flex-shrink-0 z-40 relative"
      style={{
        background: "var(--surface)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
        boxShadow:
          "0 1px 0 0 rgba(129,140,248,0.08), 0 4px 24px -4px rgba(0,0,0,0.3)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 font-bold text-sm tracking-tight select-none">
        <motion.div
          className="w-9 h-9 rounded-md flex items-center justify-center text-base cursor-pointer"
          style={{
            background:
              "linear-gradient(155deg, var(--accent), var(--accent-violet))",
            boxShadow:
              "0 4px 12px -3px color-mix(in srgb, var(--accent) 55%, transparent)",
          }}
          whileHover={{
            scale: 1.12,
            boxShadow:
              "0 0 24px -2px rgba(129,140,248,0.5), 0 4px 12px -3px rgba(129,140,248,0.4)",
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
        >
          ⚡
        </motion.div>
        <span className="text-[15px]">
          DB<span className="text-[var(--accent)]">Optima</span>
        </span>
        <span
          className="ml-1 hidden sm:inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border"
          style={{
            color: "var(--success)",
            borderColor:
              "color-mix(in srgb, var(--success) 40%, transparent)",
            background:
              "color-mix(in srgb, var(--success) 10%, transparent)",
          }}
          title="Every number this app shows — timings, scan types, speedups — comes from a real SQLite engine running in your browser, not a simulation or a guess."
        >
          <span className="w-1.5 h-1.5 rounded-sm bg-[var(--success)]" />
          measured, not simulated
        </span>
      </div>

      {/* Tabs — segmented pill control so the active section is unmistakable */}
      <nav
        className="flex gap-1 p-1 rounded-md flex-shrink-0 relative"
        style={{
          background: "var(--surface3)",
          border: "1px solid var(--border)",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative px-4 py-2 text-xs font-semibold rounded-lg transition-colors duration-150 z-[1]"
              style={{
                color: active ? "var(--accent)" : "var(--muted)",
                background: "transparent",
                border: "1px solid transparent",
              }}
            >
              {/* Sliding indicator follows the active tab */}
              {active && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border2)",
                    boxShadow:
                      "var(--shadow-glow), 0 2px 8px -2px rgba(0,0,0,0.3)",
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 30,
                  }}
                />
              )}
              <span className="relative z-[2]">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Controls */}
      <div className="flex items-center gap-2.5">
        <ThemeToggle />

        <div
          className="flex items-center gap-2 text-xs text-[var(--muted)] px-3 py-1.5 rounded-lg"
          style={{
            background: "var(--surface3)",
            border: "1px solid var(--border)",
          }}
        >
          <span className="font-medium">Speed</span>
          <input
            type="range"
            min={1}
            max={10}
            value={Math.round(11 - animSpeed / 80)}
            onChange={(e) =>
              setAnimSpeed((11 - Number(e.target.value)) * 80)
            }
            className="w-20 cursor-pointer accent-[var(--accent)]"
            title="Animation speed"
          />
        </div>

        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{
            background: "var(--surface3)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Pulsing status indicator */}
          <motion.div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
            animate={
              statusState === "running"
                ? {
                    scale: [1, 1.5, 1],
                    boxShadow: [
                      `0 0 0px ${dotColor}`,
                      `0 0 8px ${dotColor}`,
                      `0 0 0px ${dotColor}`,
                    ],
                  }
                : { scale: 1, boxShadow: `0 0 4px ${dotColor}` }
            }
            transition={
              statusState === "running"
                ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.3 }
            }
          />
          <span className="text-xs font-medium text-[var(--muted)]">
            {statusLabel}
          </span>
        </div>
      </div>
    </header>
  );
}