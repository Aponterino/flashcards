"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface CardListItemProps {
  cardId: string;
  deckId: string;
  initialBack: string;
  initialFront: string;
  statusLabel: string;
  statusTone: "hard" | "medium" | "easy" | "not-studied";
}

export default function CardListItem({
  cardId,
  deckId,
  initialBack,
  initialFront,
  statusLabel,
  statusTone,
}: CardListItemProps) {
  const [cardText, setCardText] = useState({ front: initialFront, back: initialBack });
  const [isSwappingSingle, setIsSwappingSingle] = useState(false);
  const [isSwapAllPending, setIsSwapAllPending] = useState(false);
  const [swapPulse, setSwapPulse] = useState(false);
  const pulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function handleSwapAllPending(event: Event) {
      const customEvent = event as CustomEvent<{ deckId?: string }>;
      if (customEvent.detail?.deckId !== deckId) {
        return;
      }

      setIsSwapAllPending(true);
    }

    function handleSwapAllComplete(event: Event) {
      const customEvent = event as CustomEvent<{ deckId?: string }>;
      if (customEvent.detail?.deckId !== deckId) {
        return;
      }

      setCardText((previous) => ({ front: previous.back, back: previous.front }));
      setSwapPulse(true);
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }
      pulseTimerRef.current = window.setTimeout(() => setSwapPulse(false), 240);
    }

    function handleSwapAllIdle(event: Event) {
      const customEvent = event as CustomEvent<{ deckId?: string }>;
      if (customEvent.detail?.deckId !== deckId) {
        return;
      }

      setIsSwapAllPending(false);
    }

    window.addEventListener("cards:swap-all-pending", handleSwapAllPending as EventListener);
    window.addEventListener("cards:swap-all-complete", handleSwapAllComplete as EventListener);
    window.addEventListener("cards:swap-all-idle", handleSwapAllIdle as EventListener);

    return () => {
      window.removeEventListener("cards:swap-all-pending", handleSwapAllPending as EventListener);
      window.removeEventListener("cards:swap-all-complete", handleSwapAllComplete as EventListener);
      window.removeEventListener("cards:swap-all-idle", handleSwapAllIdle as EventListener);
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }
    };
  }, [deckId]);

  async function handleSwap() {
    if (isSwappingSingle || isSwapAllPending) {
      return;
    }

    setIsSwappingSingle(true);

    try {
      const response = await fetch("/api/cards/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId, cardId }),
      });

      if (!response.ok) {
        return;
      }

      setCardText((previous) => ({ front: previous.back, back: previous.front }));
      setSwapPulse(true);
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }
      pulseTimerRef.current = window.setTimeout(() => setSwapPulse(false), 240);
    } finally {
      setIsSwappingSingle(false);
    }
  }

  const isPending = isSwappingSingle || isSwapAllPending;
  const transitionClass = `card-text-transition${isPending ? " is-pending" : ""}${swapPulse ? " is-swapped" : ""}`;

  return (
    <>
      <div>
        <p className={`card-front ${transitionClass}`}>
          <span className="card-label">Front:</span> {cardText.front}
        </p>
        <p className={`muted ${transitionClass}`}>
          <span className="card-label">Back:</span> {cardText.back}
        </p>
      </div>
      <div className="card-item-actions">
        <button
          aria-label={`Swap front and back for card: ${cardText.front}`}
          className="button ghost card-edit-button card-hover-action"
          disabled={isPending}
          onClick={handleSwap}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="card-edit-icon"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 8h14m0 0l-3-3m3 3l-3 3"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M20 16H6m0 0l3-3m-3 3l3 3"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <span>{isSwappingSingle ? "Swapping..." : "Swap"}</span>
        </button>
        <Link
          aria-label={`Edit card: ${cardText.front}`}
          className="button ghost card-edit-button card-hover-action"
          href={`/decks/${deckId}?edit=${cardId}#card-${cardId}`}
        >
          <svg
            aria-hidden="true"
            className="card-edit-icon"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 20h4l10-10-4-4L4 16v4z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M12 6l4 4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <span>Edit</span>
        </Link>
        <span className={`chip study-status-chip study-status-${statusTone}`}>{statusLabel}</span>
      </div>
    </>
  );
}
