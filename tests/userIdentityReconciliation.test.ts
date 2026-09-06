import assert from "node:assert/strict";
import test from "node:test";
import {
  findDuplicateAdminIdentities,
  canRetireDuplicateAdmin,
} from "../convex/lib/userIdentityReconciliation.ts";

const admin = (overrides: Record<string, unknown> = {}) => ({
  id: "user-row-1",
  externalId: "clerk-owner",
  email: "owner@example.test",
  name: "Owner",
  role: "admin" as const,
  retiredAt: undefined as string | undefined,
  ...overrides,
});

test("duplicate admin identities are grouped by normalized email and active records only", () => {
  const groups = findDuplicateAdminIdentities([
    admin({ id: "user-row-1", externalId: "same-clerk-id", email: "OWNER@example.test" }),
    admin({ id: "user-row-2", externalId: "same-clerk-id", email: "owner@example.test" }),
    admin({ id: "user-row-3", externalId: "same-clerk-id", email: "owner@example.test", retiredAt: "2026-09-06T00:00:00.000Z" }),
    admin({ id: "teacher-row", email: "owner@example.test", role: "teacher" }),
  ]);

  assert.deepEqual(groups, [
    { email: "owner@example.test", ids: ["user-row-1", "user-row-2"] },
  ]);
});

test("a duplicate admin can be retired by row ID even when its Clerk ID is shared", () => {
  const activeAdmins = [
    admin({ id: "user-row-1", externalId: "same-clerk-id" }),
    admin({ id: "user-row-2", externalId: "same-clerk-id" }),
  ];
  assert.equal(canRetireDuplicateAdmin(activeAdmins, "user-row-1", "user-row-2"), true);
  assert.equal(canRetireDuplicateAdmin(activeAdmins, "user-row-1", "user-row-1"), false);
  assert.equal(canRetireDuplicateAdmin([admin({ id: "user-row-1" })], "user-row-1", "user-row-2"), false);
});
