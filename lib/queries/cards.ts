import { asc, eq } from "drizzle-orm";

import { cards } from "@/db/schema";
import { getDb } from "@/lib/db";

export interface CardRecord {
  id: string;
  deckId: string;
  front: string;
  back: string;
  dueDate: Date;
  intervalDays: number;
  easeFactor: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function getCardsByDeck(deckId: string): Promise<CardRecord[]> {
  const db = getDb();
  return db.select().from(cards).where(eq(cards.deckId, deckId)).orderBy(asc(cards.dueDate));
}

export async function createCard(payload: {
  deckId: string;
  front: string;
  back: string;
}): Promise<CardRecord> {
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

  return card;
}
