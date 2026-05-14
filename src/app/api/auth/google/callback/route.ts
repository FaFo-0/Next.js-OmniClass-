// I.2 — Google OAuth callback.
// Exchanges the auth code for a refresh token, then redirects to a
// client-side completion page (/teacher/calendar?…) carrying the
// fresh refresh token in a short-lived HttpOnly cookie. The
// completion page reads the cookie via a small Next route, calls
// the standard Convex mutation under the user's session, and clears
// the cookie. This avoids needing a server-side admin client.

import { NextResponse } from "next/server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // Clerk user id
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/teacher/calendar?meet=error&reason=${errorParam}`, url.origin)
    );
  }
  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 }
    );
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Google OAuth not configured" },
      { status: 503 }
    );
  }
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: "Token exchange failed", status: tokenRes.status },
      { status: 502 }
    );
  }
  const j = (await tokenRes.json()) as { refresh_token?: string };
  if (!j.refresh_token) {
    return NextResponse.redirect(
      new URL("/teacher/calendar?meet=no_refresh_token", url.origin)
    );
  }

  // Stash the refresh token in a short-lived HttpOnly cookie so the
  // completion page can grab it via the consume route and store it
  // under the user's own Convex session.
  const res = NextResponse.redirect(
    new URL("/teacher/calendar?meet=pending_complete", url.origin)
  );
  res.cookies.set("omnic_google_refresh", j.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    maxAge: 120,
    path: "/",
  });
  return res;
}
