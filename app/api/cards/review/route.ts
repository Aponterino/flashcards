import { NextResponse } from "next/server";

import { getLocalDateISO } from "@/lib/studyCalendar";
import { reviewCard, type ReviewDifficulty } from "@/lib/queries/cards";
import { getDeckStudyCalendar, markDeckStudyCardReviewed } from "@/lib/queries/studyCalendar";

interface ReviewPayload {
  cardId?: unknown;
  difficulty?: unknown;
}

function parseDifficulty(value: unknown): ReviewDifficulty | null {
  if (value === "hard" || value === "medium" || value === "easy") {
    return value;
  }

  return null;
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

  if (!cardId || !difficulty) {
    return NextResponse.json({ error: "cardId and difficulty are required" }, { status: 400 });
  }

  try {
    const updated = await reviewCard(cardId, difficulty);
    if (!updated) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const dateIso = getLocalDateISO();
    const day = await markDeckStudyCardReviewed(updated.deckId, difficulty, dateIso);
    const calendar = await getDeckStudyCalendar(updated.deckId);

    return NextResponse.json(
      {
        id: updated.id,
        deckId: updated.deckId,
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
