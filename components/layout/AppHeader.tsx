"use client";

import { usePathname } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname();

  if (pathname !== "/") {
    return null;
  }

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Study Buddy</p>
        <h1>Flashcards</h1>
      </div>
    </header>
  );
}
