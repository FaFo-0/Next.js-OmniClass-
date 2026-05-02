import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { requirePermission } from "./lib/auth";
import { api } from "./_generated/api";

export const getRate = query({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
  },
  handler: async (ctx, { fromCurrency, toCurrency }) => {
    await requirePermission(ctx, "billing.view");
    const rates = await ctx.db.query("exchangeRates").collect();
    return rates.find(
      (r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency
    ) ?? null;
  },
});

export const setRate = mutation({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    isManual: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "billing.edit");
    const existing = (await ctx.db.query("exchangeRates").collect()).find(
      (r) => r.fromCurrency === args.fromCurrency && r.toCurrency === args.toCurrency
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        rate: args.rate,
        isManual: args.isManual ?? true,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await ctx.db.insert("exchangeRates", {
        fromCurrency: args.fromCurrency,
        toCurrency: args.toCurrency,
        rate: args.rate,
        isManual: args.isManual ?? true,
        updatedAt: new Date().toISOString(),
      });
    }
  },
});

// Action to fetch rate from a free API and save it
export const fetchAndSaveRate = action({
  args: {},
  handler: async (ctx) => {
    try {
      // Use exchangerate-api.com (free tier)
      const response = await fetch(
        "https://open.er-api.com/v6/latest/USD"
      );
      const data = await response.json();

      if (data.result === "success" && data.rates?.KGS) {
        await ctx.runMutation(api.exchangeRates.setRate, {
          fromCurrency: "KGS",
          toCurrency: "USD",
          rate: data.rates.KGS, // e.g., 87.5 KGS per 1 USD
          isManual: false,
        });
        return { success: true, rate: data.rates.KGS };
      }
      return { success: false, error: "Rate not found in response" };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
});
