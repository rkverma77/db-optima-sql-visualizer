<div align="center">
  <h1>⚡ DB Optima</h1>
  <p><strong>SQL Visualization, AI Optimization & Real-Time Performance Benchmarking — All in Your Browser</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" alt="Next.js 14" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 18" />
    <img src="https://img.shields.io/badge/SQLite-WASM-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite WASM" />
    <img src="https://img.shields.io/badge/Gemini_2.5-AI-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI" />
    <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  </p>

  <p>
    <a href="#-key-features">Features</a> •
    <a href="#-how-it-works">How It Works</a> •
    <a href="#%EF%B8%8F-tech-stack">Tech Stack</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-project-architecture">Architecture</a> •
    <a href="#-api-reference">API</a> •
    <a href="#-testing">Testing</a> •
    <a href="#-deployment">Deployment</a>
  </p>
</div>

<br/>

---

## 📖 What is DB Optima?

DB Optima is a **production-ready, full-stack monorepo application** that helps SQL learners and engineers understand, optimize, and benchmark their queries — all without leaving the browser.

Unlike traditional tools that simulate performance with formulas, DB Optima runs a **real SQLite engine compiled to WebAssembly (sql.js)** directly in your browser tab. Every timing number, every execution plan, every scan type you see is **measured from actual query execution** — not estimated, not simulated.

The AI Optimizer is powered by **Google Gemini 2.5 Flash**, grounded in real `EXPLAIN QUERY PLAN` output from the embedded SQLite engine, so its analysis is based on facts — not guesses.

---

## ✨ Key Features

### 🔍 Schema Explorer (Left Sidebar)
- **Inline Table Editor** — Create, rename, and drop tables. Add, rename, and drop columns. Edit cell values directly in the grid.
- **CSV Import** — Drag-and-drop or click to import `.csv` files as new tables.
- **SQL DDL Import** — Paste `CREATE TABLE` statements (with foreign key support) and DB Optima will parse and auto-generate sample data with FK-aligned values.
- **6 Built-in Sample Datasets** — One-click loading:
  | Dataset | Tables | Description |
  |---------|--------|-------------|
  | E-Commerce | 3 | Products, Customers, Orders |
  | Sales Pipeline | 6 | Orders, Customers, Products, Categories, Employees, Addresses |
  | Streaming Service | 3 | Users, Shows, WatchHistory |
  | SaaS Billing | 2 | Accounts, Invoices, Payments |
  | Sales Analytics Mastery | 6 | CTEs + Window functions on Sales Pipeline data |
  | Customer Cohort Retention | 6 | Subqueries + Conditional aggregation |

---

### 🎥 Visualizer Tab
The animation engine that makes SQL execution visible:

1. **AST-Based Pipeline Parsing** — Your SQL is parsed into an Abstract Syntax Tree via `node-sql-parser`, decomposed into logical execution steps: `FROM` → `JOIN` → `WHERE` → `AGGREGATE` → `WINDOW` → `SELECT`.
2. **Nested-Loop Join Animation** — Watch the O(n×m) nested-loop algorithm animate **row by row**:
   - Left table rows scan sequentially
   - For each left row, every right table row is compared
   - Matching rows flash green and merge into the result
3. **Real Query Execution** — After the animation completes, the actual query is executed against the embedded SQLite engine, and the real result set streams in with flash animations.
4. **Pipeline Sidebar** — Tracks each step's status (`pending` → `active` → `done`) in real time.
5. **Speed Control** — Adjustable animation speed slider (in the header) to slow down or speed up the visualization.

**Supported SQL constructs**: `SELECT`, `FROM`, `JOIN` (INNER/LEFT/RIGHT/CROSS), `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`, `CTEs` (`WITH ... AS`), subqueries (correlated & scalar), window functions (`ROW_NUMBER`, `RANK`, `LAG`, `LEAD`, etc.), `DISTINCT`, `UNION`, aggregates (`COUNT`, `SUM`, `AVG`, `MAX`, `MIN`).

---

### 🧠 AI Optimizer Tab (Gemini 2.5 Flash)
A three-stage optimization pipeline:

