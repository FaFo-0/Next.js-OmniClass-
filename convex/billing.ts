import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireTenant, requireTenantPermission, tenantTable } from "./lib/tenant";
import { calculateDiscount, selectBestDiscount, validateDiscount, type BillingDiscountRule } from "./lib/billingDiscounts";
import { transitionBillingOrder, transitionCatalogueVersion } from "./lib/billingState";
import { grantPointsInternal } from "./points";
import { recordEntry } from "./finance";
import { insertNotification } from "./notifications";

const localeArg = v.union(v.literal("en"), v.literal("ru"), v.literal("ar"), v.literal("kk"));
const labelsArg = v.object({
  default: v.string(),
  en: v.optional(v.string()),
  ru: v.optional(v.string()),
  ar: v.optional(v.string()),
  kk: v.optional(v.string()),
});
const publicationScopeArg = v.union(v.literal("new_clients_only"), v.literal("replace_for_everyone"));
const discountKindArg = v.union(v.literal("percent"), v.literal("fixed"));
const discountScopeArg = v.union(v.literal("all_plans"), v.literal("family"), v.literal("plan"));
const discountEligibilityArg = v.union(v.literal("everyone"), v.literal("new_clients_only"), v.literal("allowlist"));

const NOW = () => new Date().toISOString();

type Locale = "en" | "ru" | "ar" | "kk";
type Localized = { default: string; en?: string; ru?: string; ar?: string; kk?: string };

type OrderSnapshot = {
  familyKey: string;
  familyLabel: string;
  planKey: string;
  planLabel: string;
  lessonCount: number;
  expiryDays: number;
};

type PriceSnapshot = {
  listAmount: number;
  discountAmount: number;
  netAmount: number;
  currency: string;
  calculatedAt: string;
};

type DiscountSnapshot = {
  discountId?: Id<"billingDiscounts">;
  name: string;
  kind: "percent" | "fixed";
  value: number;
  amount: number;
  currency?: string;
  scope: "all_plans" | "family" | "plan";
  eligibility: "everyone" | "new_clients_only" | "allowlist";
  priority: number;
  validAt: string;
};

function localized(labels: Localized, locale: Locale): string {
  return labels[locale] ?? labels.en ?? labels.default;
}

