"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_DAILY_GOAL, getLocalDateISO } from "@/lib/studyCalendar";
import {
  buildStudyGroupsFromCards,
  buildCatchupStudySet,
  buildTodayStudySet,
  type StudyCard,
  type StudyDifficulty,
  type StudyStartMode,
} from "@/lib/studySession";

interface StudyModeProps {
  deckId: string;
  deckName: string;
  cards: StudyCard[];
  initialList?: StudyDifficulty;
  initialMode?: StudyStartMode;
}

type StudyView = "chooser" | "studying" | "complete";

const PRESET_COUNTS = [5, 10, 15, 20, 25, 30];

function clampCount(value: number, max: number): number {
  return Math.max(1, Math.min(value, max));
}

function listLabel(type: StudyDifficulty): string {
  if (type === "hard") {
    return "Hard";
  }

  if (type === "medium") {
    return "Medium";
  }

  return "Easy";
}

function cardsByIds(cardIds: string[], cardsById: Map<string, StudyCard>): StudyCard[] {
  return cardIds.map((id) => cardsById.get(id)).filter((card): card is StudyCard => Boolean(card));
}

function formatShortDate(dateIso: string): string {
  const parts = dateIso.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return dateIso;
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getDueLabel(card: StudyCard, todayIso: string): string {
  if (card.dueDate < todayIso) {
    return `Overdue since ${formatShortDate(card.dueDate)}`;
  }

  if (card.dueDate === todayIso) {
    return "Due today";
  }

  return `Due ${formatShortDate(card.dueDate)}`;
}

function parseDailyGoal(value: unknown): number {
  if (!value || typeof value !== "object") {
    return DEFAULT_DAILY_GOAL;
  }

  const record = value as Record<string, unknown>;
  const goalConfigured = record.goalConfigured === true;
  const parsed = Number(record.dailyGoal);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return goalConfigured ? DEFAULT_DAILY_GOAL : 10;
  }

  if (!goalConfigured) {
    return 10;
  }

  return Math.max(1, Math.min(500, Math.round(parsed)));
}

