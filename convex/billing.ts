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
import { localizeBillingText, normalizePresentation, sortCatalogueOffers, resolveBillingSurface, billingOrderAdminLink, type BillingLocale, type BillingLocalizedText } from "./lib/billingCatalogue";

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
const presentationArg = v.optional(v.object({
  variant: v.union(v.literal("standard"), v.literal("compact"), v.literal("featured")),
  accent: v.union(v.literal("purple"), v.literal("gold"), v.literal("blue"), v.literal("green"), v.literal("slate")),
  featured: v.boolean(),
  badge: v.optional(labelsArg),
  ctaLabel: v.optional(labelsArg),
  sectionOrder: v.array(v.union(v.literal("family"), v.literal("description"), v.literal("price"), v.literal("lessons"), v.literal("expiry"), v.literal("benefits"), v.literal("badge"))),
  sections: v.object({ family: v.boolean(), description: v.boolean(), price: v.boolean(), lessons: v.boolean(), expiry: v.boolean(), benefits: v.boolean(), badge: v.boolean() }),
}));

const NOW = () => new Date().toISOString();

type Locale = "en" | "ru" | "ar" | "kk";
type Localized = { default: string; en?: string; ru?: string; ar?: string; kk?: string };

const LEGACY_FAMILY_LABELS: Record<Locale, string> = {
  en: "Legacy package",
  ru: "Старый пакет",
  ar: "باقة قديمة",
  kk: "Ескі пакет",
};

function legacyFamilyLabel(locale: Locale): string {
  return LEGACY_FAMILY_LABELS[locale] ?? LEGACY_FAMILY_LABELS.en;
}

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

function stableKey(value: string, label: string): string {
  const key = requiredText(value, label).toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(key)) {
    throw new Error(`${label} must use lowercase letters, numbers, and single underscores`);
  }
  return key;
}

function validSortOrder(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error("Sort order must be a non-negative integer");
  }
  return value;
}

function normalizedLabels(value: Localized, label: string): Localized {
  return { ...value, default: requiredText(value.default, label) };
}

