import "./globals.css";

import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Study Buddy Flashcards",
  description: "Self-hosted flashcards with Postgres storage.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div>
              <p className="eyebrow">Study Buddy</p>
              <h1>Flashcards</h1>
            </div>
            <nav className="nav-links">
              <Link href="/">Home</Link>
              <Link href="/decks">Decks</Link>
            </nav>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