function requiredText(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function toDiscountRule(row: Doc<"billingDiscounts">): BillingDiscountRule {
  return {
    id: String(row._id),
    name: row.name,
    kind: row.kind,
    value: row.value,
    currency: row.currency,
    scope: row.scope,
    familyId: row.familyId ? String(row.familyId) : undefined,
    planId: row.planId ? String(row.planId) : undefined,
    eligibility: row.eligibility,
    priority: row.priority,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    isActive: row.isActive,
  };
}

async function settingsFor(ctx: QueryCtx | MutationCtx, orgId: string): Promise<Doc<"tenantSettings"> | null> {
  return await tenantTable(ctx, orgId, "tenantSettings").query()
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .unique();
}

async function orderRowsFor(ctx: QueryCtx | MutationCtx, orgId: string): Promise<Doc<"billingOrders">[]> {
  return await tenantTable(ctx, orgId, "billingOrders").query()
    .withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", "pending_verification"))
    .collect()
    .then(async (pending) => {
      const [granted, rejected, cancelled] = await Promise.all([
        tenantTable(ctx, orgId, "billingOrders").query().withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", "granted")).collect(),
        tenantTable(ctx, orgId, "billingOrders").query().withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", "rejected")).collect(),
        tenantTable(ctx, orgId, "billingOrders").query().withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", "cancelled")).collect(),
      ]);
      return [...pending, ...granted, ...rejected, ...cancelled];
    });
}

async function isNewClient(ctx: QueryCtx | MutationCtx, orgId: string, studentId: string): Promise<boolean> {
  const activeRows = await Promise.all([
    tenantTable(ctx, orgId, "billingOrders").query()
      .withIndex("by_organization_and_buyerStudentId_and_status", (q) => q.eq("organizationId", orgId).eq("buyerStudentId", studentId).eq("status", "pending_verification"))
      .take(20),
    tenantTable(ctx, orgId, "billingOrders").query()
      .withIndex("by_organization_and_buyerStudentId_and_status", (q) => q.eq("organizationId", orgId).eq("buyerStudentId", studentId).eq("status", "granted"))
      .take(20),
  ]);
  // Rejected requests release the lock and do not make a student ineligible
  // for a new-client offer; pending and granted requests do.
  return activeRows.every((rows) => rows.length === 0);
}

async function resolveDiscount(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  studentId: string,
  familyId: Id<"billingFamilies">,
  planId: Id<"billingPlans">,
  currency: string,
  listPrice: number,
  now: string,
) {
  const rows = await tenantTable(ctx, orgId, "billingDiscounts").query()
    .withIndex("by_organization_and_isActive", (q) => q.eq("organizationId", orgId).eq("isActive", true))
    .take(200);
  const isNew = await isNewClient(ctx, orgId, studentId);
  const candidates: BillingDiscountRule[] = [];
  for (const row of rows) {
    if (row.eligibility === "allowlist") {
      const eligible = await tenantTable(ctx, orgId, "billingDiscountEligibleStudents").query()
        .withIndex("by_organization_and_discountId_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("discountId", row._id).eq("studentId", studentId)
        )
        .unique();
      if (!eligible) continue;
    }
    candidates.push(toDiscountRule(row));
  }
  const rule = selectBestDiscount(candidates, {
    familyId: String(familyId),
    planId: String(planId),
    currency,
    isNewClient: isNew,
    allowlisted: true,
  }, now, listPrice);
  if (!rule) return { rule: null, calculation: calculateDiscount(listPrice, currency, null), isNewClient: isNew };
  return { rule, calculation: calculateDiscount(listPrice, currency, rule), isNewClient: isNew };
}

async function offerFor(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  studentId: string,
  planVersionId: Id<"billingPlanVersions">,
  locale: Locale,
) {
  const versions = tenantTable(ctx, orgId, "billingPlanVersions");
  const version = await versions.get(planVersionId);
  if (!version || version.status !== "published" || version.visibility !== "visible") throw new Error("Plan offer is not available");
  const family = await tenantTable(ctx, orgId, "billingFamilies").get(version.familyId);
  const plan = await tenantTable(ctx, orgId, "billingPlans").get(version.planId);
  if (!family || family.isArchived || !plan || plan.isArchived || plan.familyId !== family._id) throw new Error("Plan offer is not available");
  const newClient = await isNewClient(ctx, orgId, studentId);
  if (version.publicationScope === "new_clients_only" && !newClient) throw new Error("This offer is for new clients only");
  if (!Number.isInteger(version.lessonCount) || version.lessonCount <= 0 || version.listPrice < 0 || version.expiryDays <= 0) throw new Error("Plan offer is invalid");
  const now = NOW();
  const discount = await resolveDiscount(ctx, orgId, studentId, family._id, plan._id, version.currency, version.listPrice, now);
  const priceSnapshot: PriceSnapshot = {
    listAmount: version.listPrice,
    discountAmount: discount.calculation.discountAmount,
    netAmount: discount.calculation.netAmount,
    currency: version.currency,
    calculatedAt: now,
  };
  const planSnapshot: OrderSnapshot = {
    familyKey: family.key,
    familyLabel: localized(family.labels, locale),
    planKey: plan.key,
    planLabel: localized(plan.labels, locale),
    lessonCount: version.lessonCount,
    expiryDays: version.expiryDays,
  };
  const discountSnapshot: DiscountSnapshot | undefined = discount.rule ? {
    discountId: discount.rule.id as Id<"billingDiscounts">,
    name: discount.rule.name,
    kind: discount.rule.kind,
    value: discount.rule.value,
    amount: discount.calculation.discountAmount,
    currency: discount.rule.currency,
    scope: discount.rule.scope,
    eligibility: discount.rule.eligibility,
    priority: discount.rule.priority,
    validAt: now,
  } : undefined;
  return { version, family, plan, planSnapshot, priceSnapshot, discountSnapshot, discountRule: discount.rule, isNewClient: newClient };
}

function publicOrder(order: Doc<"billingOrders">) {
  return {
    orderId: order._id,
    status: order.status,
    planVersionId: order.planVersionId,
    requestedAt: order.requestedAt,
    planSnapshot: order.planSnapshot,
    priceSnapshot: order.priceSnapshot,
    discountSnapshot: order.discountSnapshot ?? null,
    rejectionReason: order.rejectionReason ?? null,
    grantId: order.grantId ?? null,
  };
}

export const getStudentBilling = query({
  args: { locale: v.optional(localeArg) },
  handler: async (ctx, { locale }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const selectedLocale = locale ?? user.locale ?? "en";
    const [families, plans, versions, benefits, orders, settings] = await Promise.all([
      tenantTable(ctx, orgId, "billingFamilies").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(200),
      tenantTable(ctx, orgId, "billingPlans").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(500),
      tenantTable(ctx, orgId, "billingPlanVersions").query().withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", "published")).take(500),
      tenantTable(ctx, orgId, "billingPlanBenefits").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(1000),
      orderRowsFor(ctx, orgId),
      settingsFor(ctx, orgId),
    ]);
    const mine = orders.filter((order) => order.buyerStudentId === user.externalId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const newClient = await isNewClient(ctx, orgId, user.externalId);
    const familyMap = new Map(families.map((family) => [String(family._id), family]));
    const planMap = new Map(plans.map((plan) => [String(plan._id), plan]));
    const visibleVersions = versions
      .filter((version) => version.visibility === "visible" && !familyMap.get(String(version.familyId))?.isArchived && !planMap.get(String(version.planId))?.isArchived)
      .filter((version) => version.publicationScope !== "new_clients_only" || newClient);
    const computedOffers = await Promise.all(visibleVersions.map(async (version) => {
      const family = familyMap.get(String(version.familyId))!;
      const plan = planMap.get(String(version.planId))!;
      const discount = await resolveDiscount(ctx, orgId, user.externalId, family._id, plan._id, version.currency, version.listPrice, NOW());
      return {
        planVersionId: version._id,
        version: version.version,
        familyId: version.familyId,
        planId: version.planId,
        familyLabel: localized(family.labels, selectedLocale),
        planLabel: localized(plan.labels, selectedLocale),
        lessonCount: version.lessonCount,
        currency: version.currency,
        listPrice: version.listPrice,
        discountAmount: discount.calculation.discountAmount,
        netPrice: discount.calculation.netAmount,
        discountName: discount.rule?.name ?? null,
        expiryDays: version.expiryDays,
        publicationScope: version.publicationScope,
        benefits: benefits
          .filter((benefit) => benefit.planVersionId === version._id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((benefit) => localized(benefit.labels, selectedLocale)),
      };
    }));
    computedOffers.sort((a, b) => {
        const familyA = familyMap.get(String(a.familyId))?.sortOrder ?? 0;
        const familyB = familyMap.get(String(b.familyId))?.sortOrder ?? 0;
        return familyA - familyB || a.lessonCount - b.lessonCount;
      });
    return {
      billingMode: settings?.billingMode ?? "legacy",
      offers: computedOffers,
      openOrder: mine.find((order) => order.status === "pending_verification") ? publicOrder(mine.find((order) => order.status === "pending_verification")!) : null,
      recentOrders: mine.slice(0, 10).map(publicOrder),
    };
  },
});

export const previewDiscount = query({
  args: { planVersionId: v.id("billingPlanVersions"), locale: v.optional(localeArg) },
  handler: async (ctx, { planVersionId, locale }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const offer = await offerFor(ctx, orgId, user.externalId, planVersionId, locale ?? user.locale ?? "en");
    return {
      planVersionId,
      planSnapshot: offer.planSnapshot,
      priceSnapshot: offer.priceSnapshot,
      discountSnapshot: offer.discountSnapshot ?? null,
    };
  },
});

export const createOrderRequest = mutation({
  args: { planVersionId: v.id("billingPlanVersions"), requestKey: v.string(), locale: v.optional(localeArg) },
  handler: async (ctx, { planVersionId, requestKey, locale }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const key = requiredText(requestKey, "Request key");
    if (key.length > 200) throw new Error("Request key is too long");
    const orders = tenantTable(ctx, orgId, "billingOrders");
    const sameKey = await orders.query().withIndex("by_organization_and_requestKey", (q) => q.eq("organizationId", orgId).eq("requestKey", key)).unique();
    if (sameKey) {
      if (sameKey.buyerStudentId !== user.externalId) throw new Error("Request key is already in use");
      return publicOrder(sameKey);
    }
    const pending = await orders.query().withIndex("by_organization_and_buyerStudentId_and_status", (q) => q.eq("organizationId", orgId).eq("buyerStudentId", user.externalId).eq("status", "pending_verification")).unique();
    if (pending) return publicOrder(pending);
    const offer = await offerFor(ctx, orgId, user.externalId, planVersionId, locale ?? user.locale ?? "en");
    const now = NOW();
    const orderId = await orders.insert({
      buyerStudentId: user.externalId,
      requestKey: key,
      familyId: offer.family._id,
      planId: offer.plan._id,
      planVersionId: offer.version._id,
      planSnapshot: offer.planSnapshot,
      priceSnapshot: offer.priceSnapshot,
      discountSnapshot: offer.discountSnapshot,
      status: "pending_verification",
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    if (offer.discountRule) {
      const discountId = offer.discountRule.id as Id<"billingDiscounts">;
      const redemption = await tenantTable(ctx, orgId, "billingDiscountRedemptions").query()
        .withIndex("by_organization_and_discountId_and_orderId", (q) => q.eq("organizationId", orgId).eq("discountId", discountId).eq("orderId", orderId))
        .unique();
      if (!redemption) {
        await tenantTable(ctx, orgId, "billingDiscountRedemptions").insert({ discountId, orderId, studentId: user.externalId, redeemedAt: now });
        const discount = await tenantTable(ctx, orgId, "billingDiscounts").get(discountId);
        if (discount) await tenantTable(ctx, orgId, "billingDiscounts").patch(discountId, { redemptionCount: discount.redemptionCount + 1, updatedAt: now });
      }
    }
    const admins = await tenantTable(ctx, orgId, "users").query().withIndex("by_organization_and_role", (q) => q.eq("organizationId", orgId).eq("role", "admin")).take(100);
    for (const admin of admins) {
      await insertNotification(ctx, {
        organizationId: orgId,
        recipientId: admin.externalId,
        kind: "billing_order_requested",
        payload: {
          studentId: user.externalId,
          studentName: user.name,
          familyLabel: offer.planSnapshot.familyLabel,
          planLabel: offer.planSnapshot.planLabel,
          lessons: offer.planSnapshot.lessonCount,
          amount: offer.priceSnapshot.netAmount,
          currency: offer.priceSnapshot.currency,
          orderId,
        },
        link: `/admin/billing?tab=orders&order=${orderId}`,
        sourceKey: `billing-order-requested:${orderId}`,
      });
    }
    return publicOrder((await orders.get(orderId))!);
  },
});

export const listOrders = query({
  args: { status: v.optional(v.union(v.literal("pending_verification"), v.literal("granted"), v.literal("rejected"), v.literal("cancelled"))) },
  handler: async (ctx, { status }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const orders = status
      ? await tenantTable(ctx, orgId, "billingOrders").query().withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", status)).order("desc").take(200)
      : await orderRowsFor(ctx, orgId);
    const users = await tenantTable(ctx, orgId, "users").query().withIndex("by_organization_and_role", (q) => q.eq("organizationId", orgId).eq("role", "student")).take(500);
    const names = new Map(users.map((user) => [user.externalId, user.name]));
    return orders.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map((order) => ({ ...publicOrder(order), buyerStudentId: order.buyerStudentId, buyerName: names.get(order.buyerStudentId) ?? order.buyerStudentId }));
  },
});

export const grantOrder = mutation({
  args: { orderId: v.id("billingOrders") },
  handler: async (ctx, { orderId }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const orders = tenantTable(ctx, orgId, "billingOrders");
    const order = await orders.get(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status === "granted") return { ok: true, alreadyProcessed: true, grantId: order.grantId };
    if (order.status !== "pending_verification") throw new Error(`Cannot grant an order that is ${order.status}`);
    const nextStatus = transitionBillingOrder(order.status, "grant");
    const grant = await grantPointsInternal(ctx, {
      orgId,
      studentId: order.buyerStudentId,
      points: order.planSnapshot.lessonCount,
      source: "purchase",
      expiryDays: order.planSnapshot.expiryDays,
      performedBy: user.externalId,
      notes: `${order.planSnapshot.familyLabel} · ${order.planSnapshot.planLabel} · billing order ${order._id}`,
    });
    await tenantTable(ctx, orgId, "pointGrants").patch(grant.grantId, {
      billingOrderId: order._id,
      planVersionId: order.planVersionId,
      familyId: order.familyId,
      planSnapshot: order.planSnapshot,
      priceSnapshot: order.priceSnapshot,
      discountSnapshot: order.discountSnapshot,
    });
    const transaction = await tenantTable(ctx, orgId, "pointTransactions").query()
      .withIndex("by_organization_and_grantId", (q) => q.eq("organizationId", orgId).eq("grantId", grant.grantId))
      .unique();
    if (!transaction) throw new Error("Grant ledger row missing");
    await tenantTable(ctx, orgId, "pointTransactions").patch(transaction._id, { billingOrderId: order._id });
    const financeEntryId = await recordEntry(ctx, {
      organizationId: orgId,
      direction: "in",
      category: "pack_sale",
      amount: order.priceSnapshot.netAmount,
      currency: order.priceSnapshot.currency,
      date: NOW().slice(0, 10),
      note: `${order.planSnapshot.familyLabel} · ${order.planSnapshot.planLabel} · ${order.planSnapshot.lessonCount} lessons`,
      source: "auto",
      sourceKey: `billing-order:${order._id}`,
      studentId: order.buyerStudentId,
      billingOrderId: order._id,
      createdBy: user.externalId,
    });
    await orders.patch(order._id, { status: nextStatus, grantedAt: NOW(), processedBy: user.externalId, grantId: grant.grantId, financeEntryId, updatedAt: NOW() });
    await insertNotification(ctx, {
      organizationId: orgId,
      recipientId: order.buyerStudentId,
      kind: "payment_received",
      payload: { packName: order.planSnapshot.planLabel, familyLabel: order.planSnapshot.familyLabel, lessons: order.planSnapshot.lessonCount, balanceAfter: grant.balanceAfter, orderId: order._id },
      link: "/student/billing",
      sourceKey: `billing-order-granted:${order._id}`,
    });
    return { ok: true, alreadyProcessed: false, grantId: grant.grantId, financeEntryId };
  },
});

export const rejectOrder = mutation({
  args: { orderId: v.id("billingOrders"), reason: v.string() },
  handler: async (ctx, { orderId, reason }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const cleaned = requiredText(reason, "Rejection reason");
    if (cleaned.length < 5) throw new Error("Give a readable reason");
    const orders = tenantTable(ctx, orgId, "billingOrders");
    const order = await orders.get(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status === "rejected") return { ok: true, alreadyProcessed: true };
    if (order.status !== "pending_verification") throw new Error(`Cannot reject an order that is ${order.status}`);
    await orders.patch(order._id, { status: transitionBillingOrder(order.status, "reject"), rejectedAt: NOW(), processedBy: user.externalId, rejectionReason: cleaned, updatedAt: NOW() });
    await insertNotification(ctx, {
      organizationId: orgId,
      recipientId: order.buyerStudentId,
      kind: "billing_order_rejected",
      payload: { planLabel: order.planSnapshot.planLabel, familyLabel: order.planSnapshot.familyLabel, reason: cleaned, orderId: order._id },
      link: "/student/billing",
      sourceKey: `billing-order-rejected:${order._id}`,
    });
    return { ok: true, alreadyProcessed: false };
  },
});

export const listCatalogue = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const [families, plans, versions, benefits] = await Promise.all([
      tenantTable(ctx, orgId, "billingFamilies").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(500),
      tenantTable(ctx, orgId, "billingPlans").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(1000),
      tenantTable(ctx, orgId, "billingPlanVersions").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(2000),
      tenantTable(ctx, orgId, "billingPlanBenefits").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(4000),
    ]);
    return { families, plans, versions, benefits };
  },
});

export const seedInitialCatalogue = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const now = NOW();
    const familiesManifest = [
      { key: "ielts", labels: { default: "IELTS", en: "IELTS", ru: "IELTS", ar: "IELTS", kk: "IELTS" }, sortOrder: 1 },
      { key: "basic_tutoring", labels: { default: "Basic Tutoring", en: "Basic Tutoring", ru: "Basic Tutoring", ar: "Basic Tutoring", kk: "Basic Tutoring" }, sortOrder: 2 },
    ] as const;
    const priceManifest = {
      ielts: [20000, 35000, 48000],
      basic_tutoring: [15000, 26000, 36000],
    } as const;
    const benefitManifest = {
      ielts: [
        { default: "Exam-focused curriculum", en: "Exam-focused curriculum", ru: "Программа с фокусом на экзамен", ar: "منهج يركز على الاختبار", kk: "Емтиханға бағытталған оқу бағдарламасы" },
        { default: "Writing and speaking feedback", en: "Writing and speaking feedback", ru: "Обратная связь по письму и говорению", ar: "ملاحظات على الكتابة والمحادثة", kk: "Жазылым мен айтылым бойынша кері байланыс" },
        { default: "Exam strategy", en: "Exam strategy", ru: "Стратегия сдачи экзамена", ar: "استراتيجيات الاختبار", kk: "Емтихан стратегиясы" },
        { default: "Progress tracking", en: "Progress tracking", ru: "Отслеживание прогресса", ar: "متابعة التقدم", kk: "Прогресті бақылау" },
      ],
      basic_tutoring: [
        { default: "Structured 1-on-1 tutoring", en: "Structured 1-on-1 tutoring", ru: "Структурированные индивидуальные занятия", ar: "دروس فردية منظمة", kk: "Құрылымдалған жеке сабақтар" },
        { default: "Flexible booking", en: "Flexible booking", ru: "Гибкое бронирование", ar: "حجز مرن", kk: "Икемді брондау" },
        { default: "Homework feedback", en: "Homework feedback", ru: "Обратная связь по домашним заданиям", ar: "ملاحظات على الواجبات المنزلية", kk: "Үй тапсырмасы бойынша кері байланыс" },
        { default: "Progress tracking", en: "Progress tracking", ru: "Отслеживание прогресса", ar: "متابعة التقدم", kk: "Прогресті бақылау" },
      ],
    } as const;
    let createdFamilies = 0;
    let createdVersions = 0;
    for (const familyManifest of familiesManifest) {
      const familyTable = tenantTable(ctx, orgId, "billingFamilies");
      let family = await familyTable.query().withIndex("by_organization_and_key", (q) => q.eq("organizationId", orgId).eq("key", familyManifest.key)).unique();
      if (!family) {
        const familyId = await familyTable.insert({ key: familyManifest.key, labels: familyManifest.labels, isArchived: false, sortOrder: familyManifest.sortOrder, createdAt: now, updatedAt: now });
        family = await familyTable.get(familyId);
        createdFamilies++;
      }
      if (!family) throw new Error("Failed to create billing family");
      for (const [index, lessonCount] of [4, 8, 12].entries()) {
        const planKey = `${familyManifest.key}_${lessonCount}`;
        const planTable = tenantTable(ctx, orgId, "billingPlans");
        let plan = await planTable.query().withIndex("by_organization_and_key", (q) => q.eq("organizationId", orgId).eq("key", planKey)).unique();
        const planLabels = { default: `${lessonCount} lessons`, en: `${lessonCount} lessons`, ru: `${lessonCount} уроков`, ar: `${lessonCount} دروس`, kk: `${lessonCount} сабақ` };
        if (!plan) {
          const planId = await planTable.insert({ familyId: family._id, key: planKey, labels: planLabels, isArchived: false, sortOrder: index, createdAt: now, updatedAt: now });
          plan = await planTable.get(planId);
        }
        if (!plan) throw new Error("Failed to create billing plan");
        const versions = await tenantTable(ctx, orgId, "billingPlanVersions").query().withIndex("by_organization_and_planId", (q) => q.eq("organizationId", orgId).eq("planId", plan!._id)).collect();
        let version = versions.find((candidate) => candidate.version === 1);
        if (!version) {
          const versionId = await tenantTable(ctx, orgId, "billingPlanVersions").insert({ planId: plan._id, familyId: family._id, version: 1, status: "published", visibility: "visible", publicationScope: "replace_for_everyone", lessonCount, currency: "KZT", listPrice: priceManifest[familyManifest.key][index], expiryDays: 60, effectiveFrom: now, publishedAt: now, publishedBy: user.externalId, createdAt: now, updatedAt: now });
          version = (await tenantTable(ctx, orgId, "billingPlanVersions").get(versionId)) ?? undefined;
          createdVersions++;
        }
        if (!version) throw new Error("Failed to create billing version");
        const existingBenefits = await tenantTable(ctx, orgId, "billingPlanBenefits").query().withIndex("by_organization_and_planVersionId", (q) => q.eq("organizationId", orgId).eq("planVersionId", version!._id)).take(20);
        if (existingBenefits.length === 0) {
          for (const [sortOrder, labels] of benefitManifest[familyManifest.key].entries()) {
            await tenantTable(ctx, orgId, "billingPlanBenefits").insert({ planVersionId: version._id, sortOrder, labels, createdAt: now });
          }
        }
      }
    }
    const settings = await settingsFor(ctx, orgId);
    if (settings && settings.billingMode !== "orders") await tenantTable(ctx, orgId, "tenantSettings").patch(settings._id, { billingMode: "orders", updatedAt: now });
    return { createdFamilies, createdVersions };
  },
});

