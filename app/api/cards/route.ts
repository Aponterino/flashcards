import { NextResponse } from "next/server";

import { cards } from "@/db/schema";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    deckId: string;
    front: string;
    back: string;
  };

  const db = getDb();
  const [card] = await db
    .insert(cards)
    .values({
      deckId: payload.deckId,
      front: payload.front,
      back: payload.back,
      dueDate: new Date(),
    })
    .returning();

  return NextResponse.json(card, { status: 201 });
}
