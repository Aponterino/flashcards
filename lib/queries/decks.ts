import { desc, eq, sql } from "drizzle-orm";

import { cards, decks } from "@/db/schema";
import { getDb } from "@/lib/db";

export interface DeckSummary {
  id: string;
  name: string;
  cardCount: number;
}

export interface DeckRecord {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function getDecks(): Promise<DeckSummary[]> {
  const db = getDb();
  return db
    .select({
      id: decks.id,
      name: decks.name,
      cardCount: sql<number>`count(${cards.id})`,
    })
    .from(decks)
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .groupBy(decks.id)
    .orderBy(desc(decks.createdAt));
}

export async function getDeckById(deckId: string): Promise<DeckRecord | null> {
  const db = getDb();
  const [deck] = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
  return deck ?? null;
}

export async function createDeck(name: string): Promise<DeckRecord> {
  const db = getDb();
  const [deck] = await db.insert(decks).values({ name }).returning();
  return deck;
}