function toDiscountRule(row: Doc<"billingDiscounts">): BillingDiscountRule {
  return {
    id: String(row._id),
    name: row.name,
    labels: row.labels,
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
  const [pendingOrders, grantedOrders, grants, paymentEvents, legacyReviews, billingRecords] = await Promise.all([
    tenantTable(ctx, orgId, "billingOrders").query()
      .withIndex("by_organization_and_buyerStudentId_and_status", (q) => q.eq("organizationId", orgId).eq("buyerStudentId", studentId).eq("status", "pending_verification"))
      .take(20),
    tenantTable(ctx, orgId, "billingOrders").query()
      .withIndex("by_organization_and_buyerStudentId_and_status", (q) => q.eq("organizationId", orgId).eq("buyerStudentId", studentId).eq("status", "granted"))
      .take(20),
    tenantTable(ctx, orgId, "pointGrants").query()
      .withIndex("by_organization_and_studentId", (q) => q.eq("organizationId", orgId).eq("studentId", studentId))
      .take(200),
    tenantTable(ctx, orgId, "paymentEvents").query()
      .withIndex("by_organization_and_studentId", (q) => q.eq("organizationId", orgId).eq("studentId", studentId))
      .take(500),
    tenantTable(ctx, orgId, "billingLegacyReviews").query()
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .take(500),
    tenantTable(ctx, orgId, "billingRecords").query()
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .take(500),
  ]);
  const legacyEventIds = new Set(
    paymentEvents
      .filter((event) => event.studentId === studentId && (event.eventName === "manual_claim" || event.isTrialPayment === true))
      .map((event) => String(event._id)),
  );
  const reviewedLegacyHistory = legacyReviews.some((review) => legacyEventIds.has(String(review.paymentEventId)));
  const legacyPurchaseHistory = paymentEvents.some((event) => legacyEventIds.has(String(event._id))) || reviewedLegacyHistory;
  const oldBillingHistory = billingRecords.some((record) => record.studentId === studentId && record.isDeleted !== true);
  // New-client offers are available only before any order-backed activity or
  // legacy purchase history. Rejected new orders release the selection lock;
  // legacy claims/reviews remain evidence that the student has entered the
  // former purchase workflow and therefore count as prior history.
  return pendingOrders.length === 0 && grantedOrders.length === 0 && grants.length === 0 && !legacyPurchaseHistory && !oldBillingHistory;
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
  if (!version || version.visibility !== "visible" || version.status === "draft" || version.status === "archived") throw new Error("Plan offer is not available");
  const family = await tenantTable(ctx, orgId, "billingFamilies").get(version.familyId);
  const plan = await tenantTable(ctx, orgId, "billingPlans").get(version.planId);
  if (!family || family.isArchived || family.visibility === "hidden" || !plan || plan.isArchived || plan.visibility === "hidden" || plan.familyId !== family._id) throw new Error("Plan offer is not available");
  const newClient = await isNewClient(ctx, orgId, studentId);
  const visibleVersion = selectStudentVersionRows(
    await versions.query().withIndex("by_organization_and_planId", (q) => q.eq("organizationId", orgId).eq("planId", version.planId)).take(100),
    newClient,
  ).find((candidate) => candidate._id === version._id);
  if (!visibleVersion) throw new Error("Plan offer is not available");
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
    name: discount.rule.labels ? localizeBillingText(discount.rule.labels as BillingLocalizedText, locale) : discount.rule.name,
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

function publicLegacyOffer(pkg: Doc<"pointPackages">, locale: Locale) {
  const currency = pkg.currency ?? "USD";
  return {
    legacyPackageId: pkg._id,
    familyLabel: legacyFamilyLabel(locale),
    planLabel: pkg.name,
    lessonCount: pkg.points,
    currency,
    listPrice: pkg.priceLocal ?? pkg.priceUSD,
    expiryDays: pkg.expiryDays ?? 0,
    isActive: pkg.isActive,
    sortOrder: pkg.sortOrder,
  };
}

function publicLegacyClaim(event: Doc<"paymentEvents">, pkg: Doc<"pointPackages"> | null, locale: Locale = "en") {
  const legacyPlanLabels: Record<Locale, string> = { en: "Legacy package", ru: "Старый пакет", ar: "باقة قديمة", kk: "Ескі пакет" };
  return {
    claimId: event._id,
    billingOrderId: event.billingOrderId ?? null,
    packageId: event.packageId ?? null,
    status: event.status,
    packName: pkg?.name ?? legacyPlanLabels[locale],
    lessonCount: pkg?.points ?? null,
    amount: event.amount ?? event.priceSnapshotLocal ?? 0,
    currency: event.currency ?? pkg?.currency ?? "USD",
    createdAt: event.createdAt,
    message: event.message ?? null,
  };
}

function selectStudentVersionRows(
  versions: Doc<"billingPlanVersions">[],
  isNewClient: boolean,
): Doc<"billingPlanVersions">[] {
  const byPlan = new Map<string, Doc<"billingPlanVersions">[]>();
  for (const version of versions) {
    if (version.visibility !== "visible" || version.status === "archived" || version.status === "draft") continue;
    const rows = byPlan.get(String(version.planId)) ?? [];
    rows.push(version);
    byPlan.set(String(version.planId), rows);
  }
  const selected: Doc<"billingPlanVersions">[] = [];
  for (const rows of byPlan.values()) {
    const eligible = isNewClient
      ? rows.filter((version) => version.status === "published")
      : rows.filter((version) => version.publicationScope !== "new_clients_only");
    const best = [...eligible].sort((a, b) =>
      b.version - a.version ||
      (b.sortOrder ?? 0) - (a.sortOrder ?? 0) ||
      String(b._id).localeCompare(String(a._id))
    )[0];
    if (best) selected.push(best);
  }
  return selected;
}

export const getStudentBilling = query({
  args: { locale: v.optional(localeArg) },
  handler: async (ctx, { locale }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const selectedLocale = (locale ?? user.locale ?? "en") as BillingLocale;
    const [families, plans, versions, benefits, orders, settings, legacyPackages, paymentEvents] = await Promise.all([
      tenantTable(ctx, orgId, "billingFamilies").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(200),
      tenantTable(ctx, orgId, "billingPlans").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(500),
      tenantTable(ctx, orgId, "billingPlanVersions").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(1000),
      tenantTable(ctx, orgId, "billingPlanBenefits").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(2000),
      orderRowsFor(ctx, orgId),
      settingsFor(ctx, orgId),
      tenantTable(ctx, orgId, "pointPackages").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(500),
      tenantTable(ctx, orgId, "paymentEvents").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).order("desc").take(100),
    ]);
    const mine = orders.filter((order) => order.buyerStudentId === user.externalId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const newClient = await isNewClient(ctx, orgId, user.externalId);
    const familyMap = new Map(families.map((family) => [String(family._id), family]));
    const planMap = new Map(plans.map((plan) => [String(plan._id), plan]));
    const visibleVersions = selectStudentVersionRows(versions, newClient)
      .filter((version) => familyMap.get(String(version.familyId)) && planMap.get(String(version.planId)))
      .filter((version) => !familyMap.get(String(version.familyId))?.isArchived && familyMap.get(String(version.familyId))?.visibility !== "hidden" && !planMap.get(String(version.planId))?.isArchived && planMap.get(String(version.planId))?.visibility !== "hidden");
    const computedOffers = await Promise.all(visibleVersions.map(async (version) => {
      const family = familyMap.get(String(version.familyId))!;
      const plan = planMap.get(String(version.planId))!;
      const discount = await resolveDiscount(ctx, orgId, user.externalId, family._id, plan._id, version.currency, version.listPrice, NOW());
      const presentation = normalizePresentation(version.presentation);
      return {
        planVersionId: version._id,
        version: version.version,
        familyId: version.familyId,
        planId: version.planId,
        familyLabel: localizeBillingText(family.labels as BillingLocalizedText, selectedLocale),
        familyDescription: family.description ? localizeBillingText(family.description as BillingLocalizedText, selectedLocale) : null,
        planLabel: localizeBillingText(plan.labels as BillingLocalizedText, selectedLocale),
        planDescription: plan.description ? localizeBillingText(plan.description as BillingLocalizedText, selectedLocale) : (version.description ? localizeBillingText(version.description as BillingLocalizedText, selectedLocale) : null),
        programLabel: version.programLabel ? localizeBillingText(version.programLabel as BillingLocalizedText, selectedLocale) : null,
        lessonCount: version.lessonCount,
        currency: version.currency,
        listPrice: version.listPrice,
        discountAmount: discount.calculation.discountAmount,
        netPrice: discount.calculation.netAmount,
        discountName: discount.rule ? (discount.rule.labels ? localizeBillingText(discount.rule.labels as BillingLocalizedText, selectedLocale) : discount.rule.name) : null,
        expiryDays: version.expiryDays,
        publicationScope: version.publicationScope,
        featured: presentation.featured,
        badgeLabel: presentation.badge ? localizeBillingText(presentation.badge as BillingLocalizedText, selectedLocale) : null,
        ctaLabel: presentation.ctaLabel ? localizeBillingText(presentation.ctaLabel as BillingLocalizedText, selectedLocale) : null,
        presentation,
        benefits: benefits
          .filter((benefit) => benefit.planVersionId === version._id)
          .sort((a, b) => a.sortOrder - b.sortOrder || String(a._id).localeCompare(String(b._id)))
          .map((benefit) => localizeBillingText(benefit.labels as BillingLocalizedText, selectedLocale)),
        familySortOrder: family.sortOrder,
        planSortOrder: plan.sortOrder,
        versionSortOrder: version.sortOrder ?? 0,
      };
    }));
    const sortedOffers = sortCatalogueOffers(computedOffers.map((offer) => ({ ...offer, id: String(offer.planVersionId), version: offer.version })));
    const billingMode = settings?.billingMode ?? "orders";
    const surface = resolveBillingSurface({
      billingMode,
      versionedOfferCount: sortedOffers.length,
      legacyPackageCount: legacyPackages.filter((pkg) => pkg.isActive).length,
    });
    const legacyOffers = surface.source === "legacy_adapter"
      ? legacyPackages.filter((pkg) => pkg.isActive).sort((a, b) => a.sortOrder - b.sortOrder || String(a._id).localeCompare(String(b._id))).map((pkg) => publicLegacyOffer(pkg, selectedLocale))
      : [];
    const legacyClaims = paymentEvents
      .filter((event) => event.studentId === user.externalId && event.eventName === "manual_claim")
      .slice(0, 30)
      .map((event) => publicLegacyClaim(event, event.packageId ? legacyPackages.find((pkg) => pkg._id === event.packageId) ?? null : null, selectedLocale));
    return {
      billingMode,
      catalogueSource: surface.source,
      compatibilityLabel: surface.compatibilityLabel ?? null,
      offers: surface.source === "versioned" ? sortedOffers : [],
      legacyOffers,
      legacyClaims,
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
        link: billingOrderAdminLink(String(orderId)),
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

export async function createLegacyBillingOrderCore(
  ctx: MutationCtx,
  args: {
    orgId: string;
    eventId?: Id<"paymentEvents">;
    legacyGrantId?: Id<"pointGrants">;
    studentId: string;
    pkg: Doc<"pointPackages"> | null;
    amount: number;
    currency: string;
    status?: "pending_verification" | "granted" | "rejected";
    grantId?: Id<"pointGrants">;
  },
): Promise<Id<"billingOrders">> {
  const orders = tenantTable(ctx, args.orgId, "billingOrders");
  const existing = args.eventId
    ? await orders.query().withIndex("by_organization_and_legacyPaymentEventId", (q) => q.eq("organizationId", args.orgId).eq("legacyPaymentEventId", args.eventId)).unique()
    : args.legacyGrantId
      ? await orders.query().withIndex("by_organization_and_legacyGrantId", (q) => q.eq("organizationId", args.orgId).eq("legacyGrantId", args.legacyGrantId)).unique()
      : null;
  if (existing) return existing._id;
  const now = NOW();
  const lessonCount = args.pkg?.points ?? 1;
  const expiryDays = args.pkg?.expiryDays ?? 0;
  const listAmount = args.pkg?.priceLocal ?? args.pkg?.priceUSD ?? args.amount;
  const discountAmount = args.pkg ? Math.max(0, listAmount - args.amount) : 0;
  const orderId = await orders.insert({
    buyerStudentId: args.studentId,
    requestKey: `legacy:${args.eventId ? `event:${args.eventId}` : `grant:${args.legacyGrantId}`}`,
    legacyPaymentEventId: args.eventId,
    legacyGrantId: args.legacyGrantId,
    legacyPackageId: args.pkg?._id,
    planSnapshot: {
      familyKey: "legacy",
      familyLabel: "Legacy package",
      planKey: args.pkg?.externalId ?? "trial",
      planLabel: args.pkg?.name ?? "Paid trial",
      lessonCount,
      expiryDays,
    },
    priceSnapshot: {
      listAmount,
      discountAmount,
      netAmount: args.amount,
      currency: args.currency,
      calculatedAt: now,
    },
    status: args.status ?? "pending_verification",
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
    grantedAt: args.status === "granted" ? now : undefined,
    grantId: args.grantId,
  });
  if (args.eventId) await tenantTable(ctx, args.orgId, "paymentEvents").patch(args.eventId, { billingOrderId: orderId });
  return orderId;
}

export async function grantBillingOrderCore(
  ctx: MutationCtx,
  { orgId, orderId, processedBy }: { orgId: string; orderId: Id<"billingOrders">; processedBy: string },
) {
  const orders = tenantTable(ctx, orgId, "billingOrders");
  const order = await orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "granted") return { ok: true as const, alreadyProcessed: true, grantId: order.grantId };
  if (order.status !== "pending_verification") throw new Error(`Cannot grant an order that is ${order.status}`);
  const nextStatus = transitionBillingOrder(order.status, "grant");
  const now = NOW();
  const grant = await grantPointsInternal(ctx, {
    orgId,
    studentId: order.buyerStudentId,
    points: order.planSnapshot.lessonCount,
    source: "purchase",
    expiryDays: order.planSnapshot.expiryDays || undefined,
    performedBy: processedBy,
    notes: `${order.planSnapshot.familyLabel} · ${order.planSnapshot.planLabel} · billing order ${order._id}`,
    billingOrderId: order._id,
    planVersionId: order.planVersionId,
    familyId: order.familyId,
    planSnapshot: order.planSnapshot,
    priceSnapshot: order.priceSnapshot,
    discountSnapshot: order.discountSnapshot,
  });
  const financeEntryId = await recordEntry(ctx, {
    organizationId: orgId,
    direction: "in",
    category: "pack_sale",
    amount: order.priceSnapshot.netAmount,
    currency: order.priceSnapshot.currency,
    date: now.slice(0, 10),
    note: `${order.planSnapshot.familyLabel} · ${order.planSnapshot.planLabel} · ${order.planSnapshot.lessonCount} lessons`,
    source: "auto",
    sourceKey: `billing-order:${order._id}`,
    studentId: order.buyerStudentId,
    billingOrderId: order._id,
    createdBy: processedBy,
  });
  await orders.patch(order._id, { status: nextStatus, grantedAt: now, processedBy, grantId: grant.grantId, financeEntryId, updatedAt: now });
  await insertNotification(ctx, {
    organizationId: orgId,
    recipientId: order.buyerStudentId,
    kind: "payment_received",
    payload: { packName: order.planSnapshot.planLabel, familyLabel: order.planSnapshot.familyLabel, lessons: order.planSnapshot.lessonCount, balanceAfter: grant.balanceAfter, orderId: order._id },
    link: "/student/billing",
    sourceKey: `billing-order-granted:${order._id}`,
  });
  return { ok: true as const, alreadyProcessed: false, grantId: grant.grantId, financeEntryId };
}

export const grantOrder = mutation({
  args: { orderId: v.id("billingOrders") },
  handler: async (ctx, { orderId }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    return await grantBillingOrderCore(ctx, { orgId, orderId, processedBy: user.externalId });
  },
});

export async function rejectBillingOrderCore(
  ctx: MutationCtx,
  { orgId, orderId, reason, processedBy }: { orgId: string; orderId: Id<"billingOrders">; reason: string; processedBy: string },
) {
  const orders = tenantTable(ctx, orgId, "billingOrders");
  const order = await orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "rejected") return { ok: true as const, alreadyProcessed: true };
  if (order.status !== "pending_verification") throw new Error(`Cannot reject an order that is ${order.status}`);
  const cleaned = requiredText(reason, "Rejection reason");
  if (cleaned.length < 5) throw new Error("Give a readable reason");
  await orders.patch(order._id, { status: transitionBillingOrder(order.status, "reject"), rejectedAt: NOW(), processedBy, rejectionReason: cleaned, updatedAt: NOW() });
  await insertNotification(ctx, {
    organizationId: orgId,
    recipientId: order.buyerStudentId,
    kind: "billing_order_rejected",
    payload: { planLabel: order.planSnapshot.planLabel, familyLabel: order.planSnapshot.familyLabel, reason: cleaned, orderId: order._id },
    link: "/student/billing",
    sourceKey: `billing-order-rejected:${order._id}`,
  });
  return { ok: true as const, alreadyProcessed: false };
}

export const rejectOrder = mutation({
  args: { orderId: v.id("billingOrders"), reason: v.string() },
  handler: async (ctx, { orderId, reason }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    return await rejectBillingOrderCore(ctx, { orgId, orderId, reason, processedBy: user.externalId });
  },
});

export const listCatalogue = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const [families, plans, versions, benefits, legacyPackages, legacyReviews, legacyEvents] = await Promise.all([
      tenantTable(ctx, orgId, "billingFamilies").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(500),
      tenantTable(ctx, orgId, "billingPlans").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(1000),
      tenantTable(ctx, orgId, "billingPlanVersions").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(2000),
      tenantTable(ctx, orgId, "billingPlanBenefits").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(4000),
      tenantTable(ctx, orgId, "pointPackages").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(500),
      tenantTable(ctx, orgId, "billingLegacyReviews").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(500),
      tenantTable(ctx, orgId, "paymentEvents").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).order("desc").take(200),
    ]);
    families.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key) || String(a._id).localeCompare(String(b._id)));
    plans.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key) || String(a._id).localeCompare(String(b._id)));
    versions.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.version - a.version || String(a._id).localeCompare(String(b._id)));
    benefits.sort((a, b) => a.sortOrder - b.sortOrder || String(a._id).localeCompare(String(b._id)));
    return {
      families,
      plans,
      versions,
      benefits,
      legacyPackages,
      legacyReviews,
      legacyClaims: legacyEvents.filter((event) => event.eventName === "manual_claim").map((event) => {
        const pkg = event.packageId ? legacyPackages.find((candidate) => candidate._id === event.packageId) ?? null : null;
        return { ...publicLegacyClaim(event, pkg), studentId: event.studentId ?? "" };
      }),
    };
  },
});

