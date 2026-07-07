import { NextRequest, NextResponse } from "next/server";
import { analyzeQuery } from "@/lib/gemini/client";
import { AnalyzeRequestSchema } from "@/lib/utils/validators";
import { checkRateLimit, getClientIp } from "@/lib/utils/rateLimit";

export const runtime = "nodejs"; // Gemini SDK uses Node APIs

// 10 requests per minute per IP — generous for a real user clicking "Optimize
// with AI" repeatedly, tight enough to blunt scripted abuse of the Gemini quota.
const LIMIT = 10;
const WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`analyze:${ip}`, LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests", message: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  try {
    const body = await req.json();
    const parsed = AnalyzeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sql, schema, explainPlan, feedback } = parsed.data;
    const result = await analyzeQuery(sql, schema, explainPlan, feedback);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/analyze]", err);
    return NextResponse.json(
      { error: "Analysis failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}