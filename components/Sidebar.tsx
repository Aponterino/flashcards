"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

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
  parentDeckId: string | null;
  cardCount: number;
  childCount: number;
  sortOrder: number;
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
  const searchParams = useSearchParams();
  const navRefreshKey = searchParams.toString();
  const navRefreshToken = searchParams.get("navRefresh");
  const router = useRouter();
  const decksMenuId = "sidebar-decks-menu";
  const sidebarPanelId = "app-sidebar-panel";
  const [decks, setDecks] = useState<SidebarDeck[]>([]);
  const [decksOpen, setDecksOpen] = useState(false);
  const [newDeckIds, setNewDeckIds] = useState<string[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [draggingDeckId, setDraggingDeckId] = useState<string | null>(null);
  const [dropTargetDeckId, setDropTargetDeckId] = useState<string | null>(null);
  const [moveDeckError, setMoveDeckError] = useState<string>("");
  const [isMovingDeck, setIsMovingDeck] = useState(false);
  const knownDeckIdsRef = useRef<Set<string>>(new Set());
  const draggingDeckIdRef = useRef<string | null>(null);
  const dropTargetDeckIdRef = useRef<string | null>(null);
  const pendingNameDragRef = useRef<{ deckId: string; pointerId: number; startX: number; startY: number } | null>(null);
  const suppressDeckClickIdRef = useRef<string | null>(null);
  const suppressDeckClickTimeoutRef = useRef<number | null>(null);
  const childDecksByParent = useMemo(() => {
    return decks.reduce<Map<string, SidebarDeck[]>>((map, deck) => {
      if (!deck.parentDeckId) {
        return map;
      }

      const existing = map.get(deck.parentDeckId) ?? [];
      existing.push(deck);
      map.set(deck.parentDeckId, existing);
      return map;
    }, new Map());
  }, [decks]);

  const rootDecks = useMemo(() => {
    const deckIds = new Set(decks.map((deck) => deck.id));
    return decks.filter((deck) => !deck.parentDeckId || !deckIds.has(deck.parentDeckId));
  }, [decks]);

  const normalizeDeckPayload = useCallback(
    (
      payload: Array<{
        id: string;
        name: string;
        parentDeckId?: string | null;
        cardCount?: number;
        childCount?: number;
        sortOrder?: number;
      }>
    ): SidebarDeck[] => {
      return payload.map((deck) => ({
        id: deck.id,
        name: deck.name,
        parentDeckId: typeof deck.parentDeckId === "string" ? deck.parentDeckId : null,
        cardCount: Number.isFinite(Number(deck.cardCount)) ? Number(deck.cardCount) : 0,
        childCount: Number.isFinite(Number(deck.childCount)) ? Number(deck.childCount) : 0,
        sortOrder: Number.isFinite(Number(deck.sortOrder)) ? Number(deck.sortOrder) : 0,
      }));
    },
    []
  );

  const fetchDecksFromApi = useCallback(async (): Promise<SidebarDeck[]> => {
    const response = await fetch("/api/decks", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load decks");
    }

    const payload = (await response.json()) as Array<{
      id: string;
      name: string;
      parentDeckId?: string | null;
      cardCount?: number;
      childCount?: number;
      sortOrder?: number;
    }>;

    return normalizeDeckPayload(payload);
  }, [normalizeDeckPayload]);

  const getDropIntent = useCallback(
    (sourceDeckId: string, targetDeckId: string): { parentDeckId: string | null; afterDeckId: string | null } | null => {
      if (!sourceDeckId || !targetDeckId || sourceDeckId === targetDeckId) {
        return null;
      }

      const sourceDeck = decks.find((deck) => deck.id === sourceDeckId);
      const targetDeck = decks.find((deck) => deck.id === targetDeckId);
      if (!sourceDeck || !targetDeck) {
        return null;
      }

      if (sourceDeck.parentDeckId === null && targetDeck.parentDeckId === null) {
        if (sourceDeck.childCount === 0) {
          return {
            parentDeckId: targetDeck.id,
            afterDeckId: null,
          };
        }

        return {
          parentDeckId: null,
          afterDeckId: targetDeck.id,
        };
      }

      if (sourceDeck.parentDeckId === targetDeck.parentDeckId && sourceDeck.parentDeckId !== null) {
        return {
          parentDeckId: sourceDeck.parentDeckId,
          afterDeckId: targetDeck.id,
        };
      }

      if (targetDeck.parentDeckId === null && sourceDeck.childCount === 0) {
        return {
          parentDeckId: targetDeck.id,
          afterDeckId: null,
        };
      }

      return null;
    },
    [decks]
  );

  const canDropToTopLevel = useCallback(
    (sourceDeckId: string): boolean => {
      if (!sourceDeckId) {
        return false;
      }

      const sourceDeck = decks.find((deck) => deck.id === sourceDeckId);
      if (!sourceDeck) {
        return false;
      }

      return Boolean(sourceDeck.parentDeckId);
    },
    [decks]
  );

  const setActiveDropTarget = useCallback((targetDeckId: string | null) => {
    dropTargetDeckIdRef.current = targetDeckId;
    setDropTargetDeckId((current) => (current === targetDeckId ? current : targetDeckId));
  }, []);

  const suppressNextDeckClick = useCallback((deckId: string) => {
    suppressDeckClickIdRef.current = deckId;
    if (suppressDeckClickTimeoutRef.current !== null) {
      window.clearTimeout(suppressDeckClickTimeoutRef.current);
    }
    suppressDeckClickTimeoutRef.current = window.setTimeout(() => {
      suppressDeckClickIdRef.current = null;
      suppressDeckClickTimeoutRef.current = null;
    }, 0);
  }, []);

  const startDeckDrag = useCallback(
    (deckId: string) => {
      setMoveDeckError("");
      setDraggingDeckId(deckId);
      draggingDeckIdRef.current = deckId;
      setActiveDropTarget(null);
    },
    [setActiveDropTarget]
  );

  const endDeckDrag = useCallback(() => {
    setDraggingDeckId(null);
    draggingDeckIdRef.current = null;
    pendingNameDragRef.current = null;
    setActiveDropTarget(null);
  }, [setActiveDropTarget]);

  const moveDeck = useCallback(
    async (deckId: string, parentDeckId: string | null, afterDeckId: string | null = null) => {
      setMoveDeckError("");
      setIsMovingDeck(true);

      try {
        const response = await fetch("/api/decks/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deckId, parentDeckId, afterDeckId }),
        });

        if (!response.ok) {
          let errorMessage = "Could not move deck.";
          try {
            const payload = (await response.json()) as { error?: unknown };
            if (typeof payload.error === "string" && payload.error.trim()) {
              errorMessage = payload.error;
            }
          } catch {
            // Keep default message.
          }
          setMoveDeckError(errorMessage);
          return;
        }

        const nextDecks = await fetchDecksFromApi();
        knownDeckIdsRef.current = new Set(nextDecks.map((deck) => deck.id));
        setDecks(nextDecks);
        router.refresh();
      } catch {
        setMoveDeckError("Could not move deck.");
      } finally {
        setIsMovingDeck(false);
        endDeckDrag();
      }
    },
    [endDeckDrag, fetchDecksFromApi, router]
  );

  function handleDeckPointerDown(deckId: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (isMovingDeck || event.button !== 0) {
      return;
    }

    event.preventDefault();
    startDeckDrag(deckId);
  }

  function handleDeckNamePointerDown(deckId: string, event: ReactPointerEvent<HTMLAnchorElement>) {
    if (isMovingDeck || event.button !== 0) {
      return;
    }

    pendingNameDragRef.current = {
      deckId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };

    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleDeckNamePointerMove(event: ReactPointerEvent<HTMLAnchorElement>) {
    const pending = pendingNameDragRef.current;
    if (!pending || pending.pointerId !== event.pointerId || draggingDeckIdRef.current) {
      return;
    }

    const deltaX = event.clientX - pending.startX;
    const deltaY = event.clientY - pending.startY;
    const dragThreshold = 4;
    if (deltaX * deltaX + deltaY * deltaY < dragThreshold * dragThreshold) {
      return;
    }

    event.preventDefault();
    startDeckDrag(pending.deckId);
    pendingNameDragRef.current = null;
  }

  function handleDeckNamePointerEnd(event: ReactPointerEvent<HTMLAnchorElement>) {
    const pending = pendingNameDragRef.current;
    if (pending && pending.pointerId === event.pointerId) {
      pendingNameDragRef.current = null;
    }

    if (event.currentTarget.releasePointerCapture && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    if (!draggingDeckId) {
      return;
    }

    function resolveDropTarget(clientX: number, clientY: number): string | null {
      const sourceDeckId = draggingDeckIdRef.current;
      if (!sourceDeckId || isMovingDeck) {
        return null;
      }

      const element = document.elementFromPoint(clientX, clientY);
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const topLevelTarget = element.closest<HTMLElement>("[data-drop-top-level='true']");
      if (topLevelTarget && canDropToTopLevel(sourceDeckId)) {
        return "__top-level__";
      }

      const deckTarget = element.closest<HTMLElement>("[data-drop-deck-id]");
      if (!deckTarget) {
        return null;
      }

      const targetDeckId = deckTarget.dataset.dropDeckId?.trim() ?? "";
      if (!targetDeckId) {
        return null;
      }

      return getDropIntent(sourceDeckId, targetDeckId) ? targetDeckId : null;
    }

    function handlePointerMove(event: PointerEvent) {
      const nextTarget = resolveDropTarget(event.clientX, event.clientY);
      setActiveDropTarget(nextTarget);
    }

    function handlePointerUp(event: PointerEvent) {
      const sourceDeckId = draggingDeckIdRef.current;
      if (!sourceDeckId || isMovingDeck) {
        endDeckDrag();
        return;
      }

      suppressNextDeckClick(sourceDeckId);
      const nextTarget = resolveDropTarget(event.clientX, event.clientY);
      setActiveDropTarget(nextTarget);

      if (nextTarget === "__top-level__") {
        if (canDropToTopLevel(sourceDeckId)) {
          void moveDeck(sourceDeckId, null, null);
          return;
        }
        endDeckDrag();
        return;
      }

      if (!nextTarget) {
        endDeckDrag();
        return;
      }

      const intent = getDropIntent(sourceDeckId, nextTarget);
      if (!intent) {
        endDeckDrag();
        return;
      }

      void moveDeck(sourceDeckId, intent.parentDeckId, intent.afterDeckId);
    }

    function handlePointerCancel() {
      endDeckDrag();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        endDeckDrag();
      }
    }

    document.body.classList.add("deck-drag-active");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.classList.remove("deck-drag-active");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [canDropToTopLevel, draggingDeckId, endDeckDrag, getDropIntent, isMovingDeck, moveDeck, setActiveDropTarget, suppressNextDeckClick]);

  useEffect(() => {
    return () => {
      if (suppressDeckClickTimeoutRef.current !== null) {
        window.clearTimeout(suppressDeckClickTimeoutRef.current);
      }
    };
  }, []);

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
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navRefreshToken) {
      return;
    }

    const nextParams = new URLSearchParams(navRefreshKey);
    nextParams.delete("navRefresh");
    const queryString = nextParams.toString();
    const nextHref = queryString ? `${pathname}?${queryString}` : pathname;
    router.replace(nextHref, { scroll: false });
  }, [navRefreshKey, navRefreshToken, pathname, router]);

  useEffect(() => {
    if (!mobileNavOpen) {
      document.body.classList.remove("mobile-nav-open");
      return;
    }

    document.body.classList.add("mobile-nav-open");

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.classList.remove("mobile-nav-open");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    let isCancelled = false;

    async function loadDecks() {
      try {
        const nextDecks = await fetchDecksFromApi();
        if (isCancelled) {
          return;
        }

        const nextIds = new Set(nextDecks.map((deck) => deck.id));
        const previousIds = knownDeckIdsRef.current;
        const added = nextDecks.filter((deck) => !previousIds.has(deck.id)).map((deck) => deck.id);

        if (previousIds.size > 0 && added.length > 0) {
          setNewDeckIds(added);
          window.setTimeout(() => {
            setNewDeckIds((current) => current.filter((id) => !added.includes(id)));
          }, 1400);
        }

        knownDeckIdsRef.current = nextIds;
        setDecks(nextDecks);
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
  }, [pathname, navRefreshKey, decksOpen, fetchDecksFromApi]);

  function renderDeckNode(deck: SidebarDeck, depth: number): JSX.Element {
    const childDecks = childDecksByParent.get(deck.id) ?? [];
    const isDragging = draggingDeckId === deck.id;
    const isDropTarget = dropTargetDeckId === deck.id;

    return (
      <div className="sidebar-deck-node-group" key={deck.id}>
        <div
          className={`sidebar-deck-node ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
          data-drop-deck-id={deck.id}
        >
          <button
            aria-label={`Drag ${deck.name}`}
            className="sidebar-deck-drag-handle"
            disabled={isMovingDeck}
            onPointerDown={(event) => handleDeckPointerDown(deck.id, event)}
            tabIndex={-1}
            title="Drag to move deck"
            type="button"
          >
            ::
          </button>
          <Link
            aria-current={isActive(pathname, `/decks/${deck.id}`) ? "page" : undefined}
            className={`sidebar-sublink ${isActive(pathname, `/decks/${deck.id}`) ? "active" : ""} ${newDeckIds.includes(deck.id) ? "new-item" : ""}`}
            href={`/decks/${deck.id}`}
            onClick={(event) => {
              if (suppressDeckClickIdRef.current === deck.id) {
                event.preventDefault();
                suppressDeckClickIdRef.current = null;
                return;
              }
              setMobileNavOpen(false);
            }}
            onPointerCancel={handleDeckNamePointerEnd}
            onPointerDown={(event) => handleDeckNamePointerDown(deck.id, event)}
            onPointerMove={handleDeckNamePointerMove}
            onPointerUp={handleDeckNamePointerEnd}
            style={{ paddingLeft: `${16 + depth * 14}px` }}
          >
            {depth > 0 ? "↳ " : ""}
            {deck.name}
          </Link>
        </div>
        {childDecks.map((childDeck) => renderDeckNode(childDeck, depth + 1))}
      </div>
    );
  }

  return (
    <>
      <div className="sidebar-mobile-bar">
        <button
          aria-controls={sidebarPanelId}
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
          className="sidebar-mobile-toggle"
          onClick={() => setMobileNavOpen((previous) => !previous)}
          type="button"
        >
          <span aria-hidden className="sidebar-mobile-icon">
            <span />
            <span />
            <span />
          </span>
          Menu
        </button>
        <p className="sidebar-mobile-title">Study Buddy</p>
      </div>

      <button
        aria-label="Close navigation menu"
        aria-hidden={!mobileNavOpen}
        className={`sidebar-overlay ${mobileNavOpen ? "open" : ""}`}
        onClick={() => setMobileNavOpen(false)}
        tabIndex={mobileNavOpen ? 0 : -1}
        type="button"
      />

      <aside aria-label="Sidebar" className={`app-sidebar ${mobileNavOpen ? "open" : ""}`} id={sidebarPanelId}>
        <div className="sidebar-top">
          <div className="sidebar-mobile-heading">
            <p className="eyebrow">Navigation</p>
            <button
              aria-label="Close navigation menu"
              className="sidebar-mobile-close"
              onClick={() => setMobileNavOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <nav aria-label="Primary" className="sidebar-nav">
            <Link
              aria-current={isActive(pathname, "/") ? "page" : undefined}
              className={isActive(pathname, "/") ? "active" : ""}
              href="/"
              onClick={() => setMobileNavOpen(false)}
            >
              Home
            </Link>
            <div className="sidebar-decks">
              <div className={`sidebar-decks-header ${isActive(pathname, "/decks") ? "active" : ""}`}>
                <Link
                  aria-current={isActive(pathname, "/decks") ? "page" : undefined}
                  className="sidebar-decks-link"
                  href="/decks"
                  onClick={() => setMobileNavOpen(false)}
                >
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
                  <Link
                    aria-current={isActive(pathname, "/decks") ? "page" : undefined}
                    className={`sidebar-sublink ${isActive(pathname, "/decks") ? "active" : ""}`}
                    href="/decks"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    All Decks
                  </Link>
                  <Link
                    aria-current={isActive(pathname, "/decks/new") ? "page" : undefined}
                    className={`sidebar-sublink ${isActive(pathname, "/decks/new") ? "active" : ""}`}
                    href="/decks/new"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    + New Deck
                  </Link>
                  {draggingDeckId ? (
                    <button
                      aria-hidden
                      className={`sidebar-sublink sidebar-drop-top-level ${dropTargetDeckId === "__top-level__" ? "drop-target" : ""} ${canDropToTopLevel(draggingDeckId) ? "ready" : "disabled"}`}
                      data-drop-top-level="true"
                      tabIndex={-1}
                      type="button"
                    >
                      Drag here to make top-level
                    </button>
                  ) : null}
                  {moveDeckError ? <p className="sidebar-sublink import-status-error">{moveDeckError}</p> : null}
                  {decks.length === 0 ? (
                    <p className="sidebar-sublink muted">No decks yet</p>
                  ) : (
                    rootDecks.map((deck) => renderDeckNode(deck, 0))
                  )}
                </div>
              ) : null}
            </div>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <Link
            aria-current={isActive(pathname, "/settings") ? "page" : undefined}
            className={`sidebar-settings ${isActive(pathname, "/settings") ? "active" : ""}`}
            href="/settings"
            onClick={() => setMobileNavOpen(false)}
          >
            App Settings
          </Link>
        </div>
      </aside>
    </>
  );
}
