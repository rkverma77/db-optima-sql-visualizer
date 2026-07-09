# DB Optima — Design System & UI Architecture

> A comprehensive design specification documenting every visual decision, color token, component style, typography rule, animation, and layout pattern used in the DB Optima dashboard.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Spacing & Border Radius](#4-spacing--border-radius)
5. [Shadows & Elevation](#5-shadows--elevation)
6. [Layout Architecture](#6-layout-architecture)
7. [Component Library](#7-component-library)
8. [Animation System](#8-animation-system)
9. [Syntax Highlighting](#9-syntax-highlighting)
10. [Responsive Design](#10-responsive-design)

---

## 1. Design Philosophy

DB Optima follows a **minimalist, professional, Linear-inspired** design language with the following principles:

| Principle | Implementation |
|---|---|
| **Flat & Clean** | No glassmorphism, no heavy blurs. Solid surfaces with crisp 1px borders |
| **Boxy & Sharp** | Small border-radius (6–8px max). Cards and panels feel structured, not bubbly |
| **Dark-First** | Dark mode is the default experience. Light mode is a clean, white alternative |
| **Accent Restraint** | Single primary accent (Electric Blue). Secondary colors are muted grays |
| **Content-Dense** | Compact spacing. Information-rich panels. Professional data dashboard feel |
| **Measured, Not Simulated** | Every visual decision reinforces that data shown is real, grounded, and trustworthy |

---

## 2. Color System

The entire color system is defined through CSS custom properties (design tokens) on `:root`, enabling instant theme switching via `data-theme="light"` on `<html>`.

### 2.1 Canvas (Background)

| Token | Dark Mode | Light Mode | Usage |
|---|---|---|---|
| `--bg` | `#09090b` | `#fafafa` | Page background, deepest layer |
| `--bg-gradient` | `none` | `none` | Background gradient (disabled for clean look) |

### 2.2 Surfaces

| Token | Dark Mode | Light Mode | Usage |
|---|---|---|---|
| `--surface` | `#18181b` | `#ffffff` | Card backgrounds, panels, sidebar |
| `--surface2` | `#27272a` | `#f4f4f5` | Elevated surface (buttons, inputs) |
| `--surface3` | `#3f3f46` | `#e4e4e7` | Highest elevation (hover states, tab bar) |
| `--surface-solid` | `#18181b` | `#ffffff` | Non-transparent surface (code blocks, inputs) |

### 2.3 Typography Colors

| Token | Dark Mode | Light Mode | Usage |
|---|---|---|---|
| `--text` | `#f4f4f5` | `#09090b` | Primary body text |
| `--text-secondary` | `#d4d4d8` | `#3f3f46` | Secondary / supporting text |
| `--muted` | `#a1a1aa` | `#71717a` | Labels, captions, metadata |
| `--muted2` | `#71717a` | `#a1a1aa` | Placeholders, disabled text |

### 2.4 Accent Colors

| Token | Dark Mode | Light Mode | Role |
|---|---|---|---|
| `--accent` | `#3b82f6` | `#2563eb` | **Primary** — buttons, links, active states |
| `--accent-hover` | `#2563eb` | `#1d4ed8` | Primary hover state |
| `--accent-soft` | `rgba(59,130,246, 0.1)` | `rgba(37,99,235, 0.1)` | Primary background tint |
| `--accent-cyan` | `#60a5fa` | `#3b82f6` | Secondary accent (chart lines) |
| `--accent-violet` | `#9ca3af` | `#64748b` | Muted accent (schema border, outline buttons) |
| `--accent-amber` | `#f97316` | `#ea580c` | Warm accent (warnings, amber borders) |
| `--accent-teal` | `#94a3b8` | `#475569` | Neutral accent (teal card borders) |

### 2.5 Status Colors

| Token | Dark Mode | Light Mode | Usage |
|---|---|---|---|
| `--success` | `#10b981` | `#059669` | Success states, "Idle" indicator, speed badges |
| `--success-soft` | `rgba(16,185,129, 0.1)` | `rgba(5,150,105, 0.1)` | Success background tint |
| `--warning` | `#f59e0b` | `#d97706` | Warnings, skipped benchmarks |
| `--warning-soft` | `rgba(245,158,11, 0.1)` | `rgba(217,119,6, 0.1)` | Warning background tint |
| `--error` | `#ef4444` | `#dc2626` | Errors, destructive actions |
| `--error-soft` | `rgba(239,68,68, 0.1)` | `rgba(220,38,38, 0.1)` | Error background tint |

### 2.6 Borders

| Token | Dark Mode | Light Mode | Usage |
|---|---|---|---|
| `--border` | `#27272a` | `#e4e4e7` | Default border (panels, sidebar) |
| `--border2` | `#3f3f46` | `#d4d4d8` | Stronger border (cards, inputs, buttons) |
| `--border-subtle` | `#27272a` | `#f4f4f5` | Subtle separators |
| `--border-glow` | `transparent` | `transparent` | Hover glow (disabled in flat design) |

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Fallbacks | Loading |
|---|---|---|---|
| **UI / Body** | `Inter` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | `next/font/google` (swap) |
| **Code / Monospace** | `JetBrains Mono` | `'Fira Code', 'SF Mono', Monaco, Consolas, monospace` | `next/font/google` (swap) |

### 3.2 Type Scale

| Usage | Size | Weight | Other |
|---|---|---|---|
| Brand name ("DBOptima") | `15px` | `700 (bold)` | `tracking-tight` |
| Panel headings ("SCHEMA EXPLORER") | `0.7rem (11.2px)` | `700` | `uppercase`, `letter-spacing: 0.1em` |
| Body text | `0.875rem (14px)` | `400` | `line-height: 1.6` |
| Button labels | `0.82rem (13.1px)` | `700` (primary), `600` (secondary) | — |
| Small labels / badges | `0.75rem (12px)` | `600` | `uppercase`, `letter-spacing: 0.025em` |
| Table cell data | `11.5px` | `400` | `font-mono` |
| Tiny metadata | `9.5px – 10px` | `600–700` | Used for row/column counts, status pills |

### 3.3 Line Height

- **Body**: `1.6` (set on `<body>`)
- **Code blocks**: `1.6` (matches body)
- **Compact UI**: Varies per component

---

## 4. Spacing & Border Radius

### 4.1 Border Radius Tokens

| Token | Value | Usage |
|---|---|---|
| `--radius-xl` | `8px` | Largest containers (rarely used) |
| `--radius-lg` | `6px` | Cards (`.card` class) |
| `--radius-md` | `4px` | Buttons, inputs, code blocks |
| `--radius-sm` | `2px` | Small elements, ghost buttons, input fields |

> **Design Intent**: Boxes are intentionally **boxy** with only a slight curve — professional and structured, not bubbly.

### 4.2 Common Spacing Patterns

| Pattern | Value | Usage |
|---|---|---|
| Card padding | `p-4` (16px) | Inside `.card` components |
| Panel gap | `gap-3` (12px) | Between cards in scrollable lists |
| Section margin | `m-3` (12px) | Schema Explorer header card |
| Button padding | `0.55rem 1.1rem` | Primary/secondary buttons |
| Input padding | `0.5rem 0.75rem` | Text inputs |
| Header height | `h-16` (64px) | Fixed top navigation bar |
| Sidebar width | `420px` | Schema Explorer sidebar |

---

## 5. Shadows & Elevation

| Token | Dark Mode | Light Mode | Usage |
|---|---|---|---|
| `--shadow` | `0 1px 3px rgba(0,0,0,0.5), 0 1px 2px -1px rgba(0,0,0,0.5)` | `...rgba(0,0,0,0.1)...` | Default card shadow |
| `--shadow-lg` | `0 4px 6px -1px rgba(0,0,0,0.5), 0 2px 4px -2px rgba(0,0,0,0.5)` | `...rgba(0,0,0,0.1)...` | Hover state, elevated elements |
| `--shadow-glow` | `none` | `none` | Glow effect (disabled) |
| `--shadow-inset` | `none` | `none` | Inset shadow (disabled) |

> **Note**: Blur effects (`--blur-glass`, `--blur-heavy`) are set to `0px` — no glassmorphism in the current design.

---

## 6. Layout Architecture

### 6.1 Page Structure

```
┌────────────────────────────────────────────────────────────┐
│                     Header (h-16, fixed)                   │
│  [Logo] [Brand] [Badge]    [Tab Nav]    [Speed] [Theme]    │
├──────────────┬─────────────────────────────────────────────┤
│              │                                             │
│   Schema     │              Workbench                      │
│   Explorer   │   (Tab Content: Visualizer / Optimizer /    │
│   (420px)    │    Performance)                             │
│              │                                             │
│   Sidebar    │   Full remaining width                      │
│   (scroll)   │   (scroll)                                  │
│              │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

### 6.2 Header (`Header.tsx`)

| Element | Style | Details |
|---|---|---|
| Container | `h-16`, `flex`, `items-center`, `justify-between`, `px-5` | `background: var(--surface)`, `border-bottom: 1px solid var(--border)` |
| Logo icon | `w-9 h-9 rounded-md` | Gradient background (`--accent` → `--accent-violet`), whileHover scale animation |
| Brand text | `text-[15px] font-bold tracking-tight` | "DB" in `--text`, "Optima" in `--accent` |
| Status badge | `text-[9.5px] font-bold uppercase rounded-md` | Green border + text for "MEASURED, NOT SIMULATED" |
| Tab nav | `flex gap-1 p-1 rounded-md` | `background: var(--surface3)`, `border: 1px solid var(--border)` |
| Active tab | `layoutId="tab-indicator"` | Framer Motion animated sliding indicator |
| Status dot | Pulsing circle | Color changes: idle=`--success`, running=`--accent`, error=`--error` |

### 6.3 Schema Explorer (`SchemaPanel.tsx`)

| Element | Style |
|---|---|
| `<aside>` | `width: 420px`, `background: var(--bg)`, `border-right: 1px solid var(--border)` |
| Header card | `.card .card-accent-violet`, `m-3 p-4` — bordered box with violet top accent |
| Table name input | `.input`, `!py-1.5 !text-[11.5px]` |
| "+ Table" button | `.btn-primary`, `!py-1.5 !px-2.5 !text-[11px]` |
| Import buttons | `.btn-secondary`, `!py-1.5 !text-[11px]` |
| Table cards | `.card`, `overflow-hidden flex-shrink-0` — each table is a bordered card |
| Table header row | Gradient background (`--surface3` → `--surface2`), table name in mono `text-[11.5px] font-bold` |
| Row/Col badges | `text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md` with accent-soft background |
| Data cells | `font-mono text-[11.5px]`, hover highlights with `--accent-soft` |

### 6.4 Workbench (`Workbench.tsx`)

- All 3 tabs stay **mounted** (hidden via CSS display) to preserve state
- Each tab wrapped in `motion.div` with fade-up animation on switch
- Content area fills remaining width with `flex-1`

---

## 7. Component Library

### 7.1 Cards

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: var(--radius-lg);        /* 6px */
  box-shadow: var(--shadow);
  position: relative;
  overflow: hidden;
}

/* Subtle top highlight line */
.card::before {
  content: '';
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
}
```

**Accent Variants** (colored top border):
| Class | Color | Usage |
|---|---|---|
| `.card-accent-blue` | `var(--accent)` | Performance panels |
| `.card-accent-violet` | `var(--accent-violet)` | Schema Explorer header |
| `.card-accent-teal` | `var(--accent-teal)` | Miscellaneous panels |
| `.card-accent-amber` | `var(--accent-amber)` | Warning panels |
| `.card-accent-success` | `var(--success)` | Success panels |

### 7.2 Buttons

| Class | Background | Text | Border | Hover |
|---|---|---|---|---|
| `.btn-primary` | `linear-gradient(135deg, --accent, --accent-hover)` | `white` | `rgba(255,255,255,0.15)` | `translateY(-1px)`, brighter gradient overlay |
| `.btn-secondary` | `var(--surface2)` | `var(--text-secondary)` | `var(--border2)` | `var(--surface3)`, border → accent |
| `.btn-outline-violet` | `var(--accent-violet-soft)` | `var(--accent-violet)` | `rgba(167,139,250,0.3)` | Deeper violet bg, `translateY(-1px)` |
| `.btn-ghost` | `transparent` | `var(--muted)` | `transparent` | `var(--surface3)`, text → `var(--text)` |
| `.btn-danger-ghost` | `transparent` | `var(--muted)` | `transparent` | `var(--error-soft)`, text → `var(--error)` |

**Disabled state** (all buttons): `opacity: 0.4`, `cursor: not-allowed`

### 7.3 Inputs

```css
.input {
  background: var(--surface-solid);
  border: 1px solid var(--border2);
  border-radius: var(--radius-sm);        /* 2px */
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
```

### 7.4 Badges

| Class | Background | Text | Border |
|---|---|---|---|
| `.badge-success` | `var(--success-soft)` | `var(--success)` | `rgba(52,211,153,0.25)` |
| `.badge-warning` | `var(--warning-soft)` | `var(--warning)` | `rgba(251,191,36,0.25)` |
| `.badge-error` | `var(--error-soft)` | `var(--error)` | `rgba(248,113,113,0.25)` |
| `.badge-info` | `var(--accent-soft)` | `var(--accent)` | `rgba(129,140,248,0.25)` |

All badges: `border-radius: 9999px` (pill shape), `font-size: 0.75rem`, `font-weight: 600`, `uppercase`.

### 7.5 Panel Headings

```css
.panel-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.panel-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  box-shadow: 0 0 8px currentColor;    /* Subtle glow */
}
```

### 7.6 Miscellaneous Components

| Component | Style |
|---|---|
| `.divider` | `height: 1px`, gradient from transparent → `--border2` → transparent |
| `.code-block` | `background: var(--surface-solid)`, `font-family: 'JetBrains Mono'`, `font-size: 0.8125rem` |
| `.glass-panel` | `background: var(--surface)`, `border: 1px solid var(--border)` |
| `.skeleton` | Shimmer animation (gradient sweep), `border-radius: var(--radius-sm)` |
| `.tooltip` | `background: var(--surface-solid)`, `font-size: 0.72rem`, fade on hover |
| `.noise-overlay::after` | Fixed SVG fractal noise texture, `opacity: 0.015` — barely visible grain |

---

## 8. Animation System

### 8.1 CSS Keyframes

| Animation | Description | Duration | Easing |
|---|---|---|---|
| `fadeIn` | Opacity 0→1, translateY 8px→0 | `0.35s` | `ease-out` |
| `fadeInScale` | Opacity 0→1, scale 0.96→1 | `0.3s` | `ease-out` |
| `slideInRight` | Opacity 0→1, translateX 12px→0 | `0.25s` | `ease-out` |
| `slideInLeft` | Opacity 0→1, translateX -12px→0 | `0.25s` | `ease-out` |
| `pulse-ring` | Scale 0.8→1.6, opacity 0.5→0 | — | — |
| `spin` | `rotate(0→360deg)` | `1.5s` | `linear` |
| `shimmer` | Background position -200%→200% | `2s` | `ease-in-out` |
| `glow-pulse` | Box-shadow oscillation | `2s` | `ease-in-out` |
| `float` | translateY 0→-6px→0 | `3s` | `ease-in-out` |
| `count-up` | Opacity + translateY for number reveals | — | — |

### 8.2 Utility Classes

| Class | Animation |
|---|---|
| `.animate-fade-in` | `fadeIn 0.35s ease-out forwards` |
| `.animate-fade-in-scale` | `fadeInScale 0.3s ease-out forwards` |
| `.animate-slide-in-right` | `slideInRight 0.25s ease-out forwards` |
| `.animate-slide-in-left` | `slideInLeft 0.25s ease-out forwards` |
| `.animate-spin-slow` | `spin 1.5s linear infinite` |
| `.animate-shimmer` | Shimmer gradient sweep, `2s infinite` |
| `.animate-glow-pulse` | Box-shadow pulse, `2s infinite` |
| `.animate-float` | Vertical float, `3s infinite` |

### 8.3 Framer Motion Patterns

| Component | Motion Pattern |
|---|---|
| Logo icon | `whileHover: { scale: 1.12 }`, `whileTap: { scale: 0.95 }`, spring stiffness 400 |
| Tab indicator | `layoutId="tab-indicator"` — shared layout animation sliding between tabs |
| Schema cards | Staggered entrance: `variants` with `custom` delay index, `popLayout` exit |
| Tab content | `motion.div` opacity/transform fade-up on tab switch |
| Theme toggle | `AnimatePresence` for icon rotation swap (Sun ↔ Moon) |
| Empty states | `float` animation on icon (3s ease-in-out infinite) |
| Loading spinners | Two concentric `motion.div` circles rotating in opposite directions |

---

## 9. Syntax Highlighting

### 9.1 SQL Editor (Prism.js Tokens)

| Token Type | Color | Weight |
|---|---|---|
| Keywords (`SELECT`, `FROM`, `JOIN`, etc.) | `#3b82f6` (Electric Blue) | `bold` |
| Functions (`COUNT`, `SUM`, `ROW_NUMBER`, etc.) | `#22d3ee` (Cyan) | normal |
| Strings (`'text'`) | `#34d399` (Emerald Green) | normal |
| Numbers / Booleans | `#f472b6` (Pink) | normal |
| Comments (`-- ...`) | `#4a5170` (Dark Slate) | `italic` |
| Operators / Punctuation | `var(--muted)` | normal |

### 9.2 Read-Only SQL Highlighting (`highlightSQL()`)

Uses the same palette as Prism for visual consistency:

| Element | Color |
|---|---|
| SQL Keywords | `#38bdf8` (Sky Blue), `font-weight: bold` |
| Functions | `#a78bfa` (Violet) |
| Strings | `#22c55e` (Green) |
| Numbers | `#f472b6` (Pink) |
| Comments | `#6b7280` (Gray), `italic` |

---

## 10. Responsive Design

### 10.1 Breakpoints

| Breakpoint | Behavior |
|---|---|
| `≤ 1024px` | `.hide-mobile` elements are hidden |
| `≥ 1025px` | `.hide-desktop` elements are hidden |

### 10.2 Scrollbar Design

| Property | Value |
|---|---|
| Width/Height | `6px` |
| Track | `transparent` |
| Thumb | `var(--scrollbar-thumb)` — `#3f3f46` (dark) / `#d4d4d8` (light) |
| Thumb hover | `var(--accent-soft)` |
| Firefox | `scrollbar-width: thin` |

### 10.3 Focus & Accessibility

| Feature | Implementation |
|---|---|
| Focus ring | `2px solid var(--accent)`, `offset: 2px` on `:focus-visible` |
| Text selection | `background: var(--accent)`, `color: white` |
| Font smoothing | `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale` |
| Smooth scrolling | `scroll-behavior: smooth` on `<html>` |

---

## Appendix: Recharts Integration

Chart tooltips and overlays are styled to match the design system:

```css
.recharts-default-tooltip {
  background: var(--surface-solid) !important;
  border: 1px solid var(--border2) !important;
  border-radius: var(--radius-md) !important;
  color: var(--text) !important;
  box-shadow: var(--shadow-lg) !important;
}
```

---

## Appendix: WASM Configuration

The `next.config.js` sets required security headers for the SQLite WASM engine:

| Header | Value | Purpose |
|---|---|---|
| `Cross-Origin-Opener-Policy` | `same-origin` | Required for `SharedArrayBuffer` |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Required for WASM threading |

---

*This document reflects the current design state of DB Optima as of July 2026.*
