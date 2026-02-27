import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { cards, decks } from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/db";

export interface DeckSummary {
  id: string;
  name: string;
  parentDeckId: string | null;
  sortOrder: number;
  cardCount: number;
  childCount: number;
}

export interface DeckRecord {
  id: string;
  name: string;
  parentDeckId: string | null;
  sortOrder: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DeckHierarchyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckHierarchyError";
  }
}

async function getActiveDeckRows(): Promise<
  Array<{
    id: string;
    name: string;
    parentDeckId: string | null;
    sortOrder: number;
    createdAt: Date;
  }>
> {
  await ensureDbReady();
  const db = getDb();
  return db
    .select({
      id: decks.id,
      name: decks.name,
      parentDeckId: decks.parentDeckId,
      sortOrder: decks.sortOrder,
      createdAt: decks.createdAt,
    })
    .from(decks)
    .where(isNull(decks.deletedAt))
    .orderBy(asc(decks.sortOrder), desc(decks.createdAt));
}

async function getCardCounts(deckIds: string[]): Promise<Map<string, number>> {
  if (deckIds.length === 0) {
    return new Map();
  }

  const db = getDb();
  const rows = await db
    .select({
      deckId: cards.deckId,
      cardCount: sql<number>`count(${cards.id})::int`,
    })
    .from(cards)
    .where(inArray(cards.deckId, deckIds))
    .groupBy(cards.deckId);

  return new Map(rows.map((row) => [row.deckId, row.cardCount]));
}

function isSameParent(parentA: string | null, parentB: string | null): boolean {
  return (parentA ?? null) === (parentB ?? null);
}

function sortSiblingDecks<T extends { sortOrder: number; createdAt: Date }>(decksToSort: T[]): T[] {
  return [...decksToSort].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

async function getNextSiblingSortOrder(parentDeckId: string | null): Promise<number> {
  await ensureDbReady();
  const db = getDb();
  const whereClause = parentDeckId
    ? and(eq(decks.parentDeckId, parentDeckId), isNull(decks.deletedAt))
    : and(isNull(decks.parentDeckId), isNull(decks.deletedAt));

  const [row] = await db
    .select({
      maxSortOrder: sql<number>`coalesce(max(${decks.sortOrder}), -1)::int`,
    })
    .from(decks)
    .where(whereClause);

  return (row?.maxSortOrder ?? -1) + 1;
}

export async function getDecks(): Promise<DeckSummary[]> {
  try {
    const deckRows = await getActiveDeckRows();
    const directCardCounts = await getCardCounts(deckRows.map((deck) => deck.id));
    const childCounts = deckRows.reduce<Map<string, number>>((map, deck) => {
      if (!deck.parentDeckId) {
        return map;
      }
      map.set(deck.parentDeckId, (map.get(deck.parentDeckId) ?? 0) + 1);
      return map;
    }, new Map());
    const childrenByParent = deckRows.reduce<Map<string, string[]>>((map, deck) => {
      if (!deck.parentDeckId) {
        return map;
      }
      const existing = map.get(deck.parentDeckId) ?? [];
      existing.push(deck.id);
      map.set(deck.parentDeckId, existing);
      return map;
    }, new Map());
    const aggregateCardCountCache = new Map<string, number>();
    const computeAggregateCardCount = (id: string, stack = new Set<string>()): number => {
      const cached = aggregateCardCountCache.get(id);
      if (typeof cached === "number") {
        return cached;
      }

      if (stack.has(id)) {
        return directCardCounts.get(id) ?? 0;
      }

      const direct = directCardCounts.get(id) ?? 0;
      const children = childrenByParent.get(id) ?? [];
      const nextStack = new Set(stack);
      nextStack.add(id);
      const total = children.reduce((sum, childId) => sum + computeAggregateCardCount(childId, nextStack), direct);
      aggregateCardCountCache.set(id, total);
      return total;
    };

    return deckRows.map((deck) => ({
      id: deck.id,
      name: deck.name,
      parentDeckId: deck.parentDeckId,
      sortOrder: deck.sortOrder,
      cardCount: computeAggregateCardCount(deck.id),
      childCount: childCounts.get(deck.id) ?? 0,
    }));
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
  return createDeckWithParent(name, null);
}

export async function createDeckWithParent(name: string, parentDeckId: string | null): Promise<DeckRecord> {
  await ensureDbReady();
  const db = getDb();

  if (parentDeckId) {
    const [parentDeck] = await db
      .select({
        id: decks.id,
        parentDeckId: decks.parentDeckId,
      })
      .from(decks)
      .where(and(eq(decks.id, parentDeckId), isNull(decks.deletedAt)))
      .limit(1);

    if (!parentDeck) {
      throw new DeckHierarchyError("Master deck was not found.");
    }

    if (parentDeck.parentDeckId) {
      throw new DeckHierarchyError("Only top-level decks can be used as master decks.");
    }
  }

  const sortOrder = await getNextSiblingSortOrder(parentDeckId);

  const [deck] = await db
    .insert(decks)
    .values({
      name,
      parentDeckId,
      sortOrder,
    })
    .returning();
  return deck;
}

export async function getDeckDescendantIds(deckId: string): Promise<string[]> {
  await ensureDbReady();
  const db = getDb();

  const allDecks = await db
    .select({
      id: decks.id,
      parentDeckId: decks.parentDeckId,
    })
    .from(decks)
    .where(isNull(decks.deletedAt));

  const childrenByParent = allDecks.reduce<Map<string, string[]>>((map, deck) => {
    if (!deck.parentDeckId) {
      return map;
    }
    const existing = map.get(deck.parentDeckId) ?? [];
    existing.push(deck.id);
    map.set(deck.parentDeckId, existing);
    return map;
  }, new Map());

  const descendants: string[] = [];
  const visited = new Set<string>();
  const queue = [...(childrenByParent.get(deckId) ?? [])];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next)) {
      continue;
    }

    visited.add(next);
    descendants.push(next);
    queue.push(...(childrenByParent.get(next) ?? []));
  }

  return descendants;
}

