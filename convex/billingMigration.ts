import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireTenantPermission } from "./lib/tenant";
import { createLegacyBillingOrderCore } from "./billing";

const NOW = () => new Date().toISOString();

const INITIAL_FAMILIES = [
  {
    key: "ielts",
    labels: { default: "IELTS", en: "IELTS", ru: "IELTS", ar: "IELTS", kk: "IELTS" },
    benefits: [
      "Exam-focused curriculum",
      "Writing and speaking feedback",
      "Exam strategy",
      "Progress tracking",
    ],
  },
  {
    key: "basic_tutoring",
    labels: { default: "Basic Tutoring", en: "Basic Tutoring", ru: "Basic Tutoring", ar: "Basic Tutoring", kk: "Basic Tutoring" },
    benefits: [
      "Structured 1-on-1 tutoring",
      "Flexible booking",
      "Homework feedback",
      "Progress tracking",
    ],
  },
] as const;

const INITIAL_PLANS = [4, 8, 12] as const;
const PRICE_BY_FAMILY: Record<string, Record<number, number>> = {
  basic_tutoring: { 4: 15000, 8: 26000, 12: 36000 },
  ielts: { 4: 20000, 8: 35000, 12: 48000 },
};

function planLabels(lessons: number) {
  return {
    default: `${lessons} lessons`,
    en: `${lessons} lessons`,
    ru: `${lessons} урока`,
    ar: `${lessons} دروس`,
    kk: `${lessons} сабақ`,
  };
}

function benefitLabels(text: string) {
  return { default: text, en: text, ru: text, ar: text, kk: text };
}

async function seedInitialCatalogueCore(ctx: MutationCtx, orgId: string) {
  const settings = await ctx.db.query("tenantSettings").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).unique();
  if (!settings) throw new Error("Tenant settings not found");
  let familiesCreated = 0;
  let plansCreated = 0;
  let versionsCreated = 0;
  let benefitsCreated = 0;
  const now = NOW();

  for (const [familyIndex, familyManifest] of INITIAL_FAMILIES.entries()) {
    let family = await ctx.db.query("billingFamilies").withIndex("by_organization_and_key", (q) => q.eq("organizationId", orgId).eq("key", familyManifest.key)).unique();
    if (!family) {
      const familyId = await ctx.db.insert("billingFamilies", { organizationId: orgId, key: familyManifest.key, labels: familyManifest.labels, isArchived: false, sortOrder: familyIndex, createdAt: now, updatedAt: now });
      family = await ctx.db.get(familyId);
      familiesCreated++;
    }
    if (!family) throw new Error("Family seed failed");
    if (family.labels.default !== familyManifest.labels.default) {
      await ctx.db.patch(family._id, { labels: familyManifest.labels, updatedAt: now });
    }
    const plans = await ctx.db.query("billingPlans").withIndex("by_organization_and_familyId", (q) => q.eq("organizationId", orgId).eq("familyId", family!._id)).collect();
    for (const [planIndex, lessons] of INITIAL_PLANS.entries()) {
      const key = `${familyManifest.key}_${lessons}`;
      let plan = plans.find((candidate) => candidate.key === key);
      if (!plan) {
        const planId = await ctx.db.insert("billingPlans", { organizationId: orgId, familyId: family._id, key, labels: planLabels(lessons), isArchived: false, sortOrder: planIndex, createdAt: now, updatedAt: now });
        const insertedPlan = await ctx.db.get(planId);
        if (!insertedPlan) throw new Error("Plan seed failed");
        plan = insertedPlan;
        plansCreated++;
      }
      if (!plan) throw new Error("Plan seed failed");
      const versions = await ctx.db.query("billingPlanVersions").withIndex("by_organization_and_planId", (q) => q.eq("organizationId", orgId).eq("planId", plan!._id)).collect();
      const hasPublished = versions.some((version) => version.status === "published");
      if (!hasPublished && versions.length === 0) {
        const versionId = await ctx.db.insert("billingPlanVersions", {
          organizationId: orgId,
          planId: plan._id,
          familyId: family._id,
          version: 1,
          status: "published",
          visibility: "visible",
          publicationScope: "replace_for_everyone",
          lessonCount: lessons,
          currency: "KZT",
          listPrice: PRICE_BY_FAMILY[familyManifest.key]![lessons]!,
          expiryDays: 60,
          effectiveFrom: now,
          publishedAt: now,
          publishedBy: "system:approved-commercial-manifest",
          createdAt: now,
          updatedAt: now,
        });
        versionsCreated++;
        for (const [benefitIndex, text] of familyManifest.benefits.entries()) {
          await ctx.db.insert("billingPlanBenefits", { organizationId: orgId, planVersionId: versionId, sortOrder: benefitIndex, labels: benefitLabels(text), createdAt: now });
          benefitsCreated++;
        }
      }
    }
  }
  if (settings.billingMode !== "orders") await ctx.db.patch(settings._id, { billingMode: "orders", updatedAt: now });
  return { familiesCreated, plansCreated, versionsCreated, benefitsCreated, billingMode: "orders" as const };
}

