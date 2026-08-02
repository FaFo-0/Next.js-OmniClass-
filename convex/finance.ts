// The academy's money. One ledger, one rule: a row is written when money
// actually moves (or when the system can prove it moved), and it is never
// recomputed afterwards. The old dashboard revenue was derived live from
// current pack prices, which meant editing a price rewrote last month.
//
// Rows are either `auto` (a pack sale, a refund, an approved payroll run, the
// metered AI accrual) or `manual` (someone typing what they spent). Anything
// manual that repeats gets a reminder rather than a guess.

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

const CATEGORY = v.union(
  v.literal("pack_sale"),
  v.literal("refund"),
  v.literal("salary"),
  v.literal("ads"),
  v.literal("subscriptions"),
  v.literal("tools"),
  v.literal("rent"),
  v.literal("other")
);

const MANUAL_CATEGORY = v.union(
  v.literal("salary"),
  v.literal("ads"),
  v.literal("subscriptions"),
  v.literal("tools"),
  v.literal("rent"),
  v.literal("other")
);

export const CATEGORY_LABELS: Record<string, string> = {
  pack_sale: "Lesson packs",
  refund: "Refunds",
  salary: "Teacher salaries",
  ads: "Advertising",
  subscriptions: "Subscriptions",
  tools: "Tools & software",
  rent: "Rent",
  other: "Other",
};

function monthOf(date: string) {
  return date.slice(0, 7);
}

async function baseCurrencyOf(
  ctx: { db: { query: QueryCtx["db"]["query"] } },
  orgId: string
) {
  const settings = await ctx.db
    .query("tenantSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .unique();
  return settings?.baseCurrency ?? "USD";
}

/**
 * Write a ledger row from inside another mutation (a grant, a payroll run).
 * `sourceKey` makes it idempotent: the same sale can't be booked twice if a
 * mutation retries.
 */
export async function recordEntry(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    direction: "in" | "out";
    category:
      | "pack_sale"
      | "refund"
      | "salary"
      | "ads"
      | "subscriptions"
      | "tools"
      | "rent"
      | "other";
    amount: number;
    currency: string;
    amountBase?: number;
    date: string;
    note?: string;
    source: "auto" | "manual";
    sourceKey?: string;
    isEstimate?: boolean;
    teacherId?: string;
    studentId?: string;
    createdBy: string;
  }
) {
  if (args.sourceKey) {
    const existing = await ctx.db
      .query("financeEntries")
      .withIndex("by_organization_and_sourceKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("sourceKey", args.sourceKey)
      )
      .unique();
    if (existing) return existing._id;
  }
  return await ctx.db.insert("financeEntries", {
    organizationId: args.organizationId,
    direction: args.direction,
    category: args.category,
    amount: args.amount,
    currency: args.currency,
    amountBase: args.amountBase ?? args.amount,
    date: args.date,
    month: monthOf(args.date),
    note: args.note,
    source: args.source,
    sourceKey: args.sourceKey,
    isEstimate: args.isEstimate,
    teacherId: args.teacherId,
    studentId: args.studentId,
    createdBy: args.createdBy,
    createdAt: new Date().toISOString(),
  });
}

// ── Reading the books ────────────────────────────────────────────────

export const listEntries = query({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, { month }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const rows = month
      ? await ctx.db
          .query("financeEntries")
          .withIndex("by_organization_and_month", (q) =>
            q.eq("organizationId", orgId).eq("month", month)
          )
          .collect()
      : await ctx.db
          .query("financeEntries")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
          .order("desc")
          .take(200);
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  },
});

/**
 * A month's P&L, straight from the ledger. Categories are returned as they
 * are — no bucketing into "opex" fictions — because the admin entering the
 * rows is the one reading the report.
 */
export const monthSummary = query({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, { month }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const key = month ?? new Date().toISOString().slice(0, 7);
    const rows = await ctx.db
      .query("financeEntries")
      .withIndex("by_organization_and_month", (q) =>
        q.eq("organizationId", orgId).eq("month", key)
      )
      .collect();

    let income = 0;
    let costs = 0;
    let estimated = 0;
    const byCategory: Record<string, number> = {};
    for (const r of rows) {
      const signed = r.direction === "in" ? r.amountBase : -r.amountBase;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + signed;
      if (r.direction === "in") income += r.amountBase;
      else costs += r.amountBase;
      if (r.isEstimate) estimated += r.amountBase;
    }

    // Months that already have rows, so the picker only offers real ones.
    const all = await ctx.db
      .query("financeEntries")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const months = [...new Set(all.map((r) => r.month))].sort().reverse();
    if (!months.includes(key)) months.unshift(key);

    return {
      month: key,
      currency: await baseCurrencyOf(ctx, orgId),
      income: Math.round(income * 100) / 100,
      costs: Math.round(costs * 100) / 100,
      net: Math.round((income - costs) * 100) / 100,
      estimatedPortion: Math.round(estimated * 100) / 100,
      byCategory,
      entryCount: rows.length,
      months,
    };
  },
});

