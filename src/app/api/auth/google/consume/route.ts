// I.2 — Consume the short-lived refresh-token cookie set by the OAuth
// callback. Returns the token to the caller (assumed authenticated by
// Clerk middleware) so the client can store it via the standard
// users.setGoogleOAuthToken mutation under its own session. Clears
// the cookie after read.

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const jar = await cookies();
  const c = jar.get("omnic_google_refresh");
  if (!c) {
    return NextResponse.json({ refreshToken: null });
  }
  const res = NextResponse.json({ refreshToken: c.value });
  res.cookies.set("omnic_google_refresh", "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
