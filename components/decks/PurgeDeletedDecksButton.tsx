"use client";

import type { FormEvent } from "react";

interface PurgeDeletedDecksButtonProps {
  purgeAction: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}

export default function PurgeDeletedDecksButton({ purgeAction, disabled }: PurgeDeletedDecksButtonProps) {
  function handlePurgeConfirm(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm("Permanently purge all deleted decks? This cannot be undone.");
    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <form action={purgeAction} onSubmit={handlePurgeConfirm}>
      <button className="button danger" type="submit" disabled={disabled}>
        Purge deleted decks
      </button>
    </form>
  );
}
