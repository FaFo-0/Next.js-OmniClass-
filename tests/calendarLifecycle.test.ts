import assert from "node:assert/strict";
import test from "node:test";
import type { QueryCtx } from "../convex/_generated/server";
import { eventsForToken } from "../convex/icsInternal";
import { isPayable, monthPayroll } from "../convex/payroll";
import { ACADEMY_ID } from "../convex/lib/tenant";

type DirectQuery<Args, Result> = { _handler: (ctx: QueryCtx, args: Args) => Promise<Result> };
type Feed = { orgTz: string; events: Array<{ uid: string; location?: string }> };
type FeedUser = { organizationId: string; role: "student" | "teacher" | "admin"; externalId: string; icsToken: string; tokenIdentifier?: string; permissions?: string[] };
type FeedEvent = { _id: string; organizationId: string; studentId: string; teacherId: string; date: string; startTime: string; endTime: string; title: string; type: string; status: string; isDeleted?: boolean; googleMeetLink?: string };
const feedHandler = eventsForToken as unknown as DirectQuery<{ token: string }, Feed | null>;
const feedBase = { organizationId: ACADEMY_ID, icsToken: "opaque", tokenIdentifier: "issuer|member" };

function feedContext(user: FeedUser | null, events: FeedEvent[]): QueryCtx {
  return { db: { query(table: string) {
    const constraints: Array<[string, unknown]> = [];
    const query = {
      withIndex(_name: string, fn: (builder: unknown) => unknown) {
        const builder = { eq(key: string, value: unknown) { constraints.push([key, value]); return builder; } };
        fn(builder); return query;
      },
      async unique() {
        if (table !== "users") return { timezone: "Asia/Almaty" };
        return user && constraints.every(([key, value]) => (user as unknown as Record<string, unknown>)[key] === value) ? user : null;
      },
      async collect() { return events.filter((event) => constraints.every(([key, value]) => (event as unknown as Record<string, unknown>)[key] === value)); },
    };
    return query;
  } } } as unknown as QueryCtx;
}

function futureFeedEvents(): FeedEvent[] {
  const first: FeedEvent = { _id: "own", organizationId: ACADEMY_ID, studentId: "student", teacherId: "teacher", date: "2099-01-01", startTime: "16:00", endTime: "17:00", title: "Lesson", type: "1on1", status: "scheduled", googleMeetLink: "https://meet.google.com/example" };
  return [first,
    { ...first, _id: "other-student", studentId: "other", date: "2099-01-02", status: "makeup" },
    { ...first, _id: "other-teacher", studentId: "other", teacherId: "other-teacher" },
    { ...first, _id: "other-academy", organizationId: "other-academy" },
    { ...first, _id: "deleted", isDeleted: true },
    { ...first, _id: "cancelled", status: "cancelled" },
    { ...first, _id: "placeholder", type: "placeholder" },
    { ...first, _id: "replaced-original", status: "rescheduled" },
  ];
}

test("ICS feeds follow role ownership, academy isolation and admin permissions", async () => {
  const events = futureFeedEvents();
  for (const [role, externalId, expected] of [
    ["student", "student", ["own"]],
    ["teacher", "teacher", ["own", "other-student"]],
    ["admin", "admin", ["own", "other-student", "other-teacher"]],
  ] as const) {
    const feed = await feedHandler._handler(feedContext({ ...feedBase, role, externalId }, events), { token: "opaque" });
    assert.ok(feed);
    assert.equal(feed.orgTz, "Asia/Almaty");
    assert.deepEqual(feed.events.map((event) => event.uid), [...expected]);
    assert.equal(feed.events[0].location, "https://meet.google.com/example");
  }
  const restricted: FeedUser = { ...feedBase, role: "admin", externalId: "admin", permissions: ["billing.view"] };
  assert.equal(await feedHandler._handler(feedContext(restricted, events), { token: "opaque" }), null);
  assert.equal(await feedHandler._handler(feedContext({ ...restricted, permissions: ["lessons.view.any"] }, events), { token: "opaque" }).then((feed) => feed?.events.length), 3);
  assert.equal(await feedHandler._handler(feedContext(null, events), { token: "revoked" }), null);
  assert.equal(await feedHandler._handler(feedContext({ ...feedBase, role: "student", externalId: "student" }, events), { token: "wrong-token" }), null);
  assert.equal(await feedHandler._handler(feedContext({ ...feedBase, role: "teacher", externalId: "teacher", tokenIdentifier: undefined }, events), { token: "opaque" }), null);
});

