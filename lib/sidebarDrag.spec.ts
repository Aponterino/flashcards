import { isPointWithinDecksArea, resolveTopLevelDropAfter, TOP_LEVEL_DROP_BOTTOM_SLACK, type RootDeckRect } from "./sidebarDrag.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected "${String(expected)}", got "${String(actual)}".`);
  }
}

function run() {
  assert(
    isPointWithinDecksArea(50, 210, { left: 0, right: 100, top: 0, bottom: 100 }, TOP_LEVEL_DROP_BOTTOM_SLACK),
    "Point should be inside decks area when within bottom slack"
  );
  assert(
    !isPointWithinDecksArea(50, 230, { left: 0, right: 100, top: 0, bottom: 100 }, TOP_LEVEL_DROP_BOTTOM_SLACK),
    "Point should be outside decks area when past bottom slack"
  );

  const roots: RootDeckRect[] = [
    { id: "a", left: 0, right: 200, top: 0, bottom: 40 },
    { id: "b", left: 0, right: 200, top: 60, bottom: 100 },
    { id: "c", left: 0, right: 200, top: 120, bottom: 160 },
  ];

  assertEqual(
    resolveTopLevelDropAfter({ x: 20, y: 80, roots: [], isPointWithinDecksArea: true }),
    null,
    "No roots should resolve to null insertion point"
  );
  assertEqual(
    resolveTopLevelDropAfter({ x: 20, y: 10, roots, isPointWithinDecksArea: true }),
    undefined,
    "Point above first midpoint should not produce top-level insertion"
  );
  assertEqual(
    resolveTopLevelDropAfter({ x: 20, y: 50, roots, isPointWithinDecksArea: true }),
    "a",
    "Gap between first and second root should insert after first root"
  );
  assertEqual(
    resolveTopLevelDropAfter({ x: 20, y: 70, roots, isPointWithinDecksArea: true }),
    undefined,
    "Pointer over middle root row should not force top-level insertion"
  );
  assertEqual(
    resolveTopLevelDropAfter({ x: 20, y: 150, roots, isPointWithinDecksArea: true }),
    "c",
    "Pointer over lower half of last root row should keep end insertion sticky"
  );
}

run();