export default function StudyMode({ deckId, deckName, cards, initialList, initialMode }: StudyModeProps) {
  const router = useRouter();
  const [studyCards, setStudyCards] = useState<StudyCard[]>(cards);
  const [customCount, setCustomCount] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [activeCards, setActiveCards] = useState<StudyCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showHardReviewAtEnd, setShowHardReviewAtEnd] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("Study Session");
  const [view, setView] = useState<StudyView>("chooser");
  const [isFlipped, setIsFlipped] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"next" | "previous">("next");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isRating, setIsRating] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);

  const cardsById = useMemo(() => new Map(studyCards.map((card) => [card.id, card])), [studyCards]);
  const groups = useMemo(() => buildStudyGroupsFromCards(studyCards), [studyCards]);
  const hardCards = useMemo(() => cardsByIds(groups.hard, cardsById), [groups.hard, cardsById]);
  const canStudy = studyCards.length > 0;
  const todayIso = getLocalDateISO();
  const overdueCount = useMemo(() => studyCards.filter((card) => card.dueDate < todayIso).length, [studyCards, todayIso]);
  const todaySessionMax = Math.max(dailyGoal, 20);

  useEffect(() => {
    setStudyCards(cards);
  }, [cards]);

  useEffect(() => {
    let canceled = false;

    async function loadCalendarGoal() {
      try {
        const response = await fetch(`/api/decks/${deckId}/study-calendar`, { method: "GET" });
        if (!response.ok) {
          return;
        }

        const nextGoal = parseDailyGoal(await response.json());
        if (!canceled) {
          setDailyGoal(nextGoal);
        }
      } catch {
        // Keep default goal when loading fails.
      }
    }

    void loadCalendarGoal();

    return () => {
      canceled = true;
    };
  }, [deckId]);

  useEffect(() => {
    if (!initialList && !initialMode) {
      setView("chooser");
      return;
    }

    if (initialMode === "today") {
      const todayCards = buildTodayStudySet(cards, buildStudyGroupsFromCards(cards), Math.max(DEFAULT_DAILY_GOAL, 20));
      if (todayCards.length === 0) {
        setView("chooser");
        return;
      }

      beginSession(todayCards, "Today's Study", false);
      return;
    }

    if (initialMode === "catchup") {
      const catchupCards = buildCatchupStudySet(cards, 15);
      if (catchupCards.length === 0) {
        setView("chooser");
        return;
      }

      beginSession(catchupCards, "Catch-up Session", false);
      return;
    }

    if (initialMode === "all") {
      beginSession(cards, "Study All", false);
      return;
    }

    if (initialList) {
      const initialGroups = buildStudyGroupsFromCards(cards);
      const startCards = cardsByIds(initialGroups[initialList], new Map(cards.map((card) => [card.id, card])));
      if (startCards.length === 0) {
        setView("chooser");
        return;
      }

      beginSession(startCards, `Review ${listLabel(initialList)} cards`, false);
      return;
    }

    setView("chooser");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, initialList, initialMode]);

  const currentCard = activeCards[currentIndex] ?? null;
  const progressLabel = activeCards.length > 0 ? `Card ${currentIndex + 1} of ${activeCards.length}` : "";
  const onFirstCard = currentIndex === 0;

  async function startTodayIfNeeded() {
    try {
      await fetch(`/api/decks/${deckId}/study-calendar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start-day",
          dateIso: todayIso,
        }),
      });
    } catch {
      // Session can still continue if this call fails.
    }
  }

  function beginSession(nextCards: StudyCard[], label: string, includeHardReviewAtEnd: boolean) {
    if (nextCards.length === 0) {
      return;
    }

    void startTodayIfNeeded();
    setSessionLabel(label);
    setActiveCards(nextCards);
    setCurrentIndex(0);
    setSlideDirection("next");
    setIsFlipped(false);
    setShowHardReviewAtEnd(includeHardReviewAtEnd);
    setReviewError(null);
    setView("studying");
  }

  function startDeckStudy(count: number) {
    if (!canStudy) {
      return;
    }

    const nextCount = clampCount(count, studyCards.length);
    beginSession(studyCards.slice(0, nextCount), "Study Session", true);
  }

  function startTodaysStudy() {
    if (!canStudy) {
      return;
    }

    const todayCards = buildTodayStudySet(studyCards, groups, todaySessionMax);
    beginSession(todayCards, "Today's Study", false);
  }

  function startCatchupStudy() {
    if (!canStudy) {
      return;
    }

    const catchupCards = buildCatchupStudySet(studyCards, 15);
    beginSession(catchupCards, "Catch-up Session", false);
  }

  function handleCustomStart() {
    const parsed = Number.parseInt(customCount, 10);
    if (Number.isNaN(parsed)) {
      return;
    }

    startDeckStudy(parsed);
  }

  async function rateCard(difficulty: StudyDifficulty) {
    if (!currentCard || isRating) {
      return;
    }

    setIsRating(true);
    setReviewError(null);

    try {
      const response = await fetch("/api/cards/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardId: currentCard.id,
          difficulty,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const updated = (await response.json()) as {
        id: string;
        dueDate: string;
        intervalDays: number;
        easeFactor: string;
        lastDifficulty: StudyDifficulty | null;
        dailyGoal: number;
      };

      setStudyCards((previous) =>
        previous.map((card) =>
          card.id === updated.id
            ? {
                ...card,
                dueDate: updated.dueDate,
                intervalDays: updated.intervalDays,
                easeFactor: updated.easeFactor,
                lastDifficulty: updated.lastDifficulty,
              }
            : card
        )
      );
      setDailyGoal(Math.max(1, Math.min(500, Math.round(updated.dailyGoal))));
    } catch (error) {
      console.error("Failed to persist review schedule", error);
      setReviewError("Review was not saved on the server. Please try again.");
      setIsRating(false);
      return;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= activeCards.length) {
      setView("complete");
      setIsRating(false);
      return;
    }

    setSlideDirection("next");
    setCurrentIndex(nextIndex);
    setIsFlipped(false);
    setIsRating(false);
  }

  function goToPreviousCard() {
    if (onFirstCard) {
      return;
    }

    setSlideDirection("previous");
    setCurrentIndex((previous) => Math.max(0, previous - 1));
    setIsFlipped(false);
  }

  function toggleFlip() {
    setIsFlipped((previous) => !previous);
  }

  function endSession() {
    router.replace(`/decks/${deckId}?session=${Date.now()}`);
  }

  function beginHardReview() {
    if (hardCards.length === 0) {
      return;
    }

    beginSession(hardCards, "Hard Card Review", false);
  }

  useEffect(() => {
    if (view !== "studying" || !currentCard) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "button") {
          return;
        }
      }

      event.preventDefault();
      toggleFlip();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentCard, view]);

  if (!canStudy) {
    return (
      <section className="card stack study-panel-centered">
        <h1>Study {deckName}</h1>
        <p className="muted">No cards available in this deck yet.</p>
        <div className="button-row study-action-row">
          <Link className="button ghost" href={`/decks/${deckId}?session=empty`}>
            Back to deck
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="study-page-shell stack">
      <div className="row">
        <div>
          <p className="eyebrow">Study Mode</p>
          <h1>{deckName}</h1>
        </div>
        <button className="button ghost" onClick={endSession} type="button">
          Back to deck
        </button>
      </div>

      {view === "chooser" && (
        <section className="card stack study-panel-centered">
          <h2>How many cards do you want to study?</h2>
          <p className="muted">This deck currently has {studyCards.length} cards.</p>
          <div className="button-row study-action-row">
            <button className="button primary" type="button" onClick={startTodaysStudy}>
              Today&apos;s Study (up to {todaySessionMax})
            </button>
            {overdueCount > 0 && (
              <button className="button ghost" type="button" onClick={startCatchupStudy}>
                Catch up overdue ({Math.min(overdueCount, 15)})
              </button>
            )}
          </div>
          <div className="study-count-grid">
            {PRESET_COUNTS.map((count) => (
              <button key={count} className="button ghost" type="button" onClick={() => startDeckStudy(count)}>
                {count}
              </button>
            ))}
            <button className="button ghost" type="button" onClick={() => setCustomOpen((previous) => !previous)}>
              Custom
            </button>
          </div>
          {customOpen && (
            <div className="study-custom-row">
              <input
                aria-label="Custom card count"
                className="study-custom-input"
                inputMode="numeric"
                min={1}
                max={studyCards.length}
                onChange={(event) => setCustomCount(event.target.value)}
                placeholder="Enter card count"
                type="number"
                value={customCount}
              />
              <button className="button primary" type="button" onClick={handleCustomStart}>
                Start custom study
              </button>
            </div>
          )}
        </section>
      )}

      {view === "studying" && currentCard && (
        <section className="study-focused-card">
          <div className="study-card-toolbar">
            <button
              aria-label="Go to previous card"
              className="button ghost study-back-arrow"
              disabled={onFirstCard || isRating}
              onClick={goToPreviousCard}
              type="button"
            >
              ←
            </button>
            <div className="study-toolbar-meta">
              <p className="chip">{progressLabel}</p>
              <p className="chip study-due-chip">{getDueLabel(currentCard, todayIso)}</p>
            </div>
          </div>
          <button
            aria-label={`Flip flashcard. Currently showing ${isFlipped ? "back" : "front"} side.`}
            className={`study-flashcard-shell ${slideDirection === "next" ? "slide-next" : "slide-previous"}`}
            key={currentCard.id}
            onClick={toggleFlip}
            type="button"
          >
            <div className={`study-flashcard${isFlipped ? " flipped" : ""}`}>
              <div className="study-flashcard-face study-flashcard-front">
                <span className="study-face-label">Front</span>
                <p>{currentCard.front}</p>
              </div>
              <div className="study-flashcard-face study-flashcard-back">
                <span className="study-face-label">Back</span>
                <p>{currentCard.back}</p>
              </div>
            </div>
          </button>
          <button className="button ghost study-flip-button" disabled={isRating} onClick={toggleFlip} type="button">
            Flip card
          </button>
          <div className="difficulty-row">
            <button className="button difficulty easy" disabled={isRating} type="button" onClick={() => rateCard("easy")}>
              Easy
            </button>
            <button className="button difficulty medium" disabled={isRating} type="button" onClick={() => rateCard("medium")}>
              Medium
            </button>
            <button className="button difficulty hard" disabled={isRating} type="button" onClick={() => rateCard("hard")}>
              Hard
            </button>
          </div>
          {reviewError ? <p className="study-review-error">{reviewError}</p> : null}
        </section>
      )}

      {view === "complete" && (
        <section className="card stack study-panel-centered">
          <h2>{sessionLabel} complete</h2>
          <p className="muted">
            Hard: {groups.hard.length} | Medium: {groups.medium.length} | Easy: {groups.easy.length}
          </p>
          <p className="muted">Daily goal: {dailyGoal} cards</p>
          <div className="button-row study-action-row">
            {showHardReviewAtEnd && hardCards.length > 0 && (
              <button className="button difficulty hard" type="button" onClick={beginHardReview}>
                Review hard cards
              </button>
            )}
            <button className="button primary" type="button" onClick={endSession}>
              End study session
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