**Stage 1 — Grounded Analysis**
1. Your query is first run against the real SQLite engine to capture the actual `EXPLAIN QUERY PLAN` output.
2. That ground-truth plan, along with the query and full schema description, is sent to Gemini.
3. Gemini returns a structured JSON response containing:
   - **Detected Issues** — Anti-patterns with `high` / `medium` / `low` severity (e.g., implicit cross join, `SELECT *`, missing `WHERE`, Cartesian product)
   - **Optimized SQL** — A production-ready rewrite using proper SQLite syntax
   - **Index Suggestions** — Exact `CREATE INDEX` DDL statements ready to execute
   - **Scan Type Before/After** — e.g., "SCAN TABLE Orders" → "SEARCH TABLE Orders USING INDEX"
   - **Result Equivalence** — Step-by-step reasoning on whether the rewrite is semantically equivalent
   - **Explanation** — Plain-English summary (≤200 words)

**Stage 2 — Apply & Verify**
- Clicking "Apply & Verify" actually **creates the suggested indexes** in a fresh in-memory SQLite database, re-runs `EXPLAIN QUERY PLAN`, and measures execution timing **before and after**.
- You see the real plan change side-by-side — confirming the AI's suggestions actually alter the query planner's behavior.

**Stage 3 — Auto-Correction Loop**
- If the Performance tab detects that the AI's rewrite produces **different results** than the original (via full result-set comparison), the exact mismatch details are fed back to Gemini as empirical proof of a wrong rewrite.
- Gemini re-derives the rewrite from scratch, capped at **3 retry attempts** to prevent infinite loops.

---

### 📈 Performance Tab
The benchmarking engine that generates real performance curves:

- **Two Independent SQL Editors** — Side-by-side: Editor A (original query) and Editor B (optimized query). You can type freely or pull in the AI Optimizer's suggestion with one click.
- **Volume Slider** — Scale synthetic data from **1K to 100K rows** across 6 data points (1K, 5K, 10K, 25K, 50K, 100K).
- **Real Benchmarking Engine** — For each volume point:
  1. Synthetic data is generated deterministically (Mulberry32 PRNG) with FK-aligned values
  2. A fresh SQLite database is built and the original query is timed (median of multiple runs)
  3. A second database is built with indexes applied, and the optimized query is timed
  4. Results are plotted as comparison curves via Recharts
- **Smart Bailout** — Power-law extrapolation detects when a query will take too long at higher volumes and skips proactively (per-side 4-second budget).
- **Time Estimation** — Before running, a 3-probe power-law fit estimates total benchmark duration and warns if some volumes will be skipped.
- **Result Set Comparison** — Automatically compares the output of both queries (order-independent multiset comparison) and flags mismatches with specific examples.
- **Execution Plan Viewer** — Shows the real `EXPLAIN QUERY PLAN` for both queries side-by-side.
- **Complexity Analyzer** — Evaluates query complexity metrics.

---

### 🔗 Save & Share
- Click "Save & Share" in the header to persist the current query + full schema snapshot to PostgreSQL (via Drizzle ORM).
- Generates a shareable `/q/:id` link (96-bit entropy, base64url) that reloads the exact state.
- Requires `DATABASE_URL` — without it, the app still works fully (everything else is client-side).

---

## ⚙️ How It Works

