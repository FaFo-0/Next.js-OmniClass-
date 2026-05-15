// H.6 — Server-side: read the pending invite cookie, resolve it via
// Convex to find the target tenant org, then call Clerk's Backend API
// to add the freshly-signed-up user to that org as a teacher.
//
// Requires:
//   CLERK_SECRET_KEY (already in .env.local; used by Clerk middleware)
//   CONVEX_URL or NEXT_PUBLIC_CONVEX_URL (already set)

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex";

const CLERK_API = "https://api.clerk.com/v1";
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
  const inviteToken = tokenCookie.value;

  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex URL not configured" },
      { status: 503 }
    );
  }
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) {
    return NextResponse.json(
      { error: "CLERK_SECRET_KEY not configured" },
      { status: 503 }
    );
  }

  // 1) Resolve the invite token → tenant org id (public Convex query).
  const convex = new ConvexHttpClient(convexUrl);
  let resolved: { organizationId: string; tenantName: string } | null;
  try {
    resolved = (await convex.query(api.tenantSettings.resolveTeacherInvite, {
      token: inviteToken,
    })) as { organizationId: string; tenantName: string } | null;
  } catch (e) {
    return NextResponse.json(
      { error: `Convex query failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
  if (!resolved) {
    // Clear the cookie so the user doesn't bounce again.
    const res = NextResponse.json({ status: "invalid_invite" });
    res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }

  // 2) Add the new Clerk user to the tenant org as a teacher (basic
  // member). Clerk's `org:teacher` custom role is honoured if present
  // in the dashboard; otherwise fall back to the built-in member role.
  let role = "org:teacher";
  let addOk = false;
  let lastErr: string | null = null;
  for (const attemptRole of [role, "org:member"]) {
    const r = await fetch(
      `${CLERK_API}/organizations/${resolved.organizationId}/memberships`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clerkSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId, role: attemptRole }),
      }
    );
    if (r.ok) {
      addOk = true;
      role = attemptRole;
      break;
    }
    const body = await r.text();
    // Already a member is fine.
    if (r.status === 422 && body.includes("already")) {
      addOk = true;
      role = attemptRole;
      break;
    }
    lastErr = `Clerk membership add ${attemptRole} failed (${r.status}): ${body}`;
  }
  if (!addOk) {
    return NextResponse.json({ error: lastErr ?? "Add failed" }, { status: 502 });
  }

  // 3) Flip the user's role in our DB. The standard
  // tenantSettings.acceptTeacherInvite mutation runs under the user's
  // session; we forward the JWT via setAuth.
  try {
    const jwt = await getToken({ template: "convex" });
    if (!jwt) throw new Error("No Convex JWT available");
    convex.setAuth(jwt);
    await convex.mutation(api.tenantSettings.acceptTeacherInvite, {
      token: inviteToken,
    });
  } catch (e) {
    // Convex side fails non-fatally — the Clerk membership is the
    // source of truth; users.upsertFromAuth will pick up the role on
    // next sign-in. Log and move on.
    console.warn("[teacher-invite] convex acceptTeacherInvite failed", e);
  }

  // Clear the cookie.
  const res = NextResponse.json({
    status: "ok",
    organizationId: resolved.organizationId,
    tenantName: resolved.tenantName,
    role,
  });
  res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
