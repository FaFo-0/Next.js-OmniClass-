import assert from "node:assert/strict";
import test from "node:test";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";
import { ACADEMY_ID } from "../convex/lib/tenant";
import { getCells, editCells, undo } from "../convex/calendarAvailability";
import {
  rescheduleEvent,
  cancelEvent,
  previewMove,
  blockTimeOff,
  unblockTimeOff,
} from "../convex/calendar";
import { projectCalendarSlots } from "../src/lib/calendarSlots";
import { CalendarAvailabilityEdits, type AvailabilityEdit } from "../src/lib/calendarAvailabilityEdits";

type Row = Record<string, unknown>;
type Handler = {
  _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown>;
};
const invoke = (fn: unknown, ctx: MutationCtx, args: unknown) =>
  (fn as Handler)._handler(ctx, args);
function fixture(role = "teacher") {
  let sequence = 0;
  const tables = new Map<string, Map<string, Row>>();
  const rows = (name: string) => {
    let table = tables.get(name);
    if (!table) {
      table = new Map();
      tables.set(name, table);
    }
    return table;
  };
  const put = (table: string, row: Row) => {
    rows(table).set(String(row._id), {
      _creationTime: 1,
      organizationId: ACADEMY_ID,
      createdAt: "2026-10-07T00:00:00Z",
      ...row,
    });
  };
  put("users", {
    _id: "teacher",
    role: "teacher",
    externalId: "teacher",
    tokenIdentifier: "teacher-token",
    name: "Teacher",
  });
  put("users", {
    _id: "student",
    role: "student",
    externalId: "student",
    teacherId: "teacher",
    tokenIdentifier: "student-token",
    name: "Student",
  });
  put("users", {
    _id: "admin",
    role: "admin",
    externalId: "admin",
    tokenIdentifier: "admin-token",
    name: "Admin",
  });
  put("tenantSettings", {
    _id: "settings",
    timezone: "Asia/Almaty",
    activityTypes: [
      {
        id: "basic",
        name: "Lesson",
        isActive: true,
        isGroup: false,
        pointCost: 1,
      },
    ],
  });
  const ctx = {
    auth: {
      getUserIdentity: async () => ({ tokenIdentifier: `${role}-token` }),
    },
    db: {
      query(table: string) {
        const constraints: Array<[string, unknown]> = [];
        const q = {
          withIndex(_name: string, fn: (builder: unknown) => unknown) {
            const b = {
              eq(key: string, value: unknown) {
                constraints.push([key, value]);
                return b;
              },
            };
            fn(b);
            return q;
          },
          collect: async () =>
            [...rows(table).values()].filter((row) =>
              constraints.every(([key, value]) => row[key] === value),
            ),
          unique: async () => (await q.collect())[0] ?? null,
          take: async (n: number) => (await q.collect()).slice(0, n),
        };
        return q;
      },
      get: async (id: string) =>
        [...tables.values()].map((table) => table.get(id)).find(Boolean) ??
        null,
      insert: async (table: string, row: Row) => {
        const id = `${table}-${++sequence}`;
        put(table, { ...row, _id: id });
        return id;
      },
      delete: async (id: string) => {
        for (const table of tables.values()) table.delete(id);
      },
      patch: async (id: string, patch: Row) => {
        const row = [...tables.values()]
          .map((table) => table.get(id))
          .find(Boolean);
        assert.ok(row);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) delete row[key];
          else row[key] = value;
        }
      },
    },
    runMutation: async () => null,
  } as unknown as MutationCtx;
  return { ctx, put, rows };
}
async function cells(ctx: MutationCtx, date = "2099-01-05", eventId?: string) {
  return await (
    getCells as unknown as {
      _handler: (
        ctx: QueryCtx,
        args: unknown,
      ) => Promise<{
        cells: Array<{
          date: string;
          startTime: string;
          open: boolean;
          expectedState: string;
          canBook: boolean;
          canMove: boolean;
          eventId?: string;
        }>;
      }>;
    }
  )._handler(ctx, { fromDate: date, toDate: date, eventId });
}

