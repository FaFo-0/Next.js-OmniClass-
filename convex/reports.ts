// Admin dashboard values are derived from immutable billing orders and their
// finance/grant provenance. Administrative credits are reported separately;
// they never invent commercial revenue.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

export const monthlyStats = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const monthStart = `${month}-01T00:00:00.000Z`;

    const [financeEntries, grants, events, transactions, students] = await Promise.all([
      ctx.db.query("financeEntries")
        .withIndex("by_organization_and_month", (q) => q.eq("organizationId", orgId).eq("month", month))
        .collect(),
      ctx.db.query("pointGrants")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect(),
      ctx.db.query("scheduleEvents")
        .withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", "completed"))
        .collect(),
      ctx.db.query("pointTransactions")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect(),
      ctx.db.query("users")
        .withIndex("by_organization_and_role", (q) => q.eq("organizationId", orgId).eq("role", "student"))
        .collect(),
    ]);

    const revenueBase = financeEntries
      .filter((entry) => entry.direction === "in" && entry.category === "pack_sale" && Boolean(entry.billingOrderId))
      .reduce((sum, entry) => sum + entry.amountBase, 0);
    const lessonsSold = grants
      .filter((grant) => grant.source === "purchase" && Boolean(grant.billingOrderId) && grant.purchasedAt >= monthStart)
      .reduce((sum, grant) => sum + grant.points, 0);
    const manualLessons = grants
      .filter((grant) => grant.source !== "purchase" && grant.purchasedAt >= monthStart)
      .reduce((sum, grant) => sum + grant.points, 0);
    const lessonsDelivered = events.filter((event) => !event.isDeleted && event.date >= `${month}-01`).length;
    const lessonsSpent = transactions
      .filter((transaction) => transaction.createdAt >= monthStart && transaction.type === "spend")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

    const statusCounts = { active: 0, trial: 0, paused: 0, cancelled: 0 };
    let newThisMonth = 0;
    for (const student of students) {
      const status = (student.studentStatus ?? "active") as keyof typeof statusCounts;
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      if (student.createdAt >= monthStart) newThisMonth += 1;
    }

    return {
      month,
      revenueUSD: Math.round(revenueBase * 100) / 100,
      lessonsSold,
      manualLessons,
      lessonsDelivered,
      lessonsSpent,
      statusCounts,
      newThisMonth,
    };
  },
});

/**
 * Teacher earnings use the immutable commercial snapshots attached to canonical
 * purchase grants. It does not estimate from today's catalogue price.
 */
export const teacherEarnings = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") throw new Error("Teachers only");

    const targetId = teacherId ?? user.externalId;
    if (user.role !== "admin" && targetId !== user.externalId) throw new Error("Not your earnings");
    const target = await ctx.db.query("users")
      .withIndex("by_organization_and_externalId", (q) => q.eq("organizationId", orgId).eq("externalId", targetId))
      .unique();
    if (!target || target.role !== "teacher") return null;

    const [settings, events, grants] = await Promise.all([
      ctx.db.query("tenantSettings").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).unique(),
      ctx.db.query("scheduleEvents").withIndex("by_organization_and_teacherId", (q) => q.eq("organizationId", orgId).eq("teacherId", targetId)).collect(),
      ctx.db.query("pointGrants").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).collect(),
    ]);
    const rate = target.payoutRateOverride ?? 0.3;
    const monthKey = new Date().toISOString().slice(0, 7);
    const payable = (status: string) => status === "completed" || status === "no_show_student";
    const payableEvents = events.filter((event) => !event.isDeleted && event.type !== "placeholder" && payable(event.status));
    const monthLessons = payableEvents.filter((event) => event.date.slice(0, 7) === monthKey).length;

    const pricedGrants = grants.filter((grant) =>
      grant.source === "purchase" &&
      Boolean(grant.billingOrderId) &&
      Boolean(grant.priceSnapshot) &&
      grant.points > 0,
    );
    const avgLessonUSD = pricedGrants.length
      ? pricedGrants.reduce((sum, grant) => sum + (grant.priceSnapshot!.netAmount / grant.points), 0) / pricedGrants.length
      : 0;
    const upcoming = events.filter((event) =>
      !event.isDeleted &&
      event.type !== "placeholder" &&
      (event.status === "scheduled" || event.status === "makeup") &&
      event.date >= new Date().toISOString().slice(0, 10),
    ).length;

    return {
      rate,
      currency: settings?.baseCurrency ?? "KZT",
      avgLessonUSD,
      monthEarningsUSD: avgLessonUSD > 0 ? monthLessons * avgLessonUSD * rate : null,
      monthLessons,
      allTimeLessons: payableEvents.length,
      upcoming,
    };
  },
});
