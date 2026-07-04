"use client";

import { SunMedium, MoonStar } from "lucide-react";
import { useTheme } from "@/app/providers";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-300 hover:scale-105"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface3)",
      }}
      aria-label="Toggle theme"
      title="Toggle light / dark theme"
    >
      {theme === "dark" ? (
        <SunMedium className="h-5 w-5 text-amber-400" />
      ) : (
        <MoonStar className="h-5 w-5 text-slate-500" />
      )}
    </button>
  );
}