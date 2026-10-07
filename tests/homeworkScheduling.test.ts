import assert from "node:assert/strict";
import test from "node:test";
import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { assign, setDueDate, syncAutomaticHomeworkDeadlines } from "../convex/homework";
import { ACADEMY_ID } from "../convex/lib/tenant";

type HomeworkRow = {
  _id: Id<"homework">;
  organizationId: string;
  teacherId: string;
  studentId: string;
  title: string;
  status: "draft" | "assigned" | "in_progress" | "submitted" | "reviewed";
  dueDateMode?: "auto" | "manual";
  dueAt?: string;
  dueScheduleEventId?: string;
  updatedAt?: string;
};
type EventRow = {
  _id: string;
  organizationId: string;
  studentId: string;
  date: string;
  startTime: string;
  status: string;
  type: string;
  isDeleted?: boolean;
};
type MutationHandler<Args> = { _handler: (ctx: MutationCtx, args: Args) => Promise<unknown> };

function fixture() {
  const homework = new Map<string, HomeworkRow>();
  const events: EventRow[] = [
    { _id: "next", organizationId: ACADEMY_ID, studentId: "student", date: "2099-01-01", startTime: "16:00", status: "scheduled", type: "1on1" },
    { _id: "later", organizationId: ACADEMY_ID, studentId: "student", date: "2099-01-02", startTime: "16:00", status: "makeup", type: "1on1" },
    { _id: "other-academy", organizationId: "other", studentId: "student", date: "2098-12-01", startTime: "16:00", status: "scheduled", type: "1on1" },
    { _id: "other-student", organizationId: ACADEMY_ID, studentId: "other", date: "2098-12-01", startTime: "16:00", status: "scheduled", type: "1on1" },
  ];
  const user = { organizationId: ACADEMY_ID, externalId: "teacher", role: "teacher", tokenIdentifier: "issuer|teacher" };
  const notifications: unknown[] = [];
  const counters = { eventReads: 0, patches: 0 };
  const ctx = {
    auth: { async getUserIdentity() { return { tokenIdentifier: user.tokenIdentifier }; } },
    db: {
      query(table: string) {
        const constraints: Array<[string, unknown]> = [];
        const source = () => table === "homework" ? [...homework.values()] : table === "scheduleEvents" ? events : table === "users" ? [user] : [{ organizationId: ACADEMY_ID, timezone: "Asia/Almaty" }];
        const query = {
          withIndex(_name: string, fn: (builder: unknown) => unknown) {
            const builder = { eq(key: string, value: unknown) { constraints.push([key, value]); return builder; } };
            fn(builder);
            return query;
          },
          async collect() {
            if (table === "scheduleEvents") counters.eventReads++;
            return source().filter((row) => constraints.every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value));
          },
          async unique() { return (await query.collect())[0] ?? null; },
        };
        return query;
      },
      async get(id: string) { return homework.get(id) ?? null; },
      async patch(id: string, patch: Record<string, unknown>) {
        const row = homework.get(id);
        assert.ok(row, "Only an existing tenant homework row is patched");
        counters.patches++;
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) delete (row as unknown as Record<string, unknown>)[key];
          else (row as unknown as Record<string, unknown>)[key] = value;
        }
      },
      async insert(table: string, value: unknown) {
        assert.equal(table, "notifications");
        notifications.push(value);
        return `notification-${notifications.length}`;
      },
    },
  } as unknown as MutationCtx;
  const add = (id: string, fields: Partial<HomeworkRow> = {}) => {
    const row: HomeworkRow = { _id: id as Id<"homework">, organizationId: ACADEMY_ID, teacherId: "teacher", studentId: "student", title: id, status: "assigned", ...fields };
    homework.set(id, row);
    return row;
  };
  return { ctx, homework, events, counters, notifications, add };
}

const assignHandler = assign as unknown as MutationHandler<{ id: Id<"homework">; dueAt?: string }>;
const setDueHandler = setDueDate as unknown as MutationHandler<{ id: Id<"homework">; dueAt: string | null }>;

