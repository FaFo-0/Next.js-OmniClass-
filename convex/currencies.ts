import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireTenantPermission, ACADEMY_ID } from "./lib/tenant";
import { bookedAmount, convertMoney, moneyRate } from "./lib/money";

export const settings = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const row = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", orgId)).unique();
    const rates: Record<string, number> = { KZT: 1, ...row?.fxRatesKzt };
    return { baseCurrency: row?.baseCurrency ?? "KZT", rates, rateUpdatedAt: row?.fxRatesUpdatedAt ?? null, source: row?.fxRatesSource ?? "Manual" };
  },
});

export const update = mutation({
  args: { baseCurrency: v.union(v.literal("KZT"), v.literal("USD")), usdToKzt: v.number() },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    if (!Number.isFinite(args.usdToKzt) || args.usdToKzt <= 0) throw new Error("USD rate must be greater than zero");
    const row = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", orgId)).unique();
    if (!row) throw new Error("Academy settings missing");
    const rates = { ...row.fxRatesKzt, KZT: 1, USD: args.usdToKzt };
    moneyRate("USD", args.baseCurrency, rates);
    if (row.baseCurrency !== args.baseCurrency) {
      // Prove historical rows can be reported in the new base without relabeling them.
      for await (const entry of ctx.db.query("financeEntries").withIndex("by_organization", q => q.eq("organizationId", orgId))) bookedAmount(entry, args.baseCurrency);
      for await (const run of ctx.db.query("payrollRuns").withIndex("by_organization", q => q.eq("organizationId", orgId))) bookedAmount({ ...run, amountBase: run.amountBase ?? run.amount }, args.baseCurrency);
      // Pin pre-existing rate agreements before changing their default unit.
      for await (const teacher of ctx.db.query("users").withIndex("by_organization", q => q.eq("organizationId", orgId))) {
        if (teacher.payoutPerLesson !== undefined && !teacher.payoutCurrency) await ctx.db.patch(teacher._id, { payoutCurrency: row.baseCurrency });
      }
    }
    await ctx.db.patch(row._id, { baseCurrency: args.baseCurrency, defaultPayoutCurrency: row.defaultPayoutCurrency ?? row.baseCurrency, fxRatesKzt: rates, fxRatesUpdatedAt: new Date().toISOString(), fxRatesSource: "Manual", updatedAt: new Date().toISOString() });
    return { saved: true };
  },
});

/** One-time, tenant-scoped reset explicitly authorized by FaFo. No public reset button. */
export const resetToKzt = internalMutation({
  args: { usdToKzt: v.number(), confirm: v.literal("reset-old-money-and-teacher-rates") },
  handler: async (ctx, { usdToKzt }) => {
    convertMoney(1, "USD", "KZT", { USD: usdToKzt });
    const row = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID)).unique();
    if (!row) throw new Error("Academy settings missing");
    if (row.moneyResetAt) return { alreadyReset: true, resetAt: row.moneyResetAt };
    const entries = await ctx.db.query("financeEntries").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID)).take(500);
    const runs = await ctx.db.query("payrollRuns").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID)).take(500);
    if (entries.length === 500 || runs.length === 500) throw new Error("Reset needs batching before running on this data volume");
    for (const entry of entries) await ctx.db.delete(entry._id);
    for (const run of runs) await ctx.db.delete(run._id);
    let teachers = 0;
    for await (const user of ctx.db.query("users").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID))) {
      if (user.payoutPerLesson !== undefined || user.payoutRateOverride !== undefined || user.payoutCurrency !== undefined) {
        await ctx.db.patch(user._id, { payoutPerLesson: undefined, payoutRateOverride: undefined, payoutCurrency: undefined }); teachers++;
      }
    }
    // Reminder amounts retain their original currencies; they are not ledger history.
    for await (const reminder of ctx.db.query("financeReminders").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID))) await ctx.db.patch(reminder._id, { lastSatisfiedPeriod: undefined });
    // Old billing records remain useful as purchase history, without dangling receipt ids.
    for await (const order of ctx.db.query("billingOrders").withIndex("by_organization_and_status", q => q.eq("organizationId", ACADEMY_ID))) {
      if (order.financeEntryId) await ctx.db.patch(order._id, { financeEntryId: undefined });
    }
    for await (const notification of ctx.db.query("notifications").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID))) {
      if (notification.kind === "salary_paid") await ctx.db.delete(notification._id);
    }
    const now = new Date().toISOString();
    await ctx.db.patch(row._id, { baseCurrency: "KZT", defaultPayoutPerLesson: undefined, defaultPayoutCurrency: "KZT", fxRatesKzt: { KZT: 1, USD: usdToKzt }, fxRatesUpdatedAt: now, fxRatesSource: "National Bank of Kazakhstan · 2026-10-08", moneyResetAt: now, updatedAt: now });
    return { entriesDeleted: entries.length, payrollRunsDeleted: runs.length, teacherRatesCleared: teachers, baseCurrency: "KZT", usdToKzt };
  },
});
