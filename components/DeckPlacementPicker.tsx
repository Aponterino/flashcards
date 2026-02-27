"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface DeckPlacementOption {
  id: string;
  name: string;
}

interface DeckPlacementPickerProps {
  deckId: string;
  redirectTo: string;
  currentParentDeckId: string | null;
  options: DeckPlacementOption[];
  moveAction: (formData: FormData) => void | Promise<void>;
}

export default function DeckPlacementPicker({
  deckId,
  redirectTo,
  currentParentDeckId,
  options,
  moveAction,
}: DeckPlacementPickerProps) {
  const [selectedParentDeckId, setSelectedParentDeckId] = useState(currentParentDeckId ?? "");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedParentDeckId(currentParentDeckId ?? "");
  }, [currentParentDeckId]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const selectedLabel = useMemo(() => {
    if (!selectedParentDeckId) {
      return "No master (top-level)";
    }

    const selectedOption = options.find((option) => option.id === selectedParentDeckId);
    return selectedOption?.name ?? "Choose master deck";
  }, [options, selectedParentDeckId]);

  function pickParent(nextParentDeckId: string) {
    setSelectedParentDeckId(nextParentDeckId);
    setIsMenuOpen(false);
  }

  return (
    <form action={moveAction} className="deck-placement-form">
      <input name="deckId" type="hidden" value={deckId} />
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <input name="parentDeckId" type="hidden" value={selectedParentDeckId} />

      <div className="deck-placement-picker" ref={rootRef}>
        <p className="deck-placement-label">Move under</p>
        <button
          aria-expanded={isMenuOpen}
          aria-haspopup="listbox"
          className={`button ghost deck-placement-trigger ${isMenuOpen ? "open" : ""}`}
          onClick={() => setIsMenuOpen((previous) => !previous)}
          type="button"
        >
          <span>{selectedLabel}</span>
          <span aria-hidden className="deck-placement-caret">▾</span>
        </button>

        {isMenuOpen ? (
          <div className="deck-placement-menu" role="listbox">
            <button
              className={`deck-placement-option ${selectedParentDeckId === "" ? "active" : ""}`}
              onClick={() => pickParent("")}
              aria-selected={selectedParentDeckId === ""}
              role="option"
              type="button"
            >
              <span>No master (top-level)</span>
              {selectedParentDeckId === "" ? <span aria-hidden>✓</span> : null}
            </button>
            {options.map((option) => {
              const isSelected = selectedParentDeckId === option.id;

              return (
                <button
                  className={`deck-placement-option ${isSelected ? "active" : ""}`}
                  key={option.id}
                  onClick={() => pickParent(option.id)}
                  aria-selected={isSelected}
                  role="option"
                  type="button"
                >
                  <span>{option.name}</span>
                  {isSelected ? <span aria-hidden>✓</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <button className="button ghost" type="submit">
        Update placement
      </button>
    </form>
  );
}
