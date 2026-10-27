import assert from "node:assert/strict";
import test from "node:test";
import { preview, clear } from "../convex/studentLessonCleanup";
import { fixture } from "./helpers/libraryFixture";

type Preview = { lessons: number; unpaidPayable: number; revision: string; payments: { id: string; currency: string; amount: number }[] };
type Handler = { _handler(ctx: unknown, args: Record<string, unknown>): Promise<Preview> };
const inspect = (ctx: unknown) => (preview as unknown as Handler)._handler(ctx, { studentId: "student" });
async function setup(role = "admin") {
  const f = fixture(role);
  await f.add("users", { externalId: "student", email: "student@example.test", role: "student" });
  const event = async (extra: Record<string, unknown> = {}) => f.add("scheduleEvents", { studentId: "student", teacherId: "teacher", type: "1on1", date: "2020-01-01", startTime: "10:00", endTime: "11:00", status: "completed", title: "Practice", titleSource: "teacher", ...extra });
  const past = await event();
  const cancelled = await event({ status: "cancelled", date: "2999-01-01" });
  const future = await event({ status: "scheduled", date: "2999-01-01" });
  const other = await event({ studentId: "someone-else" });
  const live = await event();
  await f.add("lessons", { studentId: "student", teacherId: "teacher", scheduleEventId: live, status: "recording", title: "Live" });
  const session = await f.add("lessons", { studentId: "student", teacherId: "teacher", scheduleEventId: past, status: "published", title: "Practice" });
  const execute = async (revision?: string) => (clear as unknown as Handler)._handler(f.ctx, { studentId: "student", confirmation: "student@example.test", revision: revision ?? (await inspect(f.ctx)).revision });
  return { ...f, past, cancelled, future, other, live, session, execute };
}

test("cleanup removes cancelled and past lessons from payroll but preserves future/live/other students and balance", async () => {
  const f = await setup();
  const grant = await f.add("pointGrants", { studentId: "student", remainingPoints: 3 });
  const p = await inspect(f.ctx);
  assert.equal(p.lessons, 2);
  assert.equal(p.unpaidPayable, 1);
  await f.execute();
  for (const id of [f.past, f.cancelled, f.session]) assert.equal((await f.ctx.db.get(id))?.isDeleted, true);
  for (const id of [f.future, f.other, f.live]) assert.equal((await f.ctx.db.get(id))?.isDeleted, undefined);
  assert.equal((await f.ctx.db.get(grant))?.remainingPoints, 3);
  assert.equal((await inspect(f.ctx)).lessons, 0);
  await f.execute(); // Repeating cleanup must not subtract payroll twice.
});

test("mixed paid runs keep other lessons and historical FX amounts", async () => {
  const f = await setup();
  const run = await f.add("payrollRuns", { lessonEventIds: [f.past, f.other], teacherId: "teacher", lessonCount: 2, amount: 20, amountBase: 10000, currency: "USD", baseCurrency: "KZT" });
  const entry = await f.add("financeEntries", { sourceKey: `payroll:${run}`, amount: 20, amountBase: 10000, currency: "USD", fxRate: 500 });
  const p = await inspect(f.ctx);
  assert.deepEqual(p.payments, [{ id: run, currency: "USD", amount: 10 }]);
  assert.equal(p.unpaidPayable, 0);
  await f.execute();
  assert.deepEqual((await f.ctx.db.get(run))?.lessonEventIds, [f.other]);
  assert.equal((await f.ctx.db.get(run))?.amount, 10);
  assert.equal((await f.ctx.db.get(entry))?.amountBase, 5000);
  assert.equal((await f.ctx.db.get(entry))?.fxRate, 500);
});

test("test-only payment run and its ledger entry disappear together", async () => {
  const f = await setup();
  const run = await f.add("payrollRuns", { lessonEventIds: [f.past], lessonCount: 1, amount: 10, currency: "USD" });
  const entry = await f.add("financeEntries", { sourceKey: `payroll:${run}`, amount: 10, amountBase: 5000 });
  await f.execute();
  assert.equal(await f.ctx.db.get(run), null);
  assert.equal(await f.ctx.db.get(entry), null);
});

test("teachers and restricted admins cannot clean student history", async () => {
  const teacher = await setup("teacher");
  await assert.rejects(inspect(teacher.ctx), /Access denied|Only an admin/);
  const f = await setup();
  await f.ctx.db.patch("actor", { permissions: ["lessons.delete"] });
  await assert.rejects(f.execute(), /Only an admin/);
  assert.equal((await f.ctx.db.get(f.past))?.isDeleted, undefined);
});

test("cross-tenant students and events cannot be selected", async () => {
  const f = await setup();
  const foreign = await f.add("scheduleEvents", { studentId: "student", organizationId: "other", type: "1on1", status: "cancelled" });
  await f.execute();
  assert.equal((await f.ctx.db.get(foreign))?.isDeleted, undefined);
  const student = f.rows.users.find(row => row.externalId === "student")!;
  student.organizationId = "other";
  await assert.rejects(inspect(f.ctx), /Student not found/);
});

test("confirmation rejects changes made after preview before any deletion", async () => {
  const f = await setup();
  const p = await inspect(f.ctx);
  await f.ctx.db.patch(f.past, { unpaid: true });
  await assert.rejects(f.execute(p.revision), /changed/);
  assert.equal((await f.ctx.db.get(f.past))?.isDeleted, undefined);
  await assert.rejects((clear as unknown as Handler)._handler(f.ctx, { studentId: "student", revision: p.revision, confirmation: "wrong@example.test" }), /email/);
});


test("past lesson cutoff uses academy wall time and leaves unfinished bookings alone", async (t) => {
  const f = await setup();
  t.mock.method(Date, "now", () => Date.parse("2026-10-27T06:00:00Z"));
  const ended = await f.add("scheduleEvents", { studentId: "student", teacherId: "teacher", type: "1on1", date: "2026-10-27", startTime: "10:00", endTime: "11:00", status: "scheduled", title: "Ended" });
  const running = await f.add("scheduleEvents", { studentId: "student", teacherId: "teacher", type: "1on1", date: "2026-10-27", startTime: "11:00", endTime: "12:00", status: "scheduled", title: "Still running" });
  await f.execute();
  assert.equal((await f.ctx.db.get(ended))?.isDeleted, true);
  assert.equal((await f.ctx.db.get(running))?.isDeleted, undefined);
});
