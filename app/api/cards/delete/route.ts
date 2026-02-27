import { NextResponse } from "next/server";

import { createDeckVersionSnapshot } from "@/lib/queries/versions";
import { deleteCardsByIds } from "@/lib/queries/cards";

interface DeleteCardPayload {
  deckId?: string;
  cardId?: string;
}

export async function POST(request: Request) {
  let payload: DeleteCardPayload;

  try {
    payload = (await request.json()) as DeleteCardPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const deckId = String(payload.deckId ?? "");
  const cardId = String(payload.cardId ?? "");
  if (!deckId || !cardId) {
    return NextResponse.json({ error: "Missing deckId or cardId" }, { status: 400 });
  }

  try {
    const deletedCount = await deleteCardsByIds(deckId, [cardId]);
    if (deletedCount === 0) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    await createDeckVersionSnapshot(deckId, "Card deleted");
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(`Failed to delete card ${cardId}`, error);
    return NextResponse.json({ error: "Failed to delete card" }, { status: 500 });
  }
}
