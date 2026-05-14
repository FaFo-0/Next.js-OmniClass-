// I.2 — Kick off Google OAuth for the calling teacher.
// Requires env: GOOGLE_CLIENT_ID, NEXT_PUBLIC_APP_URL (or falls back
// to the current request origin). Carries the Clerk user id in state
// so the callback can store the refresh token against the right row.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"].join(" ");

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Google OAuth not configured" },
      { status: 503 }
    );
  }
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = encodeURIComponent(userId);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // force refresh_token return
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
