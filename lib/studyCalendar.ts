export type StudyDayStatus = "complete" | "in_progress" | "missed" | "idle";

export interface StudyDayEntry {
  goal: number;
  reviewedCount: number;
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
  dueCountSnapshot?: number;
  overdueCountSnapshot?: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface StudyCalendarState {
  dailyGoal: number;
  goalConfigured: boolean;
  days: Record<string, StudyDayEntry>;
}

export const DEFAULT_DAILY_GOAL = 20;
export const QUALITY_THRESHOLD = 0.75;

export function getLocalDateISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getReviewedCount(entry: StudyDayEntry | undefined): number {
  return entry?.reviewedCount ?? 0;
}

export function getDayProgress(entry: StudyDayEntry | undefined): number {
  if (!entry || entry.goal <= 0) {
    return 0;
  }

  return Math.min(getReviewedCount(entry) / entry.goal, 1);
}

export function getDayAccuracy(entry: StudyDayEntry | undefined): number {
  if (!entry || getReviewedCount(entry) === 0) {
    return 0;
  }

  const easy = entry.easyCount ?? 0;
  const medium = entry.mediumCount ?? 0;
  const hard = entry.hardCount ?? 0;
  const observed = easy + medium + hard;

  if (observed <= 0) {
    return 1;
  }

  const score = easy + medium * 0.65 + hard * 0.25;
  return Math.max(0, Math.min(score / observed, 1));
}

export function getMinimumViableTarget(goal: number): number {
  return Math.max(3, Math.min(goal, Math.ceil(goal * 0.3)));
}

export function hitsMomentum(entry: StudyDayEntry | undefined): boolean {
  if (!entry) {
    return false;
  }

  const reviewed = getReviewedCount(entry);
  if (reviewed >= entry.goal) {
    return true;
  }

  return reviewed >= getMinimumViableTarget(entry.goal);
}

export function getDayStatus(dateIso: string, entry: StudyDayEntry | undefined, todayIso = getLocalDateISO()): StudyDayStatus {
  if (!entry) {
    return "idle";
  }

  const reviewedCount = getReviewedCount(entry);
  const isQualityComplete = reviewedCount >= entry.goal && getDayAccuracy(entry) >= QUALITY_THRESHOLD;
  if (isQualityComplete || Boolean(entry.completedAt)) {
    return "complete";
  }

  const hasStarted = Boolean(entry.startedAt) || reviewedCount > 0;
  if (!hasStarted) {
    return "idle";
  }

  if (dateIso < todayIso) {
    return "missed";
  }

  return "in_progress";
}

export function setCalendarDailyGoal(calendar: StudyCalendarState, nextGoal: number): StudyCalendarState {
  const boundedGoal = Math.max(1, Math.min(500, Math.round(nextGoal)));
  return {
    ...calendar,
    dailyGoal: boundedGoal,
    goalConfigured: true,
  };
}

export function mergeCalendarDay(
  calendar: StudyCalendarState,
  dateIso: string,
  dayEntry: StudyDayEntry,
  dailyGoal?: number
): StudyCalendarState {
  return {
    ...calendar,
    dailyGoal: dailyGoal ?? calendar.dailyGoal,
    days: {
      ...calendar.days,
      [dateIso]: dayEntry,
    },
  };
}
