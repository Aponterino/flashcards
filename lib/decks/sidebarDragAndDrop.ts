export interface DeckAreaRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RootDeckRect {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface ResolveTopLevelDropAfterOptions {
  x: number;
  y: number;
  roots: RootDeckRect[];
  isPointWithinDecksArea: boolean;
}

export const TOP_LEVEL_DROP_BOTTOM_SLACK = 120;

export function isPointWithinDecksArea(
  x: number,
  y: number,
  deckAreaRect: DeckAreaRect | null,
  bottomSlack: number = TOP_LEVEL_DROP_BOTTOM_SLACK
): boolean {
  if (!deckAreaRect) {
    return false;
  }

  return x >= deckAreaRect.left && x <= deckAreaRect.right && y >= deckAreaRect.top && y <= deckAreaRect.bottom + bottomSlack;
}

export function resolveTopLevelDropAfter(options: ResolveTopLevelDropAfterOptions): string | null | undefined {
  const { x, y, roots, isPointWithinDecksArea } = options;
  if (!isPointWithinDecksArea) {
    return undefined;
  }

  if (roots.length === 0) {
    return null;
  }

  const first = roots[0];
  const firstMid = first.top + (first.bottom - first.top) / 2;
  if (y < firstMid) {
    return undefined;
  }

  const pointerOverRoot = roots.find((root) => y >= root.top && y <= root.bottom && x >= root.left && x <= root.right);
  if (pointerOverRoot) {
    const lastRoot = roots[roots.length - 1];
    const lastRootMid = lastRoot.top + (lastRoot.bottom - lastRoot.top) / 2;
    const isLastRootLowerHalf = pointerOverRoot.id === lastRoot.id && y >= lastRootMid;
    if (!isLastRootLowerHalf) {
      return undefined;
    }
  }

  let afterDeckId = roots[roots.length - 1].id;
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index];
    const currentMid = current.top + (current.bottom - current.top) / 2;
    if (y < currentMid) {
      if (index === 0) {
        return undefined;
      }
      afterDeckId = roots[index - 1].id;
      break;
    }
  }

  return afterDeckId;
}