export const adoptLegacyClaim = mutation({
  args: { eventId: v.id("paymentEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId || event.eventName !== "manual_claim") throw new Error("Legacy claim not found");
    if (event.billingOrderId) return { orderId: event.billingOrderId, alreadyProcessed: true };
    const pkg = event.packageId ? await ctx.db.get(event.packageId) : null;
    const grant = event.grantId ? await ctx.db.get(event.grantId) : null;
    const amount = event.amount ?? event.priceSnapshotLocal ?? pkg?.priceLocal ?? pkg?.priceUSD;
    const currency = event.currency ?? pkg?.currency ?? (pkg?.priceLocal === undefined ? "USD" : undefined);
    if (!event.studentId || (!pkg && !event.isTrialPayment) || amount === undefined || !currency) {
      const reason = "Legacy claim cannot be reconstructed without its original student, package, amount, and currency; it remains unchanged for review.";
      const review = await tenantTable(ctx, orgId, "billingLegacyReviews").query().withIndex("by_organization_and_paymentEventId", (q) => q.eq("organizationId", orgId).eq("paymentEventId", eventId)).unique();
      if (!review) await tenantTable(ctx, orgId, "billingLegacyReviews").insert({ paymentEventId: eventId, status: "unreconstructable", reason, createdAt: NOW() });
      return { orderId: null, alreadyProcessed: false, unresolved: true };
    }
    if (event.status === "fulfilled" && !grant) throw new Error("Fulfilled legacy claim has no grant to link");
    const status = event.status === "fulfilled" ? "granted" : event.status === "rejected" ? "rejected" : "pending_verification";
    const orderId = await createLegacyBillingOrderCore(ctx, { orgId, eventId, studentId: event.studentId, pkg, amount, currency, status, grantId: grant?._id });
    const order = await tenantTable(ctx, orgId, "billingOrders").get(orderId);
    if (grant && order) {
      await tenantTable(ctx, orgId, "pointGrants").patch(grant._id, { billingOrderId: orderId, planSnapshot: order.planSnapshot, priceSnapshot: order.priceSnapshot });
      const txs = await tenantTable(ctx, orgId, "pointTransactions").query().withIndex("by_organization_and_grantId", (q) => q.eq("organizationId", orgId).eq("grantId", grant._id)).take(20);
      for (const tx of txs) if (!tx.billingOrderId) await tenantTable(ctx, orgId, "pointTransactions").patch(tx._id, { billingOrderId: orderId });
    }
    if (event.status === "rejected" && event.message && order) await tenantTable(ctx, orgId, "billingOrders").patch(orderId, { rejectionReason: event.message });
    const linkedReview = await tenantTable(ctx, orgId, "billingLegacyReviews").query().withIndex("by_organization_and_paymentEventId", (q) => q.eq("organizationId", orgId).eq("paymentEventId", eventId)).unique();
    if (!linkedReview) await tenantTable(ctx, orgId, "billingLegacyReviews").insert({ paymentEventId: eventId, status: "linked", reason: `Linked to compatibility billing order ${orderId} without rewriting legacy history.`, billingOrderId: orderId, createdAt: NOW(), reviewedAt: NOW(), reviewedBy: user.externalId });
    return { orderId, alreadyProcessed: false, unresolved: false };
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
        const familyId = await familyTable.insert({ key: familyManifest.key, labels: familyManifest.labels, visibility: "visible", isArchived: false, sortOrder: familyManifest.sortOrder, createdAt: now, updatedAt: now });
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
          const planId = await planTable.insert({ familyId: family._id, key: planKey, labels: planLabels, visibility: "visible", isArchived: false, sortOrder: index, createdAt: now, updatedAt: now });
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
  args: { id: v.optional(v.id("billingFamilies")), key: v.string(), labels: labelsArg, description: v.optional(labelsArg), visibility: v.optional(v.union(v.literal("visible"), v.literal("hidden"))), sortOrder: v.number(), isArchived: v.boolean() },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const key = stableKey(args.key, "Family key");
    const labels = normalizedLabels(args.labels, "Family label");
    const sortOrder = validSortOrder(args.sortOrder);
    const table = tenantTable(ctx, orgId, "billingFamilies");
    const duplicate = await table.query().withIndex("by_organization_and_key", (q) => q.eq("organizationId", orgId).eq("key", key)).take(2);
    if (duplicate.some((row) => row._id !== args.id)) throw new Error("Family key already exists in this organization");
    const now = NOW();
    if (args.id) {
      const existing = await table.get(args.id);
      if (!existing) throw new Error("Family not found");
      await table.patch(args.id, { key, labels, description: args.description, visibility: args.visibility ?? existing.visibility ?? "visible", sortOrder, isArchived: existing.isArchived, updatedAt: now, updatedBy: user.externalId });
      return args.id;
    }
    return await table.insert({ key, labels, description: args.description, visibility: args.visibility ?? "visible", sortOrder, isArchived: args.isArchived, createdAt: now, createdBy: user.externalId, updatedAt: now, updatedBy: user.externalId });
  },
});

export const savePlan = mutation({
  args: { id: v.optional(v.id("billingPlans")), familyId: v.id("billingFamilies"), key: v.string(), labels: labelsArg, description: v.optional(labelsArg), visibility: v.optional(v.union(v.literal("visible"), v.literal("hidden"))), sortOrder: v.number(), isArchived: v.boolean() },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const family = await tenantTable(ctx, orgId, "billingFamilies").get(args.familyId);
    if (!family) throw new Error("Family not found");
    const key = stableKey(args.key, "Plan key");
    const labels = normalizedLabels(args.labels, "Plan label");
    const sortOrder = validSortOrder(args.sortOrder);
    const table = tenantTable(ctx, orgId, "billingPlans");
    const duplicate = await table.query().withIndex("by_organization_and_key", (q) => q.eq("organizationId", orgId).eq("key", key)).take(2);
    if (duplicate.some((row) => row._id !== args.id)) throw new Error("Plan key already exists in this organization");
    const now = NOW();
    if (args.id) {
      const existing = await table.get(args.id);
      if (!existing) throw new Error("Plan not found");
      await table.patch(args.id, { familyId: args.familyId, key, labels, description: args.description, visibility: args.visibility ?? existing.visibility ?? "visible", sortOrder, isArchived: existing.isArchived, updatedAt: now, updatedBy: user.externalId });
      return args.id;
    }
    return await table.insert({ familyId: args.familyId, key, labels, description: args.description, visibility: args.visibility ?? "visible", sortOrder, isArchived: args.isArchived, createdAt: now, createdBy: user.externalId, updatedAt: now, updatedBy: user.externalId });
  },
});

