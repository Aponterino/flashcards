import { notFound } from "next/navigation";
import Link from "next/link";

import CardListItem from "@/components/CardListItem";
import DeckPlacementPicker from "@/components/DeckPlacementPicker";
import DeckSettingsMenu from "@/components/DeckSettingsMenu";
import ImportSuccessFocus from "@/components/ImportSuccessFocus";
import StudySession from "@/components/StudySession";
import SwapAllCardsButton from "@/components/SwapAllCardsButton";
import {
  archiveDeckAction,
  createDeckAction,
  createCardAction,
  moveDeckParentAction,
  resetDeckLearningProgressAction,
  resolveImportedCardsAction,
  updateCardAction,
  updateDeckNameAction,
} from "@/lib/actions";
import { getCardsByDeck, getCardsForStudyDeck, type CardRecord } from "@/lib/queries/cards";
import { getDeckById, getDecks, getDirectChildDecks } from "@/lib/queries/decks";
import type { StudyDifficulty } from "@/lib/studySession";

export const dynamic = "force-dynamic";

interface DeckPageProps {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{
    edit?: string;
    editDeck?: string;
    importAdded?: string;
    importMerged?: string;
    importReplaced?: string;
    importCardIds?: string;
    importError?: string;
    hierarchyError?: string;
  }>;
}

function parseLastDifficulty(value: string | null): StudyDifficulty | null {
  if (value === "hard" || value === "medium" || value === "easy") {
    return value;
  }

  return null;
}

function getCardStudyStatus(lastDifficulty: string | null): {
  label: string;
  tone: "hard" | "medium" | "easy" | "not-studied";
} {
  const difficulty = parseLastDifficulty(lastDifficulty);
  if (!difficulty) {
    return { label: "Not studied yet", tone: "not-studied" };
  }

  if (difficulty === "hard") {
    return { label: "Hard", tone: "hard" };
  }

  if (difficulty === "medium") {
    return { label: "Medium", tone: "medium" };
  }

  return { label: "Easy", tone: "easy" };
}

function getTodayLocalDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface SectionStats {
  cardCount: number;
  dueCount: number;
  overdueCount: number;
  hardCount: number;
  mediumCount: number;
  easyCount: number;
  notStudiedCount: number;
}

function summarizeSectionStats(sectionCards: CardRecord[], todayIso: string): SectionStats {
  return sectionCards.reduce<SectionStats>(
    (stats, card) => {
      stats.cardCount += 1;
      if (card.dueDate <= todayIso) {
        stats.dueCount += 1;
      }
      if (card.dueDate < todayIso) {
        stats.overdueCount += 1;
      }

      if (card.lastDifficulty === "hard") {
        stats.hardCount += 1;
      } else if (card.lastDifficulty === "medium") {
        stats.mediumCount += 1;
      } else if (card.lastDifficulty === "easy") {
        stats.easyCount += 1;
      } else {
        stats.notStudiedCount += 1;
      }

      return stats;
    },
    {
      cardCount: 0,
      dueCount: 0,
      overdueCount: 0,
      hardCount: 0,
      mediumCount: 0,
      easyCount: 0,
      notStudiedCount: 0,
    }
  );
}

