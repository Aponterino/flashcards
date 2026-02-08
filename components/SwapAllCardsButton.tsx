"use client";

import { useState } from "react";

interface SwapAllCardsButtonProps {
  deckId: string;
}

export default function SwapAllCardsButton({ deckId }: SwapAllCardsButtonProps) {
  const [isSwapping, setIsSwapping] = useState(false);

  async function handleSwapAll() {
    if (isSwapping) {
      return;
    }

    setIsSwapping(true);
    window.dispatchEvent(new CustomEvent("cards:swap-all-pending", { detail: { deckId } }));

    try {
      const response = await fetch("/api/cards/swap-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId }),
      });

      if (!response.ok) {
        return;
      }

      window.dispatchEvent(new CustomEvent("cards:swap-all-complete", { detail: { deckId } }));
    } finally {
      setIsSwapping(false);
      window.dispatchEvent(new CustomEvent("cards:swap-all-idle", { detail: { deckId } }));
    }
  }

  return (
    <button className="button ghost cards-swap-button" disabled={isSwapping} onClick={handleSwapAll} type="button">
      {isSwapping ? "Swapping..." : "Swap Front/Back (All Cards)"}
    </button>
  );
}