### Client-Side Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Tab                          │
│                                                             │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │  Zustand  │   │  React 18 +  │   │  Framer Motion   │    │
│  │  Store    │◄──│  Next.js 14  │──►│  Animations      │    │
│  └────┬─────┘   └──────┬───────┘   └──────────────────┘    │
│       │                │                                     │
│       │    ┌───────────▼────────────┐                       │
│       │    │    SQL Pipeline Engine  │                       │
│       │    │  (node-sql-parser AST)  │                       │
│       │    └────────────────────────┘                       │
│       │                                                     │
│  ┌────▼──────────────────────────────────────────────┐      │
│  │              Web Worker (Background Thread)        │      │
│  │                                                    │      │
│  │  ┌────────────────────────────────────────────┐   │      │
│  │  │         sql.js (SQLite → WASM)              │   │      │
│  │  │  • runQuery()          • explainQueryPlan() │   │      │
│  │  │  • verifyIndexImpact() • compareResultSets()│   │      │
│  │  │  • benchmarkAcrossVolumes()                 │   │      │
│  │  │  • generateSyntheticData()                  │   │      │
│  │  └────────────────────────────────────────────┘   │      │
│  └───────────────────────────────────────────────────┘      │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Only for AI Optimizer
                           ▼
              ┌──────────────────────────┐
              │   Next.js API Routes     │
              │  POST /api/analyze       │
              │  POST /api/suggest-index │
              │         ▼                │
              │  Google Gemini 2.5 Flash │
              └──────────────────────────┘
```

**Key Design Decisions:**
- **Two Web Workers** — A `generalWorker` handles UI queries (EXPLAIN, single runs) and a separate `benchmarkWorker` handles heavy benchmark operations. This prevents long benchmarks from blocking the interactive UI.
- **Parameterized Inserts** — All data insertion uses bound placeholders (`?`) to prevent SQL injection and handle special characters safely.
- **Baseline `id` Indexes** — Every table gets an automatic index on its `id` column (mirroring real-world primary keys) so correlated subqueries don't degrade to O(n²) full scans by default.
- **Deterministic Synthetic Data** — The Mulberry32 PRNG is seeded with `targetRows + tableCount`, so the same volume always produces the same data — making benchmarks reproducible.

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose | Version |
|---|---|---|
| [Next.js](https://nextjs.org/) | App Router, SSR, API routes | 14.2.5 |
| [React](https://react.dev/) | UI library | 18.3.1 |
| [TypeScript](https://typescriptlang.org/) | Type safety | 5.x |
| [Zustand](https://github.com/pmndrs/zustand) | Global state management | 4.5.5 |
| [Framer Motion](https://www.framer.com/motion/) | Animations & transitions | 12.42.2 |
| [TailwindCSS](https://tailwindcss.com/) | Utility-first CSS | 3.4.6 |
| [Recharts](https://recharts.org/) | Performance charts | 2.12.7 |
| [Prism.js](https://prismjs.com/) + react-simple-code-editor | SQL syntax highlighting | 1.30.0 |
| [Radix UI](https://www.radix-ui.com/) | Accessible primitives (Dialog, Tooltip, Select) | Latest |
| [Lucide React](https://lucide.dev/) + Heroicons | Icons | Latest |

### Core Engines
| Technology | Purpose | Version |
|---|---|---|
| [sql.js](https://github.com/sql-js/sql.js/) | SQLite compiled to WebAssembly (runs in browser) | 1.12.0 |
| [node-sql-parser](https://github.com/niconi/node-sql-parser) | AST-based SQL parsing for pipeline extraction | 5.4.0 |
| [Google Gemini](https://ai.google.dev/) (`@google/generative-ai`) | AI-powered query analysis & optimization | 0.14.1 |

### Backend & Data
| Technology | Purpose | Version |
|---|---|---|
| [Drizzle ORM](https://orm.drizzle.team/) | Type-safe ORM for PostgreSQL (Save & Share) | 0.31.4 |
| [PostgreSQL](https://postgresql.org/) | Persistent storage for shared queries | 16 |
| [Zod](https://zod.dev/) | Runtime schema validation (API requests + AI responses) | 3.23.8 |

### Testing & Tooling
| Technology | Purpose | Version |
|---|---|---|
| [Vitest](https://vitest.dev/) | Unit testing | 2.1.9 |
| [ESLint](https://eslint.org/) | Linting | 8.57.0 |
| [Docker Compose](https://docs.docker.com/compose/) | Local PostgreSQL | — |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18.0.0
- **npm** ≥ 9.0.0
- A **Gemini API key** (free) — [Get one here](https://aistudio.google.com/app/apikey)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/db-optima.git
cd db-optima
npm install
```

> The `postinstall` script automatically copies the sql.js WASM binaries into `apps/web/public/`.

