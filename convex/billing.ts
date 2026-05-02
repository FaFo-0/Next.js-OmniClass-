import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";

export const listBillingRecords = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    await requirePermission(ctx, "billing.view");
    if (studentId) {
      return await ctx.db
        .query("billingRecords")
        .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
        .collect();
    }
    return await ctx.db.query("billingRecords").collect();
  },
});

export const getLatestBilling = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requirePermission(ctx, "billing.view");
    const records = await ctx.db
      .query("billingRecords")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .order("desc")
      .take(1);
    return records[0] ?? null;
  },
});

// Student-accessible: get my latest billing record
export const getMyBilling = query({
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return null;
    const records = await ctx.db
      .query("billingRecords")
      .withIndex("by_studentId", (q) => q.eq("studentId", user.externalId))
      .order("desc")
      .take(1);
    return records[0] ?? null;
  },
});

export const createBillingRecord = mutation({
  args: {
    studentId: v.string(),
    monthlyAmount: v.number(),
    teacherPayment: v.number(),
    lessonsPerMonth: v.optional(v.number()),
    paymentDate: v.optional(v.string()),
    renewalDate: v.optional(v.string()), // admin can override
    status: v.optional(v.union(v.literal("paid"), v.literal("unpaid"))), // admin can override
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "billing.edit");

    // Calculate renewal date: use explicit override, or paymentDate + 30 days
    let renewalDate: string;
    if (args.renewalDate) {
      renewalDate = args.renewalDate;
    } else {
      const baseDate = args.paymentDate ?? new Date().toISOString().slice(0, 10);
      const renewal = new Date(baseDate);
      renewal.setDate(renewal.getDate() + 30);
      renewalDate = renewal.toISOString().slice(0, 10);
    }

    // Status: use explicit override, or auto-detect
    const status = args.status ?? (args.paymentDate ? "paid" : "unpaid");

    await ctx.db.insert("billingRecords", {
      studentId: args.studentId,
      monthlyAmount: args.monthlyAmount,
      teacherPayment: args.teacherPayment,
      lessonsPerMonth: args.lessonsPerMonth,
      paymentDate: args.paymentDate,
      renewalDate,
      status,
      currency: args.currency ?? "KGS",
      notes: args.notes,
      createdAt: new Date().toISOString(),
    });
  },
});

export const updateBillingRecord = mutation({
  args: {
    id: v.id("billingRecords"),
    monthlyAmount: v.optional(v.number()),
    teacherPayment: v.optional(v.number()),
    lessonsPerMonth: v.optional(v.number()),
    paymentDate: v.optional(v.string()),
    renewalDate: v.optional(v.string()), // explicit override
    status: v.optional(v.union(v.literal("paid"), v.literal("unpaid"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requirePermission(ctx, "billing.edit");
    const patch: Record<string, unknown> = {};

    if (updates.monthlyAmount !== undefined) patch.monthlyAmount = updates.monthlyAmount;
    if (updates.teacherPayment !== undefined) patch.teacherPayment = updates.teacherPayment;
    if (updates.lessonsPerMonth !== undefined) patch.lessonsPerMonth = updates.lessonsPerMonth;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.status !== undefined) patch.status = updates.status;

    // Explicit renewalDate takes priority over auto-calculation
    if (updates.renewalDate !== undefined) {
      patch.renewalDate = updates.renewalDate;
    } else if (updates.paymentDate !== undefined) {
      // Auto-calculate renewal date from payment date
      const renewal = new Date(updates.paymentDate);
      renewal.setDate(renewal.getDate() + 30);
      patch.renewalDate = renewal.toISOString().slice(0, 10);
    }

    if (updates.paymentDate !== undefined) {
      patch.paymentDate = updates.paymentDate;
    }

    await ctx.db.patch(id, patch);
  },
});

export const markAsPaid = mutation({
  args: { id: v.id("billingRecords") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "billing.edit");
    const today = new Date().toISOString().slice(0, 10);
    const renewal = new Date(today);
    renewal.setDate(renewal.getDate() + 30);

    await ctx.db.patch(id, {
      status: "paid",
      paymentDate: today,
      renewalDate: renewal.toISOString().slice(0, 10),
    });
  },
});
