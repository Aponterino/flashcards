"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  DEFAULT_THEME,
  THEME_KEY,
  dismissThemeNudge,
  hasCustomizedTheme,
  hasDismissedThemeNudge,
  resolveTheme,
} from "@/lib/preferences/appTheme";

export default function ThemeRecommendationCard() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const activeTheme = resolveTheme(window.localStorage.getItem(THEME_KEY), document.documentElement.getAttribute("data-theme"));
    const shouldShow = activeTheme === DEFAULT_THEME && !hasCustomizedTheme() && !hasDismissedThemeNudge();
    setIsVisible(shouldShow);
  }, []);

  function handleDismiss() {
    dismissThemeNudge();
    setIsVisible(false);
  }

  if (!isVisible) {
    return null;
  }

  return (
    <section className="card home-theme-nudge" aria-label="Theme recommendation">
      <div className="home-theme-nudge-copy">
        <p className="eyebrow">Quick Tip</p>
        <h2>Did you know you can change your theme?</h2>
        <p className="subtitle">Try a different look for backgrounds, buttons, and progress visuals whenever you want.</p>
      </div>
      <div className="button-row home-theme-nudge-actions">
        <Link className="button primary" href="/settings">
          Choose a Theme
        </Link>
        <button className="button ghost" onClick={handleDismiss} type="button">
          Dismiss
        </button>
      </div>
    </section>
  );
}