export const savePlanVersionDraft = mutation({
  args: {
    id: v.optional(v.id("billingPlanVersions")),
    planId: v.id("billingPlans"),
    familyId: v.id("billingFamilies"),
    lessonCount: v.number(),
    currency: v.string(),
    listPrice: v.number(),
    expiryDays: v.number(),
    sortOrder: v.optional(v.number()),
    programLabel: v.optional(labelsArg),
    description: v.optional(labelsArg),
    presentation: presentationArg,
    visibility: v.union(v.literal("visible"), v.literal("hidden")),
    publicationScope: publicationScopeArg,
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const plan = await tenantTable(ctx, orgId, "billingPlans").get(args.planId);
    const family = await tenantTable(ctx, orgId, "billingFamilies").get(args.familyId);
    if (!plan || !family || plan.familyId !== family._id) throw new Error("Plan and family do not match");
    const sortOrder = validSortOrder(args.sortOrder ?? plan.sortOrder);
    if (!Number.isInteger(args.lessonCount) || args.lessonCount <= 0 || args.listPrice < 0 || args.expiryDays <= 0 || !args.currency.trim() || !/^[A-Z]{3}$/.test(args.currency.trim().toUpperCase())) throw new Error("Invalid plan version values");
    const table = tenantTable(ctx, orgId, "billingPlanVersions");
    const now = NOW();
    const programLabel = args.programLabel ? normalizedLabels(args.programLabel, "Program label") : undefined;
    const description = args.description ? normalizedLabels(args.description, "Plan description") : undefined;
    if (args.id) {
      const existing = await table.get(args.id);
      if (!existing) throw new Error("Version not found");
      if (existing.status === "draft") {
        await table.patch(args.id, { planId: args.planId, familyId: args.familyId, lessonCount: args.lessonCount, currency: args.currency.trim().toUpperCase(), listPrice: args.listPrice, expiryDays: args.expiryDays, sortOrder, programLabel, description, presentation: args.presentation, visibility: args.visibility, publicationScope: args.publicationScope, updatedAt: now, updatedBy: user.externalId });
        return args.id;
      }
      const versions = await table.query().withIndex("by_organization_and_planId", (q) => q.eq("organizationId", orgId).eq("planId", args.planId)).take(200);
      const version = Math.max(0, ...versions.map((row) => row.version)) + 1;
      const draftId = await table.insert({ planId: args.planId, familyId: args.familyId, version, status: "draft", visibility: args.visibility, publicationScope: args.publicationScope, lessonCount: args.lessonCount, currency: args.currency.trim().toUpperCase(), listPrice: args.listPrice, expiryDays: args.expiryDays, sortOrder, programLabel: programLabel ?? existing.programLabel, description: description ?? existing.description, presentation: args.presentation ?? existing.presentation, effectiveFrom: now, createdAt: now, createdBy: user.externalId, updatedAt: now, updatedBy: user.externalId });
      const oldBenefits = await tenantTable(ctx, orgId, "billingPlanBenefits").query().withIndex("by_organization_and_planVersionId", (q) => q.eq("organizationId", orgId).eq("planVersionId", existing._id)).take(100);
      for (const benefit of oldBenefits) await tenantTable(ctx, orgId, "billingPlanBenefits").insert({ planVersionId: draftId, sortOrder: benefit.sortOrder, labels: benefit.labels, createdAt: now });
      return draftId;
    }
    const versions = await table.query().withIndex("by_organization_and_planId", (q) => q.eq("organizationId", orgId).eq("planId", args.planId)).take(200);
    const version = Math.max(0, ...versions.map((row) => row.version)) + 1;
    return await table.insert({ planId: args.planId, familyId: args.familyId, version, status: "draft", visibility: args.visibility, publicationScope: args.publicationScope, lessonCount: args.lessonCount, currency: args.currency.trim().toUpperCase(), listPrice: args.listPrice, expiryDays: args.expiryDays, sortOrder, programLabel, description, presentation: args.presentation, effectiveFrom: now, createdAt: now, createdBy: user.externalId, updatedAt: now, updatedBy: user.externalId });
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
      const sortOrder = validSortOrder(benefit.sortOrder);
      await table.insert({ planVersionId, sortOrder, labels: { ...benefit.labels, default: defaultText }, createdAt: NOW() });
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
      if (row.status === "published") await table.patch(row._id, { status: transitionCatalogueVersion(row.status, "supersede"), updatedAt: now, updatedBy: user.externalId });
    }
    await table.patch(version._id, { status: transitionCatalogueVersion(version.status, "publish"), publicationScope, publishedAt: now, publishedBy: user.externalId, updatedAt: now, updatedBy: user.externalId });
    return version._id;
  },
});

