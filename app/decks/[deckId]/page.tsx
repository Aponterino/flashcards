import { notFound } from "next/navigation";
import Link from "next/link";

import CardListItem from "@/components/CardListItem";
import DeckSettingsMenu from "@/components/DeckSettingsMenu";
import StudySession from "@/components/StudySession";
import SwapAllCardsButton from "@/components/SwapAllCardsButton";
import {
  archiveDeckAction,
  createCardAction,
  resetDeckLearningProgressAction,
  resolveImportedCardsAction,
  updateCardAction,
} from "@/lib/actions";
import { getCardsByDeck } from "@/lib/queries/cards";
import { getDeckById } from "@/lib/queries/decks";
import { getDeckStudyCalendar } from "@/lib/queries/studyCalendar";
import { buildStudyGroupsFromCards, type StudyDifficulty } from "@/lib/studySession";

export const dynamic = "force-dynamic";

interface DeckPageProps {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{
    edit?: string;
    importAdded?: string;
    importMerged?: string;
    importReplaced?: string;
    importError?: string;
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

export default async function DeckPage({ params, searchParams }: DeckPageProps) {
  const { deckId } = await params;
  const { edit, importAdded, importMerged, importReplaced, importError } = await searchParams;
  const deck = await getDeckById(deckId);
  if (!deck) {
    notFound();
  }

  const [cards, studyCalendar] = await Promise.all([getCardsByDeck(deckId), getDeckStudyCalendar(deckId)]);
  const studyCards = cards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    dueDate: card.dueDate,
    intervalDays: card.intervalDays,
    easeFactor: card.easeFactor,
    lastDifficulty: parseLastDifficulty(card.lastDifficulty),
  }));
  const studyGroups = buildStudyGroupsFromCards(studyCards);
  const studiedCount = studyGroups.hard.length + studyGroups.medium.length + studyGroups.easy.length;
  const isOnboardingPhase = studiedCount === 0 && !studyCalendar.goalConfigured;
  const editingCardId = edit ?? "";

  return (
    <section className="stack">
      <div className="row deck-header-row">
        <div>
          <p className="eyebrow">Deck</p>
          <h1>{deck.name}</h1>
          <p className="subtitle">Review due cards, add new prompts, and track progress.</p>
        </div>
        <DeckSettingsMenu
          archiveAction={archiveDeckAction}
          deckId={deckId}
          existingCards={cards.map((card) => ({ id: card.id, front: card.front, back: card.back }))}
          resetLearningAction={resetDeckLearningProgressAction}
          resolveImportAction={resolveImportedCardsAction}
        />
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

      <StudySession cards={studyCards} deckId={deckId} />

      <section className="card stack">
        <div className="cards-section-header">
          <h3>Add a card</h3>
          {isOnboardingPhase ? (
            <Link className="button ghost" href="#deck-settings">
              Import cards
            </Link>
          ) : null}
        </div>
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

      <section className="card stack">
        <div className="cards-section-header">
          <h3>Cards</h3>
          <SwapAllCardsButton deckId={deckId} />
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
                  id={`card-${card.id}`}
                  key={card.id}
                >
                {editingCardId === card.id ? (
                  <form action={updateCardAction} className="card-edit-form">
                    <input type="hidden" name="deckId" value={deckId} />
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
                    <CardListItem
                      cardId={card.id}
                      deckId={deckId}
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
