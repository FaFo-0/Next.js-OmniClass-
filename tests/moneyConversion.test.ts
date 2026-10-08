import assert from "node:assert/strict";
import test from "node:test";
import { bookedAmount, convertMoney } from "../convex/lib/money";
import { recordEntry, monthSummary } from "../convex/finance";

const rates = { KZT: 1, USD: 447.14 };
test("USD converts into KZT and frozen records survive rate and base changes", () => {
  assert.equal(convertMoney(20, "USD", "KZT", rates), 8942.8);
  assert.equal(convertMoney(8942.8, "KZT", "USD", rates), 20);
  const booked = { amount: 20, currency: "USD", amountBase: 8942.8, baseCurrency: "KZT", fxRatesKzt: { ...rates } };
  rates.USD = 500;
  assert.equal(bookedAmount(booked, "KZT"), 8942.8);
  assert.equal(bookedAmount(booked, "USD"), 20);
  assert.equal(convertMoney(20, "USD", "KZT", rates), 10000);
  assert.throws(() => convertMoney(20, "EUR", "KZT", rates), /Set an exchange rate/);
  assert.throws(() => convertMoney(Infinity, "KZT", "KZT", rates), /finite/);
  assert.throws(() => bookedAmount({ amount: 10, currency: "USD", amountBase: 10 }, "KZT"), /no recorded exchange rate/);
});

test("all ledger writers convert originals and P&L includes foreign-currency expenses exactly once", async () => {
  const entries: Array<Record<string, unknown>> = [];
  const settings = { organizationId: "org_3DIbJAWeR5CjVaBRlB4AZXL1UpD", baseCurrency: "KZT", fxRatesKzt: { KZT: 1, USD: 447.14 } };
  const user = { organizationId: settings.organizationId, externalId: "admin", role: "admin" };
  const ctx = { auth: { getUserIdentity: async () => ({ tokenIdentifier: "qa" }) }, db: {
    query(table: string) { const q = { withIndex: () => q, unique: async () => table === "tenantSettings" ? settings : table === "users" ? user : null, collect: async () => entries }; return q; },
    insert: async (_table: string, row: Record<string, unknown>) => { entries.push(row); return "entry"; },
  } };
  const args = { organizationId: settings.organizationId, source: "manual" as const, createdBy: "admin", date: "2026-10-08" };
  await recordEntry(ctx as never, { ...args, direction: "in", category: "pack_sale", amount: 26000, currency: "KZT" });
  await recordEntry(ctx as never, { ...args, direction: "out", category: "tools", amount: 20, currency: "USD" });
  assert.equal(entries[1].amountBase, 8942.8);
  assert.equal(entries[1].amount, 20);
  assert.equal(entries[1].fxRate, 447.14);
  settings.fxRatesKzt.USD = 500;
  assert.equal((entries[1].fxRatesKzt as typeof rates).USD, 447.14);
  const summary = await (monthSummary as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<{ income: number; costs: number; net: number }> })._handler(ctx, { month: "2026-10" });
  assert.equal(summary.income, 26000);
  assert.equal(summary.costs, 8942.8);
  assert.equal(summary.net, 17057.2);
});

test("authorized money reset is scoped and idempotent, preserving student packs and balances", async () => {
  const { resetToKzt } = await import("../convex/currencies");
  const { ACADEMY_ID } = await import("../convex/lib/tenant");
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = {
    tenantSettings: [{ _id: "settings", organizationId: ACADEMY_ID, baseCurrency: "USD" }],
    financeEntries: [{ _id: "old-entry", organizationId: ACADEMY_ID }, { _id: "other-entry", organizationId: "other" }],
    payrollRuns: [{ _id: "old-run", organizationId: ACADEMY_ID }],
    users: [{ _id: "teacher", organizationId: ACADEMY_ID, payoutPerLesson: 5, payoutCurrency: "USD" }],
    billingOrders: [{ _id: "order", organizationId: ACADEMY_ID, financeEntryId: "old-entry", status: "granted" }],
    pointGrants: [{ _id: "grant", organizationId: ACADEMY_ID, points: 8 }],
    packs: [{ _id: "pack", organizationId: ACADEMY_ID, currency: "KZT", price: 26000 }],
    notifications: [{ _id: "salary", organizationId: ACADEMY_ID, kind: "salary_paid" }, { _id: "lesson", organizationId: ACADEMY_ID, kind: "lesson_reminder" }],
    financeReminders: [],
  };
  const ctx = { db: {
    query(table: string) {
      const constraints: Array<[string, unknown]> = [];
      const rows = () => tables[table].filter(row => constraints.every(([key,value]) => row[key] === value));
      const q = { withIndex: (_name: string, fn: (b: unknown) => void) => { const b = { eq: (key: string, value: unknown) => { constraints.push([key,value]); return b; } }; fn(b); return q; }, unique: async () => rows()[0], take: async (n: number) => rows().slice(0,n), async *[Symbol.asyncIterator]() { yield* rows(); } }; return q;
    },
    delete: async (id: string) => { for (const table of Object.keys(tables)) tables[table] = tables[table].filter(row => row._id !== id); },
    patch: async (id: string, fields: Row) => { for (const rows of Object.values(tables)) { const row = rows.find(row => row._id === id); if (row) Object.assign(row, fields); } },
  } };
  const handler = resetToKzt as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<Record<string, unknown>> };
  const args = { usdToKzt: 447.14, confirm: "reset-old-money-and-teacher-rates" };
  const result = await handler._handler(ctx, args);
  assert.equal(result.entriesDeleted, 1);
  assert.equal(result.payrollRunsDeleted, 1);
  assert.equal(tables.financeEntries[0]._id, "other-entry");
  assert.equal(tables.users[0].payoutPerLesson, undefined);
  assert.equal(tables.billingOrders[0].financeEntryId, undefined);
  assert.equal(tables.billingOrders[0].status, "granted");
  assert.equal(tables.pointGrants[0].points, 8);
  assert.equal(tables.packs[0].price, 26000);
  assert.equal(tables.notifications[0]._id, "lesson");
  assert.equal((await handler._handler(ctx, args)).alreadyReset, true);
});
