// Public signups land in the academy's org automatically.
//
// A student who signs up from the public site (no invite link) ends up in
// Clerk with NO organization membership. The middleware then exiles them to
// /onboarding/select-org — whose <OrganizationList /> can only list orgs
// they already belong to. A dead end for the one audience the site is for.
//
// This is the signup-side twin of /api/auth/teacher-invite/accept: resolve
// the tenant this deployment serves (single-tenant v1), add the user to that
// Clerk org as a student, and let the post-signup page hard-reload so the
// JWT picks up the org_id claim. The Convex users row is then created by the
// normal upsertFromAuth path on next load.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex";

const CLERK_API = "https://api.clerk.com/v1";

export async function POST() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (orgId) {
    return NextResponse.json({ status: "already_active" });
  }

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

  // 1) Which tenant does this deployment serve? (public Convex query)
  const convex = new ConvexHttpClient(convexUrl);
  let tenant: { organizationId: string; tenantName: string } | null;
  try {
    tenant = (await convex.query(api.tenantSettings.getSignupTenant, {})) as {
      organizationId: string;
      tenantName: string;
    } | null;
  } catch (e) {
    console.error("[auto-join] tenant lookup failed", e);
    return NextResponse.json(
      { error: "Could not resolve the signup tenant" },
      { status: 502 }
    );
  }
  if (!tenant) {
    // No tenant configured — nothing to auto-join; fall back to the org
    // selector so the user isn't stuck on a spinner.
    return NextResponse.json({ status: "no_tenant" });
  }

  // Existing membership is success. Check first because Clerk can return a
  // quota error before its duplicate-membership error when the org is full.
  const existingResponse = await fetch(
    `${CLERK_API}/users/${userId}/organization_memberships?limit=100`,
    { headers: { Authorization: `Bearer ${clerkSecret}` } }
  );
  if (!existingResponse.ok) {
    console.error(
      `[auto-join] Clerk membership lookup failed (${existingResponse.status})`
    );
    return NextResponse.json(
      { error: "Could not check academy membership" },
      { status: 502 }
    );
  }
  const existing = (await existingResponse.json()) as {
    data?: Array<{ role: string; organization: { id: string } }>;
  };
  const currentMembership = existing.data?.find(
    (item) => item.organization.id === tenant.organizationId
  );
  if (currentMembership) {
    return NextResponse.json({
      status: "ok",
      organizationId: tenant.organizationId,
      tenantName: tenant.tenantName,
      role: currentMembership.role,
    });
  }

  // App roles live in Convex; the built-in Clerk member role maps to student.
  const membership = await fetch(
    `${CLERK_API}/organizations/${tenant.organizationId}/memberships`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clerkSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, role: "org:member" }),
    }
  );
  const body = membership.ok ? "" : await membership.text();
  if (!membership.ok) {
    console.error(
      `[auto-join] Clerk membership failed (${membership.status}): ${body}`
    );
    return NextResponse.json(
      { error: "Could not join the academy" },
      { status: 502 }
    );
  }

  // 3) Done — the post-signup page hard-reloads so Clerk re-issues the
  // session token with the org_id claim, then upsertFromAuth creates the
  // Convex users row as role=student on first authenticated load.
  return NextResponse.json({
    status: "ok",
    organizationId: tenant.organizationId,
    tenantName: tenant.tenantName,
    role: "org:member",
  });
}
