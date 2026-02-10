export interface ImportedCardInput {
  front: string;
  back: string;
  dueDate?: string;
  intervalDays?: number;
  easeFactor?: string;
}

export interface ExportCardRecord {
  front: string;
  back: string;
  dueDate?: string;
  intervalDays?: number;
  easeFactor?: string;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeImportedCard(value: unknown): ImportedCardInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const card = value as {
    front?: unknown;
    back?: unknown;
    question?: unknown;
    answer?: unknown;
    prompt?: unknown;
    dueDate?: unknown;
    intervalDays?: unknown;
    interval?: unknown;
    easeFactor?: unknown;
    ease?: unknown;
  };

  const rawFront = card.front ?? card.question ?? card.prompt;
  const rawBack = card.back ?? card.answer;
  const front = typeof rawFront === "string" ? rawFront.trim() : "";
  const back = typeof rawBack === "string" ? rawBack.trim() : "";

  if (!front || !back) {
    return null;
  }

  const dueDate = typeof card.dueDate === "string" && isIsoDate(card.dueDate) ? card.dueDate : undefined;

  const intervalRaw = card.intervalDays ?? card.interval;
  const intervalValue = Number(intervalRaw);
  const intervalDays = Number.isFinite(intervalValue) && intervalValue > 0 ? Math.round(intervalValue) : undefined;

  const easeRaw = card.easeFactor ?? card.ease;
  const easeValue = Number(easeRaw);
  const easeFactor = Number.isFinite(easeValue) && easeValue > 0 ? easeValue.toFixed(2) : undefined;

  return { front, back, dueDate, intervalDays, easeFactor };
}

function parseDelimitedRows(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      const nextCharacter = text[index + 1];
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      currentCell = "";
      if (currentRow.some((cell) => cell.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function parseDelimited(text: string, delimiter: "," | "\t"): ImportedCardInput[] {
  const rows = parseDelimitedRows(text, delimiter);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const hasHeader = headers.includes("front") || headers.includes("back");
  const startIndex = hasHeader ? 1 : 0;

  return rows
    .slice(startIndex)
    .map((row) => {
      const cells = row.map((cell) => cell.trim());
      if (hasHeader) {
        const frontIndex = headers.indexOf("front");
        const backIndex = headers.indexOf("back");
        return normalizeImportedCard({
          front: frontIndex >= 0 ? cells[frontIndex] : "",
          back: backIndex >= 0 ? cells[backIndex] : "",
        });
      }
      return normalizeImportedCard({ front: cells[0] ?? "", back: cells[1] ?? "" });
    })
    .filter((card): card is ImportedCardInput => Boolean(card));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function extractTagValue(source: string, tags: string[]): string {
  for (const tag of tags) {
    const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = source.match(pattern);
    if (match?.[1]) {
      return decodeXmlEntities(match[1].trim());
    }
  }
  return "";
}

function parseXml(text: string): ImportedCardInput[] {
  const cardMatches = [...text.matchAll(/<(card|flashcard|note)[^>]*>([\s\S]*?)<\/\1>/gi)];

  const parsed = cardMatches
    .map((match) => {
      const body = match[2] ?? "";
      const front = extractTagValue(body, ["front", "question", "prompt"]);
      const back = extractTagValue(body, ["back", "answer"]);
      return normalizeImportedCard({ front, back });
    })
    .filter((card): card is ImportedCardInput => Boolean(card));

  if (parsed.length > 0) {
    return parsed;
  }

  const textMatches = [...text.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)];
  const values = textMatches
    .map((match) => decodeXmlEntities((match[1] ?? "").trim()))
    .filter((value) => value.length > 0);

  const fallback: ImportedCardInput[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    const card = normalizeImportedCard({ front: values[i], back: values[i + 1] });
    if (card) {
      fallback.push(card);
    }
  }

  return fallback;
}

export function parseImportFile(filename: string, text: string): ImportedCardInput[] {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "json") {
    const parsed = JSON.parse(text) as { deck?: { cards?: unknown[] }; cards?: unknown[] } | unknown[];
    const cards = Array.isArray(parsed) ? parsed : parsed.deck?.cards ?? parsed.cards ?? [];
    return cards.map((card) => normalizeImportedCard(card)).filter((card): card is ImportedCardInput => Boolean(card));
  }

  if (extension === "csv") {
    return parseDelimited(text, ",");
  }

  if (extension === "tsv") {
    return parseDelimited(text, "\t");
  }

  if (extension === "xml") {
    return parseXml(text);
  }

  return parseDelimited(text, "\t");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function serializeDeckAsJson(deckName: string, cards: ExportCardRecord[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      deck: {
        name: deckName,
        cards,
      },
    },
    null,
    2
  );
}

export function serializeDeckAsDelimited(cards: ExportCardRecord[], delimiter: "," | "\t"): string {
  const header = ["front", "back"].join(delimiter);
  const rows = cards.map((card) =>
    [card.front, card.back]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(delimiter)
  );
  return [header, ...rows].join("\n");
}

export function serializeDeckAsXml(cards: ExportCardRecord[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<cards>",
    ...cards.map((card) => `  <card><front>${escapeXml(card.front)}</front><back>${escapeXml(card.back)}</back></card>`),
    "</cards>",
  ];
  return lines.join("\n");
}
