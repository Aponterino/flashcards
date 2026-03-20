import { NextResponse } from "next/server";

import { parseThemeId } from "@/lib/preferences/appTheme";
import { getUserThemePreference, saveUserThemePreference } from "@/lib/preferences/userPreferenceQueries";

interface ThemeUpdatePayload {
  profileId?: unknown;
  theme?: unknown;
}

function parseProfileId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return null;
  }

  return trimmed;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileId = parseProfileId(url.searchParams.get("profileId"));

  if (!profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  try {
    const theme = await getUserThemePreference(profileId);
    return NextResponse.json({ theme }, { status: 200 });
  } catch (error) {
    console.error(`Failed to get theme preference for profile ${profileId}`, error);
    return NextResponse.json({ error: "Failed to load theme preference" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: ThemeUpdatePayload;
  try {
    payload = (await request.json()) as ThemeUpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const profileId = parseProfileId(payload.profileId);
  const theme = parseThemeId(payload.theme);

  if (!profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  if (!theme) {
    return NextResponse.json({ error: "theme is invalid" }, { status: 400 });
  }

  try {
    const savedTheme = await saveUserThemePreference(profileId, theme);
    return NextResponse.json({ theme: savedTheme }, { status: 200 });
  } catch (error) {
    console.error(`Failed to save theme preference for profile ${profileId}`, error);
    return NextResponse.json({ error: "Failed to save theme preference" }, { status: 500 });
  }
}