export const archivePlanVersion = mutation({
  args: { planVersionId: v.id("billingPlanVersions") },
  handler: async (ctx, { planVersionId }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "billingPlanVersions");
    const version = await table.get(planVersionId);
    if (!version) throw new Error("Version not found");
    if (version.status === "archived") return version._id;
    const nextStatus = version.status === "draft" ? "archived" : transitionCatalogueVersion(version.status, "archive");
    await table.patch(version._id, { status: nextStatus, updatedAt: NOW(), updatedBy: user.externalId });
    return version._id;
  },
});

export const restorePlanVersion = mutation({
  args: { planVersionId: v.id("billingPlanVersions") },
  handler: async (ctx, { planVersionId }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "billingPlanVersions");
    const version = await table.get(planVersionId);
    if (!version) throw new Error("Version not found");
    if (version.status !== "archived") return version._id;
    await table.patch(version._id, { status: "draft", updatedAt: NOW(), updatedBy: user.externalId });
    return version._id;
  },
});

export const setPlanVersionVisibility = mutation({
  args: { planVersionId: v.id("billingPlanVersions"), visibility: v.union(v.literal("visible"), v.literal("hidden")) },
  handler: async (ctx, { planVersionId, visibility }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "billingPlanVersions");
    const version = await table.get(planVersionId);
    if (!version) throw new Error("Version not found");
    await table.patch(version._id, { visibility, updatedAt: NOW(), updatedBy: user.externalId });
    return version._id;
  },
});

