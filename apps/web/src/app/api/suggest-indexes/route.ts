import { NextRequest, NextResponse } from "next/server";
import { suggestIndexes } from "@/lib/gemini/client";
import { SuggestIndexesRequestSchema } from "@/lib/utils/validators";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SuggestIndexesRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sql, schema } = parsed.data;
    const indexes = await suggestIndexes(sql, schema);

    return NextResponse.json({ indexes });
  } catch (err) {
    console.error("[/api/suggest-indexes]", err);
    return NextResponse.json(
      { error: "Index suggestion failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}