### 2. Configure Environment

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
# Required — powers the AI Optimizer tab
GEMINI_API_KEY=your_gemini_api_key_here

# Optional — enables Save & Share feature
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dboptima

# Optional — your app URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note:** Without `GEMINI_API_KEY`, the AI Optimizer tab won't work but everything else (Visualizer, Performance, Schema) is fully functional. Without `DATABASE_URL`, Save & Share is disabled but the rest of the app works entirely client-side.

### 3. Run the Dev Server

```bash
npm run dev
```

Visit **http://localhost:3000** — you'll be redirected to the dashboard automatically.

### 4. (Optional) Start PostgreSQL for Save & Share

```bash
docker compose -f docker/docker-compose.yml up -d
npm run db:push    # Push Drizzle schema to the database
```

### 5. (Optional) Run Tests

```bash
npm test
```

Runs the Vitest test suite covering the SQL pipeline parser, nested-loop join engine, index derivation, synthetic data generator, and SQL DDL schema importer.

---

## 📁 Project Architecture

```
db-optima/
├── apps/
│   └── web/                              # Next.js 14 Application
│       ├── public/
│       │   └── sql-wasm.wasm             # SQLite WASM binary (auto-copied)
│       ├── scripts/
│       │   └── copy-wasm.js              # Postinstall: copies WASM from node_modules
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx            # Root layout (fonts, theme provider)
│       │   │   ├── page.tsx              # Redirect → /dashboard
│       │   │   ├── providers.tsx         # ThemeProvider (dark/light mode)
│       │   │   ├── dashboard/
│       │   │   │   └── page.tsx          # Main shell: Header + SchemaPanel + Workbench
│       │   │   ├── q/[id]/
│       │   │   │   └── page.tsx          # Shared query loader → redirects to dashboard
│       │   │   └── api/
│       │   │       ├── analyze/
│       │   │       │   └── route.ts      # POST: Gemini analysis (rate-limited)
│       │   │       ├── suggest-indexes/
│       │   │       │   └── route.ts      # POST: Gemini index suggestions
│       │   │       └── queries/
│       │   │           ├── route.ts      # POST: Save query to PostgreSQL
│       │   │           └── [id]/
│       │   │               └── route.ts  # GET: Load saved query
│       │   ├── components/
│       │   │   ├── ui/
│       │   │   │   ├── Header.tsx        # Navigation, tabs, speed slider, status
│       │   │   │   ├── Workbench.tsx     # Tab content router (keeps all tabs mounted)
│       │   │   │   ├── SQLEditor.tsx     # Prism.js syntax-highlighted editor
│       │   │   │   └── ThemeToggle.tsx   # Dark/Light mode toggle
│       │   │   ├── schema/
│       │   │   │   └── SchemaPanel.tsx   # Sidebar: table editor, CSV/DDL import, datasets
│       │   │   ├── visualizer/
│       │   │   │   └── VisualizerTab.tsx # Animation engine + pipeline + results
│       │   │   ├── optimizer/
│       │   │   │   ├── OptimizerTab.tsx  # AI analysis flow + Apply & Verify
│       │   │   │   └── OptimizerResult.tsx # Results display (issues, SQL diff, indexes)
│       │   │   └── performance/
│       │   │       └── PerformanceTab.tsx # Dual editors, benchmarking, charts
│       │   ├── lib/
│       │   │   ├── sql/
│       │   │   │   ├── engine.ts         # Pipeline parser, join engine, index derivation
│       │   │   │   ├── runner.ts         # Web Worker proxy (2 workers)
│       │   │   │   ├── worker.ts         # SQLite WASM engine (850 lines — the core)
│       │   │   │   └── schemaImport.ts   # CREATE TABLE DDL parser + sample data generator
│       │   │   ├── gemini/
│       │   │   │   └── client.ts         # Gemini SDK wrapper + prompt engineering
│       │   │   ├── data/
│       │   │   │   └── datasets.ts       # 6 sample datasets + synthetic data scaler
│       │   │   └── utils/
│       │   │       ├── validators.ts     # Zod schemas for API routes
│       │   │       └── rateLimit.ts      # Sliding-window rate limiter
│       │   ├── store/
│       │   │   └── useStore.ts           # Zustand global store (all app state)
│       │   ├── types/
│       │   │   └── index.ts             # All TypeScript interfaces
│       │   └── styles/
│       │       └── globals.css           # Design tokens, theme vars, component styles
│       ├── tailwind.config.js
│       ├── next.config.js                # COOP/COEP headers for WASM
│       ├── tsconfig.json
│       └── vitest.config.ts
├── packages/
│   ├── database/                         # Drizzle ORM package
│   │   ├── db.ts                         # PostgreSQL connection pool
│   │   └── schema/
│   │       └── index.ts                  # Tables: saved_queries, optimization_history
│   └── types/                            # Shared Zod schemas
│       └── index.ts                      # OptimizationResultSchema, IndexSuggestionsSchema
├── docker/
│   └── docker-compose.yml                # PostgreSQL 16 (local dev)
├── drizzle.config.ts                     # Drizzle Kit configuration
├── vercel.json                           # Vercel deployment config
└── package.json                          # Workspace root
```

