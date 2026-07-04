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
      : "bg-[var(--muted)]";

  return (
    <header className="h-14 flex items-center justify-between px-5 gap-3 flex-shrink-0 border-b border-[var(--border)] bg-[var(--surface)] z-40">
      {/* Brand */}
      <div className="flex items-center gap-2.5 font-bold text-sm tracking-tight select-none">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-lg"
          style={{
            background: "linear-gradient(135deg, var(--accent), #a78bfa)",
          }}
        >
          ⚡
        </div>
        <span>
          DB<span className="text-[var(--accent)]">Optima</span>
        </span>
        <span
          className="ml-1 hidden sm:inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
          style={{ color: "var(--success)", borderColor: "color-mix(in srgb, var(--success) 40%, transparent)", background: "color-mix(in srgb, var(--success) 8%, transparent)" }}
          title="Every number this app shows — timings, scan types, speedups — comes from a real SQLite engine running in your browser, not a simulation or a guess."
        >
          ● measured, not simulated
        </span>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-xs font-medium transition-all duration-200 rounded-md border-b-2 bg-transparent hover:bg-[var(--surface2)]"
            style={{
              color: tab === t.id ? "var(--accent)" : "var(--muted)",
              borderBottomColor: tab === t.id ? "var(--accent)" : "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <ThemeToggle />

        <button
          onClick={() => {
            setTab("ai");
            runDemo();
          }}
          className="btn-secondary text-[11px] font-semibold"
          style={{ color: "#a78bfa", borderColor: "rgba(167,139,250,0.4)" }}
          title="Load a bad query and watch the AI Optimizer fix it"
        >
          ▶ Run Demo
        </button>

        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span>Speed</span>
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

        <div className="flex items-center gap-2 pl-2 border-l border-[var(--border)]">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          <span className="text-xs text-[var(--muted)]">{statusLabel}</span>
        </div>
      </div>
    </header>
  );
}