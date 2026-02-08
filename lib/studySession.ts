export type StudyDifficulty = "hard" | "medium" | "easy";
export type StudyStartMode = "today" | "catchup" | "all";

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
  const dueCards = cards.filter((card) => card.dueDate <= todayIso).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (dueCards.length >= cappedCount) {
    return dueCards.slice(0, cappedCount);
  }

  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const hardIds = groups.hard.filter((id) => cardMap.has(id));
  const mediumIds = groups.medium.filter((id) => cardMap.has(id) && !hardIds.includes(id));
  const easyIds = groups.easy.filter((id) => cardMap.has(id) && !hardIds.includes(id) && !mediumIds.includes(id));
  const categorizedIds = new Set([...hardIds, ...mediumIds, ...easyIds]);

  const hardPoolAll = hardIds.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));
  const mediumPoolAll = mediumIds.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));
  const easyPoolAll = easyIds.map((id) => cardMap.get(id)).filter((card): card is StudyCard => Boolean(card));
  const newPoolAll = cards.filter((card) => !categorizedIds.has(card.id));

  const dueCardIds = new Set(dueCards.map((card) => card.id));
  const hardPool = hardPoolAll.filter((card) => !dueCardIds.has(card.id));
  const mediumPool = mediumPoolAll.filter((card) => !dueCardIds.has(card.id));
  const easyPool = easyPoolAll.filter((card) => !dueCardIds.has(card.id));
  const newPool = newPoolAll.filter((card) => !dueCardIds.has(card.id));

  const totalCount = cards.length;
  const studiedCount = categorizedIds.size;
  const studiedRatio = clampRatio(studiedCount / totalCount);
  const remainingCapacity = cappedCount - dueCards.length;
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

  const chosenIds = new Set<string>([
    ...dueCards.map((card) => card.id),
    ...selected.new.map((card) => card.id),
    ...selected.hard.map((card) => card.id),
    ...selected.medium.map((card) => card.id),
    ...selected.easy.map((card) => card.id),
  ]);
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

  const dueChosen = dueCards.filter((card) => chosenIds.has(card.id));
  const nonDueChosen = cards.filter((card) => card.dueDate > todayIso && chosenIds.has(card.id));
  return [...dueChosen, ...nonDueChosen].slice(0, cappedCount);
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
