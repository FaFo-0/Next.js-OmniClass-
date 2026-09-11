import assert from "node:assert/strict";
/* Convex handler internals are intentionally accessed as a test seam. */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import test from "node:test";
import { createOrderRequest, getStudentBilling, grantOrder, listOrders } from "../convex/billing.ts";

type Row = Record<string, unknown> & { _id: string };
type Query = {
  withIndex: (name: string, configure: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => Query;
  order: (direction: "asc" | "desc") => Query;
  collect: () => Promise<Row[]>;
  take: (limit: number) => Promise<Row[]>;
  unique: () => Promise<Row | null>;
  first: () => Promise<Row | null>;
};

const ORG = "org-billing";

function createContext() {
  const tables: Record<string, Row[]> = {
    users: [
      { _id: "student-row", organizationId: ORG, externalId: "student-1", tokenIdentifier: "token-student", role: "student", name: "Student One" },
      { _id: "admin-row", organizationId: ORG, externalId: "admin-1", tokenIdentifier: "token-admin", role: "admin", name: "Admin One" },
      { _id: "teacher-row", organizationId: ORG, externalId: "teacher-1", tokenIdentifier: "token-teacher", role: "teacher", name: "Teacher One" },
    ],
    billingFamilies: [
      { _id: "family-basic", organizationId: ORG, key: "basic_tutoring", labels: { default: "Basic Tutoring", en: "Basic Tutoring" }, isArchived: false, sortOrder: 1 },
    ],
    billingPlans: [
      { _id: "plan-basic-4", organizationId: ORG, familyId: "family-basic", key: "basic_4", labels: { default: "4 lessons", en: "4 lessons" }, isArchived: false, sortOrder: 1 },
    ],
    billingPlanVersions: [
      { _id: "version-basic-4", organizationId: ORG, planId: "plan-basic-4", familyId: "family-basic", version: 1, status: "published", visibility: "visible", publicationScope: "replace_for_everyone", lessonCount: 4, currency: "KZT", listPrice: 15000, expiryDays: 60, effectiveFrom: "2026-09-01T00:00:00.000Z" },
    ],
    billingPlanBenefits: [
      { _id: "benefit-1", organizationId: ORG, planVersionId: "version-basic-4", sortOrder: 1, labels: { default: "Structured 1-on-1 tutoring", en: "Structured 1-on-1 tutoring" } },
    ],
    billingDiscounts: [],
    billingDiscountEligibleStudents: [],
    billingDiscountRedemptions: [],
    billingOrders: [],
    pointGrants: [],
    pointTransactions: [],
    financeEntries: [],
    notifications: [],
    tenantSettings: [],
  };
  let actor = "student-1";
  const db = {
    query(table: string): Query {
      const filters: Array<[string, unknown]> = [];
      let direction: "asc" | "desc" = "asc";
      const builder: Query = {
        withIndex(_name, configure) {
          const q = { eq(field: string, value: unknown) { filters.push([field, value]); return q; } };
          configure(q);
          return builder;
        },
        order(next) { direction = next; return builder; },
        collect: async () => rows(),
        take: async (limit) => rows().slice(0, limit),
        unique: async () => {
          const found = rows();
          if (found.length > 1) throw new Error("Expected a unique row");
          return found[0] ?? null;
        },
        first: async () => rows()[0] ?? null,
      };
      function rows() {
        const result = (tables[table] ?? []).filter((row) => filters.every(([field, value]) => row[field] === value));
        return direction === "desc" ? [...result].reverse() : result;
      }
      return builder;
    },
    async get(id: string) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((candidate) => candidate._id === id);
        if (row) return row;
      }
      return null;
    },
    async insert(table: string, value: Record<string, unknown>) {
      const row = { _id: `${table}-${(tables[table] ?? []).length + 1}`, ...value };
      (tables[table] ??= []).push(row);
      return row._id;
    },
    async patch(id: string, value: Record<string, unknown>) {
      const row = await db.get(id);
      if (!row) throw new Error(`Missing row ${id}`);
      Object.assign(row, value);
    },
  };
  return {
    tables,
    db,
    auth: { getUserIdentity: async () => ({ tokenIdentifier: `token-${actor === "student-1" ? "student" : actor === "admin-1" ? "admin" : "teacher"}`, org_id: ORG }) },
    setActor(next: string) { actor = next; },
  };
}

