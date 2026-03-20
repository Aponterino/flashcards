"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface CardListItemProps {
  cardId: string;
  deckId: string;
  dueLabel: string | null;
  viewDeckId?: string;
  initialBack: string;
  initialFront: string;
  statusLabel: string;
  statusTone: "hard" | "medium" | "easy" | "not-studied";
}

export default function CardListItem({
  cardId,
  deckId,
  dueLabel,
  viewDeckId,
  initialBack,
  initialFront,
  statusLabel,
  statusTone,
}: CardListItemProps) {
  const router = useRouter();
  const [cardText, setCardText] = useState({ front: initialFront, back: initialBack });
  const [isSwappingSingle, setIsSwappingSingle] = useState(false);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);
  const [isSwapAllPending, setIsSwapAllPending] = useState(false);
  const [swapPulse, setSwapPulse] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
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
    if (isSwappingSingle || isSwapAllPending || isDeletingSingle) {
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

  async function handleDelete() {
    if (isDeletingSingle || isSwappingSingle || isSwapAllPending) {
      return;
    }

    const confirmed = window.confirm("Delete this card?");
    if (!confirmed) {
      return;
    }

    setIsDeletingSingle(true);

    try {
      const response = await fetch("/api/cards/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId, cardId }),
      });

      if (!response.ok) {
        setIsDeletingSingle(false);
        return;
      }

      setIsDeleted(true);
      router.refresh();
    } finally {
      setIsDeletingSingle(false);
    }
  }

  if (isDeleted) {
    return null;
  }

  const isPending = isSwappingSingle || isSwapAllPending || isDeletingSingle;
  const transitionClass = `card-text-transition${isPending ? " is-pending" : ""}${swapPulse ? " is-swapped" : ""}`;

  return (
    <>
      <div className="card-item-content">
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
          href={`/decks/${viewDeckId ?? deckId}?edit=${cardId}#card-${cardId}`}
          onClick={(event) => {
            if (isPending) {
              event.preventDefault();
            }
          }}
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
        <button
          aria-label={`Delete card: ${cardText.front}`}
          className="button ghost-danger card-edit-button card-hover-action"
          disabled={isPending}
          onClick={handleDelete}
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
              d="M3 6h18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M8 6V4h8v2"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M6 6l1 14h10l1-14"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <span>{isDeletingSingle ? "Deleting..." : "Delete"}</span>
        </button>
        <div className="card-status-meta">
          <span className={`chip study-status-chip study-status-${statusTone}`}>{statusLabel}</span>
          {dueLabel ? <p className={`card-due-label ${transitionClass}`}>{dueLabel}</p> : null}
        </div>
      </div>
    </>
  );
}
