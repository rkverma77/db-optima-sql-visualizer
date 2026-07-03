import { NextRequest, NextResponse } from "next/server";
import { analyzeQuery } from "@/lib/gemini/client";
import { AnalyzeRequestSchema } from "@/lib/utils/validators";

export const runtime = "nodejs"; // Gemini SDK uses Node APIs

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = AnalyzeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sql, schema, explainPlan } = parsed.data;
    const result = await analyzeQuery(sql, schema, explainPlan);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/analyze]", err);
    return NextResponse.json(
      { error: "Analysis failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}
