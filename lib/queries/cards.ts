import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { cards } from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/db";
import { getDeckScopeIds } from "@/lib/queries/decks";

export interface CardRecord {
  id: string;
  deckId: string;
  front: string;
  back: string;
  dueDate: string;
  intervalDays: number;
  easeFactor: string;
  lastDifficulty: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReviewDifficulty = "hard" | "medium" | "easy";

function getTodayLocalDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addDaysToIsoDate(dateIso: string, daysToAdd: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(year, month - 1, day + daysToAdd);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function toNumericEaseFactor(value: string): number {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return 2.5;
  }

  return clamp(numeric, 1.3, 3.5);
}

function calculateReviewedSchedule(
  currentIntervalDays: number,
  currentEaseFactor: number,
  difficulty: ReviewDifficulty
): { intervalDays: number; easeFactor: number } {
  if (difficulty === "hard") {
    return {
      intervalDays: Math.max(1, Math.round(currentIntervalDays * 1.2)),
      easeFactor: clamp(currentEaseFactor - 0.15, 1.3, 3.5),
    };
  }

  if (difficulty === "medium") {
    return {
      intervalDays: Math.max(1, Math.round(currentIntervalDays * currentEaseFactor)),
      easeFactor: clamp(currentEaseFactor, 1.3, 3.5),
    };
  }

  return {
    intervalDays: Math.max(2, Math.round(currentIntervalDays * (currentEaseFactor + 0.15) * 1.3)),
    easeFactor: clamp(currentEaseFactor + 0.15, 1.3, 3.5),
  };
}

export async function getCardsByDeck(deckId: string): Promise<CardRecord[]> {
  try {
    await ensureDbReady();
    const db = getDb();
    return db.select().from(cards).where(eq(cards.deckId, deckId)).orderBy(asc(cards.dueDate));
  } catch (error) {
    console.error(`Failed to load cards for deck ${deckId}`, error);
    return [];
  }
}

export async function getCardsByDeckIds(deckIds: string[]): Promise<CardRecord[]> {
  if (deckIds.length === 0) {
    return [];
  }

  try {
    await ensureDbReady();
    const db = getDb();
    return db.select().from(cards).where(inArray(cards.deckId, deckIds)).orderBy(asc(cards.dueDate));
  } catch (error) {
    console.error("Failed to load cards for decks", error);
    return [];
  }
}

export async function getCardsForStudyDeck(deckId: string): Promise<CardRecord[]> {
  const scopeDeckIds = await getDeckScopeIds(deckId);
  return getCardsByDeckIds(scopeDeckIds);
}

export async function createCard(payload: {
  deckId: string;
  front: string;
  back: string;
}): Promise<CardRecord> {
  await ensureDbReady();
  const db = getDb();
  const [card] = await db
    .insert(cards)
    .values({
      deckId: payload.deckId,
      front: payload.front,
      back: payload.back,
      dueDate: getTodayLocalDateISO(),
      lastDifficulty: null,
    })
    .returning();

  return card;
}

export async function createCards(
  payload: Array<{
    deckId: string;
    front: string;
    back: string;
    dueDate?: string;
    intervalDays?: number;
    easeFactor?: string;
    lastDifficulty?: ReviewDifficulty | null;
  }>
): Promise<number> {
  const insertedIds = await createCardsWithIds(payload);
  return insertedIds.length;
}

export async function createCardsWithIds(
  payload: Array<{
    deckId: string;
    front: string;
    back: string;
    dueDate?: string;
    intervalDays?: number;
    easeFactor?: string;
    lastDifficulty?: ReviewDifficulty | null;
  }>
): Promise<string[]> {
  if (payload.length === 0) {
    return [];
  }

  await ensureDbReady();
  const db = getDb();
  const values = payload.map((item) => ({
    deckId: item.deckId,
    front: item.front,
    back: item.back,
    dueDate: item.dueDate ?? getTodayLocalDateISO(),
    intervalDays: item.intervalDays ?? 1,
    easeFactor: item.easeFactor ?? "2.50",
    lastDifficulty: item.lastDifficulty ?? null,
  }));

  const inserted = await db.insert(cards).values(values).returning({ id: cards.id });
  return inserted.map((card) => card.id);
}

export async function updateCard(payload: {
  id: string;
  deckId: string;
  front: string;
  back: string;
}): Promise<CardRecord | null> {
  await ensureDbReady();
  const db = getDb();
  const [card] = await db
    .update(cards)
    .set({
      front: payload.front,
      back: payload.back,
      updatedAt: new Date(),
    })
    .where(and(eq(cards.id, payload.id), eq(cards.deckId, payload.deckId)))
    .returning();

  return card ?? null;
}

export async function deleteCardsByIds(deckId: string, cardIds: string[]): Promise<number> {
  if (cardIds.length === 0) {
    return 0;
  }

  await ensureDbReady();
  const db = getDb();
  const removed = await db
    .delete(cards)
    .where(and(eq(cards.deckId, deckId), inArray(cards.id, cardIds)))
    .returning({ id: cards.id });

  return removed.length;
}

export async function swapCardFrontBackByDeck(deckId: string): Promise<number> {
  await ensureDbReady();
  const db = getDb();
  const swapped = await db
    .update(cards)
    .set({
      front: sql`${cards.back}`,
      back: sql`${cards.front}`,
      updatedAt: new Date(),
    })
    .where(eq(cards.deckId, deckId))
    .returning({ id: cards.id });

  return swapped.length;
}

export async function swapCardFrontBackById(deckId: string, cardId: string): Promise<boolean> {
  await ensureDbReady();
  const db = getDb();
  const [swapped] = await db
    .update(cards)
    .set({
      front: sql`${cards.back}`,
      back: sql`${cards.front}`,
      updatedAt: new Date(),
    })
    .where(and(eq(cards.deckId, deckId), eq(cards.id, cardId)))
    .returning({ id: cards.id });

  return Boolean(swapped);
}

export async function resetDeckCardStudyState(deckId: string): Promise<number> {
  await ensureDbReady();
  const db = getDb();

  const reset = await db
    .update(cards)
    .set({
      dueDate: getTodayLocalDateISO(),
      intervalDays: 1,
      easeFactor: "2.50",
      lastDifficulty: null,
      updatedAt: new Date(),
    })
    .where(eq(cards.deckId, deckId))
    .returning({ id: cards.id });

  return reset.length;
}

export async function reviewCard(cardId: string, difficulty: ReviewDifficulty): Promise<CardRecord | null> {
  await ensureDbReady();
  const db = getDb();

  const [existing] = await db
    .select({
      id: cards.id,
      deckId: cards.deckId,
      intervalDays: cards.intervalDays,
      easeFactor: cards.easeFactor,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!existing) {
    return null;
  }

  const currentIntervalDays = Math.max(existing.intervalDays, 1);
  const currentEaseFactor = toNumericEaseFactor(existing.easeFactor);
  const nextSchedule = calculateReviewedSchedule(currentIntervalDays, currentEaseFactor, difficulty);

  const [updated] = await db
    .update(cards)
    .set({
      dueDate: addDaysToIsoDate(getTodayLocalDateISO(), nextSchedule.intervalDays),
      intervalDays: nextSchedule.intervalDays,
      easeFactor: nextSchedule.easeFactor.toFixed(2),
      lastDifficulty: difficulty,
      updatedAt: new Date(),
    })
    .where(eq(cards.id, cardId))
    .returning();

  return updated ?? null;
}
