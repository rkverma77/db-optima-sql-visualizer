# ⚡ DB Optima — SQL Visualization & Optimization Dashboard

A production-ready full-stack monorepo that visualizes SQL execution step-by-step, uses **Gemini AI** to detect anti-patterns and rewrite queries, and **measures** (not simulates) Sequential vs Index scan performance using a real embedded SQLite engine.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TailwindCSS |
| **State** | Zustand |
| **SQL Engine** | sql.js (SQLite/WASM — fully client-side, parameterized queries) |
| **Visualization** | Recharts (performance chart) |
| **AI** | Google Gemini 1.5 Flash via `@google/generative-ai`, grounded in real `EXPLAIN QUERY PLAN` output |
| **Validation** | Zod (API request/response schemas) |
| **Database ORM** | Drizzle ORM + PostgreSQL (saved/shareable queries) |
| **Testing** | Vitest (parser, join engine, synthetic-data generator) |
| **Deployment** | Vercel (one-click) |

---

## 🧩 Key Features

### ⬡ Visualize Tab
- Write any `SELECT` with JOINs in the syntax-highlighted editor
- Watch the nested-loop join algorithm animate row-by-row with scan/match colors
- Execution Plan sidebar tracks FROM → JOIN → SELECT in real-time
- Final results stream in with flash animation
- Load a **sample dataset** (e-commerce, streaming, SaaS billing) with one click, or import your own CSV

### ✦ AI Optimizer Tab (Gemini)
- Paste any query and hit **Optimize with AI**
- The **real** current `EXPLAIN QUERY PLAN` (from sql.js/SQLite) is sent to Gemini alongside the query, so "before" analysis is grounded in fact, not a guess
- Gemini returns: detected issues (high/medium/low severity), an optimized rewrite, production-ready `CREATE INDEX` statements, and a plain-English explanation
- Side-by-side Before/After diff with one-click copy
- **Apply & Verify**: actually runs the suggested `CREATE INDEX` statements against an in-memory SQLite database, re-plans the query, and shows the real before/after `EXPLAIN QUERY PLAN` + measured timing — so you can confirm the AI's suggestion actually changes the planner's behavior instead of trusting the explanation text

### ◈ Performance Tab
- Drag a slider from 1K → 1M rows
- Runs your **actual query** against synthetically scaled data at each volume and measures **real** sql.js execution time — not a formula-generated O(n)/O(log n) curve
- Index candidates come from the AI Optimizer's suggestions when available, or are derived automatically from the query's JOIN keys otherwise
- Shows the real `EXPLAIN QUERY PLAN` for the current query

### 🔗 Save & Share
- "Save & Share" in the header persists the current query + schema snapshot (via Drizzle/Postgres) and gives you a `/q/:id` link that reloads it exactly, for sending to a friend or interviewer
- Requires `DATABASE_URL` — see setup below. Without it, the app still works fully (everything else is client-side), and Save & Share will tell you what to configure

### ▶ Run Demo
- One click in the header loads a query with a classic anti-pattern (implicit cross join) and lets the AI Optimizer fix it live — a 10-second way to show what this project does

---

## 📁 Folder Structure

```
/db-optima
├── apps/
│   └── web/                        # Next.js application
│       ├── src/
│       │   ├── app/
│       │   │   ├── dashboard/          # Main shell
│       │   │   ├── q/[id]/             # Shared/saved query loader
│       │   │   └── api/
│       │   │       ├── analyze/            # POST → Gemini (grounded in real EXPLAIN)
│       │   │       ├── suggest-indexes/    # POST → Gemini, index DDL only
│       │   │       └── queries/            # POST save / GET [id] load (Drizzle)
│       │   ├── components/
│       │   │   ├── ui/                 # Header (demo/save/share), Workbench, SQLEditor
│       │   │   ├── visualizer/         # Animation engine + results
│       │   │   ├── optimizer/          # AI results + Apply & Verify
│       │   │   ├── performance/        # Real sql.js benchmarks + EXPLAIN plan
│       │   │   └── schema/             # Inline table/row/col editor + sample datasets
│       │   ├── lib/
│       │   │   ├── gemini/client.ts    # Gemini SDK wrapper (server-only), plan-aware prompt
│       │   │   ├── sql/
│       │   │   │   ├── engine.ts       # Pipeline parser, join generator, index derivation
│       │   │   │   └── runner.ts       # sql.js loader, parameterized inserts, EXPLAIN, benchmarks
│       │   │   ├── data/datasets.ts    # Sample datasets + synthetic row generator
│       │   │   └── utils/validators.ts # Zod schemas for API routes
│       │   ├── store/useStore.ts       # Zustand global store
│       │   └── types/index.ts          # All shared TypeScript interfaces
│       └── ...
├── packages/
│   ├── database/                   # Drizzle ORM schema + client (saved_queries table)
│   └── types/                      # Shared Zod schemas (monorepo consumers)
├── docker/docker-compose.yml       # Local PostgreSQL
└── package.json                    # Workspace root
```

---

## 🚀 Quick Start

### 1. Clone & install

```bash
git clone https://github.com/yourname/db-optima.git
cd db-optima
npm install
```

### 2. Environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
# Then edit .env.local and paste your Gemini API key
```

Get a **free** Gemini key at: https://aistudio.google.com/app/apikey

### 3. (Optional) Start Postgres for Save & Share

```bash
docker compose -f docker/docker-compose.yml up -d
npm run db:push   # push Drizzle schema
```

Everything except **Save & Share** works with zero backend setup — the SQL engine, visualizer, AI Optimizer, and Performance benchmarks are all client-side (sql.js) + a single Gemini-backed API route.

### 4. Run dev server

```bash
npm run dev
# → http://localhost:3000
```

### 5. Run tests

```bash
npm run test --workspace=apps/web
```

Covers the SQL pipeline parser, the nested-loop join engine, index derivation, and the synthetic data generator.

---

## 🌐 Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Set these environment variables in the Vercel dashboard:
- `GEMINI_API_KEY` — your Gemini key
- `DATABASE_URL` — (optional) Neon/Supabase PostgreSQL URL, enables Save & Share


