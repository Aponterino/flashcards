import { NextResponse } from "next/server";

import { swapCardFrontBackByDeck } from "@/lib/cards/cardQueries";
import { createDeckVersionSnapshot } from "@/lib/decks/deckVersionQueries";

interface SwapAllPayload {
  deckId?: unknown;
}

export async function POST(request: Request) {
  let payload: SwapAllPayload;

  try {
    payload = (await request.json()) as SwapAllPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const deckId = typeof payload.deckId === "string" ? payload.deckId.trim() : "";
  if (!deckId) {
    return NextResponse.json({ error: "deckId is required" }, { status: 400 });
  }

  try {
    const swappedCount = await swapCardFrontBackByDeck(deckId);
    if (swappedCount === 0) {
      return NextResponse.json({ error: "No cards to swap" }, { status: 404 });
    }

    await createDeckVersionSnapshot(deckId, `Swapped front/back on ${swappedCount} cards`);
    return NextResponse.json({ success: true, swappedCount }, { status: 200 });
  } catch (error) {
    console.error(`Failed to swap all cards for deck ${deckId}`, error);
    return NextResponse.json({ error: "Failed to swap all cards" }, { status: 500 });
  }
}
