import assert from "node:assert/strict";
import test from "node:test";
import {
  transitionNoShowForEvent,
  type NoShowTransitionArgs,
} from "../convex/lib/teacherNoShow.ts";
import type { Id } from "../convex/_generated/dataModel.ts";

type Row = Record<string, unknown> & { _id: string };
type FakeIndex = { eq: (field: string, value: unknown) => FakeIndex };
type FakeQuery = {
  withIndex: (name: string, configure: (q: FakeIndex) => unknown) => FakeQuery;
  collect: () => Promise<Row[]>;
  take: (limit: number) => Promise<Row[]>;
  first: () => Promise<Row | null>;
  unique: () => Promise<Row | null>;
};
type TransitionContext = Parameters<typeof transitionNoShowForEvent>[0];
const ORG = "org-transition";
const EVENT_ID = "event-1" as Id<"scheduleEvents">;
const OTHER_EVENT_ID = "event-2" as Id<"scheduleEvents">;
const LESSON_ID = "lesson-1" as Id<"lessons">;

function createContext(initial: Record<string, Row[]>, failInsertTable?: string) {
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
      if (table === failInsertTable) throw new Error("simulated refund failure");
      const row = { _id: `${table}-${(tables[table] ?? []).length + 1}`, ...value };
      (tables[table] ??= []).push(row);
      return row._id;
    },
  };
  return { db, tables };
}

function rows() {
  return {
    tenantSettings: [{ _id: "settings", organizationId: ORG, timezone: "UTC" }],
    scheduleEvents: [{
      _id: "event-1",
      organizationId: ORG,
      type: "1on1",
      teacherId: "teacher-1",
      studentId: "student-1",
      title: "Grammar",
      date: "2026-09-10",
      startTime: "15:00",
      endTime: "16:00",
      status: "scheduled",
      pointCostSnapshot: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
    }],
    users: [
      { _id: "teacher-row", organizationId: ORG, externalId: "teacher-1", role: "teacher", name: "Canonical Teacher" },
      { _id: "student-row", organizationId: ORG, externalId: "student-1", role: "student", name: "Student" },
      { _id: "admin-row", organizationId: ORG, externalId: "admin-1", role: "admin", name: "Admin" },
    ],
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
    notifications: [],
    lessons: [{
      _id: "lesson-1",
      organizationId: ORG,
      teacherId: "teacher-1",
      studentId: "student-1",
      scheduleEventId: "event-1",
      status: "recording",
    }],
  } satisfies Record<string, Row[]>;
}

const EVENT_START_MS = Date.parse("2026-09-10T15:00:00.000Z");
const transitionArgs: NoShowTransitionArgs = {
  organizationId: ORG,
  eventId: EVENT_ID,
  party: "teacher" as const,
  source: "automatic" as const,
  nowMs: Date.parse("2026-09-10T15:20:00.000Z"),
};

test("automatic transition rejects calls before the twenty-minute policy grace", async () => {
  const ctx = createContext(rows());
  await assert.rejects(
    () => transitionNoShowForEvent(ctx as unknown as TransitionContext, {
      ...transitionArgs,
      nowMs: EVENT_START_MS + 19 * 60_000,
    }),
    /policy grace/,
  );
  assert.equal(ctx.tables.scheduleEvents[0].status, "scheduled");
});

test("automatic transition rejects an event that is not linked to the supplied lesson", async () => {
  const seeded = rows();
  seeded.scheduleEvents.push({ ...seeded.scheduleEvents[0], _id: "event-2" });
  const ctx = createContext(seeded);
  await assert.rejects(
    () => transitionNoShowForEvent(ctx as unknown as TransitionContext, {
      ...transitionArgs,
      eventId: OTHER_EVENT_ID,
      lessonId: LESSON_ID,
    }),
    /linked|ownership|schedule event/i,
  );
  assert.equal(ctx.tables.scheduleEvents.find((event) => event._id === "event-2")?.status, "scheduled");
  assert.equal(ctx.tables.lessons[0].status, "recording");
});
test("automatic no-show refund failure leaves the event non-terminal and succeeds on retry", async () => {
  const failed = createContext(rows(), "pointGrants");
  await assert.rejects(
    () => transitionNoShowForEvent(failed as unknown as TransitionContext, transitionArgs),
    /simulated refund failure/,
  );
  assert.equal(failed.tables.scheduleEvents[0].status, "scheduled");
  assert.equal(failed.tables.notifications.length, 0);

  const retried = createContext(rows());
  await transitionNoShowForEvent(retried as unknown as TransitionContext, transitionArgs);
  assert.equal(retried.tables.scheduleEvents[0].status, "no_show_teacher");
  assert.equal(retried.tables.lessons[0].status, "no_show_teacher");
  assert.equal(retried.tables.pointGrants.filter((grant) => grant.source === "refund").length, 1);
  assert.equal(retried.tables.notifications.filter((notification) => notification.kind === "teacher_no_show").length, 2);
});

test("repeating the centralized transition is event-idempotent for refund, status, and notifications", async () => {
  const ctx = createContext(rows());
  await transitionNoShowForEvent(ctx as unknown as TransitionContext, transitionArgs);
  await transitionNoShowForEvent(ctx as unknown as TransitionContext, transitionArgs);

  assert.equal(ctx.tables.scheduleEvents[0].status, "no_show_teacher");
  assert.equal(ctx.tables.pointGrants.filter((grant) => grant.source === "refund").length, 1);
  assert.equal(ctx.tables.pointTransactions.filter((tx) => tx.type === "refund" || tx.source === "refund").length, 1);
  assert.equal(ctx.tables.notifications.filter((notification) => notification.kind === "teacher_no_show").length, 2);
});