---

## 🔌 API Reference

### `POST /api/analyze`

Analyzes a SQL query using Gemini AI, grounded in real execution plan data.

| Field | Type | Required | Description |
|---|---|---|---|
| `sql` | `string` | ✅ | The SQL query to analyze |
| `schema` | `string` | ✅ | Human-readable schema description |
| `explainPlan` | `string` | ❌ | Real `EXPLAIN QUERY PLAN` output from sql.js |
| `feedback` | `string` | ❌ | Mismatch details from a previous wrong rewrite |

**Rate Limit:** 10 requests/minute per IP

**Response:** `OptimizationResult` — `{ issues, optimized_sql, explanation, index_statements, scan_type_before, scan_type_after, result_equivalence }`

---

### `POST /api/suggest-indexes`

Asks Gemini to generate `CREATE INDEX` statements for a query.

| Field | Type | Required | Description |
|---|---|---|---|
| `sql` | `string` | ✅ | The SQL query |
| `schema` | `string` | ✅ | Human-readable schema description |

**Response:** `{ indexes: string[] }` — Array of `CREATE INDEX` DDL statements

---

### `POST /api/queries`

Saves a query + schema snapshot for sharing. Requires `DATABASE_URL`.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✅ | Display name for the saved query |
| `sql` | `string` | ✅ | The SQL query |
| `schemaJson` | `TableData` | ✅ | Full table data snapshot (JSON) |

**Response:** `{ id: string }` — The shareable link ID

---

### `GET /api/queries/[id]`

Loads a previously saved query by its share link ID.

**Response:** `SavedQuery` — `{ id, name, sql, schemaJson, createdAt }`

---

## 📊 State Management

DB Optima uses a single **Zustand** store (`useStore.ts`) managing all application state across tabs:

| Category | Key State | Description |
|---|---|---|
| **Schema** | `tableData`, `activeDataset` | The in-memory database + which sample dataset is loaded |
| **Visualizer** | `visualizerSQL`, `pipeline`, `queryResult`, `isRunning`, `animSpeed` | SQL input, execution steps, results, animation state |
| **AI Optimizer** | `aiSQL`, `aiResult`, `aiAnalyzedSQL`, `aiLoading`, `aiError` | Input query, Gemini response, loading/error states |
| **Performance** | `perfOriginalSQL`, `perfOptimizedSQL`, `perfOptimizedSource`, `dataVolume` | Dual editor contents, data scale, source tracking |
| **Verification** | `verifyResult`, `verifyLoading`, `verifyError` | Apply & Verify state |
| **Re-optimize** | `aiReoptimizeAttempts`, `reoptimizeFeedback`, `reoptimizeTrigger` | Cross-tab AI retry loop (max 3 attempts) |
| **Save & Share** | `saveStatus`, `savedQueryId`, `saveError` | Persistence state |