export const setFamilyArchived = mutation({
  args: { familyId: v.id("billingFamilies"), isArchived: v.boolean() },
  handler: async (ctx, { familyId, isArchived }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const family = tenantTable(ctx, orgId, "billingFamilies");
    if (!await family.get(familyId)) throw new Error("Family not found");
    await family.patch(familyId, { isArchived, updatedAt: NOW(), updatedBy: user.externalId });
    return familyId;
  },
});

export const setPlanArchived = mutation({
  args: { planId: v.id("billingPlans"), isArchived: v.boolean() },
  handler: async (ctx, { planId, isArchived }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const plan = tenantTable(ctx, orgId, "billingPlans");
    if (!await plan.get(planId)) throw new Error("Plan not found");
    await plan.patch(planId, { isArchived, updatedAt: NOW(), updatedBy: user.externalId });
    return planId;
  },
});

export const listDiscounts = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const rows = await tenantTable(ctx, orgId, "billingDiscounts").query().withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(500);
    return rows.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name) || String(a._id).localeCompare(String(b._id)));
  },
});

export const saveDiscount = mutation({
  args: { id: v.optional(v.id("billingDiscounts")), name: v.string(), labels: v.optional(labelsArg), description: v.optional(labelsArg), kind: discountKindArg, value: v.number(), currency: v.optional(v.string()), scope: discountScopeArg, familyId: v.optional(v.id("billingFamilies")), planId: v.optional(v.id("billingPlans")), eligibility: discountEligibilityArg, priority: v.number(), startsAt: v.string(), endsAt: v.optional(v.string()), maxRedemptions: v.optional(v.number()), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const cleanName = requiredText(args.name, "Discount name");
    const labels = args.labels ? normalizedLabels(args.labels, "Discount label") : undefined;
    const description = args.description ? normalizedLabels(args.description, "Discount description") : undefined;
    const family = args.familyId ? await tenantTable(ctx, orgId, "billingFamilies").get(args.familyId) : null;
    const plan = args.planId ? await tenantTable(ctx, orgId, "billingPlans").get(args.planId) : null;
    if (args.familyId && !family) throw new Error("Family not found");
    if (args.planId && !plan) throw new Error("Plan not found");
    if (plan && family && plan.familyId !== family._id) throw new Error("Plan does not belong to family");
    const table = tenantTable(ctx, orgId, "billingDiscounts");
    const existing = args.id ? await table.get(args.id) : null;
    if (args.id && !existing) throw new Error("Discount not found");
    const rule: BillingDiscountRule = { id: String(args.id ?? "new"), name: cleanName, labels, kind: args.kind, value: args.value, currency: args.currency?.trim().toUpperCase() || undefined, scope: args.scope, familyId: args.familyId ? String(args.familyId) : undefined, planId: args.planId ? String(args.planId) : undefined, eligibility: args.eligibility, priority: args.priority, startsAt: args.startsAt, endsAt: args.endsAt, maxRedemptions: args.maxRedemptions, redemptionCount: existing?.redemptionCount ?? 0, isActive: args.isActive };
    validateDiscount(rule);
    if (rule.scope === "all_plans" && (args.familyId || args.planId)) throw new Error("All-plan discount cannot have a scope id");
    if (rule.scope === "family" && args.planId) throw new Error("Family discount cannot have a plan");
    if (rule.scope === "plan" && args.familyId) throw new Error("Plan discount cannot have a family");
    const requestedActive = existing ? existing.isActive && args.isActive : args.isActive;
    if (requestedActive && args.endsAt && Date.parse(args.endsAt) <= Date.now()) throw new Error("Active discount cannot already be expired");
    if (args.maxRedemptions !== undefined && args.maxRedemptions < (existing?.redemptionCount ?? 0)) throw new Error("Maximum redemptions cannot be below existing redemptions");
    const now = NOW();
    const persistedActive = requestedActive;
    if (args.id) {
      await table.patch(args.id, { name: cleanName, labels, description, kind: args.kind, value: args.value, currency: rule.currency, scope: args.scope, familyId: args.familyId, planId: args.planId, eligibility: args.eligibility, priority: args.priority, startsAt: args.startsAt, endsAt: args.endsAt, maxRedemptions: args.maxRedemptions, isActive: persistedActive, updatedBy: user.externalId, updatedAt: now });
      return args.id;
    }
    return await table.insert({ name: cleanName, labels, description, kind: args.kind, value: args.value, currency: rule.currency, scope: args.scope, familyId: args.familyId, planId: args.planId, eligibility: args.eligibility, priority: args.priority, startsAt: args.startsAt, endsAt: args.endsAt, maxRedemptions: args.maxRedemptions, redemptionCount: 0, isActive: persistedActive, createdBy: user.externalId, createdAt: now, updatedBy: user.externalId, updatedAt: now });
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
    const table = tenantTable(ctx, orgId, "billingDiscounts");
    const discount = await table.get(discountId);
    if (!discount) throw new Error("Discount not found");
    if (isActive && discount.endsAt && Date.parse(discount.endsAt) <= Date.now()) throw new Error("Expired discounts cannot be activated");
    await table.patch(discountId, { isActive, updatedBy: user.externalId, updatedAt: NOW() });
    return discountId;
  },
});
