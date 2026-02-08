import { eq } from "drizzle-orm";

import { userPreferences } from "@/db/schema";
import { DEFAULT_THEME, parseThemeId, type ThemeId, resolveTheme } from "@/lib/theme";
import { ensureDbReady, getDb } from "@/lib/db";

function normalizeTheme(themeValue: string): ThemeId {
  const parsed = parseThemeId(themeValue);
  if (parsed) {
    return parsed;
  }

  return resolveTheme(themeValue);
}

export async function getUserThemePreference(userId: string): Promise<ThemeId> {
  await ensureDbReady();
  const db = getDb();

  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  if (!row) {
    return DEFAULT_THEME;
  }

  return normalizeTheme(row.theme);
}

export async function saveUserThemePreference(userId: string, theme: ThemeId): Promise<ThemeId> {
  await ensureDbReady();
  const db = getDb();
  const now = new Date();

  const [saved] = await db
    .insert(userPreferences)
    .values({
      userId,
      theme,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        theme,
        updatedAt: now,
      },
    })
    .returning();

  return normalizeTheme(saved?.theme ?? theme);
}
