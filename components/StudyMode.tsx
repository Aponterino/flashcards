"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_DAILY_GOAL, getLocalDateISO } from "@/lib/studyCalendar";
import {
  buildStudyGroupsFromCards,
  buildCatchupStudySet,
  buildQuizStudySet,
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
type SessionKind = "study" | "learn" | "quiz";
type SessionSource = "custom" | "daily" | "catchup" | "browse" | "challenge-track" | "challenge" | "quiz";
type QuizRound = "primary" | "retry";

const PRESET_COUNTS = [5, 10, 15, 20, 25, 30];
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
]);

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

function getStudyFaceSizeClass(text: string): string {
  const newlineCount = text.match(/\n/g)?.length ?? 0;
  const effectiveLength = text.trim().length + newlineCount * 24;

  if (effectiveLength >= 430) {
    return "study-face-copy--dense";
  }

  if (effectiveLength >= 320) {
    return "study-face-copy--xlong";
  }

  if (effectiveLength >= 220) {
    return "study-face-copy--long";
  }

  if (effectiveLength >= 140) {
    return "study-face-copy--medium";
  }

  return "study-face-copy--default";
}

function shuffleValues<T>(values: T[]): T[] {
  const next = [...values];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function isNearDuplicate(a: string, b: string): boolean {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);

  if (!normalizedA || !normalizedB) {
    return false;
  }

  if (normalizedA === normalizedB) {
    return true;
  }

  return (
    (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) &&
    Math.abs(normalizedA.length - normalizedB.length) <= 8
  );
}

function distractorScore(candidate: string, correct: string): number {
  const candidateTokens = tokenize(candidate);
  const correctTokens = tokenize(correct);
  const candidateTokenSet = new Set(candidateTokens);
  const correctTokenSet = new Set(correctTokens);

  let overlapCount = 0;
  for (const token of candidateTokenSet) {
    if (correctTokenSet.has(token)) {
      overlapCount += 1;
    }
  }

  const overlapRatio =
    Math.max(candidateTokenSet.size, correctTokenSet.size) > 0
      ? overlapCount / Math.max(candidateTokenSet.size, correctTokenSet.size)
      : 0;

  const lengthRatio =
    Math.min(candidate.length, correct.length) / Math.max(1, Math.max(candidate.length, correct.length));

  const startsSame = normalizeText(candidate).slice(0, 2) === normalizeText(correct).slice(0, 2) ? 0.18 : 0;

  return overlapRatio * 3 + lengthRatio + startsSame;
}

function pickDistractors(correctAnswer: string, candidates: string[]): string[] {
  const scored = candidates
    .map((text) => ({ text, score: distractorScore(text, correctAnswer) }))
    .sort((a, b) => b.score - a.score);

  const topPoolCount = Math.min(scored.length, Math.max(6, Math.ceil(scored.length * 0.45)));
  const topPool = scored.slice(0, topPoolCount).map((entry) => entry.text);
  const picked = shuffleValues(topPool).slice(0, 3);

  if (picked.length < 3) {
    const fallbacks = scored.map((entry) => entry.text).filter((text) => !picked.includes(text));
    picked.push(...fallbacks.slice(0, 3 - picked.length));
  }

  return picked.slice(0, 3);
}

