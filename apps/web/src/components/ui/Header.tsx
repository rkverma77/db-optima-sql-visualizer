"use client";

import { useState } from "react";
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
    visualizerSQL,
    tableData,
    saveStatus,
    setSaveStatus,
    savedQueryId,
    setSavedQueryId,
    saveError,
    setSaveError,
  } = useStore();
  const [showShare, setShowShare] = useState(false);

  const handleSave = async () => {
    setSaveStatus("saving");
    setSaveError(null);
    setSavedQueryId(null);
    try {
      const name =
        typeof window !== "undefined"
          ? window.prompt("Name this query:", "My query")
          : "My query";
      if (!name) {
        setSaveStatus("idle");
        return;
      }
      const res = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sql: visualizerSQL, schemaJson: tableData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Save failed");
      setSavedQueryId(data.id);
      setSaveStatus("saved");
      setShowShare(true);
    } catch (e) {
      setSaveError((e as Error).message);
      setSaveStatus("error");
      setShowShare(true);
    }
  };

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

        <button
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          className="btn-secondary text-[11px] font-semibold disabled:opacity-50"
        >
          {saveStatus === "saving" ? "Saving…" : "🔗 Save & Share"}
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

      {showShare && (
        <ShareModal
          onClose={() => setShowShare(false)}
          id={savedQueryId}
          error={saveError}
        />
      )}
    </header>
  );
}

function ShareModal({
  id,
  error,
  onClose,
}: {
  id: string | null;
  error: string | null;
  onClose: () => void;
}) {
  const url =
    id && typeof window !== "undefined"
      ? `${window.location.origin}/q/${id}`
      : "";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl p-6 w-[400px] shadow-2xl border border-[var(--border)] bg-[var(--surface2)]"
      >
        {error ? (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-[var(--error)]">
              Couldn&apos;t save
            </div>
            <div className="text-xs font-mono text-[var(--muted)] bg-[var(--surface3)] p-3 rounded-md">
              {error}
            </div>
            <div className="text-xs text-[var(--muted)] leading-relaxed">
              Saving requires a Postgres connection. Set{" "}
              <code className="text-[var(--accent)]">DATABASE_URL</code> (see{" "}
              <code className="text-[var(--accent)]">docker/docker-compose.yml</code>) and run{" "}
              <code className="text-[var(--accent)]">npm run db:push</code>.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-[var(--success)]">
              Saved!
            </div>
            <div className="text-xs text-[var(--muted)]">
              Share this link — it reloads your exact query and schema:
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                className="input flex-1 text-[11px] font-mono"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => navigator.clipboard.writeText(url)}
                className="btn-primary text-[11px] px-3"
              >
                Copy
              </button>
            </div>
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full mt-5 py-2 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface3)] transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}