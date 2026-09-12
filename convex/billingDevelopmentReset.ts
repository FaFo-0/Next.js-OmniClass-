import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { CLEAN_BILLING_CATALOGUE } from "./lib/billingReset";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const RESET_CONFIRMATION = "RESET_DEVELOPMENT_BILLING_CATALOGUE" as const;

type BillingResetRows = {
  billingDiscountRedemptions: Doc<"billingDiscountRedemptions">[];
  billingDiscountEligibleStudents: Doc<"billingDiscountEligibleStudents">[];
  billingDiscounts: Doc<"billingDiscounts">[];
  billingPlanBenefits: Doc<"billingPlanBenefits">[];
  billingPlanVersions: Doc<"billingPlanVersions">[];
  billingPlans: Doc<"billingPlans">[];
  billingFamilies: Doc<"billingFamilies">[];
  billingOrders: Doc<"billingOrders">[];
  pointGrants: Doc<"pointGrants">[];
  pointTransactions: Doc<"pointTransactions">[];
  financeEntries: Doc<"financeEntries">[];
  notifications: Doc<"notifications">[];
};

/**
 * Shared ledgers are selected only from immutable billing provenance. This is
 * intentionally not a generic tenant wipe: manual adjustments, unrelated
 * finance entries, and unrelated notifications remain untouched.
 */
async function rowsForReset(ctx: QueryCtx | MutationCtx, organizationId: string): Promise<BillingResetRows> {
  const [
    billingDiscountRedemptions,
    billingDiscountEligibleStudents,
    billingDiscounts,
    billingPlanBenefits,
    billingPlanVersions,
    billingPlans,
    billingFamilies,
    billingOrders,
    allPointGrants,
    allPointTransactions,
    allFinanceEntries,
    allNotifications,
  ] = await Promise.all([
    ctx.db.query("billingDiscountRedemptions").withIndex("by_organization_and_discountId", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("billingDiscountEligibleStudents").withIndex("by_organization_and_studentId", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("billingDiscounts").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("billingPlanBenefits").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("billingPlanVersions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("billingPlans").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("billingFamilies").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("billingOrders").withIndex("by_organization_and_status", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("pointGrants").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("pointTransactions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("financeEntries").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ctx.db.query("notifications").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
  ]);
  const purchaseGrants = allPointGrants.filter((row) =>
    Boolean(row.billingOrderId) || row.source === "purchase",
  );
  const grantIds = new Set(purchaseGrants.map((row) => String(row._id)));

  return {
    billingDiscountRedemptions,
    billingDiscountEligibleStudents,
    billingDiscounts,
    billingPlanBenefits,
    billingPlanVersions,
    billingPlans,
    billingFamilies,
    billingOrders,
    pointGrants: purchaseGrants,
    pointTransactions: allPointTransactions.filter((row) =>
      Boolean(row.billingOrderId) || grantIds.has(String(row.grantId)),
    ),
    financeEntries: allFinanceEntries.filter((row) =>
      Boolean(row.billingOrderId) ||
      (typeof row.sourceKey === "string" && row.sourceKey.startsWith("billing-order:")),
    ),
    notifications: allNotifications.filter((row) =>
      typeof row.sourceKey === "string" && /^billing-order-(requested|granted|rejected):/.test(row.sourceKey),
    ),
  };
}

function summary(rows: BillingResetRows) {
  return Object.fromEntries(Object.entries(rows).map(([table, tableRows]) => [table, {
    count: tableRows.length,
    ids: tableRows.map((row) => row._id),
  }]));
}

/** The only code-owned catalogue seed. It has no student-facing route. */
export async function seedCleanCatalogue(ctx: MutationCtx, organizationId: string) {
  const now = new Date().toISOString();
  let familyCount = 0;
  let planCount = 0;
  let versionCount = 0;
  let benefitCount = 0;

  for (const [familyOrder, family] of CLEAN_BILLING_CATALOGUE.entries()) {
    const familyId = await ctx.db.insert("billingFamilies", {
      organizationId,
      key: family.key,
      labels: family.labels,
      description: family.description,
      visibility: "visible",
      isArchived: false,
      sortOrder: familyOrder,
      createdAt: now,
      updatedAt: now,
    });
    familyCount += 1;

    for (const [packOrder, pack] of family.packs.entries()) {
      const planId = await ctx.db.insert("billingPlans", {
        organizationId,
        familyId,
        key: pack.key,
        labels: pack.labels,
        visibility: "visible",
        isArchived: false,
        sortOrder: packOrder,
        createdAt: now,
        updatedAt: now,
      });
      planCount += 1;
      const versionId = await ctx.db.insert("billingPlanVersions", {
        organizationId,
        familyId,
        planId,
        version: 1,
        status: "published",
        visibility: "visible",
        publicationScope: "replace_for_everyone",
        lessonCount: pack.lessonCount,
        currency: pack.currency,
        listPrice: pack.price,
        expiryDays: pack.expiryDays,
        sortOrder: packOrder,
        description: family.description,
        effectiveFrom: now,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      versionCount += 1;

      for (const [benefitOrder, labels] of pack.benefits.entries()) {
        await ctx.db.insert("billingPlanBenefits", {
          organizationId,
          planVersionId: versionId,
          sortOrder: benefitOrder,
          labels,
          createdAt: now,
        });
        benefitCount += 1;
      }
    }
  }

  return { families: familyCount, plans: planCount, versions: versionCount, benefits: benefitCount, discounts: 0 };
}

export const listBillingResetTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tenants = await ctx.db.query("tenantSettings").collect();
    return await Promise.all(tenants.map(async (tenant) => ({
      organizationId: tenant.organizationId,
      tenantName: tenant.name,
      dedicatedE2E: tenant.e2eFixtureAuthorization?.dedicated === true,
      resetRows: summary(await rowsForReset(ctx, tenant.organizationId)),
    })));
  },
});

export const previewBillingReset = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const tenant = await ctx.db.query("tenantSettings").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
    if (!tenant) throw new Error("Billing reset target tenant does not exist");
    return {
      organizationId,
      tenantName: tenant.name,
      dedicatedE2E: tenant.e2eFixtureAuthorization?.dedicated === true,
      resetRows: summary(await rowsForReset(ctx, organizationId)),
      preserved: ["users", "tenantSettings", "teachers", "students", "lessons", "bookings", "library", "reader", "vocabulary", "flashcards", "unrelated notifications", "unrelated finance entries", "manual lesson adjustments"],
    };
  },
});

