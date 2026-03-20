import Link from "next/link";

import { createDeckAction } from "@/lib/decks/deckServerActions";

interface NewDeckPageProps {
  searchParams: Promise<{ hierarchyError?: string }>;
}

export default async function NewDeckPage({ searchParams }: NewDeckPageProps) {
  const { hierarchyError } = await searchParams;

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">New deck</p>
        <h1>Create a deck</h1>
        <p className="subtitle">Give your deck a name and start adding cards.</p>
      </div>

      {hierarchyError ? (
        <section className="card callout">
          <p className="subtitle">{hierarchyError}</p>
        </section>
      ) : null}

      <form className="card stack" action={createDeckAction}>
        <label className="field">
          Deck name
          <input name="name" placeholder="e.g. Biology 101" />
        </label>
        <div className="button-row">
          <button className="button primary" type="submit">
            Create deck
          </button>
          <Link className="button ghost" href="/decks">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
