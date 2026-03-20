import { NextResponse } from "next/server";

import { createDeckWithParent, DeckHierarchyError, getDecks } from "@/lib/decks/deckQueries";

export async function GET() {
  const results = await getDecks();
  return NextResponse.json(results, { status: 200 });
}

export async function POST(request: Request) {
  let payload: { name?: unknown; parentDeckId?: unknown };

  try {
    payload = (await request.json()) as { name?: unknown; parentDeckId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rawName = typeof payload.name === "string" ? payload.name : "";
  const name = rawName.trim() || "Untitled Deck";
  const parentDeckIdRaw = typeof payload.parentDeckId === "string" ? payload.parentDeckId.trim() : "";
  const parentDeckId = parentDeckIdRaw || null;

  try {
    const deck = await createDeckWithParent(name, parentDeckId);
    return NextResponse.json(deck, { status: 201 });
  } catch (error) {
    if (error instanceof DeckHierarchyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to create deck" }, { status: 500 });
  }
}