/**
 * Development/test-only explicit reset. The tenant name and confirmation bind
 * the destructive request to the reviewed target; production is never used by
 * the release workflow.
 */
export const executeBillingReset = internalMutation({
  args: {
    organizationId: v.string(),
    expectedTenantName: v.string(),
    confirmation: v.literal(RESET_CONFIRMATION),
  },
  handler: async (ctx, args) => {
    const tenant = await ctx.db.query("tenantSettings").withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId)).unique();
    if (!tenant || tenant.name !== args.expectedTenantName) {
      throw new Error("Billing reset target did not match the reviewed tenant");
    }

    const before = await rowsForReset(ctx, args.organizationId);
    const beforeSummary = summary(before);
    for (const tableRows of [
      before.billingDiscountRedemptions,
      before.billingDiscountEligibleStudents,
      before.pointTransactions,
      before.pointGrants,
      before.financeEntries,
      before.notifications,
      before.billingOrders,
      before.billingDiscounts,
      before.billingPlanBenefits,
      before.billingPlanVersions,
      before.billingPlans,
      before.billingFamilies,
    ]) {
      for (const row of tableRows) await ctx.db.delete(row._id);
    }

    const seeded = await seedCleanCatalogue(ctx, args.organizationId);
    const after = await rowsForReset(ctx, args.organizationId);
    if (after.billingOrders.length || after.pointGrants.length || after.billingDiscounts.length) {
      throw new Error("Billing reset verification failed: commercial state remains");
    }
    if (after.billingFamilies.length !== 2 || after.billingPlans.length !== 6 || after.billingPlanVersions.length !== 6 || after.billingPlanBenefits.length !== 24) {
      throw new Error("Billing reset verification failed: clean catalogue manifest is incomplete");
    }

    return {
      organizationId: args.organizationId,
      tenantName: tenant.name,
      before: beforeSummary,
      seeded,
      after: summary(after),
    };
  },
});
