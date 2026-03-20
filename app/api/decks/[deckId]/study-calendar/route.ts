import { NextResponse } from "next/server";

import { getLocalDateISO } from "@/lib/study/studyCalendarUtils";
import {
  getDeckStudyCalendar,
  markDeckStudyDayStarted,
  updateDeckDailyGoal,
  type StudyCalendarDayRecord,
} from "@/lib/study/studyCalendarQueries";

interface CalendarUpdatePayload {
  action?: unknown;
  dailyGoal?: unknown;
  dateIso?: unknown;
}

interface CalendarDayResponse extends StudyCalendarDayRecord {
  dateIso: string;
}

function parseDateIso(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return getLocalDateISO();
  }

  return value;
}

function dayResponse(dateIso: string, day: StudyCalendarDayRecord): CalendarDayResponse {
  return {
    dateIso,
    goal: day.goal,
    reviewedCount: day.reviewedCount,
    easyCount: day.easyCount,
    mediumCount: day.mediumCount,
    hardCount: day.hardCount,
    dueCountSnapshot: day.dueCountSnapshot,
    overdueCountSnapshot: day.overdueCountSnapshot,
    startedAt: day.startedAt,
    completedAt: day.completedAt,
    updatedAt: day.updatedAt,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  if (!deckId) {
    return NextResponse.json({ error: "Deck is required" }, { status: 400 });
  }

  try {
    const calendar = await getDeckStudyCalendar(deckId);
    return NextResponse.json(calendar, { status: 200 });
  } catch (error) {
    console.error(`Failed to load study calendar for deck ${deckId}`, error);
    return NextResponse.json({ error: "Failed to load study calendar" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  if (!deckId) {
    return NextResponse.json({ error: "Deck is required" }, { status: 400 });
  }

  let payload: CalendarUpdatePayload;
  try {
    payload = (await request.json()) as CalendarUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const action = typeof payload.action === "string" ? payload.action : "";

  try {
    if (action === "set-goal") {
      const parsedGoal = Number(payload.dailyGoal);
      if (!Number.isFinite(parsedGoal) || parsedGoal <= 0) {
        return NextResponse.json({ error: "dailyGoal must be a positive number" }, { status: 400 });
      }

      const settings = await updateDeckDailyGoal(deckId, parsedGoal);
      return NextResponse.json(settings, { status: 200 });
    }

    if (action === "start-day") {
      const dateIso = parseDateIso(payload.dateIso);
      const day = await markDeckStudyDayStarted(deckId, dateIso);
      const calendar = await getDeckStudyCalendar(deckId);
      return NextResponse.json(
        {
          dailyGoal: calendar.dailyGoal,
          goalConfigured: calendar.goalConfigured,
          day: dayResponse(dateIso, day),
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error(`Failed to update study calendar for deck ${deckId}`, error);
    return NextResponse.json({ error: "Failed to update study calendar" }, { status: 500 });
  }
}
