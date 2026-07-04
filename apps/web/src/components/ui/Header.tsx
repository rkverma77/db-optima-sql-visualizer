"use client";

import { create } from "zustand";
import { useStore } from "@/store/useStore";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

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
    runDemo,
  } = useStore();

  const statusState = isRunning ? "running" : error ? "error" : "idle";
  const statusLabel = isRunning ? "Running…" : error ? "Error" : "Idle";
  const dotColor =
    statusState === "running"
      ? "bg-[var(--accent)] shadow-[0_0_6px_var(--accent)] animate-pulse"
      : statusState === "error"
      ? "bg-[var(--error)]"
      : "bg-[var(--success)]";

  return (
    <header
      className="h-16 flex items-center justify-between px-5 gap-3 flex-shrink-0 z-40"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "var(--shadow)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 font-bold text-sm tracking-tight select-none">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
          style={{
            background: "linear-gradient(155deg, var(--accent), var(--accent-violet))",
            boxShadow: "0 4px 12px -3px color-mix(in srgb, var(--accent) 55%, transparent)",
          }}
        >
          ⚡
        </div>
        <span className="text-[15px]">
          DB<span className="text-[var(--accent)]">Optima</span>
        </span>
        <span
          className="ml-1 hidden sm:inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border"
          style={{
            color: "var(--success)",
            borderColor: "color-mix(in srgb, var(--success) 40%, transparent)",
            background: "color-mix(in srgb, var(--success) 10%, transparent)",
          }}
          title="Every number this app shows — timings, scan types, speedups — comes from a real SQLite engine running in your browser, not a simulation or a guess."
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
          measured, not simulated
        </span>
      </div>

      {/* Tabs — segmented pill control so the active section is unmistakable */}
      <nav
        className="flex gap-1 p-1 rounded-xl flex-shrink-0"
        style={{ background: "var(--surface3)", border: "1px solid var(--border)" }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-150"
              style={{
                color: active ? "var(--accent)" : "var(--muted)",
                background: active ? "var(--surface)" : "transparent",
                boxShadow: active ? "var(--shadow)" : "none",
                border: active ? "1px solid var(--border2)" : "1px solid transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Controls */}
      <div className="flex items-center gap-2.5">
        <ThemeToggle />

        <button
          onClick={() => {
            setTab("ai");
            runDemo();
          }}
          className="btn-outline-violet"
          title="Load a bad query and watch the AI Optimizer fix it"
        >
          ▶ Run Demo
        </button>

        <div
          className="flex items-center gap-2 text-xs text-[var(--muted)] px-3 py-1.5 rounded-lg"
          style={{ background: "var(--surface3)", border: "1px solid var(--border)" }}
        >
          <span className="font-medium">Speed</span>
          <input
            type="range"
            min={1}
            max={10}
            value={Math.round(11 - animSpeed / 80)}
            onChange={(e) => setAnimSpeed((11 - Number(e.target.value)) * 80)}
            className="w-20 cursor-pointer accent-[var(--accent)]"
            title="Animation speed"
          />
        </div>

        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: "var(--surface3)", border: "1px solid var(--border)" }}
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          <span className="text-xs font-medium text-[var(--muted)]">{statusLabel}</span>
        </div>
      </div>
    </header>
  );
}