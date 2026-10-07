import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { acceptTeacherInvite } from "../convex/tenantSettings.ts";
import { upsertFromAuth } from "../convex/users.ts";
import { ACADEMY_ID } from "../convex/lib/tenant.ts";

type Row = Record<string, unknown>;
function fixture(role?: string, inviteFields: Row = {}) {
  const rows: Record<string, Row[]> = {
    users: role ? [{
      _id: "user", organizationId: ACADEMY_ID, externalId: "synthetic",
      tokenIdentifier: "synthetic-token", role, onboardingComplete: true,
      ...(role === "student" ? { teacherId: "teacher-1", studentStatus: "active", pausedUntil: "2026-10-10" } : {}),
    }] : [],
    tenantSettings: [{ _id: "settings", organizationId: ACADEMY_ID, teacherInviteToken: "valid" }],
    teacherInvites: [{ _id: "invite", organizationId: ACADEMY_ID, token: "valid", usesCount: 0, ...inviteFields }],
  };
  const writes: Row[] = [];
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "synthetic", tokenIdentifier: "synthetic-token", name: "Synthetic", email: "synthetic@example.invalid" }) },
    db: {
      query(table: string) {
        const conditions: Row = {};
        const index = { eq(key: string, value: unknown) { conditions[key] = value; return index; } };
        return { withIndex(_name: string, apply: (q: typeof index) => unknown) {
          apply(index);
          return { unique: async () => rows[table].find(row => Object.entries(conditions).every(([key, value]) => row[key] === value)) ?? null };
        } };
      },
      async insert(table: string, fields: Row) { const row = { _id: "user", ...fields }; writes.push(fields); rows[table].push(row); return row._id; },
      async patch(id: string, fields: Row) { const row = Object.values(rows).flat().find(row => row._id === id); assert.ok(row); writes.push(fields); Object.assign(row, fields); },
    },
  };
  const accept = (token = "valid") => (acceptTeacherInvite as unknown as { _handler(ctx: unknown, args: Row): Promise<unknown> })._handler(ctx, { token });
  return { rows, writes, accept, ctx };
}

test("invite acceptance provisions a fresh teacher atomically without a student write", async () => {
  const f = fixture();
  await f.accept();
  assert.equal(f.rows.users[0].role, "teacher");
  assert.notEqual(f.rows.users[0].onboardingComplete, true);
  assert.ok(f.writes.every(write => write.role !== "student"));
  assert.equal(f.rows.teacherInvites[0].usesCount, 1);
});

test("pending valid invite resumes for an existing student and requires teacher setup", async () => {
  const f = fixture("student");
  await f.accept();
  assert.equal(f.rows.users[0].role, "teacher");
  assert.equal(f.rows.users[0].onboardingComplete, false);
  assert.equal(f.rows.users[0].teacherId, undefined);
  assert.equal(f.rows.users[0].studentStatus, undefined);
  assert.equal(f.rows.users[0].pausedUntil, undefined);
  await f.accept();
  assert.equal(f.rows.teacherInvites[0].usesCount, 1);
});

for (const role of ["teacher", "admin"]) test(`invite retry preserves completed ${role} and does not count another acceptance`, async () => {
  const f = fixture(role);
  await f.accept();
  assert.equal(f.rows.users[0].role, role);
  assert.equal(f.rows.users[0].onboardingComplete, true);
  assert.equal(f.rows.teacherInvites[0].usesCount, 0);
});

for (const [label, token, fields] of [["invalid", "wrong", {}], ["revoked", "valid", { revokedAt: "now" }], ["cross-tenant", "valid", { organizationId: "other" }]] as const) {
  test(`${label} invite cannot provision or promote`, async () => {
    for (const role of [undefined, "student"]) {
      const f = fixture(role, fields);
      assert.deepEqual(await f.accept(token), { status: "invalid_invite" });
      assert.equal(f.writes.length, 0);
    }
  });
}

test("sign-in resumes pending acceptance and provisioning cannot race the invite landing", () => {
  const signIn = readFileSync("src/app/(auth)/sign-in/[[...sign-in]]/page.tsx", "utf8");
  assert.match(signIn, /forceRedirectUrl="\/onboarding\/post-signup"/);
  const auth = readFileSync("src/lib/auth.tsx", "utf8");
  assert.match(auth, /pathname === "\/onboarding\/post-signup"/);
  const route = readFileSync("src/app/api/auth/teacher-invite/accept/route.ts", "utf8");
  assert.doesNotMatch(route, /api\.users\.upsertFromAuth/);
});

for (const role of [undefined, "student", "teacher", "admin"]) test(`ordinary sign-in preserves ${role ?? "new student"} without invite proof`, async () => {
  const f = fixture(role);
  await (upsertFromAuth as unknown as { _handler(ctx: unknown, args: Row): Promise<unknown> })._handler(f.ctx, {});
  assert.equal(f.rows.users[0].role, role ?? "student");
  assert.equal(f.rows.users[0].onboardingComplete, role ? true : undefined);
  assert.equal(f.rows.teacherInvites[0].usesCount, 0);
});

test("existing teacher without a setup flag remains an uncompleted teacher on retry", async () => {
  const f = fixture("teacher");
  delete f.rows.users[0].onboardingComplete;
  assert.deepEqual(await f.accept(), { role: "teacher", onboardingComplete: false });
  assert.equal(f.rows.teacherInvites[0].usesCount, 0);
});

 test("invalid acceptance returns a definitive typed result before writes", async () => {
  const f = fixture("student");
  assert.deepEqual(await f.accept("wrong"), { status: "invalid_invite" });
  assert.equal(f.writes.length, 0);
});
