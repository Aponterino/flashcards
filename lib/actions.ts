"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ImportedCardInput } from "@/lib/importExport";
import { createCard, createCardsWithIds, deleteCardsByIds, resetDeckCardStudyState, swapCardFrontBackByDeck, swapCardFrontBackById, updateCard } from "@/lib/queries/cards";
import { archiveDeck, createDeckWithParent, DeckHierarchyError, getDeckById, moveDeckToParent, purgeDeletedDecks, restoreDeck } from "@/lib/queries/decks";
import { resetDeckStudyCalendar } from "@/lib/queries/studyCalendar";
import { createDeckVersionSnapshot, restoreCardFromVersion, restoreDeckFromVersion } from "@/lib/queries/versions";

function appendSearchParam(path: string, key: string, value: string): string {
  const [pathWithSearch, hashFragment = ""] = path.split("#", 2);
  const [pathname, search = ""] = pathWithSearch.split("?", 2);
  const params = new URLSearchParams(search);
  params.set(key, value);
  const queryString = params.toString();
  return `${pathname}${queryString ? `?${queryString}` : ""}${hashFragment ? `#${hashFragment}` : ""}`;
}

export async function createDeckAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const parentDeckIdValue = String(formData.get("parentDeckId") || "").trim();
  const redirectTo = String(formData.get("redirectTo") || "").trim();
  const parentDeckId = parentDeckIdValue || null;

  try {
    const deck = await createDeckWithParent(name || "Untitled Deck", parentDeckId);
    await createDeckVersionSnapshot(deck.id, "Deck created");
    revalidatePath("/");
    revalidatePath("/decks");
    if (parentDeckId) {
      revalidatePath(`/decks/${parentDeckId}`);
    }
    if (redirectTo.startsWith("/")) {
      if (parentDeckId) {
        redirect(appendSearchParam(redirectTo, "navRefresh", String(Date.now())));
      }
      redirect(redirectTo);
    }
    redirect(`/decks/${deck.id}`);
  } catch (error) {
    if (error instanceof DeckHierarchyError) {
      const fallback = redirectTo.startsWith("/") ? redirectTo : "/decks/new";
      const params = new URLSearchParams();
      params.set("hierarchyError", error.message);
      redirect(`${fallback}${fallback.includes("?") ? "&" : "?"}${params.toString()}`);
    }
    throw error;
  }
}

