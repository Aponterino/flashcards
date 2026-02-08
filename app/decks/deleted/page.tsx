import Link from "next/link";

import PurgeDeletedDecksButton from "@/components/PurgeDeletedDecksButton";
import { purgeDeletedDecksAction, restoreDeletedDeckAction } from "@/lib/actions";
import { getDeletedDecks } from "@/lib/queries/decks";

export const dynamic = "force-dynamic";

interface DeletedDecksPageProps {
  searchParams: Promise<{ purged?: string; restored?: string }>;
}

export default async function DeletedDecksPage({ searchParams }: DeletedDecksPageProps) {
  const { purged, restored } = await searchParams;
  const deletedDecks = await getDeletedDecks();

  return (
    <section className="stack">
      <div className="row">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Deleted Decks</h1>
          <p className="subtitle">Decks you delete are moved here until you purge them.</p>
        </div>
        <PurgeDeletedDecksButton purgeAction={purgeDeletedDecksAction} disabled={deletedDecks.length === 0} />
      </div>

      {purged === "1" ? (
        <section className="card callout">
          <p className="subtitle">Deleted decks were permanently removed.</p>
        </section>
      ) : null}

      {restored === "1" ? (
        <section className="card callout">
          <p className="subtitle">Deck restored.</p>
        </section>
      ) : null}

      <section className="card">
        {deletedDecks.length === 0 ? (
          <p className="muted">No deleted decks.</p>
        ) : (
          <div className="card-list">
            {deletedDecks.map((deck) => (
              <div className="card-item deleted-deck-row" key={deck.id}>
                <Link
                  aria-label={`Review deleted deck: ${deck.name}`}
                  className="card-row-link"
                  href={`/decks/deleted/${deck.id}`}
                >
                  <span className="visually-hidden">Review deleted deck: {deck.name}</span>
                </Link>
                <div className="card-main-link">
                  <p className="card-front">{deck.name}</p>
                  <p className="muted">{deck.cardCount} cards</p>
                </div>
                <div className="card-item-actions">
                  <form action={restoreDeletedDeckAction}>
                    <input type="hidden" name="deckId" value={deck.id} />
                    <input type="hidden" name="redirectTo" value="/decks/deleted?restored=1" />
                    <button className="button ghost-danger card-hover-action" type="submit">
                      Restore
                    </button>
                  </form>
                  <span className="chip">
                    Deleted {deck.deletedAt ? new Date(deck.deletedAt).toLocaleDateString() : "recently"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