export const saveFamily = mutation({
  args: { id: v.optional(v.id("billingFamilies")), key: v.string(), labels: labelsArg, sortOrder: v.number(), isArchived: v.boolean() },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const key = requiredText(args.key, "Family key");
    const labels = { ...args.labels, default: requiredText(args.labels.default, "Family label") };
    const table = tenantTable(ctx, orgId, "billingFamilies");
    const now = NOW();
    if (args.id) {
      await table.patch(args.id, { key, labels, sortOrder: args.sortOrder, isArchived: args.isArchived, updatedAt: now });
      return args.id;
    }
    return await table.insert({ key, labels, sortOrder: args.sortOrder, isArchived: args.isArchived, createdAt: now, updatedAt: now });
  },
});

export const savePlan = mutation({
  args: { id: v.optional(v.id("billingPlans")), familyId: v.id("billingFamilies"), key: v.string(), labels: labelsArg, sortOrder: v.number(), isArchived: v.boolean() },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const family = await tenantTable(ctx, orgId, "billingFamilies").get(args.familyId);
    if (!family) throw new Error("Family not found");
    const key = requiredText(args.key, "Plan key");
    const labels = { ...args.labels, default: requiredText(args.labels.default, "Plan label") };
    const table = tenantTable(ctx, orgId, "billingPlans");
    const now = NOW();
    if (args.id) {
      await table.patch(args.id, { familyId: args.familyId, key, labels, sortOrder: args.sortOrder, isArchived: args.isArchived, updatedAt: now });
      return args.id;
    }
    return await table.insert({ familyId: args.familyId, key, labels, sortOrder: args.sortOrder, isArchived: args.isArchived, createdAt: now, updatedAt: now });
  },
});