export const seedInitialCatalogue = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    return await seedInitialCatalogueCore(ctx, orgId);
  },
});

export const _seedInitialCatalogue = internalMutation({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => await seedInitialCatalogueCore(ctx, orgId),
});

/**
 * Record legacy manual claims that cannot be reconstructed without an explicit
 * package→catalogue mapping. No old event, grant, or ledger row is rewritten.
 */
export const backfillLegacyOrders = internalMutation({
  args: { orgId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { orgId, limit }) => {
    const events = await ctx.db.query("paymentEvents").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(Math.min(Math.max(limit ?? 100, 1), 200));
    let created = 0;
    let linked = 0;
    let alreadyReviewed = 0;
    const unresolvedIds: string[] = [];
    for (const event of events) {
      if (event.eventName !== "manual_claim") continue;
      const existing = await ctx.db.query("billingLegacyReviews").withIndex("by_organization_and_paymentEventId", (q) => q.eq("organizationId", orgId).eq("paymentEventId", event._id)).unique();
      if (existing) { alreadyReviewed++; continue; }
      const pkg = event.packageId ? await ctx.db.get(event.packageId) : null;
      const grant = event.grantId ? await ctx.db.get(event.grantId) : null;
      const canReconstruct = Boolean(event.studentId && (pkg || event.isTrialPayment) && (event.amount ?? event.priceSnapshotLocal) !== undefined && (event.currency || pkg?.currency));
      if (canReconstruct) {
        const status = event.status === "fulfilled" && grant ? "granted" : event.status === "rejected" ? "rejected" : "pending_verification";
        const orderId = await createLegacyBillingOrderCore(ctx, {
          orgId,
          eventId: event._id,
          studentId: event.studentId!,
          pkg,
          amount: event.amount ?? event.priceSnapshotLocal ?? 0,
          currency: event.currency ?? pkg?.currency ?? "USD",
          status,
          grantId: grant?._id,
        });
        if (grant && status === "granted") {
          const order = await ctx.db.get(orderId);
          await ctx.db.patch(grant._id, {
            billingOrderId: orderId,
            planSnapshot: order?.planSnapshot,
            priceSnapshot: order?.priceSnapshot,
          });
          const txs = await ctx.db.query("pointTransactions").withIndex("by_organization_and_grantId", (q) => q.eq("organizationId", orgId).eq("grantId", grant._id)).take(20);
          for (const tx of txs) if (!tx.billingOrderId) await ctx.db.patch(tx._id, { billingOrderId: orderId });
          linked++;
        }
        created++;
        continue;
      }
      const reason = "Legacy payment history has no complete package, student, amount, or currency mapping; the original event remains unchanged for manual review.";
      await ctx.db.insert("billingLegacyReviews", { organizationId: orgId, paymentEventId: event._id, status: "unreconstructable", reason, createdAt: NOW() });
      unresolvedIds.push(event._id);
    }
    const grants = await ctx.db.query("pointGrants").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).take(Math.min(Math.max(limit ?? 100, 1), 200));
    for (const grant of grants) {
      if (grant.billingOrderId || (grant.source !== "purchase" && grant.source !== "trial")) continue;
      const existingOrder = await ctx.db.query("billingOrders").withIndex("by_organization_and_legacyGrantId", (q) => q.eq("organizationId", orgId).eq("legacyGrantId", grant._id)).unique();
      if (existingOrder) continue;
      const pkg = grant.packageId ? await ctx.db.get(grant.packageId) : null;
      if (!pkg) {
        const review = await ctx.db.query("billingLegacyReviews").withIndex("by_organization_and_legacyGrantId", (q) => q.eq("organizationId", orgId).eq("legacyGrantId", grant._id)).unique();
        if (!review) await ctx.db.insert("billingLegacyReviews", { organizationId: orgId, legacyGrantId: grant._id, status: "unreconstructable", reason: "Legacy grant has no preserved package mapping; the grant remains unchanged for manual review.", createdAt: NOW() });
        unresolvedIds.push(String(grant._id));
        continue;
      }
      const orderId = await createLegacyBillingOrderCore(ctx, { orgId, legacyGrantId: grant._id, studentId: grant.studentId, pkg, amount: pkg.priceUSD, currency: "USD", status: "granted", grantId: grant._id });
      const order = await ctx.db.get(orderId);
      await ctx.db.patch(grant._id, { billingOrderId: orderId, planSnapshot: order?.planSnapshot, priceSnapshot: order?.priceSnapshot });
      const txs = await ctx.db.query("pointTransactions").withIndex("by_organization_and_grantId", (q) => q.eq("organizationId", orgId).eq("grantId", grant._id)).take(20);
      for (const tx of txs) if (!tx.billingOrderId) await ctx.db.patch(tx._id, { billingOrderId: orderId });
      created++;
      linked++;
    }
    return { created, linked, reviewed: unresolvedIds.length, alreadyReviewed, unresolvedIds };
  },
});
