import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireTenantPermission, ACADEMY_ID } from "./lib/tenant";
import { bookedAmount, convertMoney, moneyRate } from "./lib/money";

/** Signed-out currency choices; never expose the complete provider feed. */
export const publicSettings = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID)).unique();
    const enabledCurrencies = row?.enabledCurrencies ?? ["USD", "KZT"];
    const cached: Record<string, number> = { KZT: 1, ...row?.fxRatesKzt };
    const rates = Object.fromEntries(enabledCurrencies.filter(code => Number.isFinite(cached[code]) && cached[code] > 0).map(code => [code, cached[code]]));
    return { enabledCurrencies, rates, rateUpdatedAt: row?.fxRatesUpdatedAt ?? null, source: row?.fxRatesSource ?? "Manual" };
  },
});

export const configure = mutation({
  args: { enabledCurrencies: v.array(v.string()) },
  handler: async (ctx, { enabledCurrencies }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const row = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", orgId)).unique();
    if (!row) throw new Error("Academy settings missing");
    const selected = [...new Set(enabledCurrencies)];
    if (!selected.includes("USD")) throw new Error("USD must remain enabled");
    const rates: Record<string, number> = { KZT: 1, ...row.fxRatesKzt };
    for (const code of selected) {
      if (!/^[A-Z]{3}$/.test(code) || !Number.isFinite(rates[code]) || rates[code] <= 0) throw new Error(`No exchange rate available for ${code}`);
    }
    await ctx.db.patch(row._id, { enabledCurrencies: selected, updatedAt: new Date().toISOString() });
  },
});

export const settings = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const row = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", orgId)).unique();
    const rates: Record<string, number> = { KZT: 1, ...row?.fxRatesKzt };
    return { enabledCurrencies: row?.enabledCurrencies ?? ["USD", "KZT"], availableCurrencies: Object.keys(rates).sort(), baseCurrency: row?.baseCurrency ?? "KZT", rates, rateUpdatedAt: row?.fxRatesUpdatedAt ?? null, source: row?.fxRatesSource ?? "Manual" };
  },
});

/** Enter documented historical reference rates without changing today's feed. */
export const recordHistoricalRate = mutation({
  args: { date: v.string(), currency: v.string(), usdPerUnit: v.number(), source: v.string() },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const instant = new Date(`${args.date}T00:00:00Z`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== args.date || args.date > today) throw new Error("Choose a valid transaction date that is not in the future");
    const code = args.currency.toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(code) || code === "USD") throw new Error("Choose a non-USD currency code");
    if (!Number.isFinite(args.usdPerUnit) || args.usdPerUnit <= 0) throw new Error("USD per unit must be greater than zero");
    const source = args.source.trim();
    if (!source || source.length > 300) throw new Error("Enter a documented rate source (up to 300 characters)");
    const existing = await ctx.db.query("fxDaily").withIndex("by_organization_and_date", q => q.eq("organizationId", orgId).eq("date", args.date)).unique();
    if (!existing && code !== "KZT") throw new Error("Enter this date's KZT rate first, then enter another currency");
    let rates: Record<string, number> = { ...existing?.rates };
    if (code === "KZT") {
      const anchor = 1 / args.usdPerUnit;
      if (existing?.rates.USD) rates = Object.fromEntries(Object.entries(existing.rates).map(([currency, rate]) => [currency, rate * anchor / existing.rates.USD]));
      rates.USD = anchor;
      rates.KZT = 1;
    } else {
      if (!Number.isFinite(rates.USD) || rates.USD <= 0) throw new Error("This date has no USD reference rate");
      rates[code] = args.usdPerUnit * rates.USD;
    }
    for (const rate of Object.values(rates)) if (!Number.isFinite(rate) || rate <= 0) throw new Error("Rate is outside the supported range");
    const fields = { rates, source: `Manual ${code}: ${source}`, effectiveAt: `${args.date}T00:00:00.000Z` };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("fxDaily", { organizationId: orgId, date: args.date, ...fields });
    return { saved: true };
  },
});

export const update = mutation({
  args: { baseCurrency: v.union(v.literal("KZT"), v.literal("USD")), usdToKzt: v.number() },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    if (args.baseCurrency !== "USD") throw new Error("The accounting base is USD");
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

/** Additive USD cutover; preserves existing prices and financial provenance. */
export const initializeUsd = internalMutation({
  args: {},
  handler: async ctx => {
    const row = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID)).unique();
    if (!row?.fxRatesKzt?.USD) throw new Error("Fetch rates before initializing USD");
    for await (const entry of ctx.db.query("financeEntries").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID))) bookedAmount(entry, "USD");
    for await (const run of ctx.db.query("payrollRuns").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID))) bookedAmount({ ...run, amountBase: run.amountBase ?? run.amount }, "USD");
    for await (const teacher of ctx.db.query("users").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID))) {
      if (teacher.payoutPerLesson !== undefined && !teacher.payoutCurrency) await ctx.db.patch(teacher._id, { payoutCurrency: row.baseCurrency });
    }
    for await (const pack of ctx.db.query("packs").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID))) {
      if (pack.currency === "USD") continue;
      const originalCurrency = pack.currency;
      const price = convertMoney(pack.price, originalCurrency, "USD", row.fxRatesKzt);
      await ctx.db.patch(pack._id, { currency: "USD", price, salePrice: pack.salePrice === undefined ? undefined : convertMoney(pack.salePrice, originalCurrency, "USD", row.fxRatesKzt), fixedPrices: { ...pack.fixedPrices, [originalCurrency]: pack.price } });
    }
    await ctx.db.patch(row._id, { baseCurrency: "USD", defaultPayoutCurrency: row.defaultPayoutCurrency ?? row.baseCurrency, enabledCurrencies: row.enabledCurrencies ?? ["USD", "KZT"] });
    return { baseCurrency: "USD", deletedRecords: 0 };
  },
});
