// Server-side teacher invite acceptance. Clerk supplies the signed-in identity;
// Convex validates the invite and assigns the application role.

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex";

const COOKIE = "omnic_pending_invite";

export async function POST() {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const jar = await cookies();
  const tokenCookie = jar.get(COOKIE);
  if (!tokenCookie) {
    return NextResponse.json({ status: "no_invite" });
  }

  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 503 }
    );
  }

  try {
    const jwt = await getToken({ template: "convex" });
    if (!jwt) throw new Error("No Convex JWT available");

    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(jwt);
    await convex.mutation(api.users.upsertFromAuth, {});
    await convex.mutation(api.tenantSettings.acceptTeacherInvite, {
      token: tokenCookie.value,
    });
  } catch (error) {
    console.warn("[teacher-invite] acceptance failed", error);
    return NextResponse.json(
      { error: "Teacher invitation is invalid or could not be accepted" },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ status: "ok", role: "teacher" });
  res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
