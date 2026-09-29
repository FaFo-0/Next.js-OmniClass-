import assert from "node:assert/strict";
/* Convex handler internals are intentionally accessed as a test seam. */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import test from "node:test";
import {
  createOrderRequest,
  deleteOrphanedOrder,
  getStudentCatalogue,
  getPublicCatalogue,
  grantLessonsToStudent,
  grantOrder,
  listCatalogue,
  listOrders,
  movePack,
  saveFamily,
  savePack,
  setPackVisible,
} from "../convex/pricing.ts";
import { ACADEMY_ID } from "../convex/lib/tenant.ts";

type Row = Record<string, unknown> & { _id: string };
type Query = {
  withIndex: (name: string, configure: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => Query;
  order: (direction: "asc" | "desc") => Query;
  collect: () => Promise<Row[]>;
  take: (limit: number) => Promise<Row[]>;
  unique: () => Promise<Row | null>;
  first: () => Promise<Row | null>;
};

const ORG = ACADEMY_ID;

const handler = (fn: unknown) => (fn as { _handler: Function })._handler;

function createContext() {
  const tables: Record<string, Row[]> = {
    users: [
      { _id: "student-row", organizationId: ORG, externalId: "student-1", tokenIdentifier: "token-student", role: "student", name: "Student One", locale: "en" },
      { _id: "admin-row", organizationId: ORG, externalId: "admin-1", tokenIdentifier: "token-admin", role: "admin", name: "Admin One" },
      { _id: "teacher-row", organizationId: ORG, externalId: "teacher-1", tokenIdentifier: "token-teacher", role: "teacher", name: "Teacher One" },
    ],
    packFamilies: [
      { _id: "family-standard", organizationId: ORG, label: "Standard Tutoring", labelEn: "Standard Tutoring", labelRu: "Стандартный английский", description: "Structured individual tutoring.", descriptionRu: "Структурированные занятия.", sortOrder: 0, isVisible: true, isArchived: false },
      { _id: "family-ielts", organizationId: ORG, label: "IELTS", labelEn: "IELTS", sortOrder: 1, isVisible: true, isArchived: false },
    ],
    packs: [
      {
        _id: "pack-standard-4", organizationId: ORG, familyId: "family-standard", name: "4 lessons", nameEn: "4 lessons", nameRu: "4 урока",
        lessons: 4, currency: "KZT", price: 15_000, expiryDays: 60, sortOrder: 0, isVisible: true, isArchived: false,
        benefits: [{ default: "Structured 1-on-1 tutoring", en: "Structured 1-on-1 tutoring", ru: "Индивидуальные занятия" }],
      },
      {
        _id: "pack-standard-8", organizationId: ORG, familyId: "family-standard", name: "8 lessons", nameEn: "8 lessons", nameRu: "8 уроков",
        lessons: 8, currency: "KZT", price: 26_000, expiryDays: 60, sortOrder: 1, isVisible: true, isArchived: false, benefits: [],
      },
      {
        _id: "pack-ielts-4", organizationId: ORG, familyId: "family-ielts", name: "4 lessons", nameEn: "4 lessons", nameRu: "4 урока",
        lessons: 4, currency: "KZT", price: 20_000, expiryDays: 60, sortOrder: 0, isVisible: true, isArchived: false,
        benefits: [{ default: "Exam strategy", en: "Exam strategy", ru: "Стратегия экзамена" }],
      },
    ],
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
    async delete(id: string) {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((candidate) => candidate._id === id);
        if (index >= 0) { rows.splice(index, 1); return; }
      }
      throw new Error(`Missing row ${id}`);
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
  const create = handler(createOrderRequest);
  const first = await create(ctx, { packId: "pack-standard-4", requestKey: "request-1" });
  const retry = await create(ctx, { packId: "pack-standard-4", requestKey: "request-1" });
  const differentKey = await create(ctx, { packId: "pack-standard-8", requestKey: "request-2" });
  assert.equal(ctx.tables.billingOrders.length, 1);
  assert.equal(first.orderId, retry.orderId);
  assert.equal(differentKey.orderId, first.orderId);
  assert.deepEqual(ctx.tables.billingOrders[0]?.priceSnapshot, {
    listAmount: 15_000,
    discountAmount: 0,
    netAmount: 15_000,
    currency: "KZT",
    calculatedAt: (ctx.tables.billingOrders[0]?.priceSnapshot as Row).calculatedAt,
  });
  assert.equal((ctx.tables.billingOrders[0]?.planSnapshot as Row)?.lessonCount, 4);
  assert.equal(ctx.tables.billingOrders[0]?.packId, "pack-standard-4");
});

test("admin Kazakh authoring persists through the actual public catalogue query without changing the sale", async () => {
  const ctx = createContext();
  ctx.setActor("admin-1");
  const family = ctx.tables.packFamilies[0]!;
  await handler(saveFamily)(ctx, {
    id: family._id, label: family.label, labelEn: family.labelEn, labelRu: family.labelRu,
    labelKk: "Стандартты жеке сабақтар", descriptionKk: "Күнделікті ағылшынға арналған жеке сабақтар.",
  });
  const pack = ctx.tables.packs[0]!;
  pack.price = 25_000;
  pack.salePrice = 15_000;
  await handler(savePack)(ctx, {
    id: pack._id, familyId: family._id, name: pack.name, nameEn: pack.nameEn,
    nameRu: pack.nameRu, nameKk: "4 сабақ", lessons: pack.lessons, currency: pack.currency,
    price: pack.price, salePrice: pack.salePrice, expiryDays: pack.expiryDays,
    benefits: [{ ...((pack.benefits as Row[])[0]!), kk: "Жоспарлы жеке сабақтар" }],
  });
  const kazakh = await handler(getPublicCatalogue)(ctx, { locale: "kk" });
  const offer = kazakh[0].packs[0];
  assert.equal(kazakh[0].label, "Стандартты жеке сабақтар");
  assert.equal(kazakh[0].description, "Күнделікті ағылшынға арналған жеке сабақтар.");
  assert.equal(offer.name, "4 сабақ");
  assert.deepEqual(offer.benefits, ["Жоспарлы жеке сабақтар"]);
  assert.equal(offer.listPrice, 25_000);
  assert.equal(offer.netPrice, 15_000);
  assert.equal(offer.onSale, true);
  const russian = await handler(getPublicCatalogue)(ctx, { locale: "ru" });
  assert.equal(russian[0].label, "Стандартный английский");
  const arabic = await handler(getPublicCatalogue)(ctx, { locale: "ar" });
  assert.equal(arabic[0].label, "Standard Tutoring");
});

test("a sale price is what the order receipt records, and the counted saving", async () => {
  const ctx = createContext();
  const pack = ctx.tables.packs[0]!;
  pack.salePrice = 12_000;
  const order = await handler(createOrderRequest)(ctx, { packId: "pack-standard-4", requestKey: "sale-request" });
  const snapshot = ctx.tables.billingOrders[0]?.priceSnapshot as Row;
  assert.equal(snapshot.listAmount, 15_000);
  assert.equal(snapshot.discountAmount, 3_000);
  assert.equal(snapshot.netAmount, 12_000);
  assert.equal(order.status, "pending_verification");
});

test("an expired sale window charges the plain price", async () => {
  const ctx = createContext();
  const pack = ctx.tables.packs[0]!;
  pack.salePrice = 12_000;
  pack.saleEndsAt = "2020-01-01T00:00:00.000Z";
  await handler(createOrderRequest)(ctx, { packId: "pack-standard-4", requestKey: "expired-sale" });
  assert.equal((ctx.tables.billingOrders[0]?.priceSnapshot as Row).netAmount, 15_000);
});

test("a pack that is hidden or archived cannot be ordered", async () => {
  const ctx = createContext();
  ctx.tables.packs[0]!.isVisible = false;
  await assert.rejects(
    () => handler(createOrderRequest)(ctx, { packId: "pack-standard-4", requestKey: "hidden-pack" }),
    /not available/,
  );
});

test("createOrderRequest tolerates a duplicate admin identity and fans out once", async () => {
  const ctx = createContext();
  ctx.tables.users.push({ _id: "legacy-admin-row", organizationId: ORG, externalId: "admin-1", tokenIdentifier: "legacy-admin-token", role: "admin", name: "Admin One (duplicate)" });
  const result = await handler(createOrderRequest)(ctx, { packId: "pack-standard-4", requestKey: "request-duplicate-admin" });
  assert.equal(result.status, "pending_verification");
  assert.equal(ctx.tables.notifications.length, 1);
  assert.equal(ctx.tables.notifications[0]?.recipientId, "admin-1");
});

test("grantOrder uses the order receipt and is exactly once across retries", async () => {
  const ctx = createContext();
  const order = await handler(createOrderRequest)(ctx, { packId: "pack-standard-4", requestKey: "request-1" });
  // Editing the price after the request must not rewrite what was agreed.
  ctx.tables.packs[0]!.price = 99_999;
  ctx.tables.packs[0]!.lessons = 40;
  ctx.setActor("admin-1");
  const grant = await handler(grantOrder)(ctx, { orderId: order.orderId });
  const retry = await handler(grantOrder)(ctx, { orderId: order.orderId });
  assert.equal(grant.alreadyProcessed, false);
  assert.equal(retry.alreadyProcessed, true);
  assert.equal(ctx.tables.pointGrants.length, 1);
  assert.equal(ctx.tables.pointGrants[0]?.points, 4);
  assert.equal(ctx.tables.pointGrants[0]?.packId, "pack-standard-4");
  assert.equal(ctx.tables.pointTransactions.length, 1);
  assert.equal(ctx.tables.financeEntries.length, 1);
  assert.equal(ctx.tables.financeEntries[0]?.amount, 15_000);
  assert.equal(ctx.tables.notifications.filter((notification) => notification.recipientId === "student-1").length, 1);
  assert.equal(ctx.tables.notifications.filter((notification) => notification.recipientId === "admin-1").length, 1);
});

test("deleteOrphanedOrder removes only exact order-owned records after the buyer disappears", async () => {
  const ctx = createContext();
  const order = await handler(createOrderRequest)(ctx, { packId: "pack-standard-4", requestKey: "orphaned-order" });
  ctx.setActor("admin-1");
  await handler(grantOrder)(ctx, { orderId: order.orderId });

  const grantId = ctx.tables.pointGrants[0]!._id;
  ctx.tables.pointTransactions.push({
    _id: "spent-from-deleted-grant",
    organizationId: ORG,
    studentId: "student-1",
    type: "spend",
    amount: -1,
    balanceAfter: 3,
    grantId,
    createdAt: new Date().toISOString(),
  });
  ctx.tables.financeEntries.push({
    _id: "domain-finance-entry",
    organizationId: ORG,
    direction: "out",
    category: "rent",
    amount: 50,
    currency: "USD",
    amountBase: 50,
    date: "2026-09-29",
    month: "2026-09",
    source: "manual",
    createdBy: "admin-1",
    createdAt: new Date().toISOString(),
  });
  ctx.tables.notifications.push({
    _id: "unrelated-notification",
    organizationId: ORG,
    recipientId: "admin-1",
    kind: "finance_entry_due",
    sourceKey: "billing-order-requested:unrelated",
    createdAt: new Date().toISOString(),
  });
  ctx.tables.users.splice(ctx.tables.users.findIndex((user) => user.externalId === "student-1"), 1);

  const result = await handler(deleteOrphanedOrder)(ctx, { orderId: order.orderId });
  assert.deepEqual(result, {
    ordersDeleted: 1,
    financeEntriesDeleted: 1,
    pointGrantsDeleted: 1,
    pointTransactionsDeleted: 2,
    notificationsDeleted: 2,
  });
  assert.equal(ctx.tables.billingOrders.length, 0);
  assert.deepEqual(ctx.tables.financeEntries.map((entry) => entry._id), ["domain-finance-entry"]);
  assert.equal(ctx.tables.pointGrants.length, 0);
  assert.equal(ctx.tables.pointTransactions.length, 0);
  assert.deepEqual(ctx.tables.notifications.map((notification) => notification._id), ["unrelated-notification"]);
});

test("deleteOrphanedOrder is admin-only and guards pending, live-buyer, and missing orders", async () => {
  const pendingContext = createContext();
  const pending = await handler(createOrderRequest)(pendingContext, { packId: "pack-standard-4", requestKey: "pending-order" });
  await assert.rejects(
    () => handler(deleteOrphanedOrder)(pendingContext, { orderId: pending.orderId }),
    /Access denied/,
  );
  pendingContext.setActor("admin-1");
  pendingContext.tables.users.splice(pendingContext.tables.users.findIndex((user) => user.externalId === "student-1"), 1);
  const pendingView = await handler(listOrders)(pendingContext, {});
  assert.equal(pendingView[0]?.deletionAllowed, false);
  assert.equal(pendingView[0]?.deletionBlockReason, "pending");
  await assert.rejects(
    () => handler(deleteOrphanedOrder)(pendingContext, { orderId: pending.orderId }),
    /pending order/,
  );

  const liveBuyerContext = createContext();
  const granted = await handler(createOrderRequest)(liveBuyerContext, { packId: "pack-standard-4", requestKey: "live-buyer-order" });
  liveBuyerContext.setActor("admin-1");
  await handler(grantOrder)(liveBuyerContext, { orderId: granted.orderId });
  const liveBuyerView = await handler(listOrders)(liveBuyerContext, {});
  assert.equal(liveBuyerView[0]?.deletionAllowed, false);
  assert.equal(liveBuyerView[0]?.deletionBlockReason, "buyer_exists");
  await assert.rejects(
    () => handler(deleteOrphanedOrder)(liveBuyerContext, { orderId: granted.orderId }),
    /buyer still exists/,
  );
  await assert.rejects(
    () => handler(deleteOrphanedOrder)(liveBuyerContext, { orderId: "missing-order" }),
    /Order not found/,
  );
});

test("students cannot read the admin order queue", async () => {
  const ctx = createContext();
  await assert.rejects(() => handler(listOrders)(ctx, {}), /Access denied/);
});


test("the student catalogue localizes benefits and hides a hidden family", async () => {
  const ctx = createContext();
  ctx.tables.users[0]!.locale = "ru";
  const localized = await handler(getStudentCatalogue)(ctx, { locale: "ru" });
  assert.equal(localized.groups[0]?.label, "Стандартный английский");
  assert.equal(localized.groups[0]?.description, "Структурированные занятия.");
  assert.deepEqual(localized.groups[0]?.packs[0]?.benefits, ["Индивидуальные занятия"]);
  assert.deepEqual(localized.groups[0]?.packs[0]?.name, "4 урока");

  ctx.tables.packFamilies[0]!.isVisible = false;
  const hidden = await handler(getStudentCatalogue)(ctx, { locale: "ru" });
  assert.deepEqual(hidden.groups.map((group: { label: string }) => group.label), ["IELTS"]);
});

test("a family that is hidden or archived disappears from the public catalogue too", async () => {
  const ctx = createContext();
  const { getPublicCatalogue } = await import("../convex/pricing.ts");
  // The website defaults to Russian, the same locale the student portal would use.
  assert.deepEqual(
    (await handler(getPublicCatalogue)(ctx, {})).map((group: { label: string }) => group.label),
    ["Стандартный английский", "IELTS"],
  );
  ctx.tables.packFamilies[1]!.isArchived = true;
  const after = await handler(getPublicCatalogue)(ctx, { locale: "en" });
  assert.deepEqual(after.map((group: { label: string }) => group.label), ["Standard Tutoring"]);
});

test("a family switched off for the website is still sold inside the portal", async () => {
  const ctx = createContext();
  const { getPublicCatalogue } = await import("../convex/pricing.ts");
  ctx.tables.packFamilies[1]!.showOnWebsite = false;
  assert.deepEqual(
    (await handler(getPublicCatalogue)(ctx, { locale: "en" })).map((group: { label: string }) => group.label),
    ["Standard Tutoring"],
  );
  const student = await handler(getStudentCatalogue)(ctx, { locale: "en" });
  assert.deepEqual(student.groups.map((group: { label: string }) => group.label), ["Standard Tutoring", "IELTS"]);
});

test("savePack rejects a sale price that is not lower than the price", async () => {
  const ctx = createContext();
  ctx.setActor("admin-1");
  const save = handler(savePack);
  await assert.rejects(
    () => save(ctx, { familyId: "family-standard", name: "12 lessons", lessons: 12, currency: "KZT", price: 36_000, salePrice: 36_000, expiryDays: 60, benefits: [] }),
    /lower than the price/,
  );
  await assert.rejects(
    () => save(ctx, { familyId: "family-standard", name: "Broken", lessons: 0, currency: "KZT", price: 36_000, expiryDays: 60, benefits: [] }),
    /Lessons must be/,
  );
  await assert.rejects(
    () => save(ctx, { familyId: "family-standard", name: "Broken", lessons: 4, currency: "KZT", price: 36_000, expiryDays: 0, benefits: [] }),
    /Valid-for days/,
  );
  await assert.rejects(
    () => save(ctx, { familyId: "family-standard", name: "Broken", lessons: 4, currency: "TENGE", price: 36_000, expiryDays: 60, benefits: [] }),
    /three-letter code/,
  );
});

test("editing a pack changes the price for everyone with no draft or publish step", async () => {
  const ctx = createContext();
  ctx.setActor("admin-1");
  await handler(savePack)(ctx, {
    id: "pack-standard-4",
    familyId: "family-standard",
    name: "4 lessons",
    lessons: 4,
    currency: "KZT",
    price: 17_000,
    expiryDays: 60,
    benefits: [{ default: "Structured 1-on-1 tutoring" }],
  });
  assert.equal(ctx.tables.packs.filter((pack) => pack.familyId === "family-standard").length, 2, "editing must not create a second row");
  assert.equal(ctx.tables.packs[0]?.price, 17_000);
  ctx.setActor("student-1");
  const view = await handler(getStudentCatalogue)(ctx, {});
  assert.equal(view.groups[0]?.packs[0]?.netPrice, 17_000);
});

test("a one-step move swaps display order with the neighbour", async () => {
  const ctx = createContext();
  ctx.setActor("admin-1");
  await handler(movePack)(ctx, { packId: "pack-standard-8", direction: -1 });
  assert.equal(ctx.tables.packs.find((row) => row._id === "pack-standard-8")?.sortOrder, 0);
  assert.equal(ctx.tables.packs.find((row) => row._id === "pack-standard-4")?.sortOrder, 1);
  const unchanged = await handler(movePack)(ctx, { packId: "pack-standard-4", direction: 1 });
  assert.equal(unchanged, "pack-standard-4");
});

test("a hidden pack stays out of both catalogues until it is shown again", async () => {
  const ctx = createContext();
  ctx.setActor("admin-1");
  await handler(setPackVisible)(ctx, { packId: "pack-standard-4", isVisible: false });
  ctx.setActor("student-1");
  const hidden = await handler(getStudentCatalogue)(ctx, {});
  assert.deepEqual(hidden.groups[0]?.packs.map((pack: { packId: string }) => pack.packId), ["pack-standard-8"]);
});

test("grantLessonsToStudent adds lessons and books the agreed amount", async () => {
  const ctx = createContext();
  ctx.setActor("admin-1");
  const result = await handler(grantLessonsToStudent)(ctx, {
    studentId: "student-1",
    lessons: 8,
    expiryDays: 60,
    amount: 100_000,
    currency: "KZT",
    note: "Agreed on WhatsApp",
  });
  assert.equal(ctx.tables.pointGrants.length, 1);
  assert.equal(ctx.tables.pointGrants[0]?.points, 8);
  assert.equal(ctx.tables.pointGrants[0]?.source, "manual");
  assert.equal(ctx.tables.financeEntries.length, 1);
  assert.equal(ctx.tables.financeEntries[0]?.amount, 100_000);
  assert.equal(ctx.tables.financeEntries[0]?.category, "pack_sale");
  assert.equal(result.financeEntryId, ctx.tables.financeEntries[0]?._id);
  assert.equal(ctx.tables.notifications.filter((notification) => notification.recipientId === "student-1").length, 1);
});

test("grantLessonsToStudent without an amount books no income", async () => {
  const ctx = createContext();
  ctx.setActor("admin-1");
  await handler(grantLessonsToStudent)(ctx, { studentId: "student-1", lessons: 2 });
  assert.equal(ctx.tables.pointGrants.length, 1);
  assert.equal(ctx.tables.financeEntries.length, 0);
});

test("catalogue editing requires billing.edit and rejects an unknown family", async () => {
  const ctx = createContext();
  await assert.rejects(() => handler(saveFamily)(ctx, { label: "Sneaky" }), /Access denied/);
  ctx.setActor("admin-1");
  await assert.rejects(
    () => handler(savePack)(ctx, { familyId: "family-missing", name: "4 lessons", lessons: 4, currency: "KZT", price: 1, expiryDays: 60, benefits: [] }),
    /Family not found/,
  );
});

test("catalogue reads do not silently truncate families beyond the former hard cap", async () => {
  const ctx = createContext();
  ctx.setActor("admin-1");
  for (let index = 0; index < 501; index += 1) {
    ctx.tables.packFamilies.push({ _id: `family-extra-${index}`, organizationId: ORG, label: `Family ${index}`, sortOrder: index + 2, isVisible: true, isArchived: false });
  }
  const result = await handler(listCatalogue)(ctx, {});
  assert.equal(result.families.length, 503);
  assert.equal(result.families[0]?.label, "Standard Tutoring");
  assert.equal(result.families.at(-1)?.label, "Family 500");
});
