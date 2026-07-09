"use client";

import { useCallback, useState } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import { motion } from "framer-motion";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function SQLEditor({ value, onChange, placeholder, minHeight = 200 }: Props) {
  const [isFocused, setIsFocused] = useState(false);

  const highlight = useCallback((code: string) => {
    return Prism.highlight(code, Prism.languages.sql, "sql");
  }, []);

  return (
    <motion.div
      className="relative rounded-lg overflow-y-auto font-mono text-sm"
      style={{
        height: minHeight,
        background: "var(--surface)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: isFocused
          ? "1px solid var(--border-glow)"
          : "1px solid var(--border)",
        boxShadow: isFocused
          ? "var(--shadow-glow), inset 0 0 30px -15px rgba(129,140,248,0.06)"
          : "none",
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
      }}
      animate={isFocused ? { scale: 1.005 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={highlight}
        padding={16}
        placeholder={placeholder}
        className="prism-editor text-[var(--text)]"
        textareaClassName="focus:outline-none"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Monaco, monospace',
          fontSize: 14,
          lineHeight: "1.5",
          minHeight: "100%",
        }}
      />
    </motion.div>
  );
}