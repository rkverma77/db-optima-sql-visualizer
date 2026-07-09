/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#06080d",
          surface: "rgba(15, 18, 30, 0.85)",
          surface2: "rgba(20, 25, 40, 0.7)",
          surface3: "rgba(30, 35, 55, 0.6)",
        },
        border: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          2: "rgba(255, 255, 255, 0.1)",
        },
        accent: {
          DEFAULT: "#818cf8",
          hover: "#6366f1",
          cyan: "#22d3ee",
          violet: "#a78bfa",
          amber: "#fbbf24",
          teal: "#2dd4bf",
        },
        status: {
          success: "#34d399",
          warn: "#fbbf24",
          danger: "#f87171",
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
        shimmer: "shimmer 2s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
      },
      keyframes: {
        flashGreen: {
          "0%": { backgroundColor: "rgba(52, 211, 153, 0.3)" },
          "100%": { backgroundColor: "transparent" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px -5px rgba(129,140,248,0.15)" },
          "50%": { boxShadow: "0 0 30px -2px rgba(129,140,248,0.25)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      backdropBlur: {
        glass: "16px",
        heavy: "24px",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "calc(var(--radius-xl) * 1.5)",
      },
    },
  },
  plugins: [],
};
