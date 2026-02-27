import { notFound } from "next/navigation";

import StudyMode from "@/components/StudyMode";
import { getCardsForStudyDeck } from "@/lib/queries/cards";
import { getDeckById } from "@/lib/queries/decks";
import type { StudyDifficulty, StudyStartMode } from "@/lib/studySession";

export const dynamic = "force-dynamic";

interface StudyPageProps {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ list?: string; mode?: string }>;
}

function parseDifficulty(value: string | undefined): StudyDifficulty | undefined {
  if (value === "hard" || value === "medium" || value === "easy") {
    return value;
  }

  return undefined;
}

function parseStartMode(value: string | undefined): StudyStartMode | undefined {
  if (value === "today") {
    return value;
  }

  if (value === "catchup") {
    return value;
  }

  if (value === "all") {
    return value;
  }

  if (value === "challenge") {
    return value;
  }

  if (value === "quiz") {
    return value;
  }

  return undefined;
}

function parseLastDifficulty(value: string | null): StudyDifficulty | null {
  if (value === "hard" || value === "medium" || value === "easy") {
    return value;
  }

  return null;
}

export default async function StudyPage({ params, searchParams }: StudyPageProps) {
  const { deckId } = await params;
  const { list, mode } = await searchParams;

  const deck = await getDeckById(deckId);
  if (!deck) {
    notFound();
  }

  const cards = await getCardsForStudyDeck(deckId);
  const studyCards = cards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    dueDate: card.dueDate,
    intervalDays: card.intervalDays,
    easeFactor: card.easeFactor,
    lastDifficulty: parseLastDifficulty(card.lastDifficulty),
  }));

  return (
    <StudyMode
      cards={studyCards}
      deckId={deckId}
      deckName={deck.name}
      initialList={parseDifficulty(list)}
      initialMode={parseStartMode(mode)}
    />
  );
}
