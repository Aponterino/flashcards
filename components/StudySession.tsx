"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_DAILY_GOAL,
  QUALITY_THRESHOLD,
  getDayAccuracy,
  getDayProgress,
  getDayStatus,
  getLocalDateISO,
  getMinimumViableTarget,
  getReviewedCount,
  hitsMomentum,
  setCalendarDailyGoal,
  type StudyCalendarState,
  type StudyDayEntry,
  type StudyDayStatus,
} from "@/lib/studyCalendar";
import { buildStudyGroupsFromCards, type StudyCard, type StudyDifficulty } from "@/lib/studySession";

interface StudySessionProps {
  deckId: string;
  cards: StudyCard[];
}

interface CalendarDay {
  date: Date;
  dateIso: string;
  isCurrentMonth: boolean;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GOAL_RECOMMENDATION = 10;
const GOAL_PRESETS = [5, 10, 15, 20, 30, 40];
type CalendarView = "week" | "month";

function getCardsByIds(cardIds: string[], cardMap: Map<string, StudyCard>): StudyCard[] {
  return cardIds
    .map((id) => cardMap.get(id))
    .filter((card): card is StudyCard => Boolean(card));
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

function statusLabel(status: StudyDayStatus): string {
  if (status === "complete") {
    return "Goal complete";
  }

  if (status === "in_progress") {
    return "In progress";
  }

  if (status === "missed") {
    return "Goal missed";
  }

  return "Not started";
}

function getProgressCopy(percent: number): { label: string; message: string } {
  if (percent >= 90) {
    return { label: "Mastery", message: "Nearly done. Keep momentum." };
  }

  if (percent >= 70) {
    return { label: "Strong", message: "Great progress. One short session can finish this deck." };
  }

  if (percent >= 40) {
    return { label: "Building", message: "Recall is building. Keep stacking wins." };
  }

  if (percent > 0) {
    return { label: "Starting", message: "Nice start. A few more cards will build rhythm." };
  }

  return { label: "New Deck", message: "Start your first session to unlock progress." };
}

function getTrackMeta(type: StudyDifficulty): { title: string; subtitle: string; icon: string } {
  if (type === "hard") {
    return { title: "Challenge Track", subtitle: "Stretch your recall", icon: "▲" };
  }

  if (type === "medium") {
    return { title: "Practice Track", subtitle: "Build confidence", icon: "●" };
  }

  return { title: "Foundation Track", subtitle: "Lock in basics", icon: "■" };
}

function buildCalendarDays(monthDate: Date): CalendarDay[] {
  const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(firstDayOfMonth);
  gridStart.setDate(firstDayOfMonth.getDate() - firstDayOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      date: day,
      dateIso: getLocalDateISO(day),
      isCurrentMonth: day.getMonth() === monthDate.getMonth(),
    };
  });
}

function buildCenteredWeekDays(anchorDate: Date): CalendarDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const offset = index - 3;
    const day = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + offset);
    return {
      date: day,
      dateIso: getLocalDateISO(day),
      isCurrentMonth: true,
    };
  });
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function parseCalendarPayload(value: unknown): StudyCalendarState {
  if (!value || typeof value !== "object") {
    return { dailyGoal: DEFAULT_DAILY_GOAL, goalConfigured: false, days: {} };
  }

  const record = value as Record<string, unknown>;
  const parsedGoal = Number(record.dailyGoal);
  const dailyGoal = Number.isFinite(parsedGoal) && parsedGoal > 0 ? Math.round(parsedGoal) : DEFAULT_DAILY_GOAL;
  const goalConfigured = record.goalConfigured === true;
  const daysRecord = record.days && typeof record.days === "object" ? (record.days as Record<string, unknown>) : {};

  const days = Object.entries(daysRecord).reduce<Record<string, StudyDayEntry>>((next, [dateIso, entry]) => {
    if (!entry || typeof entry !== "object") {
      return next;
    }

    const row = entry as Record<string, unknown>;
    const goal = Number(row.goal);
    const reviewedCount = Number(row.reviewedCount);
    const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString();

    if (!Number.isFinite(goal) || !Number.isFinite(reviewedCount)) {
      return next;
    }

    next[dateIso] = {
      goal: Math.max(1, Math.round(goal)),
      reviewedCount: Math.max(0, Math.round(reviewedCount)),
      easyCount: Number.isFinite(Number(row.easyCount)) ? Math.max(0, Math.round(Number(row.easyCount))) : 0,
      mediumCount: Number.isFinite(Number(row.mediumCount)) ? Math.max(0, Math.round(Number(row.mediumCount))) : 0,
      hardCount: Number.isFinite(Number(row.hardCount)) ? Math.max(0, Math.round(Number(row.hardCount))) : 0,
      dueCountSnapshot: Number.isFinite(Number(row.dueCountSnapshot)) ? Math.max(0, Math.round(Number(row.dueCountSnapshot))) : 0,
      overdueCountSnapshot: Number.isFinite(Number(row.overdueCountSnapshot)) ? Math.max(0, Math.round(Number(row.overdueCountSnapshot))) : 0,
      startedAt: typeof row.startedAt === "string" ? row.startedAt : undefined,
      completedAt: typeof row.completedAt === "string" ? row.completedAt : undefined,
      updatedAt,
    };

    return next;
  }, {});

  return { dailyGoal, goalConfigured, days };
}

function dateOffsetIso(baseIso: string, offsetDays: number): string {
  const [year, month, day] = baseIso.split("-").map(Number);
  const next = new Date(year, month - 1, day + offsetDays);
  return getLocalDateISO(next);
}