export const savePlanVersionDraft = mutation({
  args: { id: v.optional(v.id("billingPlanVersions")), planId: v.id("billingPlans"), familyId: v.id("billingFamilies"), lessonCount: v.number(), currency: v.string(), listPrice: v.number(), expiryDays: v.number(), visibility: v.union(v.literal("visible"), v.literal("hidden")), publicationScope: publicationScopeArg },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const plan = await tenantTable(ctx, orgId, "billingPlans").get(args.planId);
    const family = await tenantTable(ctx, orgId, "billingFamilies").get(args.familyId);
    if (!plan || !family || plan.familyId !== family._id) throw new Error("Plan and family do not match");
    if (!Number.isInteger(args.lessonCount) || args.lessonCount <= 0 || args.listPrice < 0 || args.expiryDays <= 0 || !args.currency.trim()) throw new Error("Invalid plan version values");
    const table = tenantTable(ctx, orgId, "billingPlanVersions");
    const now = NOW();
    if (args.id) {
      const existing = await table.get(args.id);
      if (!existing) throw new Error("Version not found");
      if (existing.status !== "draft") throw new Error("Published versions are immutable; create a new draft");
      await table.patch(args.id, { planId: args.planId, familyId: args.familyId, lessonCount: args.lessonCount, currency: args.currency.trim().toUpperCase(), listPrice: args.listPrice, expiryDays: args.expiryDays, visibility: args.visibility, publicationScope: args.publicationScope, updatedAt: now });
      return args.id;
    }
    const versions = await table.query().withIndex("by_organization_and_planId", (q) => q.eq("organizationId", orgId).eq("planId", args.planId)).collect();
    const version = Math.max(0, ...versions.map((row) => row.version)) + 1;
    return await table.insert({ planId: args.planId, familyId: args.familyId, version, status: "draft", visibility: args.visibility, publicationScope: args.publicationScope, lessonCount: args.lessonCount, currency: args.currency.trim().toUpperCase(), listPrice: args.listPrice, expiryDays: args.expiryDays, effectiveFrom: now, createdAt: now, updatedAt: now });
  },
});

