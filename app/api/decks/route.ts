import { NextResponse } from "next/server";

import { decks } from "@/db/schema";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const results = await db.select().from(decks);
  return NextResponse.json(results);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as { name?: string };
  const name = payload.name?.trim() || "Untitled Deck";

  const db = getDb();
  const [deck] = await db.insert(decks).values({ name }).returning();
  return NextResponse.json(deck, { status: 201 });
}
