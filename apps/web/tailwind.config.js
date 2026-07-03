/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#080c14",
          surface: "#0d1421",
          surface2: "#111827",
        },
        border: {
          DEFAULT: "#1e2d45",
          2: "#253347",
        },
        accent: {
          DEFAULT: "#00d4ff",
          purple: "#7c3aed",
        },
        status: {
          success: "#10b981",
          warn: "#f59e0b",
          danger: "#ef4444",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        ui: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        pulse: "pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite",
        spin: "spin 0.8s linear infinite",
        "flash-green": "flashGreen 0.8s ease",
      },
      keyframes: {
        flashGreen: {
          "0%": { backgroundColor: "rgba(16,185,129,0.3)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
    },
  },
  plugins: [],
};
