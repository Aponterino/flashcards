import Link from "next/link";
import { notFound } from "next/navigation";

import { restoreDeckVersionAction, restoreVersionCardAction } from "@/lib/actions";
import { getCardsByDeck } from "@/lib/queries/cards";
import { getDeckById } from "@/lib/queries/decks";
import { getDeckVersionCards, getDeckVersions, type DeckVersionCardRecord } from "@/lib/queries/versions";

export const dynamic = "force-dynamic";

interface DeckVersionsPageProps {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ restoredVersion?: string; restoredCard?: string; restoreError?: string }>;
}

interface VersionChangeSummary {
  added: number;
  removed: number;
  updated: number;
}

function formatDueDate(dueDate: string): string {
  const parts = dueDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return dueDate;
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day).toLocaleDateString();
}

function hasCardChanged(previous: DeckVersionCardRecord, current: DeckVersionCardRecord): boolean {
  return (
    previous.front !== current.front ||
    previous.back !== current.back ||
    previous.dueDate !== current.dueDate ||
    previous.intervalDays !== current.intervalDays ||
    previous.easeFactor !== current.easeFactor
  );
}

function summarizeVersionChanges(
  currentCards: DeckVersionCardRecord[],
  previousCards: DeckVersionCardRecord[] | null
): VersionChangeSummary {
  if (!previousCards) {
    return {
      added: currentCards.length,
      removed: 0,
      updated: 0,
    };
  }

  const previousByCardId = new Map(previousCards.map((card) => [card.cardId, card]));
  const currentByCardId = new Map(currentCards.map((card) => [card.cardId, card]));

  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const card of currentCards) {
    const previous = previousByCardId.get(card.cardId);
    if (!previous) {
      added += 1;
    } else if (hasCardChanged(previous, card)) {
      updated += 1;
    }
  }

  for (const card of previousCards) {
    if (!currentByCardId.has(card.cardId)) {
      removed += 1;
    }
  }

  return { added, removed, updated };
}

export default async function DeckVersionsPage({ params, searchParams }: DeckVersionsPageProps) {
  const { deckId } = await params;
  const { restoredVersion, restoredCard, restoreError } = await searchParams;

  const deck = await getDeckById(deckId);
  if (!deck) {
    notFound();
  }

  const [versions, currentDeckCards] = await Promise.all([getDeckVersions(deckId), getCardsByDeck(deckId)]);
  const versionCards = await Promise.all(versions.map((version) => getDeckVersionCards(version.id, deckId)));
  const currentCardIds = new Set(currentDeckCards.map((card) => card.id));

  return (
    <section className="stack">
      <div className="row deck-header-row">
        <div>
          <p className="eyebrow">Deck Recovery</p>
          <h1>{deck.name} Versions</h1>
          <p className="subtitle">Review historical changes and restore full snapshots or specific cards.</p>
        </div>
        <Link className="button ghost" href={`/decks/${deckId}`}>
          Back to Deck
        </Link>
      </div>

      {restoredVersion ? (
        <section className="card callout">
          <p className="subtitle">Version restored successfully. A new snapshot was created for this restore action.</p>
        </section>
      ) : null}

      {restoredCard ? (
        <section className="card callout">
          <p className="subtitle">Card restored successfully. A new snapshot was created for this restore action.</p>
        </section>
      ) : null}

      {restoreError ? (
        <section className="card callout">
          <p className="subtitle">{decodeURIComponent(restoreError)}</p>
        </section>
      ) : null}

      <section className="card stack">
        <h3>Version History</h3>
        {versions.length === 0 ? (
          <p className="muted">No versions available for this deck yet.</p>
        ) : (
          <div className="version-list">
            {versions.map((version, index) => {
              const cardsInVersion = versionCards[index] ?? [];
              const previousCards = versionCards[index + 1] ?? null;
              const summary = summarizeVersionChanges(cardsInVersion, previousCards);

              return (
                <article className="version-item" key={version.id}>
                  <div className="row deck-header-row">
                    <div>
                      <p className="card-front">{new Date(version.createdAt).toLocaleString()}</p>
                      <p className="muted">{version.reason}</p>
                    </div>
                    <form action={restoreDeckVersionAction}>
                      <input type="hidden" name="deckId" value={deckId} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <button className="button danger" type="submit">
                        Restore deck to this version
                      </button>
                    </form>
                  </div>

                  <p className="muted">
                    Cards in version: {version.cardCount} | Added: {summary.added} | Updated: {summary.updated} | Removed:{" "}
                    {summary.removed}
                  </p>

                  {cardsInVersion.length === 0 ? (
                    <p className="muted">This version contains no cards.</p>
                  ) : (
                    <div className="version-card-list">
                      {cardsInVersion.map((versionCard) => (
                        <div className="version-card-item" key={versionCard.id}>
                          <form action={restoreVersionCardAction}>
                            <input type="hidden" name="deckId" value={deckId} />
                            <input type="hidden" name="versionId" value={version.id} />
                            <input type="hidden" name="versionCardId" value={versionCard.id} />
                            <button className="button ghost" type="submit">
                              Restore card
                            </button>
                          </form>
                          <div>
                            <p className="card-front">
                              <span className="card-label">Front:</span> {versionCard.front}
                            </p>
                            <p className="muted">
                              <span className="card-label">Back:</span> {versionCard.back}
                            </p>
                            <p className="muted">
                              Due {formatDueDate(versionCard.dueDate)} | Interval {versionCard.intervalDays} | Ease{" "}
                              {versionCard.easeFactor}
                            </p>
                            <p className="muted">
                              {currentCardIds.has(versionCard.cardId)
                                ? "Exists in current deck"
                                : "Missing from current deck (can be restored)"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
