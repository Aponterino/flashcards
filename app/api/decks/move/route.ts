import { NextResponse } from "next/server";

import { DeckHierarchyError, moveDeckToParent } from "@/lib/queries/decks";

interface MoveDeckPayload {
  deckId?: unknown;
  parentDeckId?: unknown;
  afterDeckId?: unknown;
}

export async function POST(request: Request) {
  let payload: MoveDeckPayload;

  try {
    payload = (await request.json()) as MoveDeckPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const deckId = typeof payload.deckId === "string" ? payload.deckId.trim() : "";
  const parentDeckId =
    typeof payload.parentDeckId === "string" ? payload.parentDeckId.trim() || null : payload.parentDeckId === null ? null : null;
  const afterDeckId =
    typeof payload.afterDeckId === "string" ? payload.afterDeckId.trim() || null : payload.afterDeckId === null ? null : null;

  if (!deckId) {
    return NextResponse.json({ error: "deckId is required" }, { status: 400 });
  }

  try {
    const movedDeck = await moveDeckToParent(deckId, parentDeckId, afterDeckId);
    return NextResponse.json({ id: movedDeck.id, parentDeckId: movedDeck.parentDeckId }, { status: 200 });
  } catch (error) {
    if (error instanceof DeckHierarchyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`Failed to move deck ${deckId}`, error);
    return NextResponse.json({ error: "Failed to move deck" }, { status: 500 });
  }
}
