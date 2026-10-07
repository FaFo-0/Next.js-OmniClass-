import assert from "node:assert/strict";
import test from "node:test";
import { getStudentRosterForTeacher, getStudentsForTeacher, updateUser } from "../convex/users.ts";
import { ACADEMY_ID } from "../convex/lib/tenant.ts";

type Row = Record<string, any>;
type Handler = { _handler(ctx: unknown, args: Row): Promise<any> };

function context(rows: Record<string, Row[]>) {
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "actor-token" }) },
    db: {
      query(table: string) {
        return {
          withIndex(_name: string, apply: (q: { eq(key: string, value: unknown): unknown }) => unknown) {
            const conditions: Row = {};
            const q = { eq(key: string, value: unknown) { conditions[key] = value; return q; } };
            apply(q);
            const matched = () => (rows[table] ?? []).filter((row) =>
              Object.entries(conditions).every(([key, value]) => row[key] === value)
            );
            return { unique: async () => matched()[0] ?? null, collect: async () => matched() };
          },
        };
      },
      async patch(id: string, patch: Row) {
        const row = Object.values(rows).flat().find((value) => value._id === id);
        assert.ok(row);
        Object.assign(row, patch);
      },
    },
  };
  return { ctx, rows };
}

test("teacher rosters ignore assigned accounts whose active role is no longer student", async () => {
  const f = context({
    users: [
      { _id: "teacher", organizationId: ACADEMY_ID, externalId: "teacher-1", tokenIdentifier: "actor-token", role: "teacher" },
      { _id: "stale", organizationId: ACADEMY_ID, externalId: "former-student", role: "teacher", teacherId: "teacher-1" },
      { _id: "student", organizationId: ACADEMY_ID, externalId: "current-student", role: "student", teacherId: "teacher-1", name: "Current Student", email: "student@example.test" },
    ],
  });

  const assigned = await (getStudentsForTeacher as unknown as Handler)._handler(f.ctx, { teacherId: "teacher-1" });
  assert.deepEqual(assigned.map((row: Row) => row.externalId), ["current-student"]);

  const roster = await (getStudentRosterForTeacher as unknown as Handler)._handler(f.ctx, {});
  assert.deepEqual(roster.map((row: Row) => row.externalId), ["current-student"]);
});

test("admin role changes clear the live student assignment and require teacher setup", async () => {
  const f = context({
    users: [
      { _id: "admin", organizationId: ACADEMY_ID, externalId: "admin-1", tokenIdentifier: "actor-token", role: "admin" },
      { _id: "student", organizationId: ACADEMY_ID, externalId: "current-student", role: "student", teacherId: "teacher-1", studentStatus: "active", pausedUntil: "2026-10-10", onboardingComplete: true },
    ],
  });
  await (updateUser as unknown as Handler)._handler(f.ctx, { externalId: "current-student", role: "teacher" });
  const user = f.rows.users[1];
  assert.equal(user.role, "teacher");
  assert.equal(user.teacherId, undefined);
  assert.equal(user.studentStatus, undefined);
  assert.equal(user.pausedUntil, undefined);
  assert.equal(user.onboardingComplete, false);
});

test("saving a teacher role clears a stale student assignment without resetting setup", async () => {
  const f = context({
    users: [
      { _id: "admin", organizationId: ACADEMY_ID, externalId: "admin-1", tokenIdentifier: "actor-token", role: "admin" },
      { _id: "teacher", organizationId: ACADEMY_ID, externalId: "teacher-1", role: "teacher", teacherId: "old-teacher", studentStatus: "active", onboardingComplete: true },
    ],
  });
  await (updateUser as unknown as Handler)._handler(f.ctx, { externalId: "teacher-1", role: "teacher" });
  const user = f.rows.users[1];
  assert.equal(user.teacherId, undefined);
  assert.equal(user.studentStatus, undefined);
  assert.equal(user.onboardingComplete, true);
});