export async function getDeckScopeIds(deckId: string): Promise<string[]> {
  const descendants = await getDeckDescendantIds(deckId);
  return [deckId, ...descendants];
}

export async function getDirectChildDecks(parentDeckId: string): Promise<DeckSummary[]> {
  const decks = await getDecks();
  return decks.filter((deck) => deck.parentDeckId === parentDeckId);
}

export async function moveDeckToParent(
  deckId: string,
  nextParentDeckId: string | null,
  afterDeckId?: string | null
): Promise<DeckRecord> {
  await ensureDbReady();
  const db = getDb();
  const parentDeckId = nextParentDeckId?.trim() ? nextParentDeckId.trim() : null;
  const targetAfterDeckId = afterDeckId?.trim() ? afterDeckId.trim() : null;

  if (parentDeckId === deckId) {
    throw new DeckHierarchyError("A deck cannot be its own master.");
  }

  const activeDecks = await db
    .select({
      id: decks.id,
      parentDeckId: decks.parentDeckId,
      sortOrder: decks.sortOrder,
      createdAt: decks.createdAt,
    })
    .from(decks)
    .where(isNull(decks.deletedAt));

  const deckById = new Map(activeDecks.map((deck) => [deck.id, deck]));
  const deck = deckById.get(deckId);
  if (!deck) {
    throw new DeckHierarchyError("Deck was not found.");
  }

  if (isSameParent(deck.parentDeckId, parentDeckId) && !targetAfterDeckId) {
    const [unchanged] = await db
      .select()
      .from(decks)
      .where(and(eq(decks.id, deckId), isNull(decks.deletedAt)))
      .limit(1);

    if (!unchanged) {
      throw new DeckHierarchyError("Deck could not be moved.");
    }

    return unchanged;
  }

  const hasChildren = activeDecks.some((candidate) => candidate.parentDeckId === deckId);
  if (parentDeckId && hasChildren) {
    throw new DeckHierarchyError("Decks with sections cannot be nested under a master.");
  }

  if (parentDeckId) {
    const parentDeck = deckById.get(parentDeckId);
    if (!parentDeck) {
      throw new DeckHierarchyError("Target master deck was not found.");
    }

    if (parentDeck.parentDeckId) {
      throw new DeckHierarchyError("Only one nested level is allowed.");
    }
  }

  const siblingDecks = sortSiblingDecks(
    activeDecks.filter((candidate) => candidate.id !== deckId && isSameParent(candidate.parentDeckId, parentDeckId))
  );

  if (targetAfterDeckId && !siblingDecks.some((candidate) => candidate.id === targetAfterDeckId)) {
    throw new DeckHierarchyError("Drop target is not valid for this location.");
  }

  const insertIndex = targetAfterDeckId
    ? Math.max(
        0,
        siblingDecks.findIndex((candidate) => candidate.id === targetAfterDeckId) + 1
      )
    : siblingDecks.length;
  const nextSiblingOrder = [
    ...siblingDecks.slice(0, insertIndex),
    {
      id: deck.id,
      parentDeckId,
      sortOrder: deck.sortOrder,
      createdAt: deck.createdAt,
    },
    ...siblingDecks.slice(insertIndex),
  ];

  const previousParentDeckId = deck.parentDeckId ?? null;
  const previousSiblings = isSameParent(previousParentDeckId, parentDeckId)
    ? []
    : sortSiblingDecks(
        activeDecks.filter((candidate) => candidate.id !== deckId && isSameParent(candidate.parentDeckId, previousParentDeckId))
      );

  await db.transaction(async (tx) => {
    const now = new Date();

    for (const [index, sibling] of previousSiblings.entries()) {
      if (sibling.sortOrder === index) {
        continue;
      }

      await tx
        .update(decks)
        .set({
          sortOrder: index,
          updatedAt: now,
        })
        .where(eq(decks.id, sibling.id));
    }

    for (const [index, sibling] of nextSiblingOrder.entries()) {
      const isMovedDeck = sibling.id === deckId;
      const nextParent = isMovedDeck ? parentDeckId : sibling.parentDeckId;
      const parentChanged = !isSameParent(sibling.parentDeckId, nextParent);
      const orderChanged = sibling.sortOrder !== index;

      if (!isMovedDeck && !parentChanged && !orderChanged) {
        continue;
      }

      await tx
        .update(decks)
        .set({
          parentDeckId: nextParent,
          sortOrder: index,
          updatedAt: now,
        })
        .where(eq(decks.id, sibling.id));
    }
  });

  const [updated] = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, deckId), isNull(decks.deletedAt)))
    .limit(1);

  if (!updated) {
    throw new DeckHierarchyError("Deck could not be moved.");
  }

  return updated;
}

export interface DeletedDeckSummary {
  id: string;
  name: string;
  parentDeckId: string | null;
  cardCount: number;
  childCount: number;
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
    const deletedDeckRows = await db
      .select({
        id: decks.id,
        name: decks.name,
        parentDeckId: decks.parentDeckId,
        cardCount: sql<number>`count(${cards.id})::int`,
        deletedAt: decks.deletedAt,
      })
      .from(decks)
      .leftJoin(cards, eq(cards.deckId, decks.id))
      .where(isNotNull(decks.deletedAt))
      .groupBy(decks.id)
      .orderBy(desc(decks.deletedAt));

    const childCounts = deletedDeckRows.reduce<Map<string, number>>((map, deck) => {
      if (!deck.parentDeckId) {
        return map;
      }

      map.set(deck.parentDeckId, (map.get(deck.parentDeckId) ?? 0) + 1);
      return map;
    }, new Map());

    return deletedDeckRows.map((deck) => ({
      id: deck.id,
      name: deck.name,
      parentDeckId: deck.parentDeckId,
      cardCount: deck.cardCount,
      childCount: childCounts.get(deck.id) ?? 0,
      deletedAt: deck.deletedAt,
    }));
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
