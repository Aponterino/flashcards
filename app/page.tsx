import Link from "next/link";

import DeckList from "@/components/DeckList";
import { getDecks } from "@/lib/queries/decks";

export default async function HomePage() {
  const decks = await getDecks();
  return (
    <section className="stack">
      <div className="hero">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h2>Daily Flashcards, Made Friendly</h2>
          <p className="subtitle">
            Create decks, schedule bite-sized sessions, and review with spaced repetition.
          </p>
        </div>
        <Link className="button primary" href="/decks">
          View my decks
        </Link>
      </div>

      <DeckList decks={decks} />
    </section>
  );
}
