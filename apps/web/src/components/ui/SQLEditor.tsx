"use client";

import { useRef, useEffect } from "react";
import { highlightSQL } from "@/lib/sql/engine";

interface SQLEditorProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function SQLEditor({ value, onChange, className = "" }: SQLEditorProps) {
  const hlRef  = useRef<HTMLDivElement>(null);
  const taRef  = useRef<HTMLTextAreaElement>(null);

  const syncHighlight = (text: string) => {
    if (hlRef.current) hlRef.current.innerHTML = highlightSQL(text);
  };

  useEffect(() => { syncHighlight(value); }, [value]);

  const syncScroll = () => {
    if (!taRef.current || !hlRef.current) return;
    hlRef.current.scrollTop  = taRef.current.scrollTop;
    hlRef.current.scrollLeft = taRef.current.scrollLeft;
  };

  return (
    <div className={`relative flex-1 overflow-hidden ${className}`} style={{ background: "var(--bg)" }}>
      {/* Highlighted layer */}
      <div
        ref={hlRef}
        aria-hidden
        className="absolute inset-0 p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre overflow-hidden pointer-events-none z-10"
        style={{ color: "var(--text)" }}
      />
      {/* Editable layer */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); syncHighlight(e.target.value); }}
        onScroll={syncScroll}
        spellCheck={false}
        className="absolute inset-0 p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre resize-none z-20 outline-none border-none overflow-auto"
        style={{ background: "transparent", color: "transparent", caretColor: "var(--accent)" }}
      />

      {/* Inline syntax-highlight styles (scoped) */}
      <style>{`
        .sql-kw  { color: var(--code-kw);  font-weight: 600; }
        .sql-fn  { color: var(--code-fn);  }
        .sql-str { color: var(--code-str); }
        .sql-num { color: var(--code-num); }
        .sql-com { color: var(--code-com); font-style: italic; }
      `}</style>
    </div>
  );
}