export const savePlanBenefits = mutation({
  args: { planVersionId: v.id("billingPlanVersions"), benefits: v.array(v.object({ sortOrder: v.number(), labels: labelsArg })) },
  handler: async (ctx, { planVersionId, benefits }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const version = await tenantTable(ctx, orgId, "billingPlanVersions").get(planVersionId);
    if (!version) throw new Error("Version not found");
    if (version.status !== "draft") throw new Error("Published version benefits are immutable; create a new draft");
    const table = tenantTable(ctx, orgId, "billingPlanBenefits");
    const existing = await table.query().withIndex("by_organization_and_planVersionId", (q) => q.eq("organizationId", orgId).eq("planVersionId", planVersionId)).collect();
    for (const row of existing) await table.delete(row._id);
    for (const benefit of benefits) {
      const defaultText = requiredText(benefit.labels.default, "Benefit text");
      await table.insert({ planVersionId, sortOrder: benefit.sortOrder, labels: { ...benefit.labels, default: defaultText }, createdAt: NOW() });
    }
    return { count: benefits.length };
  },
});

export const publishPlanVersion = mutation({
  args: { planVersionId: v.id("billingPlanVersions"), publicationScope: publicationScopeArg },
  handler: async (ctx, { planVersionId, publicationScope }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "billingPlanVersions");
    const version = await table.get(planVersionId);
    if (!version) throw new Error("Version not found");
    if (version.status !== "draft") throw new Error("Only drafts can be published");
    const now = NOW();
    const previous = await table.query().withIndex("by_organization_and_planId", (q) => q.eq("organizationId", orgId).eq("planId", version.planId)).collect();
    for (const row of previous) {
      if (row.status === "published") await table.patch(row._id, { status: transitionCatalogueVersion(row.status, "supersede"), updatedAt: now });
    }
    await table.patch(version._id, { status: transitionCatalogueVersion(version.status, "publish"), publicationScope, publishedAt: now, publishedBy: user.externalId, updatedAt: now });
    return version._id;
  },
});