function formatShortDate(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  if ([year, month, day].some(Number.isNaN)) {
    return dateIso;
  }

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getDominantWeakness(entry: StudyDayEntry | undefined): "hard" | "medium" | "easy" | null {
  if (!entry) {
    return null;
  }

  const hard = entry.hardCount ?? 0;
  const medium = entry.mediumCount ?? 0;
  const easy = entry.easyCount ?? 0;
  if (hard === 0 && medium === 0 && easy === 0) {
    return null;
  }

  if (hard >= medium && hard >= easy) {
    return "hard";
  }

  if (medium >= easy) {
    return "medium";
  }

  return "easy";
}

function getWeaknessLabel(value: "hard" | "medium" | "easy" | null): string {
  if (value === "hard") {
    return "Needs reinforcement";
  }

  if (value === "medium") {
    return "Mixed confidence";
  }

  if (value === "easy") {
    return "Strong recall";
  }

  return "No signal";
}

function isGoalEditorHashActive(): boolean {
  return typeof window !== "undefined" && window.location.hash === "#daily-goal-settings";
}

export default function StudySession({ deckId, cards }: StudySessionProps) {
  const router = useRouter();
  const groups = useMemo(() => buildStudyGroupsFromCards(cards), [cards]);
  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  const [calendarState, setCalendarState] = useState<StudyCalendarState>({
    dailyGoal: DEFAULT_DAILY_GOAL,
    goalConfigured: false,
    days: {},
  });
  const [goalInput, setGoalInput] = useState(String(GOAL_RECOMMENDATION));
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>(null);
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);

  const todayIso = getLocalDateISO();

  useEffect(() => {
    let canceled = false;

    async function loadCalendar() {
      try {
        const response = await fetch(`/api/decks/${deckId}/study-calendar`, { method: "GET" });
        if (!response.ok) {
          return;
        }

        const payload = parseCalendarPayload(await response.json());
        if (!canceled) {
          setCalendarState(payload);
          setGoalInput(String(payload.goalConfigured ? payload.dailyGoal : GOAL_RECOMMENDATION));
          setGoalEditorOpen(!payload.goalConfigured || isGoalEditorHashActive());
        }
      } catch {
        // Keep defaults when loading fails.
      }
    }

    void loadCalendar();

    return () => {
      canceled = true;
    };
  }, [deckId]);

  const hardCards = getCardsByIds(groups.hard, cardMap);
  const mediumCards = getCardsByIds(groups.medium, cardMap);
  const easyCards = getCardsByIds(groups.easy, cardMap);
  const studiedCount = hardCards.length + mediumCards.length + easyCards.length;
  const totalCards = cards.length;
  const remainingCount = Math.max(totalCards - studiedCount, 0);
  const isNewDeck = studiedCount === 0;
  const progressPercent = totalCards > 0 ? Math.round((studiedCount / totalCards) * 100) : 0;
  const progressCopy = getProgressCopy(progressPercent);
  const ringSize = 200;
  const ringStroke = 16;
  const ringCenter = ringSize / 2;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progressPercent / 100) * ringCircumference;
  const safeDeckId = useMemo(() => deckId.replace(/[^a-zA-Z0-9_-]/g, "-"), [deckId]);
  const ringGradientId = useMemo(() => `study-progress-gradient-${safeDeckId}`, [safeDeckId]);
  const firstSessionHelpId = useMemo(() => `study-first-help-${safeDeckId}`, [safeDeckId]);
  const dueSessionHelpId = useMemo(() => `study-due-help-${safeDeckId}`, [safeDeckId]);
  const customSessionHelpId = useMemo(() => `study-custom-help-${safeDeckId}`, [safeDeckId]);
  const allSessionHelpId = useMemo(() => `study-all-help-${safeDeckId}`, [safeDeckId]);
  const quizSessionHelpId = useMemo(() => `study-quiz-help-${safeDeckId}`, [safeDeckId]);
  const multipleChoiceHelpId = useMemo(() => `study-mcq-help-${safeDeckId}`, [safeDeckId]);

  const todayEntry = calendarState.days[todayIso];
  const todayGoal = todayEntry?.goal ?? calendarState.dailyGoal;
  const todayReviewedCount = getReviewedCount(todayEntry);
  const todayProgress = getDayProgress(todayEntry ?? { goal: todayGoal, reviewedCount: 0, updatedAt: "" });
  const todayStatus = getDayStatus(todayIso, todayEntry, todayIso);
  const todayAccuracy = getDayAccuracy(todayEntry);
  const todayMinimum = getMinimumViableTarget(todayGoal);
  const goalCandidate = Number.parseInt(goalInput, 10);
  const projectedGoal = Number.isFinite(goalCandidate) && goalCandidate > 0 ? goalCandidate : GOAL_RECOMMENDATION;
  const projectedDaysToFinish = remainingCount > 0 ? Math.ceil(remainingCount / projectedGoal) : 0;
  const projectedCompletionDateIso = dateOffsetIso(todayIso, Math.max(projectedDaysToFinish - 1, 0));
  const projectedCompletionWeekday = new Date(
    projectedCompletionDateIso.split("-").map(Number)[0],
    projectedCompletionDateIso.split("-").map(Number)[1] - 1,
    projectedCompletionDateIso.split("-").map(Number)[2]
  ).toLocaleDateString(undefined, { weekday: "long" });
  const completionLabel =
    remainingCount === 0 ? "Done" : `${projectedCompletionWeekday}, ${formatShortDate(projectedCompletionDateIso)}`;

  const dueCountByDate = useMemo(() => {
    const map = new Map<string, number>();

    cards.forEach((card) => {
      map.set(card.dueDate, (map.get(card.dueDate) ?? 0) + 1);
    });

    return map;
  }, [cards]);

  const overdueCount = useMemo(() => cards.filter((card) => card.dueDate < todayIso).length, [cards, todayIso]);
  const dueTodayCount = useMemo(() => cards.filter((card) => card.dueDate === todayIso).length, [cards, todayIso]);
  const upcomingCount = useMemo(() => cards.filter((card) => card.dueDate > todayIso).length, [cards, todayIso]);
  const todayQueueCount = overdueCount + dueTodayCount;
  const nextSessionCards = useMemo(() => {
    if (isNewDeck) {
      return Math.max(1, Math.min(Math.max(todayGoal, 10), Math.max(totalCards, todayGoal)));
    }

    const baseline = todayQueueCount > 0 ? todayQueueCount : todayGoal;
    return Math.max(1, Math.min(Math.max(baseline, 12), 40));
  }, [isNewDeck, todayGoal, totalCards, todayQueueCount]);
  const nextSessionMinutes = Math.max(5, Math.round(nextSessionCards * 0.75));
  const hardRatio = studiedCount > 0 ? hardCards.length / studiedCount : 0;
  const riskLevel: "high" | "medium" | "low" =
    overdueCount >= 5 || hardRatio >= 0.4 ? "high" : overdueCount > 0 || hardRatio >= 0.2 ? "medium" : "low";
  const riskLabel = riskLevel === "high" ? "High" : riskLevel === "medium" ? "Medium" : "Low";
  const paceOnTrack = todayStatus === "complete" || todayReviewedCount >= todayMinimum;
  const paceLabel = paceOnTrack ? "On track" : "Behind";
  const paceToneClass = paceOnTrack ? "pace-on-track" : "pace-behind";
  const nextFocusAction = (() => {
    if (remainingCount === 0) {
      return "Deck complete. Keep momentum with a quick maintenance review.";
    }

    if (overdueCount > 0) {
      return `Catch up overdue cards first (${Math.min(overdueCount, 15)} suggested).`;
    }

    if (hardCards.length > 0) {
      return `Review hard cards next (${Math.min(hardCards.length, 15)} suggested).`;
    }

    if (dueTodayCount > 0) {
      return `Clear cards due today (${Math.min(dueTodayCount, 15)} suggested).`;
    }

    return `Learn new cards (${Math.min(Math.max(todayGoal, 10), remainingCount)} suggested).`;
  })();

  const monthCalendarDays = useMemo(() => buildCalendarDays(calendarCursor), [calendarCursor]);
  const weekCalendarDays = useMemo(() => buildCenteredWeekDays(new Date()), []);
  const calendarDays = calendarView === "month" ? monthCalendarDays : weekCalendarDays;
  const monthCompletedDays = useMemo(() => {
    return calendarDays.filter((day) => day.isCurrentMonth && getDayStatus(day.dateIso, calendarState.days[day.dateIso], todayIso) === "complete").length;
  }, [calendarDays, calendarState.days, todayIso]);

  const forecastDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const dateIso = dateOffsetIso(todayIso, index);
      const due = dueCountByDate.get(dateIso) ?? 0;
      return {
        dateIso,
        due,
        overload: due > Math.max(1, calendarState.dailyGoal * 1.2),
      };
    });
  }, [todayIso, dueCountByDate, calendarState.dailyGoal]);

  const maxForecast = useMemo(() => Math.max(1, ...forecastDays.map((day) => day.due)), [forecastDays]);

  const suggestedGoal = useMemo(() => {
    const nextThree = forecastDays.slice(0, 3).reduce((sum, day) => sum + day.due, 0);
    const baseline = Math.ceil(nextThree / 3);
    return Math.max(10, Math.min(120, baseline + Math.ceil(overdueCount / 4)));
  }, [forecastDays, overdueCount]);

  const retention7Day = useMemo(() => {
    const total = Array.from({ length: 7 }, (_, index) => calendarState.days[dateOffsetIso(todayIso, -index)]).filter(Boolean);
    if (total.length === 0) {
      return 0;
    }

    const numerator = total.reduce((sum, entry) => sum + getDayAccuracy(entry), 0);
    return numerator / total.length;
  }, [calendarState.days, todayIso]);

  const weeklySummary = useMemo(() => {
    const recent = Array.from({ length: 7 }, (_, index) => {
      const dateIso = dateOffsetIso(todayIso, -index);
      const entry = calendarState.days[dateIso];
      return {
        dateIso,
        entry,
        status: getDayStatus(dateIso, entry, todayIso),
      };
    });

    const completeDays = recent.filter((day) => day.status === "complete").length;
    const missedDays = recent.filter((day) => day.status === "missed").length;
    const bestStart = recent
      .map((day) => day.entry?.startedAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .sort((a, b) => a.getHours() - b.getHours())[0];

    return {
      completeDays,
      missedDays,
      bestStartLabel: bestStart
        ? bestStart.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        : "No sessions",
    };
  }, [calendarState.days, todayIso]);

  const momentumStreak = useMemo(() => {
    let streak = 0;
    let cursor = 0;
    while (cursor < 30) {
      const dateIso = dateOffsetIso(todayIso, -cursor);
      const entry = calendarState.days[dateIso];
      if (!hitsMomentum(entry)) {
        break;
      }
      streak += 1;
      cursor += 1;
    }

    return streak;
  }, [calendarState.days, todayIso]);

  const forecastRiskLevel = useMemo(() => {
    const nextWeekDue = forecastDays.reduce((sum, day) => sum + day.due, 0);
    const capacity = calendarState.dailyGoal * 7;

    if (capacity === 0) {
      return "high";
    }

    const ratio = nextWeekDue / capacity;
    if (ratio >= 1.15) {
      return "high";
    }

    if (ratio >= 0.85) {
      return "medium";
    }

    return "low";
  }, [forecastDays, calendarState.dailyGoal]);
  const forecastRiskLabel =
    forecastRiskLevel === "high" ? "High" : forecastRiskLevel === "medium" ? "Medium" : "Low";
  const goalActionVerb = calendarState.goalConfigured ? "Change" : "Set";
  const showNewDeckWelcome = isNewDeck && !calendarState.goalConfigured;
  const [animateDashboard, setAnimateDashboard] = useState(false);
  const [showMetricDetails, setShowMetricDetails] = useState(false);

  const selectedEntry = selectedDateIso ? calendarState.days[selectedDateIso] : undefined;

  function jumpToAddCardsSection() {
    const addCardsSection = document.getElementById("add-cards-section");
    if (addCardsSection) {
      addCardsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (typeof window !== "undefined") {
      const nextUrl = `${window.location.pathname}${window.location.search}#add-cards-section`;
      window.history.replaceState(null, "", nextUrl);
    }
  }

  function handleWelcomeStudyAll() {
    if (totalCards === 0) {
      jumpToAddCardsSection();
      return;
    }

    router.push(`/decks/${deckId}/study?mode=all`);
  }

  function shiftCalendarMonth(offset: number) {
    if (calendarView === "week") {
      return;
    }
    setCalendarCursor((previous) => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = Number.parseInt(goalInput, 10);
    if (Number.isNaN(parsed)) {
      setGoalInput(String(calendarState.dailyGoal));
      return;
    }

    try {
      const response = await fetch(`/api/decks/${deckId}/study-calendar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set-goal",
          dailyGoal: parsed,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { dailyGoal: number };
      setCalendarState((previous) => setCalendarDailyGoal(previous, payload.dailyGoal));
      setGoalInput(String(payload.dailyGoal));
      setGoalEditorOpen(false);
    } catch {
      setGoalInput(String(calendarState.goalConfigured ? calendarState.dailyGoal : GOAL_RECOMMENDATION));
    }
  }

  async function applySuggestedGoal() {
    setGoalInput(String(suggestedGoal));
    try {
      const response = await fetch(`/api/decks/${deckId}/study-calendar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set-goal",
          dailyGoal: suggestedGoal,
        }),
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { dailyGoal: number };
      setCalendarState((previous) => setCalendarDailyGoal(previous, payload.dailyGoal));
      setGoalInput(String(payload.dailyGoal));
      setGoalEditorOpen(false);
    } catch {
      // Ignore optimistic failure.
    }
  }

  useEffect(() => {
    if (showNewDeckWelcome) {
      return;
    }

    setAnimateDashboard(true);
    const timeoutId = window.setTimeout(() => setAnimateDashboard(false), 520);
    return () => window.clearTimeout(timeoutId);
  }, [showNewDeckWelcome]);

  useEffect(() => {
    if (isNewDeck) {
      setShowMetricDetails(false);
    }
  }, [isNewDeck]);

  useEffect(() => {
    const syncGoalEditorWithHash = () => {
      if (isGoalEditorHashActive()) {
        setShowMetricDetails(true);
        setGoalEditorOpen(true);
      }
    };

    syncGoalEditorWithHash();
    window.addEventListener("hashchange", syncGoalEditorWithHash);
    return () => window.removeEventListener("hashchange", syncGoalEditorWithHash);
  }, []);

  useEffect(() => {
    if (!showMetricDetails || !isGoalEditorHashActive()) {
      return;
    }

    const goalSettings = document.getElementById("daily-goal-settings");
    goalSettings?.scrollIntoView({ block: "start" });
  }, [showMetricDetails]);

  return (
    <section className="card stack study-session-shell">
      <div className="study-session-header">
        <div>
          <h3>Study</h3>
          <p className="subtitle">Start a focused study session first, then review trends and planning details.</p>
        </div>
      </div>
      {showNewDeckWelcome ? (
        <section className="study-welcome-card" aria-label="New deck setup">
          <p className="study-welcome-eyebrow">Let&apos;s begin studying</p>
          <h4>Choose your first study path</h4>
          <p className="study-welcome-copy">Start with a full-deck review or set your daily goal for steady progress.</p>
          <div className="study-welcome-grid">
            <article className="study-welcome-option study-welcome-option-all" aria-label="Browse flashcards option">
              <p className="study-welcome-option-eyebrow">Quick Start</p>
              <h5>Browse flashcards</h5>
              <p className="study-welcome-option-copy">
                Browse every card in this deck with free navigation and no grading.
              </p>
              <button className="button ghost subtle-attention-button subtle-attention-button-browse" onClick={handleWelcomeStudyAll} type="button">
                Browse flashcards
              </button>
            </article>

            <article className="study-welcome-option study-welcome-option-goal" aria-label={`${goalActionVerb} daily goal option`}>
              <p className="study-welcome-recommended">Recommended</p>
              <p className="study-welcome-option-eyebrow">Consistency Track</p>
              <h5>{goalActionVerb} your daily goal</h5>
              <p className="study-welcome-option-copy">
                Choose how many cards to study each day. You can adjust this anytime.
              </p>

              <div className="study-goal-presets">
                {GOAL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    className={`button ghost study-goal-preset ${projectedGoal === preset ? "active" : ""}`}
                    type="button"
                    onClick={() => setGoalInput(String(preset))}
                  >
                    {preset}/day
                  </button>
                ))}
              </div>

              <form className="study-goal-form study-welcome-goal-form" onSubmit={saveGoal}>
                <input
                  aria-label="Daily goal"
                  className="study-goal-input"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  onChange={(event) => setGoalInput(event.target.value)}
                  type="number"
                  value={goalInput}
                />
                <button className="button primary subtle-attention-button subtle-attention-button-goal" type="submit">
                  {goalActionVerb} Daily Goal
                </button>
              </form>

              <button className="button ghost study-suggest-button" onClick={applySuggestedGoal} type="button">
                Use Suggested Goal ({suggestedGoal}/day)
              </button>
            </article>
          </div>
        </section>
      ) : (
      <div className={`study-dashboard-shell ${animateDashboard ? "enter" : ""}`}>
      {!isNewDeck ? (
        <section className="study-today-strip" aria-label="Today at a glance">
          <article className="study-today-item">
            <p className="study-today-label">Goal progress</p>
            <p className="study-today-value">
              {todayReviewedCount}/{todayGoal}
            </p>
          </article>
          <article className="study-today-item">
            <p className="study-today-label">Momentum streak</p>
            <p className="study-today-value">
              {momentumStreak} day{momentumStreak === 1 ? "" : "s"}
            </p>
          </article>
          <article className="study-today-item">
            <p className="study-today-label">Next session ETA</p>
            <p className="study-today-value">{nextSessionMinutes} min</p>
          </article>
        </section>
      ) : null}
      <section className="study-actions-panel" aria-label="Study actions">
        <h4 className="study-actions-title">Start a study session</h4>
        <p className="study-actions-highlight">
          Next best action: review {nextSessionCards} card{nextSessionCards === 1 ? "" : "s"} in about {nextSessionMinutes} minutes.
        </p>
        {isNewDeck ? (
          <>
            <p className="study-actions-copy">Start your first focused session or open a flexible custom session.</p>
            <div className="study-actions-list">
              <div className="study-action-item">
                <div className="study-action-head">
                  <span className="study-action-icon" aria-hidden="true">
                    ▶
                  </span>
                  <div>
                    <p className="study-action-title">First Session</p>
                    <p className="study-action-meta">~8-12 minutes</p>
                  </div>
                </div>
                <p className="study-action-help" id={firstSessionHelpId}>
                  A balanced starter mix of due and new cards.
                </p>
                <Link className="button primary" href={`/decks/${deckId}/study?mode=today`} aria-describedby={firstSessionHelpId}>
                  Start daily session
                </Link>
              </div>
              <div className="study-action-item">
                <div className="study-action-head">
                  <span className="study-action-icon" aria-hidden="true">
                    ≡
                  </span>
                  <div>
                    <p className="study-action-title">Custom Study</p>
                    <p className="study-action-meta">Flexible duration</p>
                  </div>
                </div>
                <p className="study-action-help" id={customSessionHelpId}>
                  Study the full deck or choose your own session size.
                </p>
                <Link className="button ghost" href={`/decks/${deckId}/study`} aria-describedby={customSessionHelpId}>
                  Open custom study
                </Link>
              </div>
              <div className="study-action-item">
                <div className="study-action-head">
                  <span className="study-action-icon" aria-hidden="true">
                    ∞
                  </span>
                  <div>
                    <p className="study-action-title">Browse Flashcards</p>
                    <p className="study-action-meta">Entire deck</p>
                  </div>
                </div>
                <p className="study-action-help" id={allSessionHelpId}>
                  Browse every card with arrow-key navigation and no grading.
                </p>
                <Link className="button ghost" href={`/decks/${deckId}/study?mode=all`} aria-describedby={allSessionHelpId}>
                  Browse flashcards
                </Link>
              </div>
              <div className="study-action-item">
                <div className="study-action-head">
                  <span className="study-action-icon" aria-hidden="true">
                    ★
                  </span>
                  <div>
                    <p className="study-action-title">Progressive Challenge</p>
                    <p className="study-action-meta">Adaptive challenge</p>
                  </div>
                </div>
                <p className="study-action-help" id={quizSessionHelpId}>
                  Adaptive card grading with a progressively harder mix.
                </p>
                <Link className="button ghost" href={`/decks/${deckId}/study?mode=challenge`} aria-describedby={quizSessionHelpId}>
                  Start progressive challenge
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="study-actions-copy">Choose a focused daily set or open a flexible custom session.</p>
            <div className="study-actions-list">
              <div className="study-action-item">
                <div className="study-action-head">
                  <span className="study-action-icon" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <p className="study-action-title">Study Due Today</p>
                    <p className="study-action-meta">~8-12 minutes</p>
                  </div>
                </div>
                <p className="study-action-help" id={dueSessionHelpId}>
                  Due cards first, with targeted review mixed in.
                </p>
                <Link className="button primary" href={`/decks/${deckId}/study?mode=today`} aria-describedby={dueSessionHelpId}>
                  Start daily session
                </Link>
              </div>
              <div className="study-action-item">
                <div className="study-action-head">
                  <span className="study-action-icon" aria-hidden="true">
                    ≡
                  </span>
                  <div>
                    <p className="study-action-title">Custom Study</p>
                    <p className="study-action-meta">Flexible duration</p>
                  </div>
                </div>
                <p className="study-action-help" id={customSessionHelpId}>
                  Study the full deck or choose your own session size.
                </p>
                <Link className="button ghost" href={`/decks/${deckId}/study`} aria-describedby={customSessionHelpId}>
                  Open custom study
                </Link>
              </div>
              <div className="study-action-item">
                <div className="study-action-head">
                  <span className="study-action-icon" aria-hidden="true">
                    ∞
                  </span>
                  <div>
                    <p className="study-action-title">Browse Flashcards</p>
                    <p className="study-action-meta">Entire deck</p>
                  </div>
                </div>
                <p className="study-action-help" id={allSessionHelpId}>
                  Browse every card with arrow-key navigation and no grading.
                </p>
                <Link className="button ghost" href={`/decks/${deckId}/study?mode=all`} aria-describedby={allSessionHelpId}>
                  Browse flashcards
                </Link>
              </div>
              <div className="study-action-item">
                <div className="study-action-head">
                  <span className="study-action-icon" aria-hidden="true">
                    ★
                  </span>
                  <div>
                    <p className="study-action-title">Progressive Challenge</p>
                    <p className="study-action-meta">Adaptive challenge</p>
                  </div>
                </div>
                <p className="study-action-help" id={quizSessionHelpId}>
                  Adaptive card grading with a progressively harder mix.
                </p>
                <Link className="button ghost" href={`/decks/${deckId}/study?mode=challenge`} aria-describedby={quizSessionHelpId}>
                  Start progressive challenge
                </Link>
              </div>
            </div>
            {overdueCount > 0 ? (
              <div className="study-recovery-row">
                <p className="muted">Recovery plan: clear overdue cards first.</p>
                <Link className="button ghost" href={`/decks/${deckId}/study?mode=catchup`}>
                  Catch up overdue ({Math.min(overdueCount, 15)})
                </Link>
              </div>
            ) : null}
          </>
        )}
      </section>
      <section className="session-card stack study-tracks-panel" aria-label="Multiple-choice quiz">
        <div>
          <h4 className="study-tracks-title">Multiple-Choice Quiz</h4>
          <p className="muted">Multiple-choice mode with 4 answers per card and a retry round for misses.</p>
        </div>
        <div className="study-action-item">
          <div className="study-action-head">
            <span className="study-action-icon" aria-hidden="true">
              ?
            </span>
            <div>
              <p className="study-action-title">Multiple-Choice Quiz</p>
              <p className="study-action-meta">Front prompt + 4 options</p>
            </div>
          </div>
          <p className="study-action-help" id={multipleChoiceHelpId}>
            One correct answer and three distractors from other cards.
          </p>
          <Link className="button ghost" href={`/decks/${deckId}/study?mode=quiz`} aria-describedby={multipleChoiceHelpId}>
            Start multiple-choice quiz
          </Link>
        </div>
      </section>

      {!isNewDeck ? (
      <section className="session-card stack study-tracks-panel" aria-label="Challenge tracks">
        <div>
          <h4 className="study-tracks-title">Challenge tracks</h4>
          <p className="muted">Browse a focused difficulty lane to learn patterns without grading.</p>
        </div>
        <div className="study-summary-grid">
          {([
            { type: "hard", cards: hardCards },
            { type: "medium", cards: mediumCards },
            { type: "easy", cards: easyCards },
          ] as const).map(({ type, cards: categoryCards }) => (
            <article className={`study-summary-card ${type}`} key={type}>
              <header className="study-summary-head">
                <div className="study-summary-heading">
                  <span className="study-summary-icon" aria-hidden="true">
                    {getTrackMeta(type).icon}
                  </span>
                  <div>
                    <h4>{getTrackMeta(type).title}</h4>
                    <p className="study-summary-subtitle">{getTrackMeta(type).subtitle}</p>
                  </div>
                </div>
                <p className="study-summary-count">{categoryCards.length}</p>
              </header>
              <ul className="study-summary-list">
                {categoryCards.length === 0 ? (
                  <li className="study-summary-empty">No cards yet</li>
                ) : (
                  <>
                    {categoryCards.slice(0, 3).map((card) => (
                      <li key={card.id}>{card.front}</li>
                    ))}
                    {categoryCards.length > 3 ? <li className="study-summary-empty">+{categoryCards.length - 3} more</li> : null}
                  </>
                )}
              </ul>
              <Link className={`button difficulty ${type} study-summary-action`} href={`/decks/${deckId}/study?list=${type}`}>
                Browse {listLabel(type)}
              </Link>
            </article>
          ))}
        </div>
        <p className="muted">Progressive Challenge is in Start a study session above. Multiple-Choice Quiz is in the section above.</p>
      </section>
      ) : null}
      <section className="study-analytics-section" aria-label="Progress and planning">
        <header className="study-analytics-header">
          <p className="study-analytics-eyebrow">Progress and planning</p>
          <h4>Track outcomes and plan upcoming sessions</h4>
        </header>

        <section className="study-progress-card" aria-label="Deck study progress">
        <div className="study-progress-visual" aria-hidden="true">
          <svg className="study-progress-ring" viewBox={`0 0 ${ringSize} ${ringSize}`}>
            <defs>
              <linearGradient id={ringGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9fb1ff" />
                <stop offset="50%" stopColor="#7d93ff" />
                <stop offset="100%" stopColor="#4f70ff" />
              </linearGradient>
            </defs>
            <circle className="study-progress-track" cx={ringCenter} cy={ringCenter} r={ringRadius} />
            <circle
              className="study-progress-fill"
              cx={ringCenter}
              cy={ringCenter}
              r={ringRadius}
              stroke={`url(#${ringGradientId})`}
              style={{
                strokeDasharray: `${ringCircumference}`,
                strokeDashoffset: `${ringOffset}`,
              }}
            />
          </svg>
          <div className="study-progress-percent">
            <p className="study-progress-value">{progressPercent}%</p>
            <p className="study-progress-label">Complete</p>
          </div>
        </div>
        <div className="study-progress-copy">
          <p className="chip study-progress-chip">{progressCopy.label}</p>
          <div className="study-progress-metrics" aria-label="Study card totals">
            <article className="study-progress-metric">
              <p className="study-progress-metric-label">Cards studied</p>
              <p className="study-progress-metric-value">
                {studiedCount} of {totalCards}
              </p>
            </article>
            <article className="study-progress-metric">
              <p className="study-progress-metric-label">Remaining to study</p>
              <p className="study-progress-metric-value">{remainingCount}</p>
            </article>
          </div>
          <section className="study-focus" aria-label="Study focus">
            <h4 className="study-focus-title">Study focus</h4>
            <p className="study-focus-next">{nextFocusAction}</p>
            <div className="study-focus-chip-row">
              <span className={`chip risk-${riskLevel}`}>Risk: {riskLabel}</span>
              <span className={`chip ${paceToneClass}`}>Pace: {paceLabel}</span>
              <span className="chip study-focus-eta">ETA: {completionLabel}</span>
            </div>
            <div className="study-focus-progress" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="study-focus-progress-label">
              {studiedCount} / {totalCards} studied
            </p>
          </section>
          <p className="subtitle">{progressCopy.message}</p>
        </div>
        </section>

        <div className="study-metrics-action-row">
          <button
            className="button ghost study-metrics-toggle"
            type="button"
            onClick={() => setShowMetricDetails((previous) => !previous)}
            aria-expanded={showMetricDetails}
            aria-controls="study-metric-details"
          >
            {showMetricDetails ? "Hide details" : "Show more details"}
          </button>
        </div>

        <div className={`study-analytics-details ${showMetricDetails ? "open" : ""}`} id="study-metric-details">
          <div className="study-analytics-details-inner">

        <section className="study-insights-grid" aria-label="Daily goal and calendar">
        <article className={`study-goal-card status-${todayStatus}`} id="daily-goal-settings">
          <div
            className="study-goal-ring"
            aria-hidden="true"
            style={{ "--study-goal-progress": `${Math.round(todayProgress * 360)}deg` } as CSSProperties}
          >
            <div className="study-goal-ring-inner">
              <span>{Math.round(todayProgress * 100)}%</span>
            </div>
          </div>
          <div className="study-goal-content">
            <p className="chip">Daily goal</p>
            {!calendarState.goalConfigured ? (
              <p className="study-goal-prompt">Choose your first daily learning goal.</p>
            ) : null}
            <p className="study-goal-total">
              {todayReviewedCount} / {todayGoal}
            </p>
            <p className="study-goal-status">{statusLabel(todayStatus)}</p>
            <p className="study-quality-copy">
              Accuracy {Math.round(todayAccuracy * 100)}% (target {Math.round(QUALITY_THRESHOLD * 100)}%)
            </p>
            <p className="study-quality-copy">Momentum floor: {todayMinimum} cards</p>
            <div className="study-goal-metrics" aria-label="Due card load">
              <span className="study-goal-metric overdue" title="Overdue cards" />
              <span className="study-goal-metric-label">{overdueCount}</span>
              <span className="study-goal-metric due" title="Due today" />
              <span className="study-goal-metric-label">{dueTodayCount}</span>
              <span className="study-goal-metric upcoming" title="Upcoming cards" />
              <span className="study-goal-metric-label">{upcomingCount}</span>
            </div>
            <p className="study-goal-estimate">
              At {projectedGoal} cards/day, you&apos;ll finish in about {projectedDaysToFinish} day
              {projectedDaysToFinish === 1 ? "" : "s"}.
            </p>
            <p className="study-goal-estimate">Based on remaining {remainingCount} cards.</p>
            <p className="study-goal-estimate">
              Target completion day: {projectedCompletionWeekday} ({formatShortDate(projectedCompletionDateIso)})
            </p>
            <button className="button primary study-goal-open-button" onClick={() => setGoalEditorOpen((previous) => !previous)} type="button">
              {goalEditorOpen ? "Hide Goal Setup" : `${goalActionVerb} Daily Goal`}
            </button>
            <p className="study-goal-action-help">Choose your daily target and control your completion timeline.</p>
            {goalEditorOpen ? (
              <section className="study-goal-editor" aria-label="Goal setup">
                <div className="study-goal-presets">
                  {GOAL_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      className={`button ghost study-goal-preset ${projectedGoal === preset ? "active" : ""}`}
                      type="button"
                      onClick={() => setGoalInput(String(preset))}
                    >
                      {preset}/day
                    </button>
                  ))}
                </div>
                <form className="study-goal-form" onSubmit={saveGoal}>
                  <input
                    aria-label="Daily goal"
                    className="study-goal-input"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    onChange={(event) => setGoalInput(event.target.value)}
                    type="number"
                    value={goalInput}
                  />
                  <button className="button primary" type="submit">
                    Save Goal
                  </button>
                </form>
                <p className="study-goal-action-help">Save Goal: applies your selected cards-per-day target to planning and tracking.</p>
                <button className="button ghost study-suggest-button" onClick={applySuggestedGoal} type="button">
                  Use Suggested Goal ({suggestedGoal}/day)
                </button>
                <p className="study-goal-action-help">
                  Use Suggested Goal: auto-sets a target based on your upcoming due load and overdue carryover.
                </p>
              </section>
            ) : null}
          </div>
        </article>

        <article className="study-calendar-card" aria-label="Monthly study calendar">
          <header className="study-calendar-header">
            <div className="study-calendar-nav-row">
              <button
                className="button ghost study-calendar-nav"
                onClick={() => shiftCalendarMonth(-1)}
                type="button"
                aria-label="Previous month"
                disabled={calendarView === "week"}
              >
                ←
              </button>
              <h2>{calendarView === "week" ? "This week" : formatMonthLabel(calendarCursor)}</h2>
              <button
                className="button ghost study-calendar-nav"
                onClick={() => shiftCalendarMonth(1)}
                type="button"
                aria-label="Next month"
                disabled={calendarView === "week"}
              >
                →
              </button>
            </div>
            <div className="study-calendar-controls">
              <button
                className={`button ghost study-calendar-toggle ${calendarView === "week" ? "active" : ""}`}
                onClick={() => setCalendarView("week")}
                type="button"
              >
                Week
              </button>
              <button
                className={`button ghost study-calendar-toggle ${calendarView === "month" ? "active" : ""}`}
                onClick={() => setCalendarView("month")}
                type="button"
              >
                Month
              </button>
            </div>
          </header>

          <div className="study-calendar-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="study-calendar-grid">
            {calendarDays.map((day) => {
              const dayEntry = calendarState.days[day.dateIso];
              const dayStatus = getDayStatus(day.dateIso, dayEntry, todayIso);
              const dayReviewedCount = getReviewedCount(dayEntry);
              const dayGoal = dayEntry?.goal ?? calendarState.dailyGoal;
              const dueCount = dueCountByDate.get(day.dateIso) ?? 0;
              const carryover = dayEntry?.overdueCountSnapshot ?? 0;
              const weakness = getDominantWeakness(dayEntry);
              const isProjectedCompletionDay = day.dateIso === projectedCompletionDateIso;
              const goalStateLabel =
                dayStatus === "complete"
                  ? "Met goal"
                  : dayStatus === "in_progress"
                    ? "In progress"
                    : dayStatus === "missed"
                      ? "Not met"
                      : day.dateIso > todayIso
                        ? "Pending"
                        : "Not started";
              const goalStateClass =
                dayStatus === "complete"
                  ? "met"
                  : dayStatus === "in_progress"
                    ? "in-progress"
                    : dayStatus === "missed"
                      ? "not-met"
                      : "pending";

              return (
                <article
                  aria-label={`${day.dateIso}. ${statusLabel(dayStatus)}. ${dayReviewedCount}/${dayGoal} cards toward goal. ${dueCount} cards due.`}
                  className={`study-calendar-day ${day.isCurrentMonth ? "" : "outside"} status-${dayStatus} ${
                    day.dateIso === todayIso ? "today" : ""
                  } ${isProjectedCompletionDay ? "target-day" : ""}`}
                  key={day.dateIso}
                >
                  <button className="study-day-open" onClick={() => setSelectedDateIso(day.dateIso)} type="button">
                    <header className="study-calendar-day-head">
                      <span className="study-calendar-date">{day.date.getDate()}</span>
                      <span className="study-calendar-state-dot" aria-hidden="true" />
                    </header>
                    <p className="study-calendar-goal">Goal {dayGoal}</p>
                    <p className={`study-calendar-goal-state ${goalStateClass}`}>{goalStateLabel}</p>
                    <p className="study-calendar-due">Due {dueCount}</p>
                    {carryover > 0 ? <p className="study-calendar-carry">+{carryover} carryover</p> : null}
                    {isProjectedCompletionDay ? <p className="study-calendar-target">Goal target day</p> : null}
                    {weakness ? <p className={`study-day-weakness ${weakness}`}>{getWeaknessLabel(weakness)}</p> : null}
                  </button>
                </article>
              );
            })}
          </div>

          <footer className="study-calendar-footer">
            <p className="study-calendar-legend">
              <span className="study-calendar-legend-item">
                <span className="legend-dot complete" />
                Met
              </span>
              <span className="study-calendar-legend-item">
                <span className="legend-dot in-progress" />
                In progress
              </span>
              <span className="study-calendar-legend-item">
                <span className="legend-dot missed" />
                Not met
              </span>
            </p>
            <p className="muted">{monthCompletedDays} days completed this month</p>
          </footer>
        </article>
        </section>

        <section className="study-forecast-card" aria-label="7 day forecast">
        <header className="study-forecast-head">
          <h4>7-day forecast</h4>
          <p className={`chip risk-${forecastRiskLevel}`}>Risk: {forecastRiskLabel}</p>
        </header>
        <div className="study-forecast-grid">
          {forecastDays.map((day) => (
            <article key={day.dateIso} className={`study-forecast-day ${day.overload ? "overload" : ""}`}>
              <span>{formatShortDate(day.dateIso)}</span>
              <div className="study-forecast-bar">
                <span style={{ width: `${Math.round((day.due / maxForecast) * 100)}%` }} />
              </div>
              <strong>{day.due}</strong>
            </article>
          ))}
        </div>
        </section>

        <section className="study-weekly-card" aria-label="Weekly reflection">
        <h4>Weekly reflection</h4>
        <p className="muted">
          {weeklySummary.completeDays} goal days complete, {weeklySummary.missedDays} missed, best start time {weeklySummary.bestStartLabel}.
        </p>
        <p className="muted">7-day retention trend: {Math.round(retention7Day * 100)}%</p>
        <p className="muted">Momentum streak: {momentumStreak} day{momentumStreak === 1 ? "" : "s"}</p>
        </section>
          </div>
        </div>
      </section>
      </div>
      )}

      {selectedDateIso ? (
        <div className="study-modal-backdrop" role="presentation" onClick={() => setSelectedDateIso(null)}>
          <section
            className="study-modal"
            aria-label="Day details"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="study-modal-head">
              <h4>{formatShortDate(selectedDateIso)} details</h4>
              <button className="button ghost" type="button" onClick={() => setSelectedDateIso(null)}>
                Close
              </button>
            </header>
            <p className="muted">Status: {statusLabel(getDayStatus(selectedDateIso, selectedEntry, todayIso))}</p>
            <p className="muted">
              Goal progress: {getReviewedCount(selectedEntry)} / {selectedEntry?.goal ?? calendarState.dailyGoal}
            </p>
            <p className="muted">Accuracy: {Math.round(getDayAccuracy(selectedEntry) * 100)}%</p>
            <p className="muted">Due load: {selectedEntry?.dueCountSnapshot ?? 0}</p>
            <p className="muted">Carryover: {selectedEntry?.overdueCountSnapshot ?? 0}</p>
            <p className="muted">Weakness signal: {getWeaknessLabel(getDominantWeakness(selectedEntry))}</p>
            <div className="button-row">
              <Link className="button primary" href={`/decks/${deckId}/study?mode=today`}>
                Start this day&apos;s plan
              </Link>
              <Link className="button ghost" href={`/decks/${deckId}/study?mode=catchup`}>
                Recovery session
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
