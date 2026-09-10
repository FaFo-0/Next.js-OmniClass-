import assert from "node:assert/strict";
import test from "node:test";
import * as calendarApi from "../convex/calendar.ts";
import { markNoShow as markScheduleNoShow, seedTestEvent, updateEvent } from "../convex/schedule.ts";
import { markNoShow as markLessonNoShow } from "../convex/lessons.ts";

type Row = Record<string, unknown> & { _id: string };
type FakeIndex = { eq: (field: string, value: unknown) => FakeIndex };
type FakeQuery = {
  withIndex: (name: string, configure: (q: FakeIndex) => unknown) => FakeQuery;
  filter: () => FakeQuery;
  collect: () => Promise<Row[]>;
  take: (limit: number) => Promise<Row[]>;
  first: () => Promise<Row | null>;
  unique: () => Promise<Row | null>;
};
type Handler = { _handler: (ctx: unknown, args: unknown) => Promise<unknown> };

const ORG = "org-no-show";

function createContext(callerId: string, initial: Record<string, Row[]>) {
  const tables = Object.fromEntries(
    Object.entries(initial).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
  ) as Record<string, Row[]>;

  const matching = (table: string, filters: Array<[string, unknown]>) =>
    (tables[table] ?? []).filter((row) => filters.every(([field, value]) => row[field] === value));

  const db = {
    query(table: string) {
      const filters: Array<[string, unknown]> = [];
      const builder: FakeQuery = {
        withIndex(_name: string, configure: (q: FakeIndex) => unknown) {
          const index: FakeIndex = {
            eq(field: string, value: unknown) {
              filters.push([field, value]);
              return index;
            },
          };
          configure(index);
          return builder;
        },
        filter() {
          return builder;
        },
        collect: async () => matching(table, filters),
        take: async (limit: number) => matching(table, filters).slice(0, limit),
        first: async () => matching(table, filters)[0] ?? null,
        unique: async () => {
          const rows = matching(table, filters);
          if (rows.length > 1) throw new Error("Expected unique row");
          return rows[0] ?? null;
        },
      };
      return builder;
    },
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((candidate) => candidate._id === id);
        if (row) return row;
      }
      return null;
    },
    async patch(id: string, patch: Record<string, unknown>) {
      const row = await db.get(id);
      if (!row) throw new Error(`Missing row ${id}`);
      Object.assign(row, patch);
    },
    async insert(table: string, value: Record<string, unknown>) {
      const row = { _id: `${table}-${(tables[table] ?? []).length + 1}`, ...value };
      (tables[table] ??= []).push(row);
      return row._id;
    },
  };

  return {
    db,
    tables,
    auth: {
      getUserIdentity: async () => ({
        tokenIdentifier: `token-${callerId}`,
        org_id: ORG,
      }),
    },
    runMutation: async () => null,
  };
}

async function atTime<T>(iso: string, run: () => Promise<T>): Promise<T> {
  const originalNow = Date.now;
  Date.now = () => Date.parse(iso);
  try {
    return await run();
  } finally {
    Date.now = originalNow;
  }
}