export const archivePlanVersion = mutation({
  args: { planVersionId: v.id("billingPlanVersions") },
  handler: async (ctx, { planVersionId }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "billingPlanVersions");
    const version = await table.get(planVersionId);
    if (!version) throw new Error("Version not found");
    if (version.status === "archived") return version._id;
    if (version.status === "draft") await table.patch(version._id, { status: "archived", updatedAt: NOW() });
    else await table.patch(version._id, { status: transitionCatalogueVersion(version.status, "archive"), updatedAt: NOW() });
    return version._id;
  },
});

export const listDiscounts = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    return await tenantTable(ctx, orgId, "billingDiscounts").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).order("desc").take(500);
  },
});

export const saveDiscount = mutation({
  args: { id: v.optional(v.id("billingDiscounts")), name: v.string(), kind: discountKindArg, value: v.number(), currency: v.optional(v.string()), scope: discountScopeArg, familyId: v.optional(v.id("billingFamilies")), planId: v.optional(v.id("billingPlans")), eligibility: discountEligibilityArg, priority: v.number(), startsAt: v.string(), endsAt: v.optional(v.string()), maxRedemptions: v.optional(v.number()), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    if (args.familyId && !(await tenantTable(ctx, orgId, "billingFamilies").get(args.familyId))) throw new Error("Family not found");
    if (args.planId && !(await tenantTable(ctx, orgId, "billingPlans").get(args.planId))) throw new Error("Plan not found");
    const rule: BillingDiscountRule = { id: String(args.id ?? "new"), name: args.name, kind: args.kind, value: args.value, currency: args.currency?.trim().toUpperCase() || undefined, scope: args.scope, familyId: args.familyId ? String(args.familyId) : undefined, planId: args.planId ? String(args.planId) : undefined, eligibility: args.eligibility, priority: args.priority, startsAt: args.startsAt, endsAt: args.endsAt, maxRedemptions: args.maxRedemptions, redemptionCount: 0, isActive: args.isActive };
    validateDiscount(rule);
    if (rule.scope === "all_plans" && (args.familyId || args.planId)) throw new Error("All-plan discount cannot have a scope id");
    if (rule.scope === "family" && args.planId) throw new Error("Family discount cannot have a plan");
    if (rule.scope === "plan" && args.familyId) throw new Error("Plan discount cannot have a family");
    const table = tenantTable(ctx, orgId, "billingDiscounts");
    const now = NOW();
    if (args.id) {
      const existing = await table.get(args.id);
      if (!existing) throw new Error("Discount not found");
      await table.patch(args.id, { name: args.name.trim(), kind: args.kind, value: args.value, currency: rule.currency, scope: args.scope, familyId: args.familyId, planId: args.planId, eligibility: args.eligibility, priority: args.priority, startsAt: args.startsAt, endsAt: args.endsAt, maxRedemptions: args.maxRedemptions, isActive: args.isActive, updatedBy: user.externalId, updatedAt: now });
      return args.id;
    }
    return await table.insert({ name: args.name.trim(), kind: args.kind, value: args.value, currency: rule.currency, scope: args.scope, familyId: args.familyId, planId: args.planId, eligibility: args.eligibility, priority: args.priority, startsAt: args.startsAt, endsAt: args.endsAt, maxRedemptions: args.maxRedemptions, redemptionCount: 0, isActive: args.isActive, createdBy: user.externalId, createdAt: now, updatedBy: user.externalId, updatedAt: now });
  },
});