// ── Manual entries ───────────────────────────────────────────────────

export const addEntry = mutation({
  args: {
    direction: v.union(v.literal("in"), v.literal("out")),
    category: CATEGORY,
    amount: v.number(),
    currency: v.optional(v.string()),
    date: v.string(),
    note: v.optional(v.string()),
    teacherId: v.optional(v.string()),
    /** Satisfies a recurring reminder for its current period. */
    reminderId: v.optional(v.id("financeReminders")),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    if (!(args.amount > 0)) throw new Error("Amount must be more than zero");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("Bad date");
    const currency = args.currency ?? (await baseCurrencyOf(ctx, orgId));

    const id = await recordEntry(ctx, {
      organizationId: orgId,
      direction: args.direction,
      category: args.category,
      amount: args.amount,
      currency,
      date: args.date,
      note: args.note?.trim() || undefined,
      source: "manual",
      teacherId: args.teacherId,
      createdBy: user.externalId,
    });

    if (args.reminderId) {
      const reminder = await ctx.db.get(args.reminderId);
      if (reminder && reminder.organizationId === orgId) {
        await ctx.db.patch(args.reminderId, {
          lastSatisfiedPeriod: periodKeyFor(reminder, args.date),
        });
      }
    }
    return id;
  },
});

export const deleteEntry = mutation({
  args: { id: v.id("financeEntries") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) throw new Error("Entry not found");
    // Payroll rows are the receipt for a payment that was approved — deleting
    // one would leave the run claiming money that the books deny.
    if (row.payrollRunId) {
      throw new Error("This came from a payroll run — undo the run instead");
    }
    await ctx.db.delete(id);
  },
});

// ── Recurring reminders ──────────────────────────────────────────────

/** Which period a date belongs to for this reminder's cadence. */
function periodKeyFor(
  reminder: { cadence: string; onceDate?: string },
  date: string
) {
  if (reminder.cadence === "monthly") return date.slice(0, 7);
  if (reminder.cadence === "once") return reminder.onceDate ?? date;
  // Weekly: ISO-ish week key from the Monday of that date.
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Is the reminder's current period due yet, and has it been satisfied? */
export function reminderStatus(
  reminder: {
    cadence: string;
    dayOfMonth?: number;
    dayOfWeek?: number;
    onceDate?: string;
    lastSatisfiedPeriod?: string;
    isActive: boolean;
  },
  today: string
): { due: boolean; period: string } {
  const period = periodKeyFor(reminder as any, today);
  if (!reminder.isActive) return { due: false, period };
  if (reminder.lastSatisfiedPeriod === period) return { due: false, period };

  if (reminder.cadence === "monthly") {
    const dom = Number(today.slice(8, 10));
    return { due: dom >= (reminder.dayOfMonth ?? 1), period };
  }
  if (reminder.cadence === "weekly") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { due: dow === (reminder.dayOfWeek ?? 1), period };
  }
  return { due: !!reminder.onceDate && reminder.onceDate <= today, period };
}

export const listReminders = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const today = new Date().toISOString().slice(0, 10);
    const rows = await ctx.db
      .query("financeReminders")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows
      .map((r) => ({ ...r, ...reminderStatus(r, today) }))
      .sort((a, b) => Number(b.due) - Number(a.due) || a.label.localeCompare(b.label));
  },
});

export const upsertReminder = mutation({
  args: {
    id: v.optional(v.id("financeReminders")),
    label: v.string(),
    category: MANUAL_CATEGORY,
    expectedAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    cadence: v.union(v.literal("monthly"), v.literal("weekly"), v.literal("once")),
    dayOfMonth: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    onceDate: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...args }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    if (!args.label.trim()) throw new Error("Give it a name");
    if (args.cadence === "monthly") {
      const d = args.dayOfMonth ?? 1;
      if (d < 1 || d > 28) throw new Error("Day of month must be 1–28");
    }
    const currency = args.currency ?? (await baseCurrencyOf(ctx, orgId));
    const patch = {
      label: args.label.trim(),
      category: args.category,
      expectedAmount: args.expectedAmount,
      currency,
      cadence: args.cadence,
      dayOfMonth: args.cadence === "monthly" ? (args.dayOfMonth ?? 1) : undefined,
      dayOfWeek: args.cadence === "weekly" ? (args.dayOfWeek ?? 1) : undefined,
      onceDate: args.cadence === "once" ? args.onceDate : undefined,
      isActive: args.isActive ?? true,
    };
    if (id) {
      const row = await ctx.db.get(id);
      if (!row || row.organizationId !== orgId) throw new Error("Reminder not found");
      await ctx.db.patch(id, patch);
      return id;
    }
    return await ctx.db.insert("financeReminders", {
      organizationId: orgId,
      ...patch,
      createdAt: new Date().toISOString(),
    });
  },
});