export default async function DeckPage({ params, searchParams }: DeckPageProps) {
  const { deckId } = await params;
  const { edit, editDeck, importAdded, importMerged, importReplaced, importCardIds, importError, hierarchyError } =
    await searchParams;
  const deck = await getDeckById(deckId);
  if (!deck) {
    notFound();
  }

  const [cards, ownDeckCards, childDecks, allDecks] = await Promise.all([
    getCardsForStudyDeck(deckId),
    getCardsByDeck(deckId),
    getDirectChildDecks(deckId),
    getDecks(),
  ]);
  const todayIso = getTodayLocalDateISO();
  const sectionStats = await Promise.all(
    childDecks.map(async (childDeck) => {
      const sectionCards = await getCardsForStudyDeck(childDeck.id);
      return {
        id: childDeck.id,
        name: childDeck.name,
        stats: summarizeSectionStats(sectionCards, todayIso),
      };
    })
  );
  const deckNameById = new Map(allDecks.map((item) => [item.id, item.name]));
  const activeParentDeck = deck.parentDeckId ? allDecks.find((item) => item.id === deck.parentDeckId) ?? null : null;
  const topLevelMasterCandidates = allDecks.filter((item) => item.parentDeckId === null && item.id !== deckId);
  const studyCards = cards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    dueDate: card.dueDate,
    intervalDays: card.intervalDays,
    easeFactor: card.easeFactor,
    lastDifficulty: parseLastDifficulty(card.lastDifficulty),
  }));
  const isMasterDeck = childDecks.length > 0;
  const isSectionDeck = Boolean(deck.parentDeckId);
  const canMoveUnderMaster = !isMasterDeck;
  const canCreateSections = !isSectionDeck;
  const showPlacementPanel = isSectionDeck || isMasterDeck;
  const isDeckEmpty = cards.length === 0;
  const editingCardId = edit ?? "";
  const isEditingDeckName = editDeck === "1";
  const importAddedCount = Number(importAdded ?? "0");
  const importedIds = String(importCardIds ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return (
    <section className="stack">
      <div className="row deck-header-row">
        <div>
          <p className="eyebrow">Deck</p>
          {isEditingDeckName ? (
            <form action={updateDeckNameAction} className="deck-name-edit-form">
              <input type="hidden" name="deckId" value={deckId} />
              <input type="hidden" name="redirectTo" value={`/decks/${deckId}`} />
              <label className="visually-hidden" htmlFor={`deck-name-input-${deckId}`}>
                Deck name
              </label>
              <h1 className="deck-name-inline-heading">
                <input
                  className="deck-name-inline-input"
                  id={`deck-name-input-${deckId}`}
                  name="name"
                  defaultValue={deck.name}
                  maxLength={255}
                  required
                />
              </h1>
              <div className="card-item-actions">
                <button className="button primary" type="submit">
                  Save
                </button>
                <Link className="button ghost" href={`/decks/${deckId}`}>
                  Cancel
                </Link>
              </div>
            </form>
          ) : (
            <div className="deck-name-editable">
              <h1>{deck.name}</h1>
              <Link
                aria-label={`Edit deck name: ${deck.name}`}
                className="button ghost card-edit-button card-hover-action"
                href={`/decks/${deckId}?editDeck=1`}
              >
                <svg
                  aria-hidden="true"
                  className="card-edit-icon"
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4 20h4l10-10-4-4L4 16v4z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 6l4 4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                <span>Edit</span>
              </Link>
            </div>
          )}
          <p className="subtitle">
            {isMasterDeck
              ? "Master deck view: study all section cards together and track aggregate progress."
              : isSectionDeck
                ? "Section deck: focus on this section independently."
                : "Review due cards, add new prompts, and track progress."}
          </p>
        </div>
        <div className="button-row">
          {activeParentDeck ? (
            <Link className="button ghost" href={`/decks/${activeParentDeck.id}`}>
              Open Master Deck
              {activeParentDeck.name ? ` (${activeParentDeck.name})` : ""}
            </Link>
          ) : deck.parentDeckId ? (
            <span className="chip">Master deck unavailable</span>
          ) : null}
          <DeckSettingsMenu
            archiveAction={archiveDeckAction}
            deckId={deckId}
            existingCards={ownDeckCards.map((card) => ({ id: card.id, front: card.front, back: card.back }))}
            importResultKey={importAdded || importMerged || importReplaced ? `${importAdded ?? "0"}:${importMerged ?? "0"}:${importReplaced ?? "0"}` : ""}
            resetLearningAction={resetDeckLearningProgressAction}
            resolveImportAction={resolveImportedCardsAction}
          />
        </div>
      </div>

      {importAdded || importMerged || importReplaced ? (
        <section className="card callout">
          <p className="subtitle">
            Import complete.
            {" "}
            Added {Number(importAdded ?? "0")} card{Number(importAdded ?? "0") === 1 ? "" : "s"}.
            {" "}
            Merged {Number(importMerged ?? "0")} duplicate{Number(importMerged ?? "0") === 1 ? "" : "s"}.
            {" "}
            Replaced {Number(importReplaced ?? "0")} duplicate{Number(importReplaced ?? "0") === 1 ? "" : "s"}.
          </p>
        </section>
      ) : null}

      {importError ? (
        <section className="card callout">
          <p className="subtitle">{decodeURIComponent(importError)}</p>
        </section>
      ) : null}

      <ImportSuccessFocus addedCount={importAddedCount} importedCardIds={importedIds} />

      {hierarchyError ? (
        <section className="card callout">
          <p className="subtitle">{hierarchyError}</p>
        </section>
      ) : null}

      <StudySession cards={studyCards} deckId={deckId} />

      <section className="card stack deck-organization-card">
        <div className="cards-section-header">
          <h3>Deck organization</h3>
          {canCreateSections && childDecks.length > 0 ? <span className="chip">{childDecks.length} sections</span> : null}
        </div>

        <div className="deck-organization-grid">
          {showPlacementPanel ? (
            <div className="stack-sm deck-organization-panel">
              <p className="deck-organization-title">Placement</p>
              <p className="muted">
                Current location:{" "}
                {deck.parentDeckId
                  ? `Section under ${deckNameById.get(deck.parentDeckId) ?? "an unavailable master deck"}`
                  : "Top-level master deck"}
              </p>
              {canMoveUnderMaster ? (
                <DeckPlacementPicker
                  currentParentDeckId={deck.parentDeckId}
                  deckId={deckId}
                  moveAction={moveDeckParentAction}
                  options={topLevelMasterCandidates.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
                  redirectTo={`/decks/${deckId}`}
                />
              ) : (
                <p className="muted">This deck has sections. With one-level nesting, masters cannot be moved under another deck.</p>
              )}
            </div>
          ) : null}

          {canCreateSections ? (
            <div className="stack-sm deck-organization-panel">
              <p className="deck-organization-title">Sections</p>
              <form action={createDeckAction} className="section-create-form">
                <input type="hidden" name="parentDeckId" value={deckId} />
                <input type="hidden" name="redirectTo" value={`/decks/${deckId}`} />
                <label className="field section-name-field">
                  Section name
                  <input name="name" placeholder="e.g. Section 1: Fundamentals" />
                </label>
                <button className="button ghost" type="submit">
                  Add section
                </button>
              </form>
            </div>
          ) : null}
        </div>

        {canCreateSections ? (
          sectionStats.length === 0 ? (
            <p className="muted">No sections yet. Create one to split this deck by test section.</p>
          ) : (
            <div className="section-list">
              {sectionStats.map((section) => (
                <Link className="card section-link-card" href={`/decks/${section.id}`} key={section.id}>
                  <div className="row">
                    <p className="deck-title">{section.name}</p>
                    <span className="chip">{section.stats.cardCount} cards</span>
                  </div>
                  <p className="muted">
                    Due now: {section.stats.dueCount} ({section.stats.overdueCount} overdue) | Hard: {section.stats.hardCount} |
                    Medium: {section.stats.mediumCount} | Easy: {section.stats.easyCount} | Not studied:{" "}
                    {section.stats.notStudiedCount}
                  </p>
                </Link>
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="card stack" id="add-cards-section">
        <div className="cards-section-header">
          <h3>Add a card</h3>
          {isDeckEmpty ? (
            <label className="button ghost file-input-button" htmlFor={`deck-import-file-${deckId}`}>
              Import cards
            </label>
          ) : null}
        </div>
        {isDeckEmpty ? (
          <p className="subtitle add-cards-guidance">
            Add cards before studying. Enter cards below or use Import cards.
          </p>
        ) : null}
        <form className="stack" action={createCardAction}>
          <input type="hidden" name="deckId" value={deckId} />
          <label className="field">
            Front
            <textarea name="front" rows={3} placeholder="Prompt or question" required />
          </label>
          <label className="field">
            Back
            <textarea name="back" rows={3} placeholder="Answer or explanation" required />
          </label>
          <button className="button primary" type="submit">
            Add card
          </button>
        </form>
      </section>

      <section className="card stack" id="cards-section">
        <div className="cards-section-header">
          <h3>Cards</h3>
          {!isMasterDeck ? <SwapAllCardsButton deckId={deckId} /> : null}
        </div>
        {cards.length === 0 ? (
          <p className="muted">No cards yet. Add your first prompt above.</p>
        ) : (
          <div className="card-list">
            {cards.map((card) => {
              const studyStatus = getCardStudyStatus(card.lastDifficulty);

              return (
                <div
                  className={`card-item card-item-${studyStatus.tone} ${editingCardId === card.id ? "editing" : ""}`}
                  data-card-id={card.id}
                  id={`card-${card.id}`}
                  key={card.id}
                >
                {editingCardId === card.id ? (
                  <form action={updateCardAction} className="card-edit-form">
                    <input type="hidden" name="deckId" value={card.deckId} />
                    <input type="hidden" name="redirectToDeckId" value={deckId} />
                    <input type="hidden" name="cardId" value={card.id} />
                    <label className="field">
                      Front
                      <textarea name="front" rows={3} defaultValue={card.front} required />
                    </label>
                    <label className="field">
                      Back
                      <textarea name="back" rows={3} defaultValue={card.back} required />
                    </label>
                    <div className="card-edit-actions">
                      <button className="button primary" type="submit">
                        Save changes
                      </button>
                      <Link className="button ghost" href={`/decks/${deckId}`}>
                        Cancel
                      </Link>
                    </div>
                  </form>
                ) : (
                  <>
                    {card.deckId !== deckId ? (
                      <p className="subtitle">
                        Section: {deckNameById.get(card.deckId) ?? "Sub-deck"}
                      </p>
                    ) : null}
                    <CardListItem
                      cardId={card.id}
                      deckId={card.deckId}
                      viewDeckId={deckId}
                      initialBack={card.back}
                      initialFront={card.front}
                      statusLabel={studyStatus.label}
                      statusTone={studyStatus.tone}
                    />
                  </>
                )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
