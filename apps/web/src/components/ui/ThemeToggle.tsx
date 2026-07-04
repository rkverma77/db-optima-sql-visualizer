"use client";

import { useTheme } from "@/app/providers";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="btn-secondary"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}