export const deleteReminder = mutation({
  args: { id: v.id("financeReminders") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) throw new Error("Reminder not found");
    await ctx.db.delete(id);
  },
});

/** Marks the current period done without an amount (e.g. "no ads this month"). */
export const skipReminderPeriod = mutation({
  args: { id: v.id("financeReminders") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) throw new Error("Reminder not found");
    const today = new Date().toISOString().slice(0, 10);
    await ctx.db.patch(id, { lastSatisfiedPeriod: periodKeyFor(row, today) });
  },
});

/** Everything waiting to be typed in — read by the attention page. */
export const dueReminders = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const today = new Date().toISOString().slice(0, 10);
    const rows = await ctx.db
      .query("financeReminders")
      .withIndex("by_organization_and_active", (q) =>
        q.eq("organizationId", orgId).eq("isActive", true)
      )
      .collect();
    return rows
      .map((r) => ({ ...r, ...reminderStatus(r, today) }))
      .filter((r) => r.due)
      .map((r) => ({
        _id: r._id,
        label: r.label,
        category: r.category,
        expectedAmount: r.expectedAmount ?? null,
        currency: r.currency,
        period: r.period,
      }));
  },
});

// ── Crons ────────────────────────────────────────────────────────────

/** Nag admins once per period about money that has to be typed in. */
export const notifyDueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    const reminders = await ctx.db.query("financeReminders").collect();
    let sent = 0;
    for (const r of reminders) {
      const { due, period } = reminderStatus(r, today);
      if (!due || r.lastNotifiedPeriod === period) continue;
      const admins = await ctx.db
        .query("users")
        .withIndex("by_organization_and_role", (q) =>
          q.eq("organizationId", r.organizationId).eq("role", "admin")
        )
        .collect();
      for (const admin of admins) {
        await ctx.db.insert("notifications", {
          organizationId: r.organizationId,
          recipientId: admin.externalId,
          kind: "finance_entry_due",
          payload: {
            label: r.label,
            category: r.category,
            expectedAmount: r.expectedAmount,
            currency: r.currency,
            period,
          },
          link: "/admin/billing?tab=expenses",
          createdAt: new Date().toISOString(),
        });
        sent++;
      }
      await ctx.db.patch(r._id, { lastNotifiedPeriod: period });
    }
    return { sent };
  },
});

/**
 * Transcription is the one cost the system can measure itself: lessons taught
 * × the Soniox rate on Settings. Booked once per month per org and clearly
 * flagged as an estimate — it is a meter reading, not an invoice.
 */
export const accrueAiCosts = internalMutation({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, { month }) => {
    // Default: the month that just ended.
    const now = new Date();
    const target =
      month ??
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
        .toISOString()
        .slice(0, 7);

    const orgs = await ctx.db.query("tenantSettings").collect();
    let written = 0;
    for (const settings of orgs) {
      const orgId = settings.organizationId;
      const events = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_organization_and_status", (q) =>
          q.eq("organizationId", orgId).eq("status", "completed")
        )
        .collect();
      const lessons = events.filter(
        (e) => !e.isDeleted && e.date.slice(0, 7) === target
      ).length;
      if (lessons === 0) continue;

      const perLesson =
        (settings.ai?.sonioxCostPerMinute ?? 0.008) *
        (settings.ai?.avgLessonMinutes ?? 60);
      const amount = Math.round(lessons * perLesson * 100) / 100;
      if (amount <= 0) continue;

      await recordEntry(ctx, {
        organizationId: orgId,
        direction: "out",
        category: "tools",
        amount,
        currency: settings.baseCurrency ?? "USD",
        date: `${target}-28`,
        note: `Transcription for ${lessons} lesson${lessons === 1 ? "" : "s"} (metered estimate)`,
        source: "auto",
        sourceKey: `ai:${target}`,
        isEstimate: true,
        createdBy: "system",
      });
      written++;
    }
    return { written, month: target };
  },
});