function baseRows() {
  return {
    users: [
      { _id: "user-teacher-1", organizationId: ORG, externalId: "teacher-1", tokenIdentifier: "token-teacher-1", role: "teacher", name: "Teacher One" },
      { _id: "user-teacher-2", organizationId: ORG, externalId: "teacher-2", tokenIdentifier: "token-teacher-2", role: "teacher", name: "Teacher Two" },
      { _id: "user-admin", organizationId: ORG, externalId: "admin-1", tokenIdentifier: "token-admin-1", role: "admin", name: "Admin" },
      { _id: "user-student", organizationId: ORG, externalId: "student-1", tokenIdentifier: "token-student-1", role: "student", name: "Student" },
    ],
    tenantSettings: [{ _id: "settings", organizationId: ORG, timezone: "UTC" }],
    pointTransactions: [],
    pointGrants: [],
    makeupCredits: [],
    notifications: [],
  } satisfies Record<string, Row[]>;
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    _id: "event-1",
    organizationId: ORG,
    type: "1on1",
    teacherId: "teacher-2",
    studentId: "student-1",
    title: "Grammar",
    date: "2026-09-10",
    startTime: "15:00",
    endTime: "16:00",
    status: "scheduled",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("schedule.markNoShow rejects a teacher targeting another teacher's event", async () => {
  const ctx = createContext("teacher-1", { ...baseRows(), scheduleEvents: [event()] });
  await assert.rejects(
    () => (markScheduleNoShow as unknown as Handler)._handler(ctx, { eventId: "event-1", party: "student" }),
    /assigned teacher|ownership|access denied/i,
  );
  assert.equal(ctx.tables.scheduleEvents[0].status, "scheduled");
  assert.equal(ctx.tables.makeupCredits.length, 0);
});

test("lessons.markNoShow rejects a teacher targeting another teacher's lesson", async () => {
  const ctx = createContext("teacher-1", {
    ...baseRows(),
    scheduleEvents: [event()],
    lessons: [{
      _id: "lesson-1",
      organizationId: ORG,
      externalId: "lesson-external-1",
      teacherId: "teacher-2",
      studentId: "student-1",
      title: "Grammar",
      status: "recording",
      transcript: "",
      summary: "",
      contentStatus: { summary: "pending", vocabulary: "pending", flashcards: "pending", quiz: "pending" },
      durationSeconds: 0,
      order: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      scheduleEventId: "event-1",
    }],
  });
  await assert.rejects(
    () => (markLessonNoShow as unknown as Handler)._handler(ctx, { id: "lesson-1", by: "student" }),
    /assigned teacher|ownership|access denied/i,
  );
  assert.equal(ctx.tables.scheduleEvents[0].status, "scheduled");
  assert.equal(ctx.tables.lessons[0].status, "recording");
});

test("a teacher cannot manually mark a teacher no-show before the policy grace", async () => {
  const ctx = createContext("teacher-1", { ...baseRows(), scheduleEvents: [event({ teacherId: "teacher-1" })] });
  await assert.rejects(
    () => (markScheduleNoShow as unknown as Handler)._handler(ctx, { eventId: "event-1", party: "teacher" }),
    /admin|automatic|grace|teacher no-show/i,
  );
  assert.equal(ctx.tables.scheduleEvents[0].status, "scheduled");
});

test("an authorized admin cannot manually mark a teacher no-show before the policy grace", async () => {
  const ctx = createContext("admin-1", { ...baseRows(), scheduleEvents: [event()] });
  await atTime("2026-09-10T15:19:59.999Z", async () => {
    await assert.rejects(
      () => (markScheduleNoShow as unknown as Handler)._handler(ctx, { eventId: "event-1", party: "teacher" }),
      /20-minute|policy grace|not due/i,
    );
  });
  assert.equal(ctx.tables.scheduleEvents[0].status, "scheduled");
});

test("an authorized admin may mark a teacher no-show at the exact +20-minute threshold once", async () => {
  const ctx = createContext("admin-1", { ...baseRows(), scheduleEvents: [event()] });
  await atTime("2026-09-10T15:20:00.000Z", async () => {
    await (markScheduleNoShow as unknown as Handler)._handler(ctx, { eventId: "event-1", party: "teacher" });
    await (markScheduleNoShow as unknown as Handler)._handler(ctx, { eventId: "event-1", party: "teacher" });
  });
  assert.equal(ctx.tables.scheduleEvents[0].status, "no_show_teacher");
  assert.equal(ctx.tables.notifications.filter((notification) => notification.kind === "teacher_no_show").length, 2);
});

test("lessons.markNoShow rejects an admin teacher no-show before the policy grace", async () => {
  const ctx = createContext("admin-1", {
    ...baseRows(),
    scheduleEvents: [event()],
    lessons: [{
      _id: "lesson-1",
      organizationId: ORG,
      externalId: "lesson-external-1",
      teacherId: "teacher-2",
      studentId: "student-1",
      title: "Grammar",
      status: "recording",
      transcript: "",
      summary: "",
      contentStatus: { summary: "pending", vocabulary: "pending", flashcards: "pending", quiz: "pending" },
      durationSeconds: 0,
      order: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      scheduleEventId: "event-1",
    }],
  });
  await atTime("2026-09-10T15:19:59.999Z", async () => {
    await assert.rejects(
      () => (markLessonNoShow as unknown as Handler)._handler(ctx, { id: "lesson-1", by: "teacher" }),
      /20-minute|policy grace|not due/i,
    );
  });
  assert.equal(ctx.tables.scheduleEvents[0].status, "scheduled");
  assert.equal(ctx.tables.lessons[0].status, "recording");
});

test("lessons.markNoShow allows an admin teacher no-show at +20", async () => {
  const ctx = createContext("admin-1", {
    ...baseRows(),
    scheduleEvents: [event()],
    lessons: [{
      _id: "lesson-1",
      organizationId: ORG,
      externalId: "lesson-external-1",
      teacherId: "teacher-2",
      studentId: "student-1",
      title: "Grammar",
      status: "recording",
      transcript: "",
      summary: "",
      contentStatus: { summary: "pending", vocabulary: "pending", flashcards: "pending", quiz: "pending" },
      durationSeconds: 0,
      order: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      scheduleEventId: "event-1",
    }],
  });
  await atTime("2026-09-10T15:20:00.000Z", async () => {
    await (markLessonNoShow as unknown as Handler)._handler(ctx, { id: "lesson-1", by: "teacher" });
  });
  assert.equal(ctx.tables.scheduleEvents[0].status, "no_show_teacher");
  assert.equal(ctx.tables.lessons[0].status, "no_show_teacher");
});

test("student-party manual no-show remains compatible before the teacher threshold", async () => {
  const ctx = createContext("teacher-2", { ...baseRows(), scheduleEvents: [event()] });
  await atTime("2026-09-10T15:00:00.000Z", async () => {
    await (markScheduleNoShow as unknown as Handler)._handler(ctx, { eventId: "event-1", party: "student" });
  });
  assert.equal(ctx.tables.scheduleEvents[0].status, "no_show_student");
  assert.equal(ctx.tables.notifications.length, 0);
  assert.equal(ctx.tables.pointGrants.length, 0);
});

test("generic schedule updates reject both terminal no-show statuses", async () => {
  for (const status of ["no_show_student", "no_show_teacher"]) {
    const ctx = createContext("teacher-1", { ...baseRows(), scheduleEvents: [event({ teacherId: "teacher-1" })] });
    await assert.rejects(
      () => (updateEvent as unknown as Handler)._handler(ctx, { eventId: "event-1", status }),
      /no-show|central|markNoShow|terminal/i,
    );
    assert.equal(ctx.tables.scheduleEvents[0].status, "scheduled");
  }
});

test("an authorized admin may mark a teacher no-show through the policy path", async () => {
  const ctx = createContext("admin-1", { ...baseRows(), scheduleEvents: [event()] });
  await atTime("2026-09-10T15:20:00.000Z", async () => {
    await (markScheduleNoShow as unknown as Handler)._handler(ctx, { eventId: "event-1", party: "teacher" });
  });
  assert.equal(ctx.tables.scheduleEvents[0].status, "no_show_teacher");
});

test("the legacy schedule producer uses the canonical event-keyed refund and no makeup credit", async () => {
  const ctx = createContext("admin-1", {
    ...baseRows(),
    scheduleEvents: [event()],
    pointTransactions: [{
      _id: "spend-1",
      organizationId: ORG,
      studentId: "student-1",
      type: "spend",
      amount: -1,
      balanceAfter: 0,
      scheduleEventId: "event-1",
      createdAt: "2026-09-10T15:00:00.000Z",
    }],
    pointGrants: [{
      _id: "grant-1",
      organizationId: ORG,
      studentId: "student-1",
      points: 1,
      remainingPoints: 0,
      expiresAt: "9999-12-31",
      purchasedAt: "2026-09-01T00:00:00.000Z",
      source: "trial",
    }],
  });

  await atTime("2026-09-10T15:20:00.000Z", async () => {
    await (markScheduleNoShow as unknown as Handler)._handler(ctx, { eventId: "event-1", party: "teacher" });
  });

  assert.equal(ctx.tables.makeupCredits.length, 0);
  assert.equal(ctx.tables.pointGrants.some((grant) => grant.source === "refund" && grant.remainingPoints === 1), true);
  assert.equal(ctx.tables.notifications.filter((notification) => notification.kind === "teacher_no_show").length, 2);
});

test("the calendar API exposes no raw status patch helper", () => {
  assert.equal(
    (calendarApi as unknown as Record<string, unknown>)._devSetEventStatus,
    undefined,
  );
});

test("the legacy seed helper cannot create a teacher no-show even with a raw status argument", async () => {
  const ctx = createContext("admin-1", {
    ...baseRows(),
    users: [
      { ...baseRows().users[0], email: "teacher@example.test" },
      { ...baseRows().users[3], email: "student@example.test" },
    ],
    scheduleEvents: [],
  });

  await (seedTestEvent as unknown as Handler)._handler(ctx, {
    orgId: ORG,
    teacherEmail: "teacher@example.test",
    studentEmail: "student@example.test",
    status: "no_show_teacher",
  });

  assert.equal(ctx.tables.scheduleEvents.length, 1);
  assert.equal(ctx.tables.scheduleEvents[0].organizationId, ORG);
  assert.equal(ctx.tables.scheduleEvents[0].status, "scheduled");
});
