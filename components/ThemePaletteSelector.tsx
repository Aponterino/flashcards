"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_THEME,
  THEME_KEY,
  THEME_OPTIONS,
  type ThemeId,
  applyThemeAttributes,
  getOrCreateThemeProfileId,
  parseThemeId,
  resolveTheme,
} from "@/lib/theme";

export default function ThemePaletteSelector() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [isOpen, setIsOpen] = useState(false);
  const menuId = "theme-picker-menu";

  useEffect(() => {
    const activeTheme = resolveTheme(window.localStorage.getItem(THEME_KEY), document.documentElement.getAttribute("data-theme"));
    setTheme(activeTheme);
    applyThemeAttributes(activeTheme);

    const profileId = getOrCreateThemeProfileId();
    void loadThemeFromServer(profileId);
  }, []);

  async function loadThemeFromServer(profileId: string) {
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

      setTheme(serverTheme);
      window.localStorage.setItem(THEME_KEY, serverTheme);
      applyThemeAttributes(serverTheme);
    } catch {
      // Ignore network errors and continue using the local theme.
    }
  }

  async function persistTheme(profileId: string, nextTheme: ThemeId) {
    try {
      await fetch("/api/preferences/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          theme: nextTheme,
        }),
      });
    } catch {
      // Ignore network errors and keep local state.
    }
  }

  function selectTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_KEY, nextTheme);
    applyThemeAttributes(nextTheme);
    setIsOpen(false);

    const profileId = getOrCreateThemeProfileId();
    void persistTheme(profileId, nextTheme);
  }

  function handleResetTheme() {
    selectTheme(DEFAULT_THEME);
  }

  const activeTheme = THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0];

  return (
    <div className="settings-item theme-palette-item">
      <span className="settings-item-title">App Theme</span>
      <span className="settings-item-summary">Pick a full look for backgrounds, buttons, chips, and progress visuals.</span>
      <div className="theme-palette-dropdown">
        <button
          aria-controls={menuId}
          aria-expanded={isOpen}
          className="theme-palette-trigger"
          onClick={() => setIsOpen((previous) => !previous)}
          type="button"
        >
          <span className="theme-palette-trigger-copy">
            <span className="theme-palette-name">{activeTheme.label}</span>
            <span className="theme-palette-description">{activeTheme.summary}</span>
          </span>
          <span aria-hidden className={`theme-palette-caret ${isOpen ? "open" : ""}`}>
            ▾
          </span>
        </button>

        {isOpen ? (
          <div className="theme-palette-menu" id={menuId}>
            {THEME_OPTIONS.map((option) => {
              const isActive = theme === option.id;

              return (
                <button
                  aria-pressed={isActive}
                  className={`theme-palette-button ${isActive ? "active" : ""}`}
                  key={option.id}
                  onClick={() => selectTheme(option.id)}
                  type="button"
                >
                  <span className="theme-palette-meta">
                    <span className="theme-palette-name">{option.label}</span>
                    <span className="theme-palette-description">{option.summary}</span>
                  </span>
                  <span aria-hidden className="theme-palette-swatches">
                    {option.swatches.map((swatch) => (
                      <span className="theme-palette-swatch" key={swatch} style={{ backgroundColor: swatch }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <button className="button ghost theme-palette-reset" disabled={theme === DEFAULT_THEME} onClick={handleResetTheme} type="button">
        Reset to Light Theme
      </button>
    </div>
  );
}