**Cross-tab coordination:** The Performance tab can trigger the AI Optimizer to re-analyze a query via `requestAiReoptimize(feedback)`, which increments `reoptimizeTrigger` — watched by the Optimizer tab's `useEffect` to fire a new analysis.

---

## 🧪 Testing

The project includes comprehensive unit tests via **Vitest**:

```bash
npm test                        # Run all tests
npm run test -- --watch         # Watch mode
```

### Test Coverage

| Test File | What It Covers |
|---|---|
| `engine.test.ts` | `parsePipeline` (FROM, JOIN, WHERE, multiple JOINs, empty), `prefixRows`, `nestedLoopJoin` (matching, fallback keys, unqualified ON), `deriveIndexSuggestions` |
| `datasets.test.ts` | `generateSyntheticData` (scaling, column shape, FK alignment, determinism, PascalCase/UPPER detection, self-referencing PKs) |
| `schemaImport.test.ts` | `parseCreateTableStatements` (simple, multiple, IF NOT EXISTS, quoted identifiers, nested parens, constraints, comments, errors), FK parsing (table-level, inline REFERENCES, schema-qualified), `importSchemaFromSQL` (FK alignment, missing refs, case-insensitive matching) |

---

## 🌐 Deployment

### Vercel (Recommended)

```bash
npm i -g vercel
vercel --prod
```

**Required Environment Variables in Vercel Dashboard:**

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `DATABASE_URL` | ❌ | PostgreSQL URL (Neon/Supabase) — enables Save & Share |
| `NEXT_PUBLIC_APP_URL` | ❌ | Your production URL |

> **Note:** The `next.config.js` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers, which are required for the sql.js WASM module to work with `SharedArrayBuffer`.

### Docker (Local PostgreSQL)

```bash
docker compose -f docker/docker-compose.yml up -d
npm run db:push    # Push Drizzle schema
```

Default credentials: `postgres:postgres@localhost:5432/dboptima`

---

## 📐 Database Schema (Drizzle ORM)

Two tables managed via Drizzle ORM in `packages/database/schema/`:

```sql
-- Saved/shared queries
CREATE TABLE saved_queries (
  id          TEXT PRIMARY KEY,       -- 96-bit random base64url
  name        TEXT NOT NULL,
  sql         TEXT NOT NULL,
  schema_json JSONB NOT NULL,         -- Full TableData snapshot
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Optimization history (for future analytics)
CREATE TABLE optimization_history (
  id           SERIAL PRIMARY KEY,
  original_sql TEXT NOT NULL,
  result       JSONB NOT NULL,        -- Full OptimizationResult from Gemini
  created_at   TIMESTAMP DEFAULT NOW()
);
```

---

## 🧩 Monorepo Structure

DB Optima uses **npm workspaces** to manage a monorepo with three packages:

| Package | Path | Description |
|---|---|---|
| `@db-optima/web` | `apps/web/` | The Next.js application (all UI + API routes) |
| `@db-optima/database` | `packages/database/` | Drizzle ORM schema + PostgreSQL client |
| `@db-optima/types` | `packages/types/` | Shared Zod validation schemas |

**Workspace scripts** (run from root):

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript strict check
npm run test         # Vitest
npm run db:push      # Push Drizzle schema to PostgreSQL
```

---

## 🔒 Security & Rate Limiting

- **Rate Limiting** — All AI-powered API routes are rate-limited to **10 requests/minute per IP** using an in-memory sliding-window counter.
- **Parameterized Queries** — All sql.js database inserts use bound placeholders (`?`) to prevent injection.
- **Input Validation** — Every API request is validated against Zod schemas before processing.
- **AI Response Validation** — Gemini responses are parsed and validated against Zod schemas (`OptimizationResultSchema`, `IndexSuggestionsSchema`) before being returned to the client.
- **COOP/COEP Headers** — Configured in `next.config.js` for secure WASM execution.

---

## 📄 License

This project is private. All rights reserved.

---

<div align="center">
  <p>Built with ❤️ for SQL learners, database engineers, and performance enthusiasts.</p>
</div>