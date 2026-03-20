import Link from "next/link";

import DeckList from "@/components/decks/DeckList";
import ThemeRecommendationCard from "@/components/preferences/ThemeRecommendationCard";
import { getDecks } from "@/lib/decks/deckQueries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const decks = await getDecks();
  const deckIds = new Set(decks.map((deck) => deck.id));
  const rootDecks = decks.filter((deck) => !deck.parentDeckId || !deckIds.has(deck.parentDeckId));
  const lastDeck = rootDecks[0] ?? null;

  return (
    <section className="stack">
      <ThemeRecommendationCard />
      <div className="home-grid">
        <Link
          aria-label={lastDeck ? `Open deck ${lastDeck.name}` : "Create your first deck"}
          className="card home-card home-card-link"
          href={lastDeck ? `/decks/${lastDeck.id}` : "/decks/new"}
        >
          <h2>Continue Studying</h2>
          <p className="subtitle">Jump right back into your most recent deck.</p>
          <div className="home-summary home-summary-centered">
            <p className="eyebrow">Last Accessed Deck</p>
            <p className="deck-title home-deck-title">{lastDeck?.name ?? "No decks yet"}</p>
            <p className="muted">{lastDeck ? `${lastDeck.cardCount} cards` : "Create one to begin."}</p>
            <span className="button primary home-card-cta">
              {lastDeck ? "Open Deck" : "Create Deck"}
            </span>
          </div>
        </Link>

        <Link className="card home-card home-card-link" href="/decks/new">
          <h2>Start a New Deck</h2>
          <p className="subtitle">Create a fresh deck and begin adding cards.</p>
          <div className="button-row home-button-row">
            <span className="button ghost home-card-cta">
              Start New Deck
            </span>
          </div>
        </Link>
      </div>
      <DeckList decks={rootDecks} />
    </section>
  );
}