test("automatic homework deadlines follow moves and cancellations atomically without repeat notifications", async () => {
  const f = fixture();
  const automatic = f.add("auto", { dueDateMode: "auto", dueAt: "old", dueScheduleEventId: "old" });
  const working = f.add("working", { status: "in_progress", dueDateMode: "auto" });
  const legacyEmpty = f.add("legacy-empty");
  const foreign = f.add("foreign", { organizationId: "other", dueDateMode: "auto", dueAt: "unchanged" });
  assert.equal(await syncAutomaticHomeworkDeadlines(f.ctx, ACADEMY_ID, "student"), 3);
  assert.equal(f.counters.eventReads, 1, "All rows share one next-lesson query");
  assert.equal(automatic.dueAt, "2099-01-01T11:00:00.000Z");
  assert.equal(automatic.dueScheduleEventId, "next");
  assert.equal(working.dueAt, automatic.dueAt);
  assert.equal(legacyEmpty.dueDateMode, "auto");
  assert.equal(foreign.dueAt, "unchanged");
  assert.equal(await syncAutomaticHomeworkDeadlines(f.ctx, ACADEMY_ID, "student"), 0);
  assert.equal(f.counters.patches, 3, "Unchanged deadlines are not patched again");
  f.events[0].startTime = "18:00";
  assert.equal(await syncAutomaticHomeworkDeadlines(f.ctx, ACADEMY_ID, "student"), 3);
  assert.equal(automatic.dueAt, "2099-01-01T13:00:00.000Z");
  f.events[0].status = "cancelled";
  await syncAutomaticHomeworkDeadlines(f.ctx, ACADEMY_ID, "student");
  assert.equal(automatic.dueScheduleEventId, "later");
  f.events[1].isDeleted = true;
  await syncAutomaticHomeworkDeadlines(f.ctx, ACADEMY_ID, "student");
  assert.equal(automatic.dueAt, undefined);
  assert.equal(automatic.dueScheduleEventId, undefined);
  assert.equal(automatic.dueDateMode, "auto");
  assert.equal(f.notifications.length, 0);
});

test("explicit dates and manually cleared deadlines stay fixed through assignment and scheduling changes", async () => {
  const f = fixture();
  const manual = f.add("manual", { status: "draft" });
  const cleared = f.add("cleared", { status: "draft", dueDateMode: "auto", dueAt: "old", dueScheduleEventId: "next" });
  const legacy = f.add("legacy", { dueAt: "2098-01-01T00:00:00.000Z" });
  const submitted = f.add("submitted", { status: "submitted", dueDateMode: "auto", dueAt: "historical" });
  const reviewed = f.add("reviewed", { status: "reviewed", dueDateMode: "auto", dueAt: "historical" });
  const draft = f.add("draft", { status: "draft", dueDateMode: "auto", dueAt: "draft-date" });
  await assignHandler._handler(f.ctx, { id: manual._id, dueAt: "2098-01-01T00:00:00.000Z" });
  await setDueHandler._handler(f.ctx, { id: cleared._id, dueAt: null });
  await assignHandler._handler(f.ctx, { id: cleared._id });
  assert.equal(cleared.dueDateMode, "manual");
  assert.equal(cleared.dueAt, undefined);
  assert.equal(cleared.dueScheduleEventId, undefined);
  f.events[0].startTime = "18:00";
  assert.equal(await syncAutomaticHomeworkDeadlines(f.ctx, ACADEMY_ID, "student"), 0);
  assert.equal(manual.dueAt, "2098-01-01T00:00:00.000Z");
  assert.equal(legacy.dueAt, "2098-01-01T00:00:00.000Z");
  assert.equal(submitted.dueAt, "historical");
  assert.equal(reviewed.dueAt, "historical");
  assert.equal(draft.dueAt, "draft-date");
  assert.equal(f.notifications.length, 2, "Assignment notifies once each; deadline sync adds none");
});
