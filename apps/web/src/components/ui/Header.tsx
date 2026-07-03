"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";

const TABS = [
  { id: "visualize", label: "⬡ Visualize" },
  { id: "ai",        label: "✦ AI Optimizer" },
  { id: "perf",      label: "◈ Performance" },
] as const;

type TabId = typeof TABS[number]["id"];

// Active tab is stored in a simple module-level atom to avoid prop drilling.
// In a real app you'd use a URL segment or a dedicated piece of store state.
import { create } from "zustand";
export const useTab = create<{ tab: TabId; setTab: (t: TabId) => void }>((set) => ({
  tab: "visualize",
  setTab: (tab) => set({ tab }),
}));

export function Header() {
  const { tab, setTab } = useTab();
  const {
    isRunning, error, animSpeed, setAnimSpeed,
    runDemo, visualizerSQL, tableData,
    saveStatus, setSaveStatus, savedQueryId, setSavedQueryId, saveError, setSaveError,
  } = useStore();
  const [showShare, setShowShare] = useState(false);

  const handleSave = async () => {
    setSaveStatus("saving");
    setSaveError(null);
    setSavedQueryId(null);
    try {
      const name = typeof window !== "undefined" ? window.prompt("Name this query:", "My query") : "My query";
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
      ? "bg-[var(--danger)]"
      : "bg-[var(--muted)]";

  return (
    <header
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      className="h-12 flex items-center justify-between px-4 gap-3 flex-shrink-0"
    >
      {/* Brand */}
      <div className="flex items-center gap-2 font-bold text-sm tracking-tight select-none">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs"
          style={{ background: "linear-gradient(135deg,var(--accent),var(--purple))" }}
        >
          ⚡
        </div>
        DB<span style={{ color: "var(--accent)" }}>Optima</span>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-xs font-medium transition-colors rounded-none border-b-2"
            style={{
              color: tab === t.id ? "var(--accent)" : "var(--muted)",
              borderBottomColor: tab === t.id ? "var(--accent)" : "transparent",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setTab("ai");
            runDemo();
          }}
          className="px-3 py-1 rounded text-[11px] font-semibold"
          style={{ border: "1px solid rgba(167,139,250,0.4)", color: "#a78bfa" }}
          title="Load a bad query and watch the AI Optimizer fix it"
        >
          ▶ Run Demo
        </button>
        <button
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          className="px-3 py-1 rounded text-[11px] font-semibold disabled:opacity-50"
          style={{ border: "1px solid var(--border2)", color: "var(--muted2)" }}
        >
          {saveStatus === "saving" ? "Saving…" : "🔗 Save & Share"}
        </button>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <span>Speed</span>
          <input
            type="range"
            min={1}
            max={10}
            value={Math.round(11 - animSpeed / 80)}
            onChange={(e) => setAnimSpeed((11 - Number(e.target.value)) * 80)}
            className="w-20 cursor-pointer accent-[var(--accent)]"
          />
        </div>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-xs" style={{ color: "var(--muted)" }}>{statusLabel}</span>
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

function ShareModal({ id, error, onClose }: { id: number | null; error: string | null; onClose: () => void }) {
  const url = id && typeof window !== "undefined" ? `${window.location.origin}/q/${id}` : "";
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg p-5 w-[380px]"
        style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
      >
        {error ? (
          <>
            <div className="text-[13px] font-semibold mb-2" style={{ color: "var(--danger)" }}>Couldn&apos;t save</div>
            <div className="text-[11.5px] font-mono mb-4" style={{ color: "var(--muted)" }}>{error}</div>
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              Saving requires a Postgres connection. Set <span className="font-mono">DATABASE_URL</span> (see{" "}
              <span className="font-mono">docker/docker-compose.yml</span>) and run{" "}
              <span className="font-mono">npm run db:push</span>.
            </div>
          </>
        ) : (
          <>
            <div className="text-[13px] font-semibold mb-2" style={{ color: "var(--success)" }}>Saved!</div>
            <div className="text-[11px] mb-2" style={{ color: "var(--muted)" }}>Share this link — it reloads your exact query and schema:</div>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                className="flex-1 px-2 py-1.5 text-[11px] font-mono rounded"
                style={{ background: "var(--bg)", border: "1px solid var(--border2)", color: "var(--text)" }}
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => navigator.clipboard.writeText(url)}
                className="px-2.5 py-1.5 rounded text-[11px] font-semibold text-black"
                style={{ background: "var(--accent)" }}
              >
                Copy
              </button>
            </div>
          </>
        )}
        <button
          onClick={onClose}
          className="w-full mt-4 py-1.5 rounded text-[11px]"
          style={{ border: "1px solid var(--border2)", color: "var(--muted2)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
