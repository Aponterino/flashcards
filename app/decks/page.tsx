import Link from "next/link";

import DeckList from "@/components/DeckList";
import { getDecks } from "@/lib/queries/decks";

export const dynamic = "force-dynamic";

interface DecksPageProps {
  searchParams: Promise<{ deleted?: string }>;
}

export default async function DecksPage({ searchParams }: DecksPageProps) {
  const { deleted } = await searchParams;
  const decks = await getDecks();
  const deckIds = new Set(decks.map((deck) => deck.id));
  const rootDecks = decks.filter((deck) => !deck.parentDeckId || !deckIds.has(deck.parentDeckId));
  return (
    <section className="stack">
      {deleted === "1" ? (
        <section className="card callout">
          <p className="subtitle">
            Deck moved to trash. View deleted decks to restore context or purge permanently.
          </p>
          <div className="button-row">
            <Link className="button ghost" href="/decks/deleted">
              View deleted decks
            </Link>
          </div>
        </section>
      ) : null}
      <div className="row">
        <div>
          <h1>Your Decks</h1>
          <p className="subtitle">Pick a deck to study or create a new one.</p>
        </div>
        <Link className="button ghost" href="/decks/new">
          New deck
        </Link>
      </div>
      <DeckList decks={rootDecks} />
    </section>
  );
}
