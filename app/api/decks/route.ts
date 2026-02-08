import { NextResponse } from "next/server";
import { isNull } from "drizzle-orm";

import { decks } from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/db";

export async function GET() {
  await ensureDbReady();
  const db = getDb();
  const results = await db.select().from(decks).where(isNull(decks.deletedAt));
  return NextResponse.json(results);
}

export async function POST(request: Request) {
  let payload: { name?: unknown };

  try {
    payload = (await request.json()) as { name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rawName = typeof payload.name === "string" ? payload.name : "";
  const name = rawName.trim() || "Untitled Deck";

  try {
    await ensureDbReady();
    const db = getDb();
    const [deck] = await db.insert(decks).values({ name }).returning();
    return NextResponse.json(deck, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create deck" }, { status: 500 });
  }
}
