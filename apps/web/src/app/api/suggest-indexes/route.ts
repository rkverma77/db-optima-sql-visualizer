import { NextRequest, NextResponse } from "next/server";
import { suggestIndexes } from "@/lib/gemini/client";
import { SuggestIndexesRequestSchema } from "@/lib/utils/validators";
import { checkRateLimit, getClientIp } from "@/lib/utils/rateLimit";

export const runtime = "nodejs";

const LIMIT = 10;
const WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`suggest-indexes:${ip}`, LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests", message: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

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