test("optimistic rapid toggles use the actual server versions and remain individually undoable", async () => {
  const f = fixture();
  const initial = (await cells(f.ctx)).cells.find((cell) => cell.startTime === "16:00")!;
  const receipts: unknown[] = [], errors: unknown[] = [];
  let visible: readonly AvailabilityEdit[] = [];
  const queue = new CalendarAvailabilityEdits({
    save: (edit) => invoke(editCells, f.ctx, { requestId: edit.requestId, changes: edit.changes }),
    changed: (pending) => { visible = pending; },
    saved: (receipt) => { receipts.push(receipt); },
    failed: (error) => { errors.push(error); },
  });
  queue.enqueue([{ ...initial, editable: true }], true, "open-request");
  queue.enqueue([{ ...initial, editable: true }], false, "close-request");
  assert.equal(visible.at(-1)?.cells[0].open, false);
  while (queue.busy) await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, []);
  assert.equal(receipts.length, 2);
  assert.equal((await cells(f.ctx)).cells.find((cell) => cell.startTime === "16:00")?.open, false);
  await invoke(undo, f.ctx, { changeId: receipts[1] });
  assert.equal((await cells(f.ctx)).cells.find((cell) => cell.startTime === "16:00")?.open, true);
  await invoke(undo, f.ctx, { changeId: receipts[0] });
  assert.equal((await cells(f.ctx)).cells.find((cell) => cell.startTime === "16:00")?.open, initial.open);
});

test("dated gestures retain untouched cells and inheritance; retry and Undo are scoped to the actor", async () => {
  const f = fixture();
  f.put("teacherVacancies", {
    _id: "weekly",
    teacherId: "teacher",
    dayOfWeek: 1,
    startTime: "16:00",
    endTime: "18:00",
    validFrom: "2020-01-01",
    isActive: true,
  });
  f.put("slotExceptions", {
    _id: "custom",
    teacherId: "teacher",
    date: "2099-01-05",
    startTime: "19:00",
    endTime: "20:00",
    kind: "open",
  });
  const before = await cells(f.ctx);
  const chosen = before.cells.find((cell) => cell.startTime === "16:30")!;
  const args = {
    requestId: "gesture-one",
    changes: [
      {
        date: chosen.date,
        startTime: chosen.startTime,
        open: false,
        expectedState: chosen.expectedState,
      },
    ],
  };
  const id = await invoke(editCells, f.ctx, args);
  assert.equal(await invoke(editCells, f.ctx, args), id);
  const after = await cells(f.ctx);
  assert.equal(
    after.cells.find((cell) => cell.startTime === "16:30")?.open,
    false,
  );
  assert.equal(
    after.cells.find((cell) => cell.startTime === "19:00")?.open,
    true,
  );
  assert.equal(
    after.cells.find((cell) => cell.startTime === "17:00")?.expectedState,
    before.cells.find((cell) => cell.startTime === "17:00")?.expectedState,
  );
  await invoke(undo, f.ctx, { changeId: id });
  await invoke(undo, f.ctx, { changeId: id });
  assert.equal(
    (await cells(f.ctx)).cells.find((cell) => cell.startTime === "16:30")?.open,
    true,
  );
  assert.equal(
    [...f.rows("slotExceptions").values()].some(
      (row) => row.startTime === "16:30",
    ),
    false,
  );
  await assert.rejects(
    () =>
      invoke(editCells, f.ctx, {
        ...args,
        teacherId: "someone-else",
        requestId: "other-gesture",
      }),
    /Not your calendar/,
  );
});

test("Undo cannot erase a newer edit or a subsequently booked lesson; a stale gesture never partly saves", async () => {
  const f = fixture();
  const before = await cells(f.ctx);
  const a = before.cells.find((cell) => cell.startTime === "16:00")!,
    b = before.cells.find((cell) => cell.startTime === "17:00")!;
  const first = await invoke(editCells, f.ctx, {
    requestId: "first-gesture",
    changes: [{ ...a, open: true }],
  });
  await assert.rejects(
    () =>
      invoke(editCells, f.ctx, {
        requestId: "stale-gesture",
        changes: [
          { ...b, open: true },
          { ...a, open: true },
        ],
      }),
    /changed elsewhere/,
  );
  assert.equal(
    (await cells(f.ctx)).cells.find((cell) => cell.startTime === "17:00")?.open,
    false,
  );
  const latest = (await cells(f.ctx)).cells.find(
    (cell) => cell.startTime === "16:00",
  )!;
  await invoke(editCells, f.ctx, {
    requestId: "newer-gesture",
    changes: [{ ...latest, open: false }],
  });
  await assert.rejects(
    () => invoke(undo, f.ctx, { changeId: first }),
    /no longer available/,
  );
  const free = (await cells(f.ctx)).cells.find(
    (cell) => cell.startTime === "17:00",
  )!;
  const second = await invoke(editCells, f.ctx, {
    requestId: "booked-gesture",
    changes: [{ ...free, open: true }],
  });
  f.put("scheduleEvents", {
    _id: "booked",
    teacherId: "teacher",
    studentId: "student",
    date: free.date,
    startTime: "17:00",
    endTime: "18:00",
    status: "scheduled",
    type: "1on1",
    title: "Lesson",
  });
  await assert.rejects(
    () => invoke(undo, f.ctx, { changeId: second }),
    /booked lesson is protected/,
  );
  assert.equal(
    (await cells(f.ctx)).cells.find((cell) => cell.startTime === "17:00")?.open,
    true,
  );
});