export const setDiscountAllowlist = mutation({
  args: { discountId: v.id("billingDiscounts"), studentIds: v.array(v.string()) },
  handler: async (ctx, { discountId, studentIds }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const discount = await tenantTable(ctx, orgId, "billingDiscounts").get(discountId);
    if (!discount) throw new Error("Discount not found");
    if (discount.eligibility !== "allowlist") throw new Error("Only allowlist discounts have eligible students");
    const table = tenantTable(ctx, orgId, "billingDiscountEligibleStudents");
    const existing = await table.query().withIndex("by_organization_and_discountId", (q) => q.eq("organizationId", orgId).eq("discountId", discountId)).collect();
    for (const row of existing) await table.delete(row._id);
    const uniqueIds = [...new Set(studentIds.map((id) => id.trim()).filter(Boolean))];
    for (const studentId of uniqueIds) {
      const student = await tenantTable(ctx, orgId, "users").query().withIndex("by_organization_and_externalId", (q) => q.eq("organizationId", orgId).eq("externalId", studentId)).unique();
      if (!student || student.role !== "student") throw new Error("Allowlist contains an unknown student");
      await table.insert({ discountId, studentId });
    }
    return { count: uniqueIds.length };
  },
});

export const setDiscountActive = mutation({
  args: { discountId: v.id("billingDiscounts"), isActive: v.boolean() },
  handler: async (ctx, { discountId, isActive }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    await tenantTable(ctx, orgId, "billingDiscounts").patch(discountId, { isActive, updatedBy: user.externalId, updatedAt: NOW() });
    return discountId;
  },
});
