import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { SaveQueryRequestSchema } from "@/lib/utils/validators";

export const runtime = "nodejs";

/**
 * Opaque, URL-safe, non-enumerable id for a saved query's public share link.
 * 12 random bytes → 16 base64url chars ≈ 96 bits of entropy, plenty to make
 * guessing/scanning infeasible for a share-link use case.
 */
function generateSavedQueryId(): string {
  return randomBytes(12).toString("base64url");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SaveQueryRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        {
          error: "Saving is not configured",
          message:
            "Set DATABASE_URL (see docker/docker-compose.yml) to enable saved/shareable queries.",
        },
        { status: 501 }
      );
    }

    const { db } = await import("@db-optima/database");
    const { savedQueries } = await import("@db-optima/database/schema");

    const { name, sql, schemaJson } = parsed.data;
    const id = generateSavedQueryId();
    await db.insert(savedQueries).values({ id, name, sql, schemaJson });

    return NextResponse.json({ id });
  } catch (err) {
    console.error("[/api/queries POST]", err);
    return NextResponse.json(
      { error: "Save failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}