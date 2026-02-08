import { notFound } from "next/navigation";
import Link from "next/link";

import { restoreDeletedDeckAction } from "@/lib/actions";
import { getCardsByDeck } from "@/lib/queries/cards";
import { getDeletedDeckById } from "@/lib/queries/decks";

export const dynamic = "force-dynamic";

interface DeletedDeckDetailPageProps {
  params: Promise<{ deckId: string }>;
}

export default async function DeletedDeckDetailPage({ params }: DeletedDeckDetailPageProps) {
  const { deckId } = await params;
  const deck = await getDeletedDeckById(deckId);
  if (!deck) {
    notFound();
  }

  const cards = await getCardsByDeck(deckId);

  return (
    <section className="stack">
      <div className="row deck-header-row">
        <div>
          <p className="eyebrow">Deleted Deck</p>
          <h1>{deck.name}</h1>
          <p className="subtitle">Review cards before restoring this deck.</p>
        </div>
        <form action={restoreDeletedDeckAction}>
          <input type="hidden" name="deckId" value={deckId} />
          <input type="hidden" name="redirectTo" value={`/decks/${deckId}`} />
          <button className="button danger" type="submit">
            Restore deck
          </button>
        </form>
      </div>

      <section className="card stack">
        <div className="row">
          <h3>Cards</h3>
          <Link className="button ghost" href="/decks/deleted">
            Back to deleted decks
          </Link>
        </div>
        {cards.length === 0 ? (
          <p className="muted">No cards in this deck.</p>
        ) : (
          <div className="card-list">
            {cards.map((card) => (
              <div className="card-item" key={card.id}>
                <div>
                  <p className="card-front">
                    <span className="card-label">Front:</span> {card.front}
                  </p>
                  <p className="muted">
                    <span className="card-label">Back:</span> {card.back}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
