import Link from "next/link";

import type { DeckSummary } from "@/lib/queries/decks";

interface DeckListProps {
  decks: DeckSummary[];
}

export default function DeckList({ decks }: DeckListProps) {
  return (
    <section className="card">
      <h3>My Decks</h3>
      {decks.length === 0 ? (
        <p className="muted">No decks yet. Create one to get started.</p>
      ) : (
        <div className="deck-grid">
          {decks.map((deck) => (
            <Link className="deck-card" key={deck.id} href={`/decks/${deck.id}`}>
              <div>
                <p className="deck-title">{deck.name}</p>
                <p className="muted">
                  {deck.cardCount} cards
                  {deck.childCount > 0 ? ` • ${deck.childCount} sections` : ""}
                </p>
              </div>
              <span className="chip deck-open-chip card-hover-action">Open</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
