"use client";

import { useCallback } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function SQLEditor({ value, onChange, placeholder, minHeight = 200 }: Props) {
  const highlight = useCallback((code: string) => {
    return Prism.highlight(code, Prism.languages.sql, "sql");
  }, []);

  return (
    <div
      className="relative rounded-lg border border-[var(--border)] overflow-hidden font-mono text-sm"
      style={{ minHeight }}
    >
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={highlight}
        padding={16}
        placeholder={placeholder}
        className="bg-[var(--surface)] text-[var(--text)]"
        textareaClassName="focus:outline-none"
        style={{
          fontFamily: '"Fira Code", "SF Mono", Monaco, monospace',
          fontSize: 14,
          lineHeight: "1.5",
        }}
      />
    </div>
  );
}