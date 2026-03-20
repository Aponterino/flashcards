export type StudyDifficulty = "hard" | "medium" | "easy";
export type StudyStartMode = "today" | "catchup" | "all" | "challenge" | "quiz";

export interface StudyCard {
  id: string;
  front: string;
  back: string;
  dueDate: string;
  intervalDays: number;
  easeFactor: string;
  lastDifficulty: StudyDifficulty | null;
}

export interface StudyGroups {
  hard: string[];
  medium: string[];
  easy: string[];
}

export const EMPTY_STUDY_GROUPS: StudyGroups = {
  hard: [],
  medium: [],
  easy: [],
};

function clampRatio(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function getTodayLocalDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function takeFirst(pool: StudyCard[], count: number): StudyCard[] {
  if (count <= 0) {
    return [];
  }

  return pool.slice(0, count);
}

function distributeByWeight(
  maxCards: number,
  weights: Record<"new" | StudyDifficulty, number>
): Record<"new" | StudyDifficulty, number> {
  const entries = (Object.entries(weights) as Array<[keyof typeof weights, number]>).map(([key, value]) => ({
    key,
    raw: value * maxCards,
  }));
  const counts = Object.fromEntries(entries.map(({ key, raw }) => [key, Math.floor(raw)])) as Record<keyof typeof weights, number>;
  let allocated = Object.values(counts).reduce((total, value) => total + value, 0);

  if (allocated < maxCards) {
    const remainders = entries
      .map(({ key, raw }) => ({ key, remainder: raw - Math.floor(raw) }))
      .sort((a, b) => b.remainder - a.remainder);

    for (const { key } of remainders) {
      if (allocated >= maxCards) {
        break;
      }
      counts[key] += 1;
      allocated += 1;
    }
  }

  return counts;
}

function getTodayWeights(studiedRatio: number): Record<"new" | StudyDifficulty, number> {
  const clampedRatio = clampRatio(studiedRatio);
  const newWeight = Math.max(0, 1 - clampedRatio);
  const reviewWeight = 1 - newWeight;

  const lateStageRamp = clampedRatio <= 0.7 ? 0 : (clampedRatio - 0.7) / 0.3;
  const hardMix = 0.6 + 0.22 * lateStageRamp;
  const mediumMix = 0.35 - 0.17 * lateStageRamp;
  const easyMix = 0.05 - 0.05 * lateStageRamp;

  return {
    new: newWeight,
    hard: reviewWeight * hardMix,
    medium: reviewWeight * mediumMix,
    easy: reviewWeight * easyMix,
  };
}

function getGuaranteedNewCount(
  studiedRatio: number,
  maxCards: number,
  unseenCount: number,
  overdueCount: number
): number {
  if (maxCards <= 0 || unseenCount <= 0) {
    return 0;
  }

  // Reserve more "must-show" new cards early in the deck, then taper that
  // floor down as the learner builds history on more cards.
  const progressFloorRatio = Math.max(0.05, 0.35 * (1 - clampRatio(studiedRatio)));
  let guaranteed = Math.round(maxCards * progressFloorRatio);

  // As long as unseen cards exist, daily study should keep making forward
  // progress through the deck instead of allowing review load to starve them.
  guaranteed = Math.max(1, guaranteed);

  // If the user has built up a heavy overdue queue, soften the guarantee so
  // review can take back more of the session while still keeping new-card
  // starvation impossible.
  if (overdueCount >= maxCards * 2) {
    guaranteed = Math.max(1, Math.floor(guaranteed / 2));
  }

  return Math.min(guaranteed, unseenCount, maxCards);
}

export function buildStudyGroupsFromCards(cards: StudyCard[]): StudyGroups {
  return cards.reduce<StudyGroups>(
    (groups, card) => {
      if (card.lastDifficulty === "hard") {
        groups.hard.push(card.id);
      } else if (card.lastDifficulty === "medium") {
        groups.medium.push(card.id);
      } else if (card.lastDifficulty === "easy") {
        groups.easy.push(card.id);
      }

      return groups;
    },
    {
      hard: [],
      medium: [],
      easy: [],
    }
  );
}

export function buildTodayStudySet(cards: StudyCard[], groups: StudyGroups, maxCards = 20): StudyCard[] {
  if (cards.length === 0 || maxCards <= 0) {
    return [];
  }

  const todayIso = getTodayLocalDateISO();
  const cappedCount = Math.min(maxCards, cards.length);
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const hardIds = groups.hard.filter((id) => cardMap.has(id));
  const mediumIds = groups.medium.filter((id) => cardMap.has(id) && !hardIds.includes(id));
  const easyIds = groups.easy.filter((id) => cardMap.has(id) && !hardIds.includes(id) && !mediumIds.includes(id));
  const categorizedIds = new Set([...hardIds, ...mediumIds, ...easyIds]);
  const unseenPoolAll = cards.filter((card) => !categorizedIds.has(card.id));

  const hardPoolAll = hardIds.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));
  const mediumPoolAll = mediumIds.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));
  const easyPoolAll = easyIds.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));

  const totalCount = cards.length;
  const studiedCount = categorizedIds.size;
  const studiedRatio = clampRatio(studiedCount / totalCount);
  const overdueCount = cards.filter((card) => card.dueDate < todayIso).length;

  // Pick a guaranteed floor of unseen cards before due-card selection so a
  // persistent review backlog cannot block deck completion forever.
  const guaranteedNewCount = getGuaranteedNewCount(studiedRatio, cappedCount, unseenPoolAll.length, overdueCount);
  const guaranteedNewCards = takeFirst(unseenPoolAll, guaranteedNewCount);
  const chosenIds = new Set<string>(guaranteedNewCards.map((card) => card.id));

  // After reserving the guaranteed unseen cards, fill as much of the session
  // as possible with due cards. This keeps review priority intact without
  // fully starving forward progress.
  const dueCards = cards
    .filter((card) => card.dueDate <= todayIso && !chosenIds.has(card.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueChosen = dueCards.slice(0, Math.max(0, cappedCount - chosenIds.size));

  for (const card of dueChosen) {
    chosenIds.add(card.id);
  }

  const dueCardIds = new Set(
    [...guaranteedNewCards, ...dueChosen].filter((card) => card.dueDate <= todayIso).map((card) => card.id)
  );
  const hardPool = hardPoolAll.filter((card) => !dueCardIds.has(card.id) && !chosenIds.has(card.id));
  const mediumPool = mediumPoolAll.filter((card) => !dueCardIds.has(card.id) && !chosenIds.has(card.id));
  const easyPool = easyPoolAll.filter((card) => !dueCardIds.has(card.id) && !chosenIds.has(card.id));
  const newPool = unseenPoolAll.filter((card) => !dueCardIds.has(card.id) && !chosenIds.has(card.id));

  const remainingCapacity = cappedCount - chosenIds.size;
  const weights = getTodayWeights(studiedRatio);
  const target = distributeByWeight(remainingCapacity, weights);
  const selected = {
    new: takeFirst(newPool, target.new),
    hard: takeFirst(hardPool, target.hard),
    medium: takeFirst(mediumPool, target.medium),
    easy: takeFirst(easyPool, target.easy),
  };

  if (studiedCount > 0 && selected.hard.length + selected.medium.length + selected.easy.length === 0) {
    if (hardPool.length > 0) {
      selected.hard = takeFirst(hardPool, 1);
    } else if (mediumPool.length > 0) {
      selected.medium = takeFirst(mediumPool, 1);
    } else if (easyPool.length > 0) {
      selected.easy = takeFirst(easyPool, 1);
    }
  }

  if (studiedRatio >= 0.5 && hardPool.length > 0 && selected.hard.length === 0) {
    selected.hard = takeFirst(hardPool, 1);
  }

  for (const card of selected.new) {
    chosenIds.add(card.id);
  }
  for (const card of selected.hard) {
    chosenIds.add(card.id);
  }
  for (const card of selected.medium) {
    chosenIds.add(card.id);
  }
  for (const card of selected.easy) {
    chosenIds.add(card.id);
  }
  const orderedPools = [hardPool, mediumPool, easyPool, newPool];

  for (const pool of orderedPools) {
    if (chosenIds.size >= cappedCount) {
      break;
    }

    for (const card of pool) {
      if (chosenIds.size >= cappedCount) {
        break;
      }
      if (chosenIds.has(card.id)) {
        continue;
      }

      chosenIds.add(card.id);
    }
  }

  // Keep the final output user-friendly: due/overdue cards first, then the
  // remaining future cards. Within those buckets we preserve the deck's
  // existing order from the incoming card list.
  const orderedChosen = cards.filter((card) => chosenIds.has(card.id));
  const dueOrdered = orderedChosen.filter((card) => card.dueDate <= todayIso);
  const futureOrdered = orderedChosen.filter((card) => card.dueDate > todayIso);
  return [...dueOrdered, ...futureOrdered].slice(0, cappedCount);
}

export function buildCatchupStudySet(cards: StudyCard[], maxCards = 15): StudyCard[] {
  if (cards.length === 0 || maxCards <= 0) {
    return [];
  }

  const todayIso = getTodayLocalDateISO();
  return cards
    .filter((card) => card.dueDate < todayIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, Math.min(maxCards, cards.length));
}

export function buildQuizStudySet(cards: StudyCard[], groups: StudyGroups, maxCards = 20): StudyCard[] {
  if (cards.length === 0 || maxCards <= 0) {
    return [];
  }

  const cappedCount = Math.min(maxCards, cards.length);
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const hardPool = groups.hard.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));
  const mediumPool = groups.medium.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));
  const easyPool = groups.easy.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));
  const categorizedIds = new Set([...groups.hard, ...groups.medium, ...groups.easy]);
  const uncategorizedPool = cards.filter((card) => !categorizedIds.has(card.id));

  const progressRatio = clampRatio(categorizedIds.size / cards.length);
  const challengeShare = 0.65 + 0.2 * progressRatio;
  const hardShareWithinChallenge = 0.45 + 0.2 * progressRatio;

  const challengeTarget = Math.round(cappedCount * challengeShare);
  const hardTarget = Math.round(challengeTarget * hardShareWithinChallenge);
  const mediumTarget = Math.max(0, challengeTarget - hardTarget);
  const easyTarget = Math.max(0, cappedCount - challengeTarget);

  const selected: StudyCard[] = [];
  const selectedIds = new Set<string>();

  function pushFrom(pool: StudyCard[], count: number) {
    if (count <= 0) {
      return;
    }

    for (const card of pool) {
      if (selected.length >= cappedCount || count <= 0) {
        break;
      }
      if (selectedIds.has(card.id)) {
        continue;
      }

      selected.push(card);
      selectedIds.add(card.id);
      count -= 1;
    }
  }

  pushFrom(hardPool, hardTarget);
  pushFrom(mediumPool, mediumTarget);
  pushFrom(mediumPool, challengeTarget - selected.length);
  pushFrom(hardPool, challengeTarget - selected.length);
  pushFrom(easyPool, easyTarget);
  pushFrom(uncategorizedPool, cappedCount - selected.length);
  pushFrom(easyPool, cappedCount - selected.length);
  pushFrom(mediumPool, cappedCount - selected.length);
  pushFrom(hardPool, cappedCount - selected.length);
  pushFrom(cards, cappedCount - selected.length);

  return selected.slice(0, cappedCount);
}
