import { NextRequest, NextResponse } from "next/server";
import { SaveQueryRequestSchema } from "@/lib/utils/validators";

export const runtime = "nodejs";

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
    const [row] = await db
      .insert(savedQueries)
      .values({ name, sql, schemaJson })
      .returning({ id: savedQueries.id }); // FIXED: explicit column

    return NextResponse.json({ id: row.id });
  } catch (err) {
    console.error("[/api/queries POST]", err);
    return NextResponse.json(
      { error: "Save failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}