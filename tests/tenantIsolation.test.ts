import assert from "node:assert/strict";
import test from "node:test";
import { ACADEMY_ID, requireTenant } from "../convex/lib/tenant.ts";

test("requireTenant rejects a user row outside the academy tenant", async () => {
  const ctx = {
    auth: {
      // Clerk is identity-only: no organization claim is present.
      getUserIdentity: async () => ({ tokenIdentifier: "token-cross-tenant" }),
    },
    db: {
      query: () => ({
        withIndex: () => ({
          unique: async () => ({
            _id: "user-cross-tenant",
            organizationId: "other-tenant",
            tokenIdentifier: "token-cross-tenant",
          }),
        }),
      }),
    },
  };

  await assert.rejects(
    () => requireTenant(ctx as never),
    /Cross-tenant access denied/
  );
});

test("requireTenant rejects removed accounts", async () => {
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "removed-token" }) },
    db: {
      query: () => ({
        withIndex: () => ({
          unique: async () => ({
            _id: "removed-user",
            organizationId: ACADEMY_ID,
            tokenIdentifier: "removed-token",
            role: "removed",
          }),
        }),
      }),
    },
  };
  await assert.rejects(() => requireTenant(ctx as never), /no longer has access/);
});
