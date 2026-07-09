"use client";

import { SunMedium, MoonStar } from "lucide-react";
import { useTheme } from "@/app/providers";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <motion.button
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden relative"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface3)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      whileHover={{
        scale: 1.1,
        borderColor: "rgba(255,255,255,0.12)",
        boxShadow: "0 0 16px -4px rgba(129,140,248,0.25)",
      }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      aria-label="Toggle theme"
      title="Toggle light / dark theme"
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === "dark" ? (
          <motion.div
            key="sun"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex items-center justify-center"
          >
            <SunMedium className="h-5 w-5 text-amber-400" />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex items-center justify-center"
          >
            <MoonStar className="h-5 w-5 text-slate-500" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}