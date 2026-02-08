import "./globals.css";

import type { ReactNode } from "react";

import AppHeader from "@/components/AppHeader";
import Sidebar from "@/components/Sidebar";

export const metadata = {
  title: "Study Buddy Flashcards",
  description: "Self-hosted flashcards with Postgres storage.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div className="app-shell">
          <Sidebar />
          <div className="app-content">
            <AppHeader />
            <main className="app-main" id="main-content" tabIndex={-1}>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