test("time off masks custom openings and removal restores them", async () => {
  const f = fixture();
  f.put("slotExceptions", {
    _id: "custom",
    teacherId: "teacher",
    date: "2099-01-05",
    startTime: "16:00",
    endTime: "18:00",
    kind: "open",
  });
  await invoke(blockTimeOff, f.ctx, {
    fromDate: "2099-01-05",
    toDate: "2099-01-05",
  });
  assert.ok(f.rows("slotExceptions").has("custom"));
  assert.equal(
    (await cells(f.ctx)).cells.find((cell) => cell.startTime === "16:00")?.open,
    false,
  );
  await invoke(unblockTimeOff, f.ctx, {
    fromDate: "2099-01-05",
    toDate: "2099-01-05",
  });
  assert.equal(
    (await cells(f.ctx)).cells.find((cell) => cell.startTime === "16:00")?.open,
    true,
  );
});

test("a staff move to closed free hours resets reminders; live actions stay protected", async () => {
  const f = fixture("admin");
  f.put("scheduleEvents", {
    _id: "lesson",
    teacherId: "teacher",
    studentId: "student",
    date: "2099-01-05",
    startTime: "16:00",
    endTime: "17:00",
    status: "scheduled",
    type: "1on1",
    title: "Lesson",
    sessionReminderSent: true,
    studentReminder24Sent: true,
    studentReminder1Sent: true,
  });
  const args = {
    eventId: "lesson",
    toDate: "2099-01-06",
    toStartTime: "17:30",
  };
  assert.equal(
    ((await invoke(previewMove, f.ctx, args)) as { allowed: boolean }).allowed,
    true,
  );
  await invoke(rescheduleEvent, f.ctx, args);
  const event = f.rows("scheduleEvents").get("lesson")!;
  assert.equal(event.startTime, "17:30");
  assert.equal(event.endTime, "18:30");
  assert.equal(event.sessionReminderSent, undefined);
  assert.equal(event.studentReminder24Sent, undefined);
  assert.equal(event.studentReminder1Sent, undefined);
  event.teacherStartedAt = "2099-01-06T12:25:00Z";
  await assert.rejects(
    () => invoke(cancelEvent, f.ctx, { eventId: "lesson" }),
    /running or finished/,
  );
  await assert.rejects(
    () => invoke(rescheduleEvent, f.ctx, { ...args, toStartTime: "19:00" }),
    /running or finished/,
  );
});

