export const THEME_KEY = "theme";
export const THEME_PROFILE_KEY = "theme-profile-id";
export const THEME_CUSTOMIZED_KEY = "theme-ever-customized";
export const THEME_NUDGE_DISMISSED_KEY = "theme-nudge-dismissed";

const LEGACY_PALETTE_IDS = [
  "cobalt",
  "sedona-warmth",
  "apple-crisp",
  "garden-of-peonies",
  "ocean-breeze",
  "golden-hour",
  "fjord-mist",
  "terracotta-olive",
  "coastal-coral",
] as const;

export const THEME_OPTIONS = [
  {
    id: "light",
    label: "Light",
    summary: "Clean neutral default.",
    swatches: ["#f4f6fb", "#ffffff", "#3d5afe"],
  },
  {
    id: "dark",
    label: "Dark",
    summary: "High contrast dark UI.",
    swatches: ["#12151e", "#1b2130", "#7d93ff"],
  },
  {
    id: "sedona-warmth",
    label: "Sedona Warmth",
    summary: "Terracotta and sand across the app.",
    swatches: ["#f6efe8", "#fffaf4", "#b97f63"],
  },
  {
    id: "apple-crisp",
    label: "Apple Crisp",
    summary: "Soft orchard greens with warm peach.",
    swatches: ["#eef2ea", "#f9fbf6", "#7e9462"],
  },
  {
    id: "garden-of-peonies",
    label: "Garden of Peonies",
    summary: "Muted rose and cool slate tones.",
    swatches: ["#f8f2f4", "#fffafb", "#7489a0"],
  },
  {
    id: "ocean-breeze",
    label: "Ocean Breeze",
    summary: "Seafoam and teal throughout surfaces.",
    swatches: ["#eaf3f3", "#f6fbfb", "#2f6f73"],
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    summary: "Warm honey tones and sunlit neutrals.",
    swatches: ["#f8f1e5", "#fffaf2", "#c9862a"],
  },
  {
    id: "fjord-mist",
    label: "Fjord Mist",
    summary: "Cool blue-gray palette with depth.",
    swatches: ["#edf1f6", "#f8faff", "#55708f"],
  },
  {
    id: "terracotta-olive",
    label: "Terracotta Olive",
    summary: "Earthy olive and clay inspired scheme.",
    swatches: ["#f2eee7", "#faf7f2", "#8a7346"],
  },
  {
    id: "coastal-coral",
    label: "Coastal Coral",
    summary: "Coral warmth with coastal blue balance.",
    swatches: ["#f8efed", "#fff7f5", "#d17171"],
  },
] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number]["id"];

export const DEFAULT_THEME: ThemeId = "light";

const THEME_ID_SET = new Set<ThemeId>(THEME_OPTIONS.map((option) => option.id));
const LEGACY_PALETTE_SET = new Set<string>(LEGACY_PALETTE_IDS);

function isThemeId(value: string | null): value is ThemeId {
  return value !== null && THEME_ID_SET.has(value as ThemeId);
}

function isLegacyPalette(value: string | null | undefined): value is string {
  return value != null && LEGACY_PALETTE_SET.has(value);
}

export function parseThemeId(value: unknown): ThemeId | null {
  if (typeof value !== "string") {
    return null;
  }

  return isThemeId(value) ? value : null;
}

// Supports migration from the old mode + palette storage model.
export function resolveTheme(themeValue: string | null, legacyPaletteValue?: string | null): ThemeId {
  if (isThemeId(themeValue)) {
    return themeValue;
  }

  if (themeValue === "dark") {
    return "dark";
  }

  if (themeValue === "light") {
    if (isLegacyPalette(legacyPaletteValue) && legacyPaletteValue !== "cobalt") {
      return legacyPaletteValue as ThemeId;
    }
    return DEFAULT_THEME;
  }

  if (isLegacyPalette(themeValue) && themeValue !== "cobalt") {
    return themeValue as ThemeId;
  }

  if (isLegacyPalette(legacyPaletteValue) && legacyPaletteValue !== "cobalt") {
    return legacyPaletteValue as ThemeId;
  }

  return DEFAULT_THEME;
}

export function applyThemeAttributes(theme: ThemeId): void {
  document.documentElement.setAttribute("data-theme", theme);
}

function createProfileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `profile-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function getOrCreateThemeProfileId(): string {
  if (typeof window === "undefined") {
    return "anonymous-profile";
  }

  const existing = window.localStorage.getItem(THEME_PROFILE_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const profileId = createProfileId();
  window.localStorage.setItem(THEME_PROFILE_KEY, profileId);
  return profileId;
}

export function hasCustomizedTheme(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(THEME_CUSTOMIZED_KEY) === "true";
}

export function markThemeCustomized(theme: ThemeId): void {
  if (typeof window === "undefined") {
    return;
  }

  if (theme !== DEFAULT_THEME) {
    window.localStorage.setItem(THEME_CUSTOMIZED_KEY, "true");
    window.localStorage.removeItem(THEME_NUDGE_DISMISSED_KEY);
  }
}

export function hasDismissedThemeNudge(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(THEME_NUDGE_DISMISSED_KEY) === "true";
}

export function dismissThemeNudge(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_NUDGE_DISMISSED_KEY, "true");
}
