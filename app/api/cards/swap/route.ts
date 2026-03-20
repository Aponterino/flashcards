import { NextResponse } from "next/server";

import { swapCardFrontBackById } from "@/lib/cards/cardQueries";
import { createDeckVersionSnapshot } from "@/lib/decks/deckVersionQueries";

interface SwapPayload {
  cardId?: unknown;
  deckId?: unknown;
}

export async function POST(request: Request) {
  let payload: SwapPayload;

  try {
    payload = (await request.json()) as SwapPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const deckId = typeof payload.deckId === "string" ? payload.deckId.trim() : "";
  const cardId = typeof payload.cardId === "string" ? payload.cardId.trim() : "";
  if (!deckId || !cardId) {
    return NextResponse.json({ error: "deckId and cardId are required" }, { status: 400 });
  }

  try {
    const swapped = await swapCardFrontBackById(deckId, cardId);
    if (!swapped) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    await createDeckVersionSnapshot(deckId, "Card front/back swapped");
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(`Failed to swap card ${cardId}`, error);
    return NextResponse.json({ error: "Failed to swap card" }, { status: 500 });
  }
}
