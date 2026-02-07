"use server";

import { revalidatePath } from "next/cache";

import { createCard } from "@/lib/queries/cards";
import { createDeck } from "@/lib/queries/decks";

export async function createDeckAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  await createDeck(name || "Untitled Deck");
  revalidatePath("/");
  revalidatePath("/decks");
}

export async function createCardAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  const front = String(formData.get("front") || "").trim();
  const back = String(formData.get("back") || "").trim();

  if (!deckId || !front || !back) {
    return;
  }

  await createCard({ deckId, front, back });
  revalidatePath(`/decks/${deckId}`);
}
