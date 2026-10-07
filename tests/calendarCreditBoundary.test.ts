import assert from "node:assert/strict";
import test from "node:test";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";
import { deductPoints, expireDailyCron, getBalance, getBalancesForOrg, grantPointsInternal, NO_EXPIRY, spendPointsInternal } from "../convex/points";
import { ACADEMY_ID } from "../convex/lib/tenant";

type Row = Record<string, unknown>;
type DirectQuery<Args, Result> = { _handler: (ctx: QueryCtx, args: Args) => Promise<Result> };
type DirectMutation<Args, Result> = { _handler: (ctx: MutationCtx, args: Args) => Promise<Result> };
const balanceHandler = getBalance as unknown as DirectQuery<{ studentId?: string }, { balance: number; nextExpiresAt: string | null }>;
const balancesHandler = getBalancesForOrg as unknown as DirectQuery<Record<string, never>, Array<{ studentId: string; balance: number; nextExpiresAt: string | null }>>;
const expiryHandler = expireDailyCron as unknown as DirectMutation<Record<string, never>, { expired: number; warned: number }>;
const deductHandler = deductPoints as unknown as DirectMutation<{ studentId: string; amount: number }, { deducted: number; balanceAfter: number }>;

function fixture(grants: Row[], settings: Row[] = [{ organizationId: ACADEMY_ID, timezone: "Asia/Almaty" }]) {
  const user: Row = { organizationId: ACADEMY_ID, externalId: "student", tokenIdentifier: "issuer|student", role: "student" };
  const tables: Record<string, Row[]> = { users: [user], pointGrants: grants, pointTransactions: [], tenantSettings: settings };
  const notifications: Row[] = [];
  const settingsReads: string[] = [];
  const ctx = {
    auth: { async getUserIdentity() { return { tokenIdentifier: user.tokenIdentifier }; } },
    db: {
      query(table: string) {
        const constraints: Array<[string, unknown]> = [];
        const query = {
          withIndex(_name: string, fn: (builder: unknown) => unknown) {
            const builder = { eq(key: string, value: unknown) { constraints.push([key, value]); return builder; } }; fn(builder); return query;
          },
          async collect() { return structuredClone((tables[table] ?? []).filter((row) => constraints.every(([key, value]) => row[key] === value))); },
          async unique() {
            if (table === "tenantSettings") settingsReads.push(String(constraints.find(([key]) => key === "organizationId")?.[1]));
            return (await query.collect())[0] ?? null;
          },
        };
        return query;
      },
      async patch(id: string, patch: Row) {
        const row = Object.values(tables).flat().find((value) => value._id === id);
        assert.ok(row);
        Object.assign(row, patch);
      },
      async insert(table: string, value: Row) {
        const id = `${table}-${tables[table]?.length ?? 0}`;
        (tables[table] ??= []).push({ _id: id, ...structuredClone(value) });
        return id;
      },
    },
    async runMutation(_reference: unknown, args: Row) { notifications.push(structuredClone(args)); return null; },
  } as unknown as MutationCtx;
  return { ctx, queryCtx: ctx as unknown as QueryCtx, user, tables, notifications, settingsReads };
}

const grant = (id: string, expiresAt: string, remainingPoints: number, organizationId = ACADEMY_ID): Row => ({
  _id: id, organizationId, studentId: "student", expiresAt, remainingPoints, points: remainingPoints, purchasedAt: "2026-01-01T00:00:00Z", isExpired: false,
});

async function atBoundary(work: () => Promise<void>) {
  const OriginalDate = globalThis.Date;
  const fixed = OriginalDate.parse("2026-10-06T23:30:00.000Z");
  class FixedDate extends OriginalDate {
    constructor(value?: string | number | Date) { super(value === undefined ? fixed : value instanceof OriginalDate ? value.getTime() : value); }
    static now() { return fixed; }
  }
  globalThis.Date = FixedDate as unknown as DateConstructor;
  try { await work(); } finally { globalThis.Date = OriginalDate; }
}

