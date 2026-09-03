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

  // 2) Teacher is an explicit Clerk role in this instance. Keeping Clerk and
  // Convex aligned also makes a refreshed JWT map to teacher immediately.
  // Update-first makes retries idempotent and avoids Clerk's quota check,
  // which can otherwise mask "already a member" with a 403.
  const update = await fetch(
    `${CLERK_API}/organizations/${resolved.organizationId}/memberships/${userId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${clerkSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "org:teacher" }),
    }
  );
  let roleReady = update.ok;
  let failureStatus = update.status;
  let failureBody = update.ok ? "" : await update.text();
  if (update.status === 404) {
    const membership = await fetch(
      `${CLERK_API}/organizations/${resolved.organizationId}/memberships`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clerkSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId, role: "org:teacher" }),
      }
    );
    roleReady = membership.ok;
    failureStatus = membership.status;
    failureBody = membership.ok ? "" : await membership.text();
  }
  if (!roleReady) {
    console.error(
      `[teacher-invite] Clerk membership failed (${failureStatus}): ${failureBody}`
    );
    return NextResponse.json(
      { error: "Could not join the academy" },
      { status: 502 }
    );
  }

  // 3) Flip the user's role in our DB. The standard
  // tenantSettings.acceptTeacherInvite mutation runs under the user's
  // session; we forward the JWT via setAuth.
  try {
    const jwt = await getToken({ template: "convex" });
    if (!jwt) throw new Error("No Convex JWT available");
    convex.setAuth(jwt);
    // On the retry after the client activates the org, link/create the user
    // before changing its application role.
    await convex.mutation(api.users.upsertFromAuth, {});
    await convex.mutation(api.tenantSettings.acceptTeacherInvite, {
      token: inviteToken,
    });
  } catch (e) {
    // Keep the cookie. The client activates the new org and retries, at which
    // point the refreshed Convex JWT contains org_id.
    console.warn("[teacher-invite] convex acceptTeacherInvite failed", e);
    return NextResponse.json({
      status: "membership_added",
      organizationId: resolved.organizationId,
      tenantName: resolved.tenantName,
    });
  }

  // Clear the cookie.
  const res = NextResponse.json({
    status: "ok",
    organizationId: resolved.organizationId,
    tenantName: resolved.tenantName,
    role: "teacher",
  });
  res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
