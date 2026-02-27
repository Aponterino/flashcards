"use client";

import { useEffect } from "react";

interface ImportSuccessFocusProps {
  addedCount: number;
  importedCardIds: string[];
}

export default function ImportSuccessFocus({ addedCount, importedCardIds }: ImportSuccessFocusProps) {
  useEffect(() => {
    if (addedCount <= 0 && importedCardIds.length === 0) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = importedCardIds
      .map((cardId) => document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`))
      .filter((element): element is HTMLElement => Boolean(element));

    const firstTarget = targets[0] ?? document.querySelector<HTMLElement>("#cards-section");
    if (!firstTarget) {
      return;
    }

    firstTarget.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });

    for (const target of targets) {
      target.classList.add("card-item-imported");
    }

    const cleanupTimer = window.setTimeout(() => {
      for (const target of targets) {
        target.classList.remove("card-item-imported");
      }
    }, 1800);

    return () => {
      window.clearTimeout(cleanupTimer);
      for (const target of targets) {
        target.classList.remove("card-item-imported");
      }
    };
  }, [addedCount, importedCardIds]);

  return null;
}
