import { GoogleGenerativeAI } from "@google/generative-ai";
import type { OptimizationResult } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MODEL = "gemini-2.5-flash"; // FIXED: was gemini-2.5-flash (doesn't exist)

export function getModel() {
  return genAI.getGenerativeModel({ model: MODEL });
}

/**
 * Analyse a SQL query and return structured optimisation suggestions.
 */
export async function analyzeQuery(
  sql: string,
  schemaDescription: string,
  explainPlan?: string
): Promise<OptimizationResult> {
  const model = getModel();

  const planSection = explainPlan
    ? `\nActual SQLite EXPLAIN QUERY PLAN output for this query against the current data (ground truth):\n${explainPlan}\n`
    : "";

  const prompt = `You are a senior SQLite performance engineer.
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
- optimized_sql: a fully corrected, production-ready rewrite using SQLite syntax
- explanation: ≤200 words, plain English
- index_statements: exact DDL the user can run immediately
- scan_type_before: base this on the actual EXPLAIN QUERY PLAN output below if provided
- scan_type_after: the scan type you expect once index_statements are applied
${planSection}
Schema:
${schemaDescription}

Query:
${sql}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const clean = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();

  try {
    return JSON.parse(clean) as OptimizationResult;
  } catch (parseErr) {
    console.error("Gemini raw response:", text);
    throw new Error("AI returned malformed JSON. Please retry.");
  }
}

/**
 * Ask Gemini to generate only CREATE INDEX statements.
 */
export async function suggestIndexes(
  sql: string,
  schemaDescription: string
): Promise<string[]> {
  const model = getModel();

  const prompt = `You are a SQLite DBA.
Return ONLY a JSON array of CREATE INDEX statements — no extra text, no markdown.
Example: ["CREATE INDEX idx_orders_cid ON orders(customer_id);"]

Schema:
${schemaDescription}

Query:
${sql}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const clean = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();

  try {
    return JSON.parse(clean) as string[];
  } catch (parseErr) {
    console.error("Gemini raw response:", text);
    throw new Error("AI returned malformed JSON. Please retry.");
  }
}