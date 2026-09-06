import assert from "node:assert/strict";
import test from "node:test";
import {
  findDuplicateAdminIdentities,
  canRetireDuplicateAdmin,
} from "../convex/lib/userIdentityReconciliation.ts";

const admin = (overrides: Record<string, unknown> = {}) => ({
  externalId: "admin-1",
  email: "owner@example.test",
  name: "Owner",
  role: "admin" as const,
  retiredAt: undefined as string | undefined,
  ...overrides,
});

test("duplicate admin identities are grouped by normalized email and active records only", () => {
  const groups = findDuplicateAdminIdentities([
    admin({ externalId: "admin-1", email: "OWNER@example.test" }),
    admin({ externalId: "admin-2", email: "owner@example.test" }),
    admin({ externalId: "admin-3", email: "owner@example.test", retiredAt: "2026-09-06T00:00:00.000Z" }),
    admin({ externalId: "teacher-1", email: "owner@example.test", role: "teacher" }),
  ]);

  assert.deepEqual(groups, [
    { email: "owner@example.test", externalIds: ["admin-1", "admin-2"] },
  ]);
});

test("a duplicate admin can be retired only by another active owner while one admin remains", () => {
  const activeAdmins = [admin({ externalId: "admin-1" }), admin({ externalId: "admin-2" })];
  assert.equal(canRetireDuplicateAdmin(activeAdmins, "admin-1", "admin-2"), true);
  assert.equal(canRetireDuplicateAdmin(activeAdmins, "admin-1", "admin-1"), false);
  assert.equal(canRetireDuplicateAdmin([admin({ externalId: "admin-1" })], "admin-1", "admin-2"), false);
});
