import { GoogleGenerativeAI } from "@google/generative-ai";
import type { OptimizationResult } from "@/types";

// Initialise once — key lives server-side only (never exposed to browser)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MODEL = "gemini-2.5-flash"; // fast, cost-efficient for SQL analysis

/** Shared helper: get the generative model */
export function getModel() {
  return genAI.getGenerativeModel({ model: MODEL });
}

/**
 * Analyse a SQL query and return structured optimisation suggestions.
 * Called from the Next.js API route — never from the client directly.
 */
export async function analyzeQuery(
  sql: string,
  schemaDescription: string,
  explainPlan?: string
): Promise<OptimizationResult> {
  const model = getModel();

  const planSection = explainPlan
    ? `\nActual SQLite EXPLAIN QUERY PLAN output for this query against the current data (ground truth — use this instead of guessing the current plan):\n${explainPlan}\n`
    : "";

  const prompt = `You are a senior PostgreSQL performance engineer.
Analyse the SQL query below against the provided schema.
Respond ONLY with a valid JSON object — no markdown fences, no preamble.

JSON shape:
{
  "issues": [{ "severity": "high|medium|low", "description": "..." }],
  "optimized_sql": "...",
  "explanation": "...",
  "index_statements": ["CREATE INDEX ...", "..."],
  "scan_type_before": "...",
  "scan_type_after": "..."
}

Rules:
- issues: list every anti-pattern (implicit JOIN, SELECT *, missing WHERE, Cartesian product, etc.)
- optimized_sql: a fully corrected, production-ready rewrite
- explanation: ≤200 words, plain English
- index_statements: exact DDL the user can run immediately
- scan_type_before: base this on the actual EXPLAIN QUERY PLAN output below if provided, not a guess
- scan_type_after: the scan type you expect once index_statements are applied, e.g. "Index Scan via idx_orders_customer_id"
${planSection}
Schema:
${schemaDescription}

Query:
${sql}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip accidental markdown fences if the model adds them
  const clean = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();

  return JSON.parse(clean) as OptimizationResult;
}

/**
 * Ask Gemini to generate only the CREATE INDEX statements for a query.
 * Used by the /api/suggest-indexes route.
 */
export async function suggestIndexes(
  sql: string,
  schemaDescription: string
): Promise<string[]> {
  const model = getModel();

  const prompt = `You are a PostgreSQL DBA.
Return ONLY a JSON array of CREATE INDEX statements — no extra text, no markdown.
Example: ["CREATE INDEX idx_orders_cid ON orders(customer_id);"]

Schema:
${schemaDescription}

Query:
${sql}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const clean = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(clean) as string[];
}