function buildQuizChoices(card: StudyCard, deckCards: StudyCard[]): string[] {
  const correctAnswer = card.back.trim();
  if (!correctAnswer) {
    return [];
  }

  const candidateSet = new Set<string>();
  for (const deckCard of deckCards) {
    if (deckCard.id === card.id) {
      continue;
    }

    const back = deckCard.back.trim();
    if (!back || back === correctAnswer) {
      continue;
    }

    candidateSet.add(back);
  }

  const allCandidates = Array.from(candidateSet);
  if (allCandidates.length < 3) {
    return [];
  }

  const strictCandidates = allCandidates.filter((candidate) => !isNearDuplicate(candidate, correctAnswer));
  const pool = strictCandidates.length >= 3 ? strictCandidates : allCandidates;
  const distractors = pickDistractors(correctAnswer, pool);

  if (distractors.length < 3) {
    return [];
  }

  return shuffleValues([correctAnswer, ...distractors]);
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
  const [sessionKind, setSessionKind] = useState<SessionKind>("study");
  const [sessionSource, setSessionSource] = useState<SessionSource>("custom");
  const [isFlipped, setIsFlipped] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"next" | "previous">("next");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isRating, setIsRating] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [quizChoices, setQuizChoices] = useState<string[]>([]);
  const [quizSelectedChoice, setQuizSelectedChoice] = useState<string | null>(null);
  const [quizAnswerCorrect, setQuizAnswerCorrect] = useState<boolean | null>(null);
  const [quizRound, setQuizRound] = useState<QuizRound>("primary");
  const [quizInitialTotal, setQuizInitialTotal] = useState(0);
  const [quizFirstPassCorrect, setQuizFirstPassCorrect] = useState(0);
  const [quizMissedCardIds, setQuizMissedCardIds] = useState<string[]>([]);
  const [quizRecoveredCardIds, setQuizRecoveredCardIds] = useState<string[]>([]);

  const quizOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const quizNextButtonRef = useRef<HTMLButtonElement | null>(null);
  const initialAutoStartAttempted = useRef(false);

  const cardsById = useMemo(() => new Map(studyCards.map((card) => [card.id, card])), [studyCards]);
  const groups = useMemo(() => buildStudyGroupsFromCards(studyCards), [studyCards]);
  const hardCards = useMemo(() => cardsByIds(groups.hard, cardsById), [groups.hard, cardsById]);
  const canStudy = studyCards.length > 0;
  const todayIso = getLocalDateISO();
  const overdueCount = useMemo(() => studyCards.filter((card) => card.dueDate < todayIso).length, [studyCards, todayIso]);
  const todaySessionMax = Math.max(1, Math.min(500, Math.round(dailyGoal)));
  const uniqueBackCount = useMemo(
    () => new Set(studyCards.map((card) => card.back.trim()).filter((back) => back.length > 0)).size,
    [studyCards]
  );
  const canStartQuiz = studyCards.length >= 4 && uniqueBackCount >= 4;
  const missedCardsSummary = useMemo(() => cardsByIds(quizMissedCardIds, cardsById), [cardsById, quizMissedCardIds]);
  const missedRecoveredCount = useMemo(
    () => quizMissedCardIds.filter((id) => quizRecoveredCardIds.includes(id)).length,
    [quizMissedCardIds, quizRecoveredCardIds]
  );
  const hasDenseQuizChoices = useMemo(
    () => quizChoices.some((choice) => choice.length > 170 || choice.split(/\s+/).length > 28),
    [quizChoices]
  );

  useEffect(() => {
    setStudyCards(cards);
  }, [cards]);

  useEffect(() => {
    let canceled = false;

    async function loadCalendarGoal() {
      try {
        const response = await fetch(`/api/decks/${deckId}/study-calendar`, { method: "GET" });
        if (!response.ok) {
          if (!canceled) {
            setGoalLoaded(true);
          }
          return;
        }

        const nextGoal = parseDailyGoal(await response.json());
        if (!canceled) {
          setDailyGoal(nextGoal);
          setGoalLoaded(true);
        }
      } catch {
        if (!canceled) {
          // Keep default goal when loading fails.
          setGoalLoaded(true);
        }
      }
    }

    void loadCalendarGoal();

    return () => {
      canceled = true;
    };
  }, [deckId]);

  const beginSession = useCallback(
    (
      nextCards: StudyCard[],
      label: string,
      includeHardReviewAtEnd: boolean,
      kind: SessionKind = "study",
      source: SessionSource = "custom"
    ) => {
      if (nextCards.length === 0) {
        return;
      }

      if (kind === "study" || kind === "quiz") {
        void (async () => {
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
        })();
      }

      setSessionLabel(label);
      setActiveCards(nextCards);
      setCurrentIndex(0);
      setSlideDirection("next");
      setIsFlipped(false);
      setSessionKind(kind);
      setSessionSource(source);
      setShowHardReviewAtEnd(includeHardReviewAtEnd);
      setReviewError(null);
      setQuizChoices([]);
      setQuizSelectedChoice(null);
      setQuizAnswerCorrect(null);
      setQuizRound("primary");
      setQuizInitialTotal(kind === "quiz" ? nextCards.length : 0);
      setQuizFirstPassCorrect(0);
      setQuizMissedCardIds([]);
      setQuizRecoveredCardIds([]);
      setView("studying");
    },
    [deckId, todayIso]
  );

  useEffect(() => {
    if ((initialMode === "today" || initialMode === "challenge" || initialMode === "quiz") && !goalLoaded) {
      return;
    }

    if (!initialList && !initialMode) {
      setView("chooser");
      return;
    }

    if (initialAutoStartAttempted.current) {
      return;
    }
    initialAutoStartAttempted.current = true;

    if (initialMode === "today") {
      const todayCards = buildTodayStudySet(cards, buildStudyGroupsFromCards(cards), todaySessionMax);
      if (todayCards.length === 0) {
        setView("chooser");
        return;
      }

      beginSession(todayCards, "Today's Study", false, "study", "daily");
      return;
    }

    if (initialMode === "catchup") {
      const catchupCards = buildCatchupStudySet(cards, 15);
      if (catchupCards.length === 0) {
        setView("chooser");
        return;
      }

      beginSession(catchupCards, "Catch-up Session", false, "study", "catchup");
      return;
    }

    if (initialMode === "all") {
      beginSession(cards, "Browse Flashcards", false, "learn", "browse");
      return;
    }

    if (initialMode === "challenge") {
      const challengeCards = buildQuizStudySet(cards, buildStudyGroupsFromCards(cards), todaySessionMax);
      if (challengeCards.length === 0) {
        setView("chooser");
        return;
      }

      beginSession(challengeCards, "Progressive Challenge", false, "study", "challenge");
      return;
    }

    if (initialMode === "quiz") {
      if (!canStartQuiz) {
        setView("chooser");
        return;
      }

      const quizCards = buildQuizStudySet(cards, buildStudyGroupsFromCards(cards), todaySessionMax);
      if (quizCards.length === 0) {
        setView("chooser");
        return;
      }

      beginSession(quizCards, "Multiple-Choice Quiz", false, "quiz", "quiz");
      return;
    }

    if (initialList) {
      const initialGroups = buildStudyGroupsFromCards(cards);
      const startCards = cardsByIds(initialGroups[initialList], new Map(cards.map((card) => [card.id, card])));
      if (startCards.length === 0) {
        setView("chooser");
        return;
      }

      beginSession(startCards, `${listLabel(initialList)} Challenge Track`, false, "learn", "challenge-track");
      return;
    }

    setView("chooser");
  }, [beginSession, canStartQuiz, cards, goalLoaded, initialList, initialMode, todaySessionMax]);

  const currentCard = activeCards[currentIndex] ?? null;
  const progressLabel = activeCards.length > 0 ? `Card ${currentIndex + 1} of ${activeCards.length}` : "";
  const onFirstCard = currentIndex === 0;
  const onLastCard = activeCards.length === 0 ? true : currentIndex >= activeCards.length - 1;
  const isLearnSession = sessionKind === "learn";
  const isQuizSession = sessionKind === "quiz";
  const frontFaceSizeClass = currentCard ? getStudyFaceSizeClass(currentCard.front) : "study-face-copy--default";
  const backFaceSizeClass = currentCard ? getStudyFaceSizeClass(currentCard.back) : "study-face-copy--default";

  useEffect(() => {
    if (view !== "studying" || !currentCard || !isQuizSession) {
      setQuizChoices([]);
      setQuizSelectedChoice(null);
      setQuizAnswerCorrect(null);
      return;
    }

    setQuizChoices(buildQuizChoices(currentCard, cards));
    setQuizSelectedChoice(null);
    setQuizAnswerCorrect(null);
  }, [cards, currentCard, isQuizSession, view]);

  useEffect(() => {
    if (view !== "studying" || !isQuizSession || quizChoices.length !== 4 || Boolean(quizSelectedChoice)) {
      return;
    }

    quizOptionRefs.current[0]?.focus();
  }, [isQuizSession, quizChoices, quizSelectedChoice, view]);

  useEffect(() => {
    if (view !== "studying" || !isQuizSession || !quizSelectedChoice) {
      return;
    }

    quizNextButtonRef.current?.focus();
  }, [isQuizSession, quizSelectedChoice, view]);

  function startDeckStudy(count: number) {
    if (!canStudy) {
      return;
    }

    const nextCount = clampCount(count, studyCards.length);
    beginSession(studyCards.slice(0, nextCount), "Study Session", true, "study", "custom");
  }

  function startTodaysStudy() {
    if (!canStudy) {
      return;
    }

    const todayCards = buildTodayStudySet(studyCards, groups, todaySessionMax);
    beginSession(todayCards, "Today's Study", false, "study", "daily");
  }

  function startCatchupStudy() {
    if (!canStudy) {
      return;
    }

    const catchupCards = buildCatchupStudySet(studyCards, 15);
    beginSession(catchupCards, "Catch-up Session", false, "study", "catchup");
  }

  function startMultipleChoiceQuiz() {
    if (!canStartQuiz) {
      return;
    }

    const quizCards = buildQuizStudySet(studyCards, groups, todaySessionMax);
    beginSession(quizCards, "Multiple Choice Quiz", false, "quiz", "quiz");
  }

  function handleCustomStart() {
    const parsed = Number.parseInt(customCount, 10);
    if (Number.isNaN(parsed)) {
      return;
    }

    startDeckStudy(parsed);
  }

  const saveReview = useCallback(async (cardId: string, difficulty: StudyDifficulty): Promise<boolean> => {
    setIsRating(true);
    setReviewError(null);

    try {
      const response = await fetch("/api/cards/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardId,
          difficulty,
          contextDeckId: deckId,
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
      return true;
    } catch (error) {
      console.error("Failed to persist review schedule", error);
      setReviewError("Review was not saved on the server. Please try again.");
      return false;
    } finally {
      setIsRating(false);
    }
  }, [deckId]);

  const startRetryRound = useCallback(() => {
    if (quizMissedCardIds.length === 0) {
      setView("complete");
      return;
    }

    const retryCards = cardsByIds(quizMissedCardIds, cardsById);
    if (retryCards.length === 0) {
      setView("complete");
      return;
    }

    setSessionLabel("Multiple-Choice Quiz Retry Round");
    setActiveCards(shuffleValues(retryCards));
    setCurrentIndex(0);
    setSlideDirection("next");
    setIsFlipped(false);
    setQuizRound("retry");
    setQuizChoices([]);
    setQuizSelectedChoice(null);
    setQuizAnswerCorrect(null);
    setReviewError(null);
    setView("studying");
  }, [cardsById, quizMissedCardIds]);

  const moveToNextCard = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= activeCards.length) {
      if (isQuizSession && quizRound === "primary" && quizMissedCardIds.length > 0) {
        startRetryRound();
        return;
      }

      setView("complete");
      return;
    }

    setSlideDirection("next");
    setCurrentIndex(nextIndex);
    setIsFlipped(false);
    setQuizChoices([]);
    setQuizSelectedChoice(null);
    setQuizAnswerCorrect(null);
  }, [activeCards.length, currentIndex, isQuizSession, quizMissedCardIds.length, quizRound, startRetryRound]);

  async function rateCard(difficulty: StudyDifficulty) {
    if (!currentCard || isRating) {
      return;
    }

    const saved = await saveReview(currentCard.id, difficulty);
    if (!saved) {
      return;
    }

    moveToNextCard();
  }

  const selectQuizChoice = useCallback(
    async (choice: string) => {
      if (!currentCard || isRating || quizSelectedChoice) {
        return;
      }

      if (quizChoices.length !== 4) {
        setReviewError("This deck needs at least 4 unique answers to run quiz mode.");
        return;
      }

      const correctAnswer = currentCard.back.trim();
      const isCorrect = choice === correctAnswer;
      setQuizSelectedChoice(choice);
      setQuizAnswerCorrect(isCorrect);

      if (quizRound === "primary") {
        if (isCorrect) {
          setQuizFirstPassCorrect((previous) => previous + 1);
        } else {
          setQuizMissedCardIds((previous) => (previous.includes(currentCard.id) ? previous : [...previous, currentCard.id]));
        }
      } else if (isCorrect) {
        setQuizRecoveredCardIds((previous) => (previous.includes(currentCard.id) ? previous : [...previous, currentCard.id]));
      }

      await saveReview(currentCard.id, isCorrect ? "easy" : "hard");
    },
    [currentCard, isRating, quizChoices, quizRound, quizSelectedChoice, saveReview]
  );

  function goToPreviousCard() {
    if (onFirstCard || isRating) {
      return;
    }

    setSlideDirection("previous");
    setCurrentIndex((previous) => Math.max(0, previous - 1));
    setIsFlipped(false);
  }

  function goToNextCard() {
    if (onLastCard || isRating) {
      return;
    }

    setSlideDirection("next");
    setCurrentIndex((previous) => Math.min(activeCards.length - 1, previous + 1));
    setIsFlipped(false);
  }

  function toggleFlip() {
    setIsFlipped((previous) => !previous);
  }

  function shuffleBrowseCards() {
    if (sessionSource !== "browse" || activeCards.length < 2 || isRating) {
      return;
    }

    setActiveCards((previous) => {
      if (previous.length < 2) {
        return previous;
      }
      return shuffleValues(previous);
    });
    setCurrentIndex(0);
    setSlideDirection("next");
    setIsFlipped(false);
  }

  function endSession() {
    router.replace(`/decks/${deckId}?session=${Date.now()}`);
  }

  function beginHardReview() {
    if (hardCards.length === 0) {
      return;
    }

    beginSession(hardCards, "Hard Card Review", false, "study", "challenge-track");
  }

  function finishLearnSession() {
    setView("complete");
  }

  useEffect(() => {
    if (view !== "studying" || !currentCard) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();

      if (!isQuizSession && (event.code === "Space" || event.code === "ArrowUp" || event.code === "ArrowDown")) {
        if (tagName === "input" || tagName === "textarea" || tagName === "button") {
          return;
        }

        event.preventDefault();
        setIsFlipped((previous) => !previous);
        return;
      }

      if (target && (tagName === "input" || tagName === "textarea")) {
        return;
      }

      if (isQuizSession && quizChoices.length === 4 && quizSelectedChoice === null) {
        if (event.code === "Digit1" || event.code === "Numpad1") {
          event.preventDefault();
          void selectQuizChoice(quizChoices[0]);
          return;
        }

        if (event.code === "Digit2" || event.code === "Numpad2") {
          event.preventDefault();
          void selectQuizChoice(quizChoices[1]);
          return;
        }

        if (event.code === "Digit3" || event.code === "Numpad3") {
          event.preventDefault();
          void selectQuizChoice(quizChoices[2]);
          return;
        }

        if (event.code === "Digit4" || event.code === "Numpad4") {
          event.preventDefault();
          void selectQuizChoice(quizChoices[3]);
          return;
        }
      }

      if (isQuizSession && quizSelectedChoice && !isRating) {
        if (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "KeyN" || event.code === "ArrowRight") {
          event.preventDefault();
          moveToNextCard();
          return;
        }
      }

      if (!isLearnSession) {
        return;
      }

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        if (isRating) {
          return;
        }
        setSlideDirection("previous");
        setCurrentIndex((previous) => Math.max(0, previous - 1));
        setIsFlipped(false);
        return;
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        if (isRating) {
          return;
        }
        setSlideDirection("next");
        setCurrentIndex((previous) => Math.min(activeCards.length - 1, previous + 1));
        setIsFlipped(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeCards.length,
    currentCard,
    isLearnSession,
    isQuizSession,
    isRating,
    moveToNextCard,
    quizChoices,
    quizSelectedChoice,
    selectQuizChoice,
    view,
  ]);

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
            <button className="button ghost" disabled={!canStartQuiz} type="button" onClick={startMultipleChoiceQuiz}>
              Multiple-choice quiz
            </button>
            {overdueCount > 0 && (
              <button className="button ghost" type="button" onClick={startCatchupStudy}>
                Catch up overdue ({Math.min(overdueCount, 15)})
              </button>
            )}
          </div>
          {!canStartQuiz ? <p className="muted">Quiz mode requires at least 4 cards with unique answers.</p> : null}
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
            {!isLearnSession && !isQuizSession && (
              <button
                aria-label="Go to previous card"
                className="button ghost study-back-arrow"
                disabled={onFirstCard || isRating}
                onClick={goToPreviousCard}
                type="button"
              >
                ←
              </button>
            )}
            <div className="study-toolbar-meta">
              <p className="chip">{progressLabel}</p>
              <p className="chip">
                {isLearnSession
                  ? "Browse flashcards"
                  : isQuizSession
                    ? quizRound === "primary"
                      ? "Quiz mode · Round 1"
                      : "Quiz mode · Retry"
                    : "Study mode"}
              </p>
            </div>
            {sessionSource === "browse" && activeCards.length > 1 ? (
              <div className="study-toolbar-actions">
                <button className="button ghost" disabled={isRating} onClick={shuffleBrowseCards} type="button">
                  Shuffle
                </button>
              </div>
            ) : null}
          </div>

          {!isQuizSession ? (
            <div className={`study-flashcard-nav-row ${isLearnSession ? "learn" : ""}`}>
              {isLearnSession ? (
                <button
                  aria-label="Previous card"
                  className="button ghost study-card-nav-button"
                  disabled={onFirstCard || isRating}
                  onClick={goToPreviousCard}
                  type="button"
                >
                  ←
                </button>
              ) : null}

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
                    <div className={`study-face-copy ${frontFaceSizeClass}`}>
                      <p>{currentCard.front}</p>
                    </div>
                  </div>
                  <div className="study-flashcard-face study-flashcard-back">
                    <span className="study-face-label">Back</span>
                    <div className={`study-face-copy ${backFaceSizeClass}`}>
                      <p>{currentCard.back}</p>
                    </div>
                  </div>
                </div>
              </button>

              {isLearnSession ? (
                <button
                  aria-label="Next card"
                  className="button ghost study-card-nav-button"
                  disabled={onLastCard || isRating}
                  onClick={goToNextCard}
                  type="button"
                >
                  →
                </button>
              ) : null}
            </div>
          ) : (
            <div className={`study-quiz-shell ${slideDirection === "next" ? "slide-next" : "slide-previous"}`} key={`${quizRound}-${currentCard.id}-${currentIndex}`}>
              <article className="study-quiz-prompt">
                <p className="study-face-label">Front</p>
                <p className={`study-quiz-front ${frontFaceSizeClass}`}>{currentCard.front}</p>
              </article>
              {quizChoices.length === 4 ? (
                <div className={`study-quiz-options${hasDenseQuizChoices ? " dense" : ""}`} role="group" aria-label="Quiz answers">
                  {quizChoices.map((choice, index) => {
                    const isSelected = quizSelectedChoice === choice;
                    const isCorrectChoice = choice === currentCard.back.trim();
                    const toneClass =
                      quizSelectedChoice === null
                        ? ""
                        : isCorrectChoice
                          ? " correct"
                          : isSelected
                            ? " incorrect"
                            : "";
                    const selectedClass = isSelected ? " selected" : "";

                    return (
                      <button
                        key={`${currentCard.id}-${index}-${choice}`}
                        aria-pressed={isSelected}
                        className={`button ghost study-quiz-option${toneClass}${selectedClass}`}
                        disabled={Boolean(quizSelectedChoice) || isRating}
                        onClick={() => void selectQuizChoice(choice)}
                        ref={(node) => {
                          quizOptionRefs.current[index] = node;
                        }}
                        type="button"
                      >
                        <span className="study-quiz-option-index">{index + 1}.</span>
                        <span className="study-quiz-option-copy">{choice}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">This deck needs at least 4 cards with unique answers to run quiz mode.</p>
              )}
            </div>
          )}

          {isLearnSession ? (
            <p className="muted study-learn-hint">Use ← and → to navigate cards, and Space, ↑, or ↓ to flip.</p>
          ) : isQuizSession ? (
            <p className="muted study-learn-hint">Pick 1-4 to answer. Press Enter, N, or → for next.</p>
          ) : null}

          {!isQuizSession && (
            <button className="button ghost study-flip-button" disabled={isRating} onClick={toggleFlip} type="button">
              Flip card
            </button>
          )}

          {!isLearnSession && !isQuizSession && (
            <div className="difficulty-row">
              <button className="button difficulty easy" disabled={isRating} type="button" onClick={() => void rateCard("easy")}>
                Easy
              </button>
              <button className="button difficulty medium" disabled={isRating} type="button" onClick={() => void rateCard("medium")}>
                Medium
              </button>
              <button className="button difficulty hard" disabled={isRating} type="button" onClick={() => void rateCard("hard")}>
                Hard
              </button>
            </div>
          )}

          {isLearnSession && onLastCard ? (
            <button className="button primary" disabled={isRating} type="button" onClick={finishLearnSession}>
              {sessionSource === "challenge-track" ? "Complete challenge track" : "Finish browsing"}
            </button>
          ) : null}

          {isQuizSession ? (
            <>
              <button
                className={`button primary study-quiz-next-button${
                  quizAnswerCorrect === null ? "" : quizAnswerCorrect ? " is-correct" : " is-wrong"
                }`}
                disabled={!quizSelectedChoice || isRating}
                onClick={moveToNextCard}
                ref={quizNextButtonRef}
                type="button"
              >
                {onLastCard
                  ? quizRound === "primary" && quizMissedCardIds.length > 0
                    ? "Start retry round"
                    : "Finish quiz"
                  : "Next question"}
              </button>
              {quizAnswerCorrect !== null ? (
                <p className="muted">
                  {quizAnswerCorrect ? "Correct." : "Not quite."} Correct answer: {currentCard.back}
                </p>
              ) : null}
            </>
          ) : null}

          {reviewError ? <p className="study-review-error">{reviewError}</p> : null}
        </section>
      )}

      {view === "complete" && (
        <section className="card stack study-panel-centered">
          <h2>{sessionLabel} complete</h2>
          <p className="muted">
            Hard: {groups.hard.length} | Medium: {groups.medium.length} | Easy: {groups.easy.length}
          </p>
          {sessionKind === "quiz" ? (
            <>
              <p className="muted">
                First pass accuracy: {quizFirstPassCorrect}/{Math.max(quizInitialTotal, 1)} ({Math.round((quizFirstPassCorrect / Math.max(quizInitialTotal, 1)) * 100)}%)
              </p>
              <p className="muted">
                Missed on first pass: {quizMissedCardIds.length}
                {quizMissedCardIds.length > 0 ? ` · Recovered in retry: ${missedRecoveredCount}/${quizMissedCardIds.length}` : ""}
              </p>
              {missedCardsSummary.length > 0 ? (
                <div className="study-quiz-summary">
                  <p className="study-quiz-summary-title">Missed cards</p>
                  <ul className="study-quiz-missed-list">
                    {missedCardsSummary.map((card) => {
                      const recovered = quizRecoveredCardIds.includes(card.id);
                      return (
                        <li key={card.id} className="study-quiz-missed-item">
                          <p className="study-quiz-missed-front">{card.front}</p>
                          <p className="study-quiz-missed-back">Answer: {card.back}</p>
                          <p className={`study-quiz-missed-status ${recovered ? "recovered" : "not-recovered"}`}>
                            {recovered ? "Recovered in retry" : "Still needs review"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
          <p className="muted">Daily goal: {dailyGoal} cards</p>
          <div className="button-row study-action-row">
            {(sessionSource === "daily" || sessionSource === "challenge-track") && canStartQuiz ? (
              <button className="button ghost" type="button" onClick={startMultipleChoiceQuiz}>
                Start multiple-choice quiz
              </button>
            ) : null}
            {sessionKind === "quiz" && quizMissedCardIds.length > 0 ? (
              <button className="button ghost" type="button" onClick={startRetryRound}>
                Retry missed cards
              </button>
            ) : null}
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