test("ICS uses the academy date when UTC and Almaty fall on different days", async () => {
  const OriginalDate = globalThis.Date;
  const fixed = OriginalDate.parse("2026-10-06T23:30:00.000Z");
  class FixedDate extends OriginalDate {
    constructor(value?: string | number | Date) { super(value === undefined ? fixed : value instanceof OriginalDate ? value.getTime() : value); }
    static now() { return fixed; }
  }
  globalThis.Date = FixedDate as unknown as DateConstructor;
  try {
    const event = futureFeedEvents()[0];
    const feed = await feedHandler._handler(feedContext({ ...feedBase, role: "student", externalId: "student" }, [
      { ...event, _id: "yesterday", date: "2026-10-06" },
      { ...event, _id: "today", date: "2026-10-07" },
    ]), { token: "opaque" });
    assert.deepEqual(feed?.events.map((row) => row.uid), ["today"]);
  } finally { globalThis.Date = OriginalDate; }
});

test("a charged late-move original and completed replacement are each payable; unpaid and refunded hours are excluded", async () => {
  const original = { _id: "original", organizationId: ACADEMY_ID, teacherId: "teacher", type: "1on1" as const, date: "2099-01-01", status: "cancelled" as const, cancelledBy: "student" as const, cancellationCharged: true };
  const replacement = { ...original, _id: "replacement", date: "2099-01-02", status: "completed" as const, cancelledBy: undefined, cancellationCharged: undefined };
  assert.equal(isPayable(original), true);
  assert.equal(isPayable(replacement), true);
  assert.equal(isPayable({ ...replacement, status: "scheduled" }), false);
  for (const row of [
    { ...original, cancellationCharged: false }, { ...original, unpaid: true },
    { ...original, cancelledBy: "teacher" as const }, { ...original, cancelledBy: "admin" as const },
    { ...replacement, unpaid: true }, { ...replacement, isDeleted: true },
    { ...replacement, status: "no_show_teacher" as const }, { ...replacement, type: "placeholder" as const },
  ]) assert.equal(isPayable(row), false);
  assert.equal(isPayable({ ...replacement, status: "no_show_student" }), true);

  const admin = { organizationId: ACADEMY_ID, externalId: "admin", tokenIdentifier: "issuer|admin", role: "admin" };
  const teacher = { organizationId: ACADEMY_ID, externalId: "teacher", role: "teacher", name: "Teacher", email: "teacher@example.com", payoutPerLesson: 10, payoutCurrency: "USD" };
  const events = [original, replacement, { ...replacement, _id: "unpaid", unpaid: true }];
  const run = { organizationId: ACADEMY_ID, teacherId: "teacher", month: "2099-01", lessonEventIds: ["original"], amount: 10, currency: "USD", amountBase: 4471.4, baseCurrency: "KZT", fxRatesKzt: { KZT: 1, USD: 447.14 }, paidAt: "2099-01-01", lessonCount: 1 };
  const ctx = { auth: { async getUserIdentity() { return { tokenIdentifier: admin.tokenIdentifier }; } }, db: { query(table: string) {
    const constraints: Array<[string, unknown]> = [];
    const source = () => table === "users" ? [admin, teacher] : table === "scheduleEvents" ? events : table === "payrollRuns" ? [run] : [{ organizationId: ACADEMY_ID, baseCurrency: "KZT", fxRatesKzt: { KZT: 1, USD: 500 }, defaultPayoutPerLesson: 5 }];
    const query = {
      withIndex(_name: string, fn: (builder: unknown) => unknown) {
        const builder = { eq(key: string, value: unknown) { constraints.push([key, value]); return builder; } }; fn(builder); return query;
      },
      async collect() { return source().filter((row) => constraints.every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)); },
      async unique() { return (await query.collect())[0] ?? null; },
    }; return query;
  } } } as unknown as QueryCtx;
  const payrollHandler = monthPayroll as unknown as DirectQuery<{ month: string }, { rows: Array<{ lessonsPayable: number; lessonsPaid: number; lessonsUnpaid: number; amountUnpaid: number; amountPaid: number; rate: number }> }>;
  const payroll = await payrollHandler._handler(ctx, { month: "2099-01" });
  assert.equal(payroll.rows.length, 1);
  assert.equal(payroll.rows[0].lessonsPayable, 2);
  assert.equal(payroll.rows[0].lessonsPaid, 1);
  assert.equal(payroll.rows[0].lessonsUnpaid, 1);
  assert.equal(payroll.rows[0].amountUnpaid, 5000);
  assert.equal(payroll.rows[0].amountPaid, 4471.4);
  assert.equal(payroll.rows[0].rate, 5000);
});
