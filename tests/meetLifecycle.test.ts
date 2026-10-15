import assert from "node:assert/strict";
import test from "node:test";
import { setMeetLink } from "../convex/users";
import { getJoinInfo } from "../convex/schedule";
import { endSession } from "../convex/lessons";
import { telegramMessage } from "../convex/lib/notificationRegistry";
import { ACADEMY_ID } from "../convex/lib/tenant";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

type Row = Record<string, unknown>;
function fixture() {
  const teacher: Row = { _id: "teacher-row", externalId: "teacher", organizationId: ACADEMY_ID, tokenIdentifier: "issuer|teacher", role: "teacher", meetLink: "https://meet.google.com/aaa-bbbb-ccc" };
  const student: Row = { _id: "student-row", externalId: "student", organizationId: ACADEMY_ID, tokenIdentifier: "issuer|student", role: "student" };
  const event: Row = { _id: "event", organizationId: ACADEMY_ID, teacherId: "teacher", studentId: "student", status: "scheduled", title: "QA", googleMeetLink: teacher.meetLink, teacherStartedAt: "2026-10-15T01:00:00Z" };
  const lesson: Row = { _id: "lesson", organizationId: ACADEMY_ID, teacherId: "teacher", studentId: "student", scheduleEventId: "event", status: "recording" };
  const historical: Row = { ...event, _id: "history", status: "completed" };
  const tables: Record<string, Row[]> = { users: [teacher, student], scheduleEvents: [event, historical], lessons: [lesson], notifications: [] };
  let current = teacher;
  const ctx = {
    auth: { async getUserIdentity() { return { tokenIdentifier: current.tokenIdentifier }; } },
    db: {
      query(table: string) {
        const filters: Array<[string, unknown]> = [];
        const q = {
          withIndex(_name: string, fn: (builder: unknown) => unknown) {
            const builder = { eq(k: string, v: unknown) { filters.push([k, v]); return builder; } }; fn(builder); return q;
          },
          async collect() { return structuredClone((tables[table] ?? []).filter(r => filters.every(([k,v]) => r[k] === v))); },
          async unique() { return (await q.collect())[0] ?? null; },
        }; return q;
      },
      async get(id: string) { return Object.values(tables).flat().find(r => r._id === id) ?? null; },
      async patch(id: string, values: Row) { const row = await ctx.db.get(id); assert.ok(row); Object.assign(row, values); },
      async insert(table: string, row: Row) { const id = `${table}-${tables[table].length}`; tables[table].push({ _id:id, ...row }); return id; },
    },
  };
  return { ctx: ctx as unknown as MutationCtx, teacher, student, event, historical, lesson, tables, asStudent() { current = student; }, asOther() { current = { ...student, externalId: "other" }; tables.users[1] = current; } };
}
const setRoom = (setMeetLink as unknown as { _handler: (ctx: MutationCtx, args: { meetLink: string }) => Promise<unknown> })._handler;
const join = (getJoinInfo as unknown as { _handler: (ctx: QueryCtx, args: {eventId: Id<"scheduleEvents">}) => Promise<{url: string | null} | null> })._handler;
const finish = (endSession as unknown as { _handler: (ctx: MutationCtx, args: {id: Id<"lessons">}) => Promise<unknown> })._handler;

test("room save updates an in-progress booking, preserves history and alerts the student", async () => {
  const f = fixture();
  await setRoom(f.ctx, { meetLink: "https://meet.google.com/ddd-eeee-fff" });
  assert.equal(f.event.googleMeetLink, "https://meet.google.com/ddd-eeee-fff");
  assert.equal(f.historical.googleMeetLink, "https://meet.google.com/aaa-bbbb-ccc");
  assert.equal(f.tables.notifications.length, 1);
  f.asStudent();
  assert.equal((await join(f.ctx as unknown as QueryCtx, { eventId: "event" as Id<"scheduleEvents"> }))?.url, f.event.googleMeetLink);
});

test("join rejects unrelated students, cancelled and cross-tenant events", async () => {
  const f = fixture(); f.asOther();
  const args = { eventId: "event" as Id<"scheduleEvents"> };
  assert.equal(await join(f.ctx as unknown as QueryCtx, args), null);
  f.asStudent(); f.tables.users[1] = f.student; f.event.status = "cancelled";
  assert.equal(await join(f.ctx as unknown as QueryCtx, args), null);
  f.event.status = "scheduled"; f.event.organizationId = "another-academy";
  assert.equal(await join(f.ctx as unknown as QueryCtx, args), null);
});

test("ending is idempotent and completes attendance before publishing", async () => {
  const f = fixture();
  await finish(f.ctx, { id: "lesson" as Id<"lessons"> });
  assert.equal(f.lesson.status, "transcribed"); assert.equal(f.event.status, "completed");
  const endedAt = f.event.endedAt;
  await finish(f.ctx, { id: "lesson" as Id<"lessons"> });
  assert.equal(f.event.endedAt, endedAt);
  f.asStudent(); assert.equal(await join(f.ctx as unknown as QueryCtx, { eventId: "event" as Id<"scheduleEvents"> }), null);
});

test("Meet validation refuses arbitrary URLs before changing the teacher or booking", async () => {
  const f = fixture();
  await assert.rejects(setRoom(f.ctx, { meetLink: "https://example.com/room" }), /Google Meet/);
  assert.equal(f.event.googleMeetLink, f.teacher.meetLink);
});

test("Telegram joins resolve the current room without embedding a stale Meet URL", () => {
  const message = telegramMessage("session_reminder", { eventId: "event", googleMeetLink: "https://meet.google.com/aaa-bbbb-ccc" }, "/student/calendar", "student");
  assert.equal(message.buttonUrl, "/join/event");
  assert.doesNotMatch(message.text, /meet\.google\.com/);
  const admin = telegramMessage("one_time_lesson_started", {eventId:"event", googleMeetLink:"https://meet.google.com/aaa-bbbb-ccc"}, "/admin/sessions", "admin");
  assert.equal(admin.buttonUrl, "/admin/sessions");
});
