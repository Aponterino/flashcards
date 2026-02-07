import Link from "next/link";

import DeckList from "@/components/DeckList";
import { getDecks } from "@/lib/queries/decks";

export default async function DecksPage() {
  const decks = await getDecks();
  return (
    <section className="stack">
      <div className="row">
        <div>
          <h2>Your Decks</h2>
          <p className="subtitle">Pick a deck to study or create a new one.</p>
        </div>
        <Link className="button ghost" href="/decks/new">
          New deck
        </Link>
      </div>
      <DeckList decks={decks} />
    </section>
  );
}
