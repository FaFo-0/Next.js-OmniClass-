import assert from "node:assert/strict";
import test from "node:test";
import { deleteUser, restoreUser } from "../convex/users.ts";
import { ACADEMY_ID } from "../convex/lib/tenant.ts";

type Row = Record<string, any>;
type Handler = { _handler(ctx: unknown, args: Row): Promise<unknown> };

function fixture(targetExtra: Row = {}) {
  const rows: Record<string, Row[]> = {
    users: [
      { _id: "admin-row", organizationId: ACADEMY_ID, externalId: "admin", tokenIdentifier: "admin-token", role: "admin", name: "Admin", email: "admin@example.test" },
      { _id: "teacher-row", organizationId: ACADEMY_ID, externalId: "teacher", tokenIdentifier: "teacher-token", role: "teacher", name: "Teacher", email: "teacher@example.test", meetLink: "https://meet.example.test/room", ...targetExtra },
      { _id: "student-row", organizationId: ACADEMY_ID, externalId: "student", role: "student", teacherId: "teacher", name: "Student", email: "student@example.test" },
    ],
    tenantSettings: [],
    scheduleEvents: [],
  };
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "admin-token" }) },
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
      async delete() { assert.fail("User history must not be hard-deleted"); },
    },
  };
  return { rows, ctx };
}

test("admin removal blocks access while preserving the account row for restore", async () => {
  const f = fixture({ payoutPerLesson: 9000 });
  await (deleteUser as unknown as Handler)._handler(f.ctx, { externalId: "teacher" });
  const removed = f.rows.users[1];
  assert.equal(removed.role, "removed");
  assert.equal(removed.removedRole, "teacher");
  assert.equal(removed.removedBy, "admin");
  assert.equal(removed.payoutPerLesson, 9000);
  assert.equal(removed.meetLink, "https://meet.example.test/room");
  assert.equal(f.rows.users[2].teacherId, undefined);

  await (restoreUser as unknown as Handler)._handler(f.ctx, { externalId: "teacher" });
  assert.equal(removed.role, "teacher");
  assert.equal(removed.removedAt, undefined);
  assert.equal(f.rows.users[2].teacherId, undefined);
});

test("removal refuses to strand an upcoming lesson", async () => {
  const f = fixture();
  f.rows.scheduleEvents.push({
    _id: "future-event",
    organizationId: ACADEMY_ID,
    teacherId: "teacher",
    studentId: "student",
    date: "2999-01-01",
    startTime: "10:00",
    endTime: "11:00",
    status: "scheduled",
  });
  await assert.rejects(
    (deleteUser as unknown as Handler)._handler(f.ctx, { externalId: "teacher" }),
    /upcoming lessons/
  );
  assert.equal(f.rows.users[1].role, "teacher");
});
