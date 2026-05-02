import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requirePermission } from "./lib/auth";

const categoryValidator = v.union(
  v.literal("ads"),
  v.literal("subscriptions"),
  v.literal("salary"),
  v.literal("trial_lessons"),
  v.literal("other")
);

export const listExpenses = query({
  args: {
    startDate: v.optional(v.string()), // YYYY-MM-DD
    endDate: v.optional(v.string()),   // YYYY-MM-DD
  },
  handler: async (ctx, { startDate, endDate }) => {
    await requirePermission(ctx, "billing.edit");
    let expenses = await ctx.db.query("expenses").collect();

    if (startDate) {
      expenses = expenses.filter((e) => e.date >= startDate);
    }
    if (endDate) {
      expenses = expenses.filter((e) => e.date <= endDate);
    }

    return expenses.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const createExpense = mutation({
  args: {
    category: categoryValidator,
    amount: v.number(),
    date: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "billing.edit");
    await ctx.db.insert("expenses", {
      category: args.category,
      amount: args.amount,
      date: args.date,
      note: args.note,
      createdAt: new Date().toISOString(),
    });
  },
});

export const updateExpense = mutation({
  args: {
    id: v.id("expenses"),
    category: v.optional(categoryValidator),
    amount: v.optional(v.number()),
    date: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requirePermission(ctx, "billing.edit");
    const patch: Record<string, unknown> = {};
    if (updates.category !== undefined) patch.category = updates.category;
    if (updates.amount !== undefined) patch.amount = updates.amount;
    if (updates.date !== undefined) patch.date = updates.date;
    if (updates.note !== undefined) patch.note = updates.note;
    await ctx.db.patch(id, patch);
  },
});

export const deleteExpense = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "billing.edit");
    await ctx.db.delete(id);
  },
});
