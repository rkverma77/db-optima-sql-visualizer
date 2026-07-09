import { GoogleGenerativeAI } from "@google/generative-ai";
import { OptimizationResultSchema, IndexSuggestionsSchema } from "@db-optima/types";
import type { OptimizationResult } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MODEL = "gemini-2.5-flash"; // confirmed current stable model string (ai.google.dev/gemini-api/docs/models)

export function getModel() {
  return genAI.getGenerativeModel({ model: MODEL });
}

/**
 * Analyse a SQL query and return structured optimisation suggestions.
 */
export async function analyzeQuery(
  sql: string,
  schemaDescription: string,
  explainPlan?: string,
  feedback?: string
): Promise<OptimizationResult> {
  const model = getModel();

  const planSection = explainPlan
    ? `\nActual SQLite EXPLAIN QUERY PLAN output for this query against the current data (ground truth):\n${explainPlan}\n`
    : "";

  // Present only when this is a retry after a PREVIOUS optimized_sql from
  // this tool was benchmarked against real SQLite execution — not the
  // model's own self-reported result_equivalence check — and found to
  // actually return different rows/columns/values than the original. This
  // is empirical proof of a wrong rewrite, so it's weighted much higher
  // than "please double check."
  const feedbackSection = feedback
    ? `\nIMPORTANT — RETRY AFTER A CONFIRMED WRONG REWRITE:\nA previous attempt at optimizing this exact query produced an optimized_sql that was actually run against real data in SQLite and empirically confirmed WRONG — not a self-check, a real execution diff:\n${feedback}\nDo not repeat this same rewrite or make the same category of mistake again. Re-derive optimized_sql from scratch, reasoning carefully step-by-step about row-for-row, column-for-column equivalence with the original query before finalizing it. If you are not fully confident the new rewrite is equivalent, set result_equivalence.equivalent to false and say so explicitly rather than guessing green again.\n`
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
  "scan_type_after": "...",
  "result_equivalence": { "equivalent": true, "reasoning": "..." }
}

Rules:
- issues: list every anti-pattern (implicit JOIN, SELECT *, missing WHERE, Cartesian product, etc.)
- optimized_sql: a fully corrected, production-ready rewrite using SQLite syntax
  - Before finalizing optimized_sql, run this general verification procedure — it applies to
    ANY SQL construct you touch, not just the examples named below (joins, correlated/scalar
    subqueries, EXISTS/NOT EXISTS, IN/NOT IN, UNION vs UNION ALL, DISTINCT, GROUP BY and
    aggregates, window functions, CTEs, LIMIT/OFFSET, ORDER BY, set operations — whatever is
    actually present in this query):
    1. For every row the ORIGINAL query returns, walk through why the rewrite also returns it
       (same columns, same values, same multiplicity — duplicated once means duplicated once in
       the rewrite too, unless the original had explicit DISTINCT/GROUP BY semantics).
    2. For every row the ORIGINAL query does NOT return (filtered out, deduplicated, or never
       matched), walk through why the rewrite also excludes it.
    3. Do this for EACH construct you changed, one at a time — rewriting three things at once
       and only checking the first one is how mistakes slip through.
    4. A specific, common instance of this general check: replacing a correlated scalar
       subquery in the SELECT list with a JOIN changes NULL-vs-dropped-row semantics unless you
       use LEFT JOIN (the subquery form keeps the outer row and returns NULL on no match; INNER
       JOIN drops the row instead) — but treat this as one example of the procedure above, not
       the only case worth checking.+
  - Do not ship a rewrite you cannot verify. If you cannot find a rewrite that is both faster
    and provably equivalent, prefer a smaller, safer optimization (e.g. add indexes only, or
    convert only the parts you're sure about) over a bigger rewrite that changes behavior. As a
    last resort, optimized_sql may equal the original query with only index_statements added —
    that is a valid answer and better than a faster-but-wrong query.
  - Never return an optimized_sql that you go on to mark equivalent:false — those two fields
    must agree. If your best rewrite isn't provably equivalent, keep revising it (falling back
    to the previous bullet if needed) until optimized_sql and result_equivalence agree, rather
    than reporting a rewrite you already know is wrong.
- explanation: ≤200 words, plain English
- index_statements: exact DDL the user can run immediately
- scan_type_before: base this on the actual EXPLAIN QUERY PLAN output below if provided
- scan_type_after: the scan type you expect once index_statements are applied
- result_equivalence: you MUST reason step-by-step (internally) about whether optimized_sql
  returns the exact same result set as the original query for ANY valid data in this schema,
  not just the sample data — same rows, same columns, same values. Only differences in row
  ORDER are allowed to be ignored (treat the result as a set) unless the original query has an
  explicit ORDER BY that must be preserved.
  - Apply the same general row-preserved/row-excluded reasoning from the optimized_sql rules
    above here too — the list below is a set of examples this has caught before, not the
    complete list of things that can go wrong. Watch for, among others: rewriting an implicit CROSS/comma JOIN as an INNER JOIN and
    accidentally changing which rows survive; adding/removing DISTINCT; changing LEFT JOIN to
    INNER JOIN (drops unmatched rows); changing aggregate functions or GROUP BY columns;
    adding a LIMIT that wasn't there; narrowing or widening the SELECT column list; adding a
    WHERE/HAVING predicate that filters out rows the original query returned; changing JOIN
    conditions in a way that changes cardinality (fan-out/fan-in).
  - "equivalent": true only if you are confident optimized_sql is guaranteed to return the same
    result set as the original for any data. If the rewrite intentionally changes behavior (e.g.
    fixes a real correctness bug in the original), or you are not fully certain, set it to false.
  - "reasoning": ≤80 words. If equivalent is false, explicitly name the specific difference
    (e.g. "original used LEFT JOIN so customers with no orders were included; optimized_sql
    uses INNER JOIN which drops them") — this must be specific enough for a human to verify by
    running both queries, not a vague disclaimer.
${planSection}${feedbackSection}
Schema:
${schemaDescription}

Query:
${sql}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(clean);
  } catch (parseErr) {
    console.error("Gemini raw response:", text);
    throw new Error("AI returned malformed JSON. Please retry.");
  }

  const validated = OptimizationResultSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error("Gemini response failed schema validation:", validated.error.flatten(), "raw:", text);
    throw new Error("AI returned an unexpected response shape. Please retry.");
  }

  return validated.data as OptimizationResult;
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
  const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(clean);
  } catch (parseErr) {
    console.error("Gemini raw response:", text);
    throw new Error("AI returned malformed JSON. Please retry.");
  }

  const validated = IndexSuggestionsSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error("Gemini response failed schema validation:", validated.error.flatten(), "raw:", text);
    throw new Error("AI returned an unexpected response shape. Please retry.");
  }

  return validated.data;
}