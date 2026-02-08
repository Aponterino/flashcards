import { and, asc, count, eq, lt, lte } from "drizzle-orm";

import { cards, deckStudyDays, deckStudySettings } from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/db";
import type { ReviewDifficulty } from "@/lib/queries/cards";

export const DEFAULT_DAILY_GOAL = 20;

export interface StudyCalendarDayRecord {
  goal: number;
  reviewedCount: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  dueCountSnapshot: number;
  overdueCountSnapshot: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface StudyCalendarRecord {
  dailyGoal: number;
  goalConfigured: boolean;
  days: Record<string, StudyCalendarDayRecord>;
}

function getTodayLocalDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDailyGoal(value: number): number {
  return Math.max(1, Math.min(500, Math.round(value)));
}

function normalizeDate(date: Date | string): string {
  if (typeof date === "string") {
    return date;
  }

  return date.toISOString().slice(0, 10);
}

function mapCalendarDay(row: typeof deckStudyDays.$inferSelect): StudyCalendarDayRecord {
  return {
    goal: row.goal,
    reviewedCount: row.reviewedCount,
    easyCount: row.easyCount,
    mediumCount: row.mediumCount,
    hardCount: row.hardCount,
    dueCountSnapshot: row.dueCountSnapshot,
    overdueCountSnapshot: row.overdueCountSnapshot,
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getDueSnapshots(deckId: string, dateIso: string): Promise<{ dueCount: number; overdueCount: number }> {
  const db = getDb();
  const [due] = await db
    .select({ count: count() })
    .from(cards)
    .where(and(eq(cards.deckId, deckId), lte(cards.dueDate, dateIso)));
  const [overdue] = await db
    .select({ count: count() })
    .from(cards)
    .where(and(eq(cards.deckId, deckId), lt(cards.dueDate, dateIso)));

  return {
    dueCount: due?.count ?? 0,
    overdueCount: overdue?.count ?? 0,
  };
}

async function getOrCreateStudySettings(deckId: string): Promise<{ dailyGoal: number; goalConfigured: boolean }> {
  await ensureDbReady();
  const db = getDb();

  const [existing] = await db.select().from(deckStudySettings).where(eq(deckStudySettings.deckId, deckId)).limit(1);
  if (existing) {
    return {
      dailyGoal: existing.dailyGoal,
      goalConfigured: existing.goalConfigured,
    };
  }

  const [inserted] = await db
    .insert(deckStudySettings)
    .values({
      deckId,
      dailyGoal: DEFAULT_DAILY_GOAL,
      goalConfigured: false,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return {
      dailyGoal: inserted.dailyGoal,
      goalConfigured: inserted.goalConfigured,
    };
  }

  const [resolved] = await db.select().from(deckStudySettings).where(eq(deckStudySettings.deckId, deckId)).limit(1);
  return {
    dailyGoal: resolved?.dailyGoal ?? DEFAULT_DAILY_GOAL,
    goalConfigured: resolved?.goalConfigured ?? false,
  };
}

export async function getDeckStudyCalendar(deckId: string): Promise<StudyCalendarRecord> {
  await ensureDbReady();
  const db = getDb();
  const settings = await getOrCreateStudySettings(deckId);
  const dayRows = await db.select().from(deckStudyDays).where(eq(deckStudyDays.deckId, deckId)).orderBy(asc(deckStudyDays.studyDate));

  const days = dayRows.reduce<Record<string, StudyCalendarDayRecord>>((record, row) => {
    record[normalizeDate(row.studyDate)] = mapCalendarDay(row);
    return record;
  }, {});

  return {
    dailyGoal: settings.dailyGoal,
    goalConfigured: settings.goalConfigured,
    days,
  };
}

export async function updateDeckDailyGoal(deckId: string, nextGoal: number): Promise<{ dailyGoal: number; goalConfigured: boolean }> {
  await ensureDbReady();
  const db = getDb();
  const dailyGoal = clampDailyGoal(nextGoal);

  const [updated] = await db
    .insert(deckStudySettings)
    .values({
      deckId,
      dailyGoal,
      goalConfigured: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: deckStudySettings.deckId,
      set: {
        dailyGoal,
        goalConfigured: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    dailyGoal: updated?.dailyGoal ?? dailyGoal,
    goalConfigured: true,
  };
}

export async function markDeckStudyDayStarted(deckId: string, dateIso = getTodayLocalDateISO()): Promise<StudyCalendarDayRecord> {
  await ensureDbReady();
  const db = getDb();
  const settings = await getOrCreateStudySettings(deckId);
  const dailyGoal = settings.dailyGoal;
  const now = new Date();
  const { dueCount, overdueCount } = await getDueSnapshots(deckId, dateIso);

  const [existing] = await db
    .select()
    .from(deckStudyDays)
    .where(and(eq(deckStudyDays.deckId, deckId), eq(deckStudyDays.studyDate, dateIso)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(deckStudyDays)
      .set({
        startedAt: existing.startedAt ?? now,
        dueCountSnapshot: existing.dueCountSnapshot > 0 ? existing.dueCountSnapshot : dueCount,
        overdueCountSnapshot: existing.overdueCountSnapshot > 0 ? existing.overdueCountSnapshot : overdueCount,
        updatedAt: now,
      })
      .where(eq(deckStudyDays.id, existing.id))
      .returning();

    return mapCalendarDay(updated ?? existing);
  }

  const [inserted] = await db
    .insert(deckStudyDays)
    .values({
      deckId,
      studyDate: dateIso,
      goal: dailyGoal,
      reviewedCount: 0,
      easyCount: 0,
      mediumCount: 0,
      hardCount: 0,
      dueCountSnapshot: dueCount,
      overdueCountSnapshot: overdueCount,
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  return mapCalendarDay(inserted);
}

export async function markDeckStudyCardReviewed(
  deckId: string,
  difficulty: ReviewDifficulty,
  dateIso = getTodayLocalDateISO()
): Promise<StudyCalendarDayRecord> {
  await ensureDbReady();
  const db = getDb();
  const settings = await getOrCreateStudySettings(deckId);
  const dailyGoal = settings.dailyGoal;
  const now = new Date();
  const { dueCount, overdueCount } = await getDueSnapshots(deckId, dateIso);
  const increments = {
    easyCount: difficulty === "easy" ? 1 : 0,
    mediumCount: difficulty === "medium" ? 1 : 0,
    hardCount: difficulty === "hard" ? 1 : 0,
  };

  const [existing] = await db
    .select()
    .from(deckStudyDays)
    .where(and(eq(deckStudyDays.deckId, deckId), eq(deckStudyDays.studyDate, dateIso)))
    .limit(1);

  if (!existing) {
    const isComplete = dailyGoal <= 1;
    const [inserted] = await db
      .insert(deckStudyDays)
      .values({
        deckId,
        studyDate: dateIso,
        goal: dailyGoal,
        reviewedCount: 1,
        easyCount: increments.easyCount,
        mediumCount: increments.mediumCount,
        hardCount: increments.hardCount,
        dueCountSnapshot: dueCount,
        overdueCountSnapshot: overdueCount,
        startedAt: now,
        completedAt: isComplete ? now : null,
        updatedAt: now,
      })
      .returning();

    return mapCalendarDay(inserted);
  }

  const nextReviewedCount = existing.reviewedCount + 1;
  const shouldComplete = nextReviewedCount >= existing.goal;

  const [updated] = await db
    .update(deckStudyDays)
    .set({
      reviewedCount: nextReviewedCount,
      easyCount: existing.easyCount + increments.easyCount,
      mediumCount: existing.mediumCount + increments.mediumCount,
      hardCount: existing.hardCount + increments.hardCount,
      startedAt: existing.startedAt ?? now,
      completedAt: shouldComplete ? existing.completedAt ?? now : null,
      dueCountSnapshot: existing.dueCountSnapshot > 0 ? existing.dueCountSnapshot : dueCount,
      overdueCountSnapshot: existing.overdueCountSnapshot > 0 ? existing.overdueCountSnapshot : overdueCount,
      updatedAt: now,
    })
    .where(eq(deckStudyDays.id, existing.id))
    .returning();

  return mapCalendarDay(updated ?? existing);
}

export async function resetDeckStudyCalendar(deckId: string): Promise<void> {
  await ensureDbReady();
  const db = getDb();

  await db.delete(deckStudyDays).where(eq(deckStudyDays.deckId, deckId));
  await db.delete(deckStudySettings).where(eq(deckStudySettings.deckId, deckId));
}
