import { notFound } from "next/navigation";

import StudySession from "@/components/StudySession";
import { createCardAction } from "@/lib/actions";
import { getCardsByDeck } from "@/lib/queries/cards";
import { getDeckById } from "@/lib/queries/decks";

interface DeckPageProps {
  params: { deckId: string };
}

export default async function DeckPage({ params }: DeckPageProps) {
  const deck = await getDeckById(params.deckId);
  if (!deck) {
    notFound();
  }

  const cards = await getCardsByDeck(params.deckId);

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Deck</p>
        <h2>{deck.name}</h2>
        <p className="subtitle">Review due cards, add new prompts, and track progress.</p>
      </div>
      <StudySession deckId={params.deckId} />

      <section className="card stack">
        <h3>Add a card</h3>
        <form className="stack" action={createCardAction}>
          <input type="hidden" name="deckId" value={params.deckId} />
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
        <h3>Cards</h3>
        {cards.length === 0 ? (
          <p className="muted">No cards yet. Add your first prompt above.</p>
        ) : (
          <div className="card-list">
            {cards.map((card) => (
              <div className="card-item" key={card.id}>
                <div>
                  <p className="card-front">{card.front}</p>
                  <p className="muted">{card.back}</p>
                </div>
                <span className="chip">
                  Due {new Date(card.dueDate).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
