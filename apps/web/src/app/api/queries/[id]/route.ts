import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        error: "Loading is not configured",
        message: "Set DATABASE_URL to enable saved/shareable queries.",
      },
      { status: 501 }
    );
  }

  try {
    const { db } = await import("@db-optima/database");
    const { savedQueries } = await import("@db-optima/database/schema");

    const [row] = await db.select().from(savedQueries).where(eq(savedQueries.id, id)).limit(1);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error("[/api/queries/[id] GET]", err);
    return NextResponse.json(
      { error: "Load failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}