export async function moveDeckParentAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "").trim();
  const parentDeckIdValue = String(formData.get("parentDeckId") || "").trim();
  const afterDeckIdValue = String(formData.get("afterDeckId") || "").trim();
  const redirectTo = String(formData.get("redirectTo") || "").trim();
  const nextParentDeckId = parentDeckIdValue || null;
  const afterDeckId = afterDeckIdValue || null;

  if (!deckId) {
    return;
  }

  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : `/decks/${deckId}`;
  const previousDeck = await getDeckById(deckId);

  try {
    const movedDeck = await moveDeckToParent(deckId, nextParentDeckId, afterDeckId);
    revalidatePath("/");
    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}`);
    if (previousDeck?.parentDeckId) {
      revalidatePath(`/decks/${previousDeck.parentDeckId}`);
    }
    if (movedDeck.parentDeckId) {
      revalidatePath(`/decks/${movedDeck.parentDeckId}`);
    }
    redirect(appendSearchParam(safeRedirect, "navRefresh", String(Date.now())));
  } catch (error) {
    if (error instanceof DeckHierarchyError) {
      const params = new URLSearchParams();
      params.set("hierarchyError", error.message);
      redirect(`${safeRedirect}${safeRedirect.includes("?") ? "&" : "?"}${params.toString()}`);
    }
    throw error;
  }
}

export async function createCardAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  const front = String(formData.get("front") || "").trim();
  const back = String(formData.get("back") || "").trim();

  if (!deckId || !front || !back) {
    return;
  }

  await createCard({ deckId, front, back });
  await createDeckVersionSnapshot(deckId, "Card added");
  revalidatePath(`/decks/${deckId}`);
}

export async function archiveDeckAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  if (!deckId) {
    return;
  }

  const archived = await archiveDeck(deckId);
  if (!archived) {
    return;
  }

  revalidatePath("/");
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/decks/deleted");
  redirect("/decks?deleted=1");
}

export async function updateCardAction(formData: FormData) {
  const cardId = String(formData.get("cardId") || "");
  const deckId = String(formData.get("deckId") || "");
  const redirectToDeckId = String(formData.get("redirectToDeckId") || "").trim();
  const front = String(formData.get("front") || "").trim();
  const back = String(formData.get("back") || "").trim();

  if (!cardId || !deckId || !front || !back) {
    return;
  }

  const updated = await updateCard({ id: cardId, deckId, front, back });
  if (!updated) {
    return;
  }

  await createDeckVersionSnapshot(deckId, "Card updated");
  revalidatePath(`/decks/${deckId}`);
  if (redirectToDeckId) {
    revalidatePath(`/decks/${redirectToDeckId}`);
    redirect(`/decks/${redirectToDeckId}`);
  }
  redirect(`/decks/${deckId}`);
}

interface DuplicateResolutionInput {
  existingCardId: string;
  imported: ImportedCardInput;
}

function isNavigationSignal(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof error === "object") {
    const maybeDigest = (error as { digest?: unknown }).digest;
    if (typeof maybeDigest === "string" && maybeDigest.includes("NEXT_REDIRECT")) {
      return true;
    }
  }

  if (error instanceof Error) {
    return error.message.includes("NEXT_REDIRECT");
  }

  return false;
}

function sanitizeImportedCards(cards: ImportedCardInput[]): ImportedCardInput[] {
  return cards
    .map((card) => ({
      front: String(card.front ?? "").trim(),
      back: String(card.back ?? "").trim(),
      dueDate: card.dueDate,
      intervalDays: card.intervalDays,
      easeFactor: card.easeFactor,
    }))
    .filter((card) => card.front.length > 0 && card.back.length > 0);
}

export async function resolveImportedCardsAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  const strategy = String(formData.get("strategy") || "merge");
  const incomingCardsRaw = String(formData.get("incomingCards") || "[]");
  const duplicateCardsRaw = String(formData.get("duplicateCards") || "[]");

  if (!deckId) {
    return;
  }

  let addedCount = 0;
  let mergedCount = 0;
  let replacedCount = 0;
  const importedCardIds: string[] = [];

  try {
    const incomingParsed = JSON.parse(incomingCardsRaw) as ImportedCardInput[];
    const duplicatesParsed = JSON.parse(duplicateCardsRaw) as DuplicateResolutionInput[];
    const incomingCards = sanitizeImportedCards(incomingParsed);
    const duplicateCards = duplicatesParsed
      .map((item) => ({
        existingCardId: String(item.existingCardId ?? ""),
        imported: {
          front: String(item.imported?.front ?? "").trim(),
          back: String(item.imported?.back ?? "").trim(),
          dueDate: item.imported?.dueDate,
          intervalDays: item.imported?.intervalDays,
          easeFactor: item.imported?.easeFactor,
        },
      }))
      .filter((item) => item.existingCardId.length > 0 && item.imported.front.length > 0 && item.imported.back.length > 0);

    if (strategy === "replace" && duplicateCards.length > 0) {
      const uniqueExistingIds = [...new Set(duplicateCards.map((card) => card.existingCardId))];
      replacedCount = await deleteCardsByIds(deckId, uniqueExistingIds);
      const replacedInsertedIds = await createCardsWithIds(
        duplicateCards.map((card) => ({
          deckId,
          front: card.imported.front,
          back: card.imported.back,
          dueDate: card.imported.dueDate,
          intervalDays: card.imported.intervalDays,
          easeFactor: card.imported.easeFactor,
        }))
      );
      addedCount += replacedInsertedIds.length;
      importedCardIds.push(...replacedInsertedIds);
    } else if (duplicateCards.length > 0) {
      let merged = 0;
      for (const duplicate of duplicateCards) {
        const updated = await updateCard({
          id: duplicate.existingCardId,
          deckId,
          front: duplicate.imported.front,
          back: duplicate.imported.back,
        });
        if (updated) {
          merged += 1;
        }
      }
      mergedCount = merged;
    }

    const insertedIds = await createCardsWithIds(
      incomingCards.map((card) => ({
        deckId,
        front: card.front,
        back: card.back,
        dueDate: card.dueDate,
        intervalDays: card.intervalDays,
        easeFactor: card.easeFactor,
      }))
    );
    addedCount += insertedIds.length;
    importedCardIds.push(...insertedIds);

    const reason =
      strategy === "replace"
        ? `Import applied (replace duplicates): +${addedCount}, replaced ${replacedCount}`
        : `Import applied (merge duplicates): +${addedCount}, merged ${mergedCount}`;
    await createDeckVersionSnapshot(deckId, reason);

    const params = new URLSearchParams();
    params.set("importAdded", String(addedCount));
    params.set("importMerged", String(mergedCount));
    params.set("importReplaced", String(replacedCount));
    if (importedCardIds.length > 0) {
      params.set("importCardIds", importedCardIds.slice(0, 24).join(","));
    }
    revalidatePath(`/decks/${deckId}`);
    redirect(`/decks/${deckId}?${params.toString()}`);
  } catch (error) {
    if (isNavigationSignal(error)) {
      throw error;
    }
    console.error(`Failed to import cards for deck ${deckId}`, error);
    revalidatePath(`/decks/${deckId}`);
    redirect(`/decks/${deckId}?importError=Import%20failed.%20Please%20check%20the%20file%20format.`);
  }
}

export async function restoreDeckVersionAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  const versionId = String(formData.get("versionId") || "");
  if (!deckId || !versionId) {
    return;
  }

  const restored = await restoreDeckFromVersion(deckId, versionId);
  if (!restored) {
    redirect(`/decks/${deckId}/versions?restoreError=Could%20not%20restore%20that%20version.`);
  }

  await createDeckVersionSnapshot(deckId, `Deck restored from version ${versionId.slice(0, 8)}`);
  revalidatePath(`/decks/${deckId}`);
  revalidatePath(`/decks/${deckId}/versions`);
  redirect(`/decks/${deckId}/versions?restoredVersion=1`);
}

export async function restoreVersionCardAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  const versionId = String(formData.get("versionId") || "");
  const versionCardId = String(formData.get("versionCardId") || "");

  if (!deckId || !versionId || !versionCardId) {
    return;
  }

  const restored = await restoreCardFromVersion(deckId, versionCardId);
  if (!restored) {
    redirect(`/decks/${deckId}/versions?restoreError=Could%20not%20restore%20that%20card.`);
  }

  await createDeckVersionSnapshot(deckId, `Card restored from version ${versionId.slice(0, 8)}`);
  revalidatePath(`/decks/${deckId}`);
  revalidatePath(`/decks/${deckId}/versions`);
  redirect(`/decks/${deckId}/versions?restoredCard=1`);
}

export async function purgeDeletedDecksAction(_formData: FormData) {
  await purgeDeletedDecks();
  revalidatePath("/");
  revalidatePath("/decks");
  revalidatePath("/decks/deleted");
  redirect("/decks/deleted?purged=1");
}

export async function restoreDeletedDeckAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  const redirectTo = String(formData.get("redirectTo") || "/decks/deleted");
  if (!deckId) {
    return;
  }

  const restored = await restoreDeck(deckId);
  if (!restored) {
    return;
  }

  revalidatePath("/");
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/decks/deleted");
  revalidatePath(`/decks/deleted/${deckId}`);

  if (redirectTo.startsWith("/")) {
    redirect(redirectTo);
  }

  redirect("/decks/deleted");
}

export async function swapDeckFrontBackAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  if (!deckId) {
    return;
  }

  const swappedCount = await swapCardFrontBackByDeck(deckId);
  if (swappedCount === 0) {
    return;
  }

  await createDeckVersionSnapshot(deckId, `Swapped front/back on ${swappedCount} cards`);
  revalidatePath(`/decks/${deckId}`);
}

export async function swapCardFrontBackAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  const cardId = String(formData.get("cardId") || "");
  if (!deckId || !cardId) {
    return;
  }

  const swapped = await swapCardFrontBackById(deckId, cardId);
  if (!swapped) {
    return;
  }

  await createDeckVersionSnapshot(deckId, "Card front/back swapped");
  revalidatePath(`/decks/${deckId}`);
  redirect(`/decks/${deckId}#card-${cardId}`);
}

export async function resetDeckLearningProgressAction(formData: FormData) {
  const deckId = String(formData.get("deckId") || "");
  if (!deckId) {
    return;
  }

  const resetCount = await resetDeckCardStudyState(deckId);
  await resetDeckStudyCalendar(deckId);

  await createDeckVersionSnapshot(deckId, `Learning progress reset (${resetCount} cards)`);
  revalidatePath(`/decks/${deckId}`);
  revalidatePath(`/decks/${deckId}/study`);
  redirect(`/decks/${deckId}`);
}