test("late student move preserves the charged original and binds the extra spend to a new reservation", async () => {
  const f = fixture("student");
  const DateBefore = globalThis.Date;
  const fixed = DateBefore.parse("2026-10-07T06:00:00Z");
  class FixedDate extends DateBefore {
    constructor(value?: string | number | Date) {
      super(
        value === undefined
          ? fixed
          : value instanceof DateBefore
            ? value.getTime()
            : value,
      );
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = FixedDate as unknown as DateConstructor;
  try {
    f.put("scheduleEvents", {
      _id: "original",
      teacherId: "teacher",
      studentId: "student",
      date: "2026-10-07",
      startTime: "14:00",
      endTime: "15:00",
      status: "scheduled",
      type: "1on1",
      title: "Lesson",
      pointCostSnapshot: 1,
      bookingRequestId: "staff-retry",
      bookingActorId: "teacher",
    });
    f.put("pointGrants", {
      _id: "grant",
      studentId: "student",
      remainingPoints: 2,
      expiresAt: "2099-01-01",
      purchasedAt: "2026-01-01",
    });
    f.put("pointTransactions", {
      _id: "old-spend",
      studentId: "student",
      type: "spend",
      amount: -1,
      scheduleEventId: "original",
      grantId: "grant",
    });
    f.put("slotExceptions", {
      _id: "target",
      teacherId: "teacher",
      date: "2026-10-08",
      startTime: "16:00",
      endTime: "17:00",
      kind: "open",
    });
    const result = (await invoke(rescheduleEvent, f.ctx, {
      eventId: "original",
      toDate: "2026-10-08",
      toStartTime: "16:00",
    })) as { eventId: string; charged: boolean };
    assert.ok(result.charged);
    assert.notEqual(result.eventId, "original");
    const original = f.rows("scheduleEvents").get("original")!,
      replacement = f.rows("scheduleEvents").get(result.eventId)!;
    assert.equal(original.date, "2026-10-07");
    assert.equal(original.status, "cancelled");
    assert.equal(original.cancellationCharged, true);
    assert.equal(original.replacementEventId, result.eventId);
    assert.equal(replacement.rescheduledFromEventId, "original");
    assert.equal(replacement.status, "scheduled");
    assert.equal(replacement.date, "2026-10-08");
    assert.equal(replacement.bookingRequestId, undefined);
    assert.equal(replacement.bookingActorId, undefined);
    assert.deepEqual(
      [...f.rows("pointTransactions").values()].map(
        (row) => row.scheduleEventId,
      ),
      ["original", result.eventId],
    );
    assert.equal(f.rows("pointGrants").get("grant")?.remainingPoints, 1);
  } finally {
    globalThis.Date = DateBefore;
  }
});

test("viewer midnight fragments and quarter-offset slots preserve canonical write identities", () => {
  const quarter = projectCalendarSlots(
    [{ date: "2026-10-08", startTime: "16:00", open: true, canBook: true }],
    "Asia/Almaty",
    "Asia/Kathmandu",
  )[0];
  assert.equal(quarter.viewerStartTime, "16:45");
  assert.equal(quarter.startTime, "16:00");
  const fragments = projectCalendarSlots(
    [{ date: "2026-10-08", startTime: "23:00", open: true, canBook: true }],
    "Asia/Almaty",
    "Asia/Kathmandu",
  );
  assert.equal(fragments.length, 2);
  assert.equal(fragments[0].date, fragments[1].date);
  assert.equal(fragments[0].key, fragments[1].key);
  assert.equal(fragments[1].canBook, false);
});

test("one booked date does not mark the same time occupied on another weekday", async () => {
  const f = fixture();
  f.put("scheduleEvents", {
    _id: "dated",
    teacherId: "teacher",
    studentId: "student",
    date: "2099-01-05",
    startTime: "16:00",
    endTime: "17:00",
    status: "scheduled",
    type: "1on1",
    title: "Lesson",
  });
  const result = (await invoke(getCells, f.ctx, {
    fromDate: "2099-01-05",
    toDate: "2099-01-06",
  })) as {
    cells: Array<{
      date: string;
      startTime: string;
      busy: boolean;
      editable: boolean;
    }>;
  };
  assert.equal(
    result.cells.find((c) => c.date === "2099-01-05" && c.startTime === "16:00")
      ?.busy,
    true,
  );
  assert.equal(
    result.cells.find((c) => c.date === "2099-01-06" && c.startTime === "16:00")
      ?.busy,
    false,
  );
  assert.equal(
    result.cells.find((c) => c.date === "2099-01-06" && c.startTime === "16:00")
      ?.editable,
    true,
  );
});


test("student far-future move cells, preview, mutation and cancellation agree without a seven-day limit", async () => {
  const f = fixture("student");
  f.put("scheduleEvents", { _id: "far-lesson", teacherId: "teacher", studentId: "student", date: "2099-01-05", startTime: "16:00", endTime: "17:00", status: "scheduled", type: "1on1", title: "Lesson" });
  f.put("slotExceptions", { _id: "far-open", teacherId: "teacher", date: "2099-01-06", startTime: "17:00", endTime: "19:00", kind: "open" });
  const args = { eventId: "far-lesson", toDate: "2099-01-06", toStartTime: "17:30" };
  assert.equal((await cells(f.ctx, "2099-01-06", "far-lesson")).cells.find(cell => cell.startTime === "17:30")?.canMove, true);
  assert.equal(((await invoke(previewMove, f.ctx, args)) as { allowed: boolean }).allowed, true);
  await invoke(rescheduleEvent, f.ctx, args);
  assert.equal(f.rows("scheduleEvents").get("far-lesson")?.date, "2099-01-06");
  await invoke(cancelEvent, f.ctx, { eventId: "far-lesson" });
  assert.equal(f.rows("scheduleEvents").get("far-lesson")?.status, "cancelled");
});
