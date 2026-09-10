import assert from "node:assert/strict";
import test from "node:test";
import { checkTeacherNoShowsCron } from "../convex/scheduleCron.ts";

type Row = Record<string, unknown> & { _id: string };
type FakeIndex = { eq: (field: string, value: unknown) => FakeIndex };
type FakeExpression = { field: string; value: unknown };
type FakeFilter = {
  field: (field: string) => string;
  eq: (field: string, value: unknown) => FakeExpression;
};
type FakeQuery = {
  withIndex: (name: string, configure: (q: FakeIndex) => unknown) => FakeQuery;
  filter: (predicate: (q: FakeFilter) => FakeExpression) => FakeQuery;
  collect: () => Promise<Row[]>;
  first: () => Promise<Row | null>;
  take: (limit: number) => Promise<Row[]>;
  unique: () => Promise<Row | null>;
};
const ORG = "org-cron";

function createContext(initial: Record<string, Row[]>) {
  const tables = Object.fromEntries(
    Object.entries(initial).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
  ) as Record<string, Row[]>;
  const matches = (table: string, filters: Array<[string, unknown]>) =>
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
        filter(predicate: (q: FakeFilter) => FakeExpression) {
          const q: FakeFilter = {
            field: (field: string) => field,
            eq: (field: string, value: unknown) => ({ field, value }),
          };
          const expression = predicate(q);
          if (expression?.field) filters.push([expression.field, expression.value]);
          return builder;
        },
        collect: async () => matches(table, filters),
        first: async () => matches(table, filters)[0] ?? null,
        take: async (limit: number) => matches(table, filters).slice(0, limit),
        unique: async () => {
          const rows = matches(table, filters);
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
  return { db, tables };
}

function event(id: string, startTime: string) {
  return {
    _id: id,
    organizationId: ORG,
    type: "1on1",
    teacherId: "teacher-1",
    studentId: "student-1",
    title: "Grammar",
    date: "2026-09-11",
    startTime,
    endTime: "13:00",
    status: "scheduled",
    pointCostSnapshot: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function rows() {
  return {
    tenantSettings: [{ _id: "settings", organizationId: ORG, timezone: "UTC" }],
    users: [
      { _id: "teacher-row", organizationId: ORG, externalId: "teacher-1", role: "teacher", name: "Canonical Teacher" },
      { _id: "student-row", organizationId: ORG, externalId: "student-1", role: "student", name: "Student" },
      { _id: "admin-row", organizationId: ORG, externalId: "admin-1", role: "admin", name: "Admin" },
    ],
    scheduleEvents: [event("late-event", "11:50"), event("no-show-event", "11:40")],
    lessons: [{
      _id: "lesson-1",
      organizationId: ORG,
      teacherId: "teacher-1",
      studentId: "student-1",
      scheduleEventId: "no-show-event",
      status: "recording",
    }],
    pointTransactions: [{
      _id: "spend-1",
      organizationId: ORG,
      studentId: "student-1",
      type: "spend",
      amount: -1,
      balanceAfter: 0,
      scheduleEventId: "no-show-event",
      createdAt: "2026-09-11T11:40:00.000Z",
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
    notifications: [],
  } satisfies Record<string, Row[]>;
}

test("cron emits +10 late-start and +20 genuine-no-show separately and is idempotent", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-11T12:00:00.000Z");
  try {
    const ctx = createContext(rows());
    const handler = (checkTeacherNoShowsCron as unknown as {
      _handler: (ctx: unknown, args: Record<string, never>) => Promise<{ touched: number; reminderSent: number; studentReminders: number }>;
    })._handler;

    const first = await handler(ctx, {});
    assert.deepEqual(first, { touched: 2, reminderSent: 0, studentReminders: 0 });
    assert.equal(ctx.tables.scheduleEvents.find((row) => row._id === "late-event")?.status, "scheduled");
    assert.equal(ctx.tables.scheduleEvents.find((row) => row._id === "no-show-event")?.status, "no_show_teacher");
    assert.equal(ctx.tables.lessons[0].status, "no_show_teacher");

    const notifications = ctx.tables.notifications.filter((row) => row.kind === "teacher_late_start" || row.kind === "teacher_no_show");
    assert.equal(notifications.length, 3);
    assert.deepEqual(
      new Set(notifications.map((row) => row.sourceKey)),
      new Set([
        "teacher_no_show:late-event:level:3:recipient:admin-1",
        "teacher_no_show:no-show-event:level:4:recipient:student-1",
        "teacher_no_show:no-show-event:level:4:recipient:admin-1",
      ]),
    );
    assert.ok(
      notifications.every(
        (row) =>
          (row.payload as { teacherName?: string } | undefined)?.teacherName ===
          "Canonical Teacher",
      ),
    );

    const second = await handler(ctx, {});
    assert.deepEqual(second, { touched: 0, reminderSent: 0, studentReminders: 0 });
    assert.equal(ctx.tables.notifications.filter((row) => row.kind === "teacher_late_start" || row.kind === "teacher_no_show").length, 3);
    assert.equal(ctx.tables.pointGrants.filter((row) => row.source === "refund").length, 1);
  } finally {
    Date.now = originalNow;
  }
});
