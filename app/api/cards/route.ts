import { NextResponse } from "next/server";

import { cards } from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/core/db";

function getTodayLocalDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function POST(request: Request) {
  let payload: {
    deckId?: unknown;
    front?: unknown;
    back?: unknown;
  };

  try {
    payload = (await request.json()) as {
      deckId?: unknown;
      front?: unknown;
      back?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const deckId = typeof payload.deckId === "string" ? payload.deckId.trim() : "";
  const front = typeof payload.front === "string" ? payload.front.trim() : "";
  const back = typeof payload.back === "string" ? payload.back.trim() : "";

  if (!deckId || !front || !back) {
    return NextResponse.json(
      { error: "deckId, front, and back are required" },
      { status: 400 }
    );
  }

  try {
    await ensureDbReady();
    const db = getDb();
    const [card] = await db
      .insert(cards)
      .values({
        deckId,
        front,
        back,
        dueDate: getTodayLocalDateISO(),
      })
      .returning();

    return NextResponse.json(card, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create card" }, { status: 500 });
  }
}