test("balance, FIFO spending, grants and admin deductions use academy expiry dates at UTC midnight", async () => atBoundary(async () => {
  const f = fixture([grant("expired", "2026-10-06", 2), grant("today", "2026-10-07", 3), grant("never", NO_EXPIRY, 5), grant("foreign", NO_EXPIRY, 99, "other")]);
  assert.equal((await balanceHandler._handler(f.queryCtx, {})).balance, 8);
  const spent = await spendPointsInternal(f.ctx, { orgId: ACADEMY_ID, studentId: "student", amount: 2, reason: "Book lesson", performedBy: "student" });
  assert.equal(spent.balanceAfter, 6);
  assert.deepEqual(spent.drainedFrom, ["today"]);
  assert.equal(f.tables.pointGrants.find((row) => row._id === "expired")?.remainingPoints, 2);
  assert.equal((await balanceHandler._handler(f.queryCtx, {})).balance, spent.balanceAfter);
  const added = await grantPointsInternal(f.ctx, { orgId: ACADEMY_ID, studentId: "student", points: 1, source: "manual", performedBy: "admin" });
  assert.equal(added.balanceAfter, 7, "Computed ledger balance also excludes yesterday's expired grant");
  f.user.role = "admin";
  assert.deepEqual(await balancesHandler._handler(f.queryCtx, {}), [{ studentId: "student", balance: 7, nextExpiresAt: "2026-10-07" }]);
  assert.deepEqual(await deductHandler._handler(f.ctx, { studentId: "student", amount: 999 }), { deducted: 7, balanceAfter: 0 });
  assert.equal(f.tables.pointGrants.find((row) => row._id === "expired")?.remainingPoints, 2);
  assert.equal(f.tables.pointGrants.find((row) => row._id === "foreign")?.remainingPoints, 99);
}));

test("expiry ledger keeps the three live lessons when a separate two-lesson grant expires", async () => atBoundary(async () => {
  const f = fixture([grant("expired-two", "2026-10-06", 2), grant("live-three", NO_EXPIRY, 3)]);
  assert.deepEqual(await expiryHandler._handler(f.ctx, {}), { expired: 1, warned: 0 });
  const transaction = f.tables.pointTransactions.find((row) => row.type === "expire");
  assert.ok(transaction);
  assert.equal(transaction.amount, -2);
  assert.equal(transaction.balanceAfter, 3, "Expired credit must not be subtracted twice");
  assert.equal((await balanceHandler._handler(f.queryCtx, {})).balance, 3);
  assert.equal(f.tables.pointGrants.find((row) => row._id === "expired-two")?.remainingPoints, 0);
}));

test("global expiry cron uses and caches each academy's date while preserving warning source keys", async () => atBoundary(async () => {
  const f = fixture([
    grant("almaty-expired", "2026-10-06", 2),
    grant("utc-still-valid", "2026-10-06", 2, "utc-academy"),
    grant("almaty-three", "2026-10-10", 1),
    grant("almaty-fourteen", "2026-10-21", 1),
    grant("utc-three", "2026-10-09", 1, "utc-academy"),
    grant("utc-fourteen", "2026-10-20", 1, "utc-academy"),
  ], [{ organizationId: ACADEMY_ID, timezone: "Asia/Almaty" }, { organizationId: "utc-academy", timezone: "UTC" }]);
  assert.deepEqual(await expiryHandler._handler(f.ctx, {}), { expired: 1, warned: 4 });
  assert.equal(f.tables.pointGrants.find((row) => row._id === "utc-still-valid")?.remainingPoints, 2);
  assert.equal(f.tables.pointGrants.find((row) => row._id === "utc-still-valid")?.isExpired, false);
  assert.deepEqual(f.notifications.map((row) => row.sourceKey).sort(), [
    "expiry-warn-3:almaty-three", "expiry-warn-14:almaty-fourteen", "expiry-warn-3:utc-three", "expiry-warn-14:utc-fourteen",
  ].sort());
  assert.equal(f.settingsReads.filter((org) => org === "utc-academy").length, 1, "No repeated settings query for that academy's grants");
}));
