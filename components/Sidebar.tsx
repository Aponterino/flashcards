"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  THEME_KEY,
  applyThemeAttributes,
  getOrCreateThemeProfileId,
  parseThemeId,
  resolveTheme,
} from "@/lib/theme";

interface SidebarDeck {
  id: string;
  name: string;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/decks" && pathname.startsWith("/decks/deleted")) {
    return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const decksMenuId = "sidebar-decks-menu";
  const [decks, setDecks] = useState<SidebarDeck[]>([]);
  const [decksOpen, setDecksOpen] = useState(false);
  const [newDeckIds, setNewDeckIds] = useState<string[]>([]);
  const knownDeckIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const initialTheme = resolveTheme(window.localStorage.getItem(THEME_KEY), document.documentElement.getAttribute("data-theme"));
    window.localStorage.setItem(THEME_KEY, initialTheme);
    applyThemeAttributes(initialTheme);

    const profileId = getOrCreateThemeProfileId();
    void syncThemeFromServer(profileId);
  }, []);

  async function syncThemeFromServer(profileId: string) {
    try {
      const response = await fetch(`/api/preferences/theme?profileId=${encodeURIComponent(profileId)}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { theme?: unknown };
      const serverTheme = parseThemeId(payload.theme);
      if (!serverTheme) {
        return;
      }

      window.localStorage.setItem(THEME_KEY, serverTheme);
      applyThemeAttributes(serverTheme);
    } catch {
      // Ignore API errors and keep local theme.
    }
  }

  useEffect(() => {
    if (pathname.startsWith("/decks")) {
      setDecksOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    let isCancelled = false;

    async function loadDecks() {
      try {
        const response = await fetch("/api/decks", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as Array<{ id: string; name: string }>;
        if (isCancelled) {
          return;
        }

        const nextIds = new Set(payload.map((deck) => deck.id));
        const previousIds = knownDeckIdsRef.current;
        const added = payload.filter((deck) => !previousIds.has(deck.id)).map((deck) => deck.id);

        if (previousIds.size > 0 && added.length > 0) {
          setNewDeckIds(added);
          window.setTimeout(() => {
            setNewDeckIds((current) => current.filter((id) => !added.includes(id)));
          }, 1400);
        }

        knownDeckIdsRef.current = nextIds;
        setDecks(payload);
      } catch {
        if (!isCancelled) {
          setDecks([]);
        }
      }
    }

    loadDecks();

    return () => {
      isCancelled = true;
    };
  }, [pathname, decksOpen]);

  return (
    <aside aria-label="Sidebar" className="app-sidebar">
      <div className="sidebar-top">
        <p className="eyebrow">Navigation</p>
        <nav aria-label="Primary" className="sidebar-nav">
          <Link aria-current={isActive(pathname, "/") ? "page" : undefined} className={isActive(pathname, "/") ? "active" : ""} href="/">
            Home
          </Link>
          <div className="sidebar-decks">
            <div className={`sidebar-decks-header ${isActive(pathname, "/decks") ? "active" : ""}`}>
              <Link aria-current={isActive(pathname, "/decks") ? "page" : undefined} className="sidebar-decks-link" href="/decks">
                Decks
              </Link>
              <button
                aria-controls={decksMenuId}
                aria-expanded={decksOpen}
                aria-label={decksOpen ? "Collapse decks menu" : "Expand decks menu"}
                className="sidebar-decks-toggle"
                onClick={() => setDecksOpen((previous) => !previous)}
                type="button"
              >
                <span className={`sidebar-decks-caret ${decksOpen ? "open" : ""}`}>▾</span>
              </button>
            </div>

            {decksOpen ? (
              <div className="sidebar-decks-menu open" id={decksMenuId}>
                <Link aria-current={isActive(pathname, "/decks") ? "page" : undefined} className={`sidebar-sublink ${isActive(pathname, "/decks") ? "active" : ""}`} href="/decks">
                  All Decks
                </Link>
                <Link
                  aria-current={isActive(pathname, "/decks/new") ? "page" : undefined}
                  className={`sidebar-sublink ${isActive(pathname, "/decks/new") ? "active" : ""}`}
                  href="/decks/new"
                >
                  + New Deck
                </Link>
                {decks.length === 0 ? (
                  <p className="sidebar-sublink muted">No decks yet</p>
                ) : (
                  decks.map((deck) => (
                    <Link
                      aria-current={isActive(pathname, `/decks/${deck.id}`) ? "page" : undefined}
                      className={`sidebar-sublink ${isActive(pathname, `/decks/${deck.id}`) ? "active" : ""} ${newDeckIds.includes(deck.id) ? "new-item" : ""}`}
                      href={`/decks/${deck.id}`}
                      key={deck.id}
                    >
                      {deck.name}
                    </Link>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </nav>
      </div>

      <div className="sidebar-bottom">
        <Link aria-current={isActive(pathname, "/settings") ? "page" : undefined} className={`sidebar-settings ${isActive(pathname, "/settings") ? "active" : ""}`} href="/settings">
          App Settings
        </Link>
      </div>
    </aside>
  );
}
