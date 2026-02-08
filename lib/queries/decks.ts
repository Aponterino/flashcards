import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { cards, decks } from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/db";

export interface DeckSummary {
  id: string;
  name: string;
  cardCount: number;
}

export interface DeckRecord {
  id: string;
  name: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getDecks(): Promise<DeckSummary[]> {
  try {
    await ensureDbReady();
    const db = getDb();
    return db
      .select({
        id: decks.id,
        name: decks.name,
        cardCount: sql<number>`count(${cards.id})::int`,
      })
      .from(decks)
      .leftJoin(cards, eq(cards.deckId, decks.id))
      .where(isNull(decks.deletedAt))
      .groupBy(decks.id)
      .orderBy(desc(decks.createdAt));
  } catch (error) {
    console.error("Failed to load decks", error);
    return [];
  }
}

export async function getDeckById(deckId: string): Promise<DeckRecord | null> {
  try {
    await ensureDbReady();
    const db = getDb();
    const [deck] = await db
      .select()
      .from(decks)
      .where(and(eq(decks.id, deckId), isNull(decks.deletedAt)))
      .limit(1);
    return deck ?? null;
  } catch (error) {
    console.error(`Failed to load deck ${deckId}`, error);
    return null;
  }
}

export async function getDeletedDeckById(deckId: string): Promise<DeckRecord | null> {
  try {
    await ensureDbReady();
    const db = getDb();
    const [deck] = await db
      .select()
      .from(decks)
      .where(and(eq(decks.id, deckId), isNotNull(decks.deletedAt)))
      .limit(1);
    return deck ?? null;
  } catch (error) {
    console.error(`Failed to load deleted deck ${deckId}`, error);
    return null;
  }
}

export async function createDeck(name: string): Promise<DeckRecord> {
  await ensureDbReady();
  const db = getDb();
  const [deck] = await db.insert(decks).values({ name }).returning();
  return deck;
}

export interface DeletedDeckSummary {
  id: string;
  name: string;
  cardCount: number;
  deletedAt: Date | null;
}

export async function archiveDeck(deckId: string): Promise<boolean> {
  await ensureDbReady();
  const db = getDb();
  const [deck] = await db
    .update(decks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(decks.id, deckId), isNull(decks.deletedAt)))
    .returning({ id: decks.id });

  return Boolean(deck);
}

export async function restoreDeck(deckId: string): Promise<boolean> {
  await ensureDbReady();
  const db = getDb();
  const [deck] = await db
    .update(decks)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(decks.id, deckId), isNotNull(decks.deletedAt)))
    .returning({ id: decks.id });

  return Boolean(deck);
}

export async function getDeletedDecks(): Promise<DeletedDeckSummary[]> {
  try {
    await ensureDbReady();
    const db = getDb();
    return db
      .select({
        id: decks.id,
        name: decks.name,
        cardCount: sql<number>`count(${cards.id})::int`,
        deletedAt: decks.deletedAt,
      })
      .from(decks)
      .leftJoin(cards, eq(cards.deckId, decks.id))
      .where(isNotNull(decks.deletedAt))
      .groupBy(decks.id)
      .orderBy(desc(decks.deletedAt));
  } catch (error) {
    console.error("Failed to load deleted decks", error);
    return [];
  }
}

export async function purgeDeletedDecks(): Promise<number> {
  await ensureDbReady();
  const db = getDb();
  const removedDecks = await db.delete(decks).where(isNotNull(decks.deletedAt)).returning({ id: decks.id });
  return removedDecks.length;
}
