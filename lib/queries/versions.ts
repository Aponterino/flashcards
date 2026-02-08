import { and, asc, count, desc, eq } from "drizzle-orm";

import { cards, deckVersionCards, deckVersions } from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/db";

export interface DeckVersionSummary {
  id: string;
  deckId: string;
  reason: string;
  createdAt: Date;
  cardCount: number;
}

export interface DeckVersionCardRecord {
  id: string;
  versionId: string;
  cardId: string;
  front: string;
  back: string;
  dueDate: string;
  intervalDays: number;
  easeFactor: string;
  createdAt: Date;
}

export async function createDeckVersionSnapshot(deckId: string, reason: string): Promise<string | null> {
  if (!deckId) {
    return null;
  }

  await ensureDbReady();
  const db = getDb();

  const [version] = await db.insert(deckVersions).values({ deckId, reason }).returning({ id: deckVersions.id });
  if (!version) {
    return null;
  }

  const deckCards = await db.select().from(cards).where(eq(cards.deckId, deckId)).orderBy(asc(cards.createdAt));
  if (deckCards.length > 0) {
    await db.insert(deckVersionCards).values(
      deckCards.map((card) => ({
        versionId: version.id,
        cardId: card.id,
        front: card.front,
        back: card.back,
        dueDate: card.dueDate,
        intervalDays: card.intervalDays,
        easeFactor: card.easeFactor,
      }))
    );
  }

  return version.id;
}

export async function getDeckVersions(deckId: string): Promise<DeckVersionSummary[]> {
  await ensureDbReady();
  const db = getDb();

  return db
    .select({
      id: deckVersions.id,
      deckId: deckVersions.deckId,
      reason: deckVersions.reason,
      createdAt: deckVersions.createdAt,
      cardCount: count(deckVersionCards.id),
    })
    .from(deckVersions)
    .leftJoin(deckVersionCards, eq(deckVersionCards.versionId, deckVersions.id))
    .where(eq(deckVersions.deckId, deckId))
    .groupBy(deckVersions.id)
    .orderBy(desc(deckVersions.createdAt));
}

export async function getDeckVersionCards(versionId: string, deckId: string): Promise<DeckVersionCardRecord[]> {
  await ensureDbReady();
  const db = getDb();

  return db
    .select({
      id: deckVersionCards.id,
      versionId: deckVersionCards.versionId,
      cardId: deckVersionCards.cardId,
      front: deckVersionCards.front,
      back: deckVersionCards.back,
      dueDate: deckVersionCards.dueDate,
      intervalDays: deckVersionCards.intervalDays,
      easeFactor: deckVersionCards.easeFactor,
      createdAt: deckVersionCards.createdAt,
    })
    .from(deckVersionCards)
    .innerJoin(deckVersions, eq(deckVersions.id, deckVersionCards.versionId))
    .where(and(eq(deckVersions.deckId, deckId), eq(deckVersionCards.versionId, versionId)))
    .orderBy(asc(deckVersionCards.createdAt));
}

export async function restoreDeckFromVersion(deckId: string, versionId: string): Promise<boolean> {
  await ensureDbReady();
  const db = getDb();
  const snapshotCards = await getDeckVersionCards(versionId, deckId);

  await db.transaction(async (tx) => {
    await tx.delete(cards).where(eq(cards.deckId, deckId));

    if (snapshotCards.length > 0) {
      await tx.insert(cards).values(
        snapshotCards.map((card) => ({
          id: card.cardId,
          deckId,
          front: card.front,
          back: card.back,
          dueDate: card.dueDate,
          intervalDays: card.intervalDays,
          easeFactor: card.easeFactor,
        }))
      );
    }
  });

  return true;
}

export async function restoreCardFromVersion(deckId: string, versionCardId: string): Promise<boolean> {
  await ensureDbReady();
  const db = getDb();

  const [snapshotCard] = await db
    .select({
      id: deckVersionCards.id,
      cardId: deckVersionCards.cardId,
      front: deckVersionCards.front,
      back: deckVersionCards.back,
      dueDate: deckVersionCards.dueDate,
      intervalDays: deckVersionCards.intervalDays,
      easeFactor: deckVersionCards.easeFactor,
      versionDeckId: deckVersions.deckId,
    })
    .from(deckVersionCards)
    .innerJoin(deckVersions, eq(deckVersions.id, deckVersionCards.versionId))
    .where(and(eq(deckVersionCards.id, versionCardId), eq(deckVersions.deckId, deckId)))
    .limit(1);

  if (!snapshotCard) {
    return false;
  }

  const [existing] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, snapshotCard.cardId), eq(cards.deckId, deckId)))
    .limit(1);

  if (existing) {
    await db
      .update(cards)
      .set({
        front: snapshotCard.front,
        back: snapshotCard.back,
        dueDate: snapshotCard.dueDate,
        intervalDays: snapshotCard.intervalDays,
        easeFactor: snapshotCard.easeFactor,
        updatedAt: new Date(),
      })
      .where(eq(cards.id, existing.id));
    return true;
  }

  await db.insert(cards).values({
    id: snapshotCard.cardId,
    deckId,
    front: snapshotCard.front,
    back: snapshotCard.back,
    dueDate: snapshotCard.dueDate,
    intervalDays: snapshotCard.intervalDays,
    easeFactor: snapshotCard.easeFactor,
  });

  return true;
}