test("createOrderRequest snapshots one offer and keeps one pending order per student", async () => {
  const ctx = createContext();
  const handler = (createOrderRequest as unknown as { _handler: Function })._handler;
  const first = await handler(ctx, { planVersionId: "version-basic-4", requestKey: "request-1" });
  const retry = await handler(ctx, { planVersionId: "version-basic-4", requestKey: "request-1" });
  const differentKey = await handler(ctx, { planVersionId: "version-basic-4", requestKey: "request-2" });
  assert.equal(ctx.tables.billingOrders.length, 1);
  assert.equal(first.orderId, retry.orderId);
  assert.equal(differentKey.orderId, first.orderId);
  assert.deepEqual(ctx.tables.billingOrders[0]?.priceSnapshot, {
    listAmount: 15000,
    discountAmount: 0,
    netAmount: 15000,
    currency: "KZT",
    calculatedAt: ctx.tables.billingOrders[0]?.priceSnapshot && (ctx.tables.billingOrders[0]?.priceSnapshot as Row).calculatedAt,
  });
  assert.equal((ctx.tables.billingOrders[0]?.planSnapshot as Row)?.lessonCount, 4);
});

test("createOrderRequest tolerates a legacy duplicate admin identity and fans out once", async () => {
  const ctx = createContext();
  ctx.tables.users.push({
    _id: "legacy-admin-row",
    organizationId: ORG,
    externalId: "admin-1",
    tokenIdentifier: "legacy-admin-token",
    role: "admin",
    name: "Admin One (legacy)",
  });
  const result = await (createOrderRequest as unknown as { _handler: Function })._handler(ctx, {
    planVersionId: "version-basic-4",
    requestKey: "request-duplicate-admin",
  });
  assert.equal(result.status, "pending_verification");
  assert.equal(ctx.tables.notifications.length, 1);
  assert.equal(ctx.tables.notifications[0]?.recipientId, "admin-1");
});


test("grantOrder uses the order snapshot and is exactly once across retries", async () => {
  const ctx = createContext();
  const create = (createOrderRequest as unknown as { _handler: Function })._handler;
  const order = await create(ctx, { planVersionId: "version-basic-4", requestKey: "request-1" });
  const version = ctx.tables.billingPlanVersions[0]!;
  version.listPrice = 99999;
  ctx.setActor("admin-1");
  const grant = await (grantOrder as unknown as { _handler: Function })._handler(ctx, { orderId: order.orderId });
  const retry = await (grantOrder as unknown as { _handler: Function })._handler(ctx, { orderId: order.orderId });
  assert.equal(grant.alreadyProcessed, false);
  assert.equal(retry.alreadyProcessed, true);
  assert.equal(ctx.tables.pointGrants.length, 1);
  assert.equal(ctx.tables.pointTransactions.length, 1);
  assert.equal(ctx.tables.financeEntries.length, 1);
  assert.equal(ctx.tables.notifications.length, 2);
  assert.equal(ctx.tables.notifications.filter((notification) => notification.recipientId === "student-1").length, 1);
  assert.equal(ctx.tables.notifications.filter((notification) => notification.recipientId === "admin-1").length, 1);
  assert.equal((ctx.tables.billingOrders[0]?.priceSnapshot as Row)?.netAmount, 15000);
  assert.equal(ctx.tables.financeEntries[0]?.amount, 15000);
  assert.equal(ctx.tables.pointGrants[0]?.billingOrderId, order.orderId);
  assert.equal(ctx.tables.pointTransactions[0]?.billingOrderId, order.orderId);
  assert.equal(ctx.tables.financeEntries[0]?.billingOrderId, order.orderId);
});

test("student billing read model includes the server-resolved automatic discount", async () => {
  const ctx = createContext();
  ctx.tables.billingDiscounts.push({
    _id: "discount-basic",
    organizationId: ORG,
    name: "Welcome",
    kind: "percent",
    value: 10,
    scope: "plan",
    planId: "plan-basic-4",
    eligibility: "everyone",
    priority: 1,
    startsAt: "2026-01-01T00:00:00.000Z",
    isActive: true,
    redemptionCount: 0,
  });
  const result = await (getStudentBilling as unknown as { _handler: Function })._handler(ctx, {});
  assert.equal(result.offers[0]?.discountAmount, 1500);
  assert.equal(result.offers[0]?.netPrice, 13500);
  assert.equal(result.offers[0]?.discountName, "Welcome");
});


test("students cannot read the admin order queue", async () => {
  const ctx = createContext();
  await assert.rejects(
    () => (listOrders as unknown as { _handler: Function })._handler(ctx, {}),
    /Access denied/,
  );
});
