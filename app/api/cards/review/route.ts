import { NextResponse } from "next/server";

import { reviewCard, type ReviewDifficulty } from "@/lib/cards/cardQueries";
import { getDeckStudyCalendar, markDeckStudyCardReviewed } from "@/lib/study/studyCalendarQueries";
import { getLocalDateISO } from "@/lib/study/studyCalendarUtils";

interface ReviewPayload {
  cardId?: unknown;
  difficulty?: unknown;
  contextDeckId?: unknown;
  dateIso?: unknown;
}

function parseDifficulty(value: unknown): ReviewDifficulty | null {
  if (value === "hard" || value === "medium" || value === "easy") {
    return value;
  }

  return null;
}

function parseDateIso(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return getLocalDateISO();
  }

  return value;
}

export async function POST(request: Request) {
  let payload: ReviewPayload;

  try {
    payload = (await request.json()) as ReviewPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const cardId = typeof payload.cardId === "string" ? payload.cardId.trim() : "";
  const difficulty = parseDifficulty(payload.difficulty);
  const contextDeckId = typeof payload.contextDeckId === "string" ? payload.contextDeckId.trim() : "";
  const dateIso = parseDateIso(payload.dateIso);

  if (!cardId || !difficulty) {
    return NextResponse.json({ error: "cardId and difficulty are required" }, { status: 400 });
  }

  try {
    const updated = await reviewCard(cardId, difficulty);
    if (!updated) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const studyDeckId = contextDeckId || updated.deckId;
    const day = await markDeckStudyCardReviewed(studyDeckId, difficulty, dateIso);
    const calendar = await getDeckStudyCalendar(studyDeckId);

    return NextResponse.json(
      {
        id: updated.id,
        deckId: updated.deckId,
        studyDeckId,
        dueDate: updated.dueDate,
        intervalDays: updated.intervalDays,
        easeFactor: updated.easeFactor,
        lastDifficulty: updated.lastDifficulty,
        dailyGoal: calendar.dailyGoal,
        day: {
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
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(`Failed to review card ${cardId}`, error);
    return NextResponse.json({ error: "Failed to update review schedule" }, { status: 500 });
  }
}
