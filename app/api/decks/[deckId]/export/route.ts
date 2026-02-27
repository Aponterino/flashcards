import { NextResponse } from "next/server";

import { serializeDeckAsDelimited, serializeDeckAsJson, serializeDeckAsXml } from "@/lib/importExport";
import { getCardsForStudyDeck } from "@/lib/queries/cards";
import { getDeckById } from "@/lib/queries/decks";

interface ExportRouteContext {
  params: Promise<{ deckId: string }>;
}

function toSafeFileStem(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "deck"
  );
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { deckId } = await context.params;
  const deck = await getDeckById(deckId);
  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  const cards = await getCardsForStudyDeck(deckId);
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "json").toLowerCase();
  const stem = toSafeFileStem(deck.name);

  let filename = `${stem}.json`;
  let contentType = "application/json; charset=utf-8";
  let body = serializeDeckAsJson(deck.name, cards);

  if (format === "csv") {
    filename = `${stem}.csv`;
    contentType = "text/csv; charset=utf-8";
    body = serializeDeckAsDelimited(cards, ",");
  } else if (format === "tsv") {
    filename = `${stem}.tsv`;
    contentType = "text/tab-separated-values; charset=utf-8";
    body = serializeDeckAsDelimited(cards, "\t");
  } else if (format === "xml") {
    filename = `${stem}.xml`;
    contentType = "application/xml; charset=utf-8";
    body = serializeDeckAsXml(cards);
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
