"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef } from "react";

import { parseImportFile, type ImportedCardInput } from "@/lib/importExport";

interface DeckSettingsMenuProps {
  deckId: string;
  archiveAction: (formData: FormData) => void | Promise<void>;
  resetLearningAction: (formData: FormData) => void | Promise<void>;
  resolveImportAction: (formData: FormData) => void | Promise<void>;
  existingCards: Array<{ id: string; front: string; back: string }>;
}

interface DuplicateCandidate {
  id: string;
  existingCardId: string;
  existingFront: string;
  existingBack: string;
  imported: ImportedCardInput;
}

function normalizeMatchValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function DeckSettingsMenu({
  deckId,
  archiveAction,
  resetLearningAction,
  resolveImportAction,
  existingCards,
}: DeckSettingsMenuProps) {
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [incomingCards, setIncomingCards] = useState<ImportedCardInput[]>([]);
  const [duplicateCards, setDuplicateCards] = useState<DuplicateCandidate[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"muted" | "error">("muted");
  const [isOpen, setIsOpen] = useState(false);
  const [isDuplicateReviewOpen, setIsDuplicateReviewOpen] = useState(false);

  const hasImportPreview = incomingCards.length > 0 || duplicateCards.length > 0;
  const hasDuplicates = duplicateCards.length > 0;
  const duplicatePayload = useMemo(
    () =>
      duplicateCards.map((duplicate) => ({
        existingCardId: duplicate.existingCardId,
        imported: duplicate.imported,
      })),
    [duplicateCards]
  );

  function handleDeleteConfirm(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm("Delete this deck? You can find it later in Deleted Decks.");
    if (!confirmed) {
      event.preventDefault();
    }
  }

  function handleResetLearningConfirm(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm("Reset learning progress for this deck? Cards stay, but all study progress will be cleared.");
    if (!confirmed) {
      event.preventDefault();
    }
  }

  function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setIncomingCards([]);
      setDuplicateCards([]);
      setImportStatus("");
      setStatusTone("muted");
      setIsDuplicateReviewOpen(false);
      return;
    }

    setSelectedFile(file);
    setIncomingCards([]);
    setDuplicateCards([]);
    setImportStatus(`Ready to upload: ${file.name}`);
    setStatusTone("muted");
    setIsDuplicateReviewOpen(false);
  }

  async function handlePrepareImport() {
    if (!selectedFile) {
      return;
    }

    try {
      const text = await selectedFile.text();
      const imported = parseImportFile(selectedFile.name, text);

      const nextIncoming: ImportedCardInput[] = [];
      const nextDuplicates: DuplicateCandidate[] = [];
      for (const importedCard of imported) {
        const importedFront = normalizeMatchValue(importedCard.front);
        const importedBack = normalizeMatchValue(importedCard.back);
        const existingMatch = existingCards.find((existingCard) => {
          const existingFront = normalizeMatchValue(existingCard.front);
          const existingBack = normalizeMatchValue(existingCard.back);
          return (
            importedFront.length > 0 &&
            importedBack.length > 0 &&
            (existingFront === importedFront || existingBack === importedBack)
          );
        });

        if (existingMatch) {
          nextDuplicates.push({
            id: `${existingMatch.id}-${nextDuplicates.length}`,
            existingCardId: existingMatch.id,
            existingFront: existingMatch.front,
            existingBack: existingMatch.back,
            imported: importedCard,
          });
        } else {
          nextIncoming.push(importedCard);
        }
      }

      setIncomingCards(nextIncoming);
      setDuplicateCards(nextDuplicates);
      setImportStatus(
        `Parsed ${imported.length} card${imported.length === 1 ? "" : "s"}: ${nextIncoming.length} new, ${nextDuplicates.length} duplicates found.`
      );
      setStatusTone("muted");
      setIsDuplicateReviewOpen(false);
    } catch {
      setIncomingCards([]);
      setDuplicateCards([]);
      setImportStatus("Import failed. Please check the file format.");
      setStatusTone("error");
      setIsDuplicateReviewOpen(false);
    }
  }

  function removeDuplicateCandidate(candidateId: string) {
    setDuplicateCards((previous) => {
      const next = previous.filter((candidate) => candidate.id !== candidateId);
      if (next.length === 0) {
        setIsDuplicateReviewOpen(false);
      }
      return next;
    });
  }

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isDuplicateReviewOpen) {
          setIsDuplicateReviewOpen(false);
          return;
        }
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isDuplicateReviewOpen]);

  useEffect(() => {
    function syncFromHash() {
      setIsOpen(window.location.hash === "#deck-settings");
    }

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <>
      <details className="deck-menu" id="deck-settings" open={isOpen} ref={menuRef}>
      <summary
        className="button ghost deck-menu-trigger"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen((previous) => !previous);
        }}
      >
        Deck Settings
      </summary>
      <div className="deck-menu-content card">
        <p className="deck-menu-title">Deck settings</p>
        <section className="deck-menu-section stack">
          <p className="deck-menu-label">Recovery</p>
          <a className="button ghost deck-menu-full-button" href={`/decks/${deckId}/versions`}>
            Deck Versions
          </a>
        </section>

        <section className="deck-menu-section stack">
          <p className="deck-menu-label">Export cards</p>
          <div className="deck-menu-button-grid">
            <a className="button ghost" href={`/api/decks/${deckId}/export?format=json`}>
              JSON
            </a>
            <a className="button ghost" href={`/api/decks/${deckId}/export?format=csv`}>
              CSV
            </a>
            <a className="button ghost" href={`/api/decks/${deckId}/export?format=tsv`}>
              TSV
            </a>
            <a className="button ghost" href={`/api/decks/${deckId}/export?format=xml`}>
              XML
            </a>
          </div>
        </section>

        <section className="deck-menu-section stack">
          <p className="deck-menu-label">Import cards</p>
          <div className="stack">
            <input
              accept=".json,.csv,.tsv,.xml,text/csv,text/tab-separated-values,application/json,application/xml,text/xml"
              className="file-input-hidden"
              id={`deck-import-file-${deckId}`}
              onChange={handleImportFileChange}
              type="file"
            />
            <div className="deck-menu-button-grid">
              <label className="button ghost file-input-button" htmlFor={`deck-import-file-${deckId}`}>
                Choose import file
              </label>
              <button className="button ghost" disabled={!selectedFile} onClick={handlePrepareImport} type="button">
                Preview Import
              </button>
            </div>
            {importStatus ? (
              <p
                aria-live="polite"
                className={statusTone === "error" ? "subtitle import-status-error" : "subtitle"}
                role={statusTone === "error" ? "alert" : "status"}
              >
                {importStatus}
              </p>
            ) : null}
          </div>

          {hasImportPreview ? (
            <form action={resolveImportAction} className="deck-menu-button-grid">
              <input type="hidden" name="deckId" value={deckId} />
              <input type="hidden" name="incomingCards" value={JSON.stringify(incomingCards)} />
              <input type="hidden" name="duplicateCards" value={JSON.stringify(duplicatePayload)} />
              <button className="button primary" name="strategy" type="submit" value="merge">
                Upload and Merge
              </button>
              <button className="button danger" name="strategy" type="submit" value="replace">
                Import and Replace Duplicates
              </button>
            </form>
          ) : null}

          {hasDuplicates ? (
            <button className="button ghost deck-menu-full-button" onClick={() => setIsDuplicateReviewOpen(true)} type="button">
              Review {duplicateCards.length} Duplicate{duplicateCards.length === 1 ? "" : "s"}
            </button>
          ) : null}
        </section>

        <form action={resetLearningAction} className="deck-menu-delete-form" onSubmit={handleResetLearningConfirm}>
          <input type="hidden" name="deckId" value={deckId} />
          <button className="button ghost deck-menu-full-button" type="submit">
            Reset Learning Progress
          </button>
        </form>

        <form action={archiveAction} className="deck-menu-delete-form" onSubmit={handleDeleteConfirm}>
          <input type="hidden" name="deckId" value={deckId} />
          <button className="button ghost-danger deck-menu-full-button" type="submit">
            Move to Trash
          </button>
        </form>
      </div>
    </details>

      {isDuplicateReviewOpen && hasDuplicates ? (
        <div
          className="import-duplicate-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsDuplicateReviewOpen(false);
            }
          }}
          role="presentation"
        >
          <section aria-labelledby={`duplicate-review-title-${deckId}`} aria-modal="true" className="import-duplicate-modal" role="dialog">
            <header className="import-duplicate-modal-head">
              <div className="stack-sm">
                <h4 id={`duplicate-review-title-${deckId}`}>Review duplicate cards</h4>
                <p className="muted">
                  {duplicateCards.length} duplicate match{duplicateCards.length === 1 ? "" : "es"} found. Remove any cards you do not
                  want to apply.
                </p>
              </div>
              <button className="button ghost" onClick={() => setIsDuplicateReviewOpen(false)} type="button">
                Close
              </button>
            </header>

            <div className="duplicate-list import-duplicate-modal-list">
              {duplicateCards.map((duplicate) => (
                <article className="duplicate-item import-duplicate-item" key={duplicate.id}>
                  <button
                    aria-label="Remove duplicate from import"
                    className="button ghost duplicate-remove-button"
                    onClick={() => removeDuplicateCandidate(duplicate.id)}
                    type="button"
                  >
                    <svg aria-hidden="true" className="card-edit-icon" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 6h18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      <path d="M8 6V4h8v2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      <path d="M6 6l1 14h10l1-14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  </button>
                  <div className="duplicate-body">
                    <p className="muted">Existing: {duplicate.existingFront} | {duplicate.existingBack}</p>
                    <p className="muted">Imported: {duplicate.imported.front} | {duplicate.imported.back}</p>
                  </div>
                </article>
              ))}
            </div>

            <form action={resolveImportAction} className="deck-menu-button-grid import-duplicate-modal-actions">
              <input type="hidden" name="deckId" value={deckId} />
              <input type="hidden" name="incomingCards" value={JSON.stringify(incomingCards)} />
              <input type="hidden" name="duplicateCards" value={JSON.stringify(duplicatePayload)} />
              <button className="button primary" name="strategy" type="submit" value="merge">
                Upload and Merge
              </button>
              <button className="button danger" name="strategy" type="submit" value="replace">
                Import and Replace Duplicates
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
