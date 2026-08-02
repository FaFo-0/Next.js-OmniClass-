// Teacher pay. The model (FaFo, 2026-08-02): a flat amount per lesson done,
// set per teacher, falling back to the academy default.
//
// A payroll run stores the exact lesson ids it paid for. That single decision
// is what makes "unpaid" self-correcting: it is always "payable lessons minus
// lessons already inside a run", so approving a payment resets the counter
// without a reset button, a partial month works, and the same lesson can
// never be paid twice — even if a lesson is later completed retroactively.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import { recordEntry } from "./finance";

/** POLICY §4 — the teacher held the hour either way. */
function isPayable(status: string) {
  return status === "completed" || status === "no_show_student";
}

function monthBounds(month: string) {
  return { from: `${month}-01`, to: `${month}-31` };
}

/**
 * Payroll for a month: every teacher, what they're owed, what's been paid.
 * Nothing is written — this is the sheet an admin reads before approving.
 */
export const monthPayroll = query({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, { month }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const key = month ?? new Date().toISOString().slice(0, 7);
    const { from, to } = monthBounds(key);

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const currency = settings?.baseCurrency ?? "USD";
    const defaultRate = settings?.defaultPayoutPerLesson ?? 0;

    const teachers = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "teacher")
      )
      .collect();

    const runs = await ctx.db
      .query("payrollRuns")
      .withIndex("by_organization_and_month", (q) =>
        q.eq("organizationId", orgId).eq("month", key)
      )
      .collect();

    const rows = [];
    for (const t of teachers) {
      const events = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_organization_and_teacherId", (q) =>
          q.eq("organizationId", orgId).eq("teacherId", t.externalId)
        )
        .collect();
      const payable = events.filter(
        (e) =>
          !e.isDeleted &&
          e.type !== "placeholder" &&
          isPayable(e.status) &&
          e.date >= from &&
          e.date <= to
      );

      const teacherRuns = runs.filter((r) => r.teacherId === t.externalId);
      const paidIds = new Set<string>();
      for (const r of teacherRuns) for (const id of r.lessonEventIds) paidIds.add(id);

      const unpaid = payable.filter((e) => !paidIds.has(e._id));
      const rate = t.payoutPerLesson ?? defaultRate;

      rows.push({
        teacherId: t.externalId,
        name: t.name,
        email: t.email,
        rate,
        rateIsDefault: t.payoutPerLesson === undefined,
        lessonsPayable: payable.length,
        lessonsPaid: payable.length - unpaid.length,
        lessonsUnpaid: unpaid.length,
        amountUnpaid: Math.round(unpaid.length * rate * 100) / 100,
        amountPaid: teacherRuns.reduce((s, r) => s + r.amount, 0),
        lastPaidAt: teacherRuns.map((r) => r.paidAt).sort().at(-1) ?? null,
        runs: teacherRuns
          .map((r) => ({
            _id: r._id,
            lessonCount: r.lessonCount,
            amount: r.amount,
            paidAt: r.paidAt,
            note: r.note ?? null,
          }))
          .sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
      });
    }
    rows.sort((a, b) => b.amountUnpaid - a.amountUnpaid || a.name.localeCompare(b.name));

    return {
      month: key,
      currency,
      defaultRate,
      rows,
      totals: {
        unpaid: Math.round(rows.reduce((s, r) => s + r.amountUnpaid, 0) * 100) / 100,
        paid: Math.round(rows.reduce((s, r) => s + r.amountPaid, 0) * 100) / 100,
        lessonsUnpaid: rows.reduce((s, r) => s + r.lessonsUnpaid, 0),
      },
      // Teachers with no rate anywhere would be paid zero — say so instead of
      // quietly settling nothing.
      missingRates: rows.filter((r) => r.rate <= 0).map((r) => r.name),
    };
  },
});

/**
 * Approve and settle what a teacher is owed for a month. Writes the run (with
 * its lesson ids) and the matching salary row in the ledger, in one
 * transaction — the books and the payroll can't disagree.
 */
export const payTeacher = mutation({
  args: {
    teacherId: v.string(),
    month: v.string(),
    note: v.optional(v.string()),
    /** Guard against paying a number the admin didn't actually see. */
    expectedLessons: v.optional(v.number()),
  },
  handler: async (ctx, { teacherId, month, note, expectedLessons }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const { from, to } = monthBounds(month);

    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", teacherId)
      )
      .unique();
    if (!teacher || teacher.role !== "teacher") throw new Error("Teacher not found");

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const currency = settings?.baseCurrency ?? "USD";
    const rate = teacher.payoutPerLesson ?? settings?.defaultPayoutPerLesson ?? 0;
    if (rate <= 0) {
      throw new Error("Set a per-lesson rate for this teacher first");
    }

    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId)
      )
      .collect();
    const payable = events.filter(
      (e) =>
        !e.isDeleted &&
        e.type !== "placeholder" &&
        isPayable(e.status) &&
        e.date >= from &&
        e.date <= to
    );

    const runs = await ctx.db
      .query("payrollRuns")
      .withIndex("by_organization_and_month", (q) =>
        q.eq("organizationId", orgId).eq("month", month)
      )
      .collect();
    const paidIds = new Set<string>();
    for (const r of runs) {
      if (r.teacherId !== teacherId) continue;
      for (const id of r.lessonEventIds) paidIds.add(id);
    }

    const unpaid = payable.filter((e) => !paidIds.has(e._id));
    if (unpaid.length === 0) throw new Error("Nothing outstanding for this month");
    if (expectedLessons !== undefined && expectedLessons !== unpaid.length) {
      throw new Error(
        `This teacher now has ${unpaid.length} unpaid lesson${unpaid.length === 1 ? "" : "s"}, not ${expectedLessons}. Reload and check.`
      );
    }

    const amount = Math.round(unpaid.length * rate * 100) / 100;
    const paidAt = new Date().toISOString();
    const runId = await ctx.db.insert("payrollRuns", {
      organizationId: orgId,
      teacherId,
      month,
      lessonEventIds: unpaid.map((e) => e._id as Id<"scheduleEvents">),
      lessonCount: unpaid.length,
      ratePerLesson: rate,
      currency,
      amount,
      note: note?.trim() || undefined,
      paidAt,
      paidBy: user.externalId,
      createdAt: paidAt,
    });

    const entryId = await recordEntry(ctx, {
      organizationId: orgId,
      direction: "out",
      category: "salary",
      amount,
      currency,
      date: paidAt.slice(0, 10),
      note: `${teacher.name} — ${unpaid.length} lesson${unpaid.length === 1 ? "" : "s"} (${month})`,
      source: "auto",
      sourceKey: `payroll:${runId}`,
      teacherId,
      createdBy: user.externalId,
    });
    await ctx.db.patch(entryId, { payrollRunId: runId });

    await ctx.db.insert("notifications", {
      organizationId: orgId,
      recipientId: teacherId,
      kind: "salary_paid",
      payload: { amount, currency, lessons: unpaid.length, month },
      link: "/teacher/profile",
      createdAt: paidAt,
    });

    return { runId, amount, lessons: unpaid.length };
  },
});

/** Undo a run — payment didn't go through, or it was the wrong teacher. */
export const undoRun = mutation({
  args: { runId: v.id("payrollRuns") },
  handler: async (ctx, { runId }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const run = await ctx.db.get(runId);
    if (!run || run.organizationId !== orgId) throw new Error("Run not found");

    const entry = await ctx.db
      .query("financeEntries")
      .withIndex("by_organization_and_sourceKey", (q) =>
        q.eq("organizationId", orgId).eq("sourceKey", `payroll:${runId}`)
      )
      .unique();
    if (entry) await ctx.db.delete(entry._id);
    await ctx.db.delete(runId);
  },
});

/** What one teacher sees on their own profile. */
export const myPayroll = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    // Not a permission-gated report: a teacher always sees their own pay, an
    // admin sees anyone's. ("lessons.view.own" isn't in the admin role, so
    // gating on it locked admins out of the teacher page.)
    const { orgId, user } = await requireTenant(ctx);
    const target = teacherId ?? user.externalId;
    if (target !== user.externalId && user.role !== "admin") {
      throw new Error("Not your payroll");
    }
    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", target)
      )
      .unique();
    if (!teacher || teacher.role !== "teacher") return null;

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const currency = settings?.baseCurrency ?? "USD";
    const rate = teacher.payoutPerLesson ?? settings?.defaultPayoutPerLesson ?? 0;

    const month = new Date().toISOString().slice(0, 7);
    const { from, to } = monthBounds(month);
    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    const payable = events.filter(
      (e) =>
        !e.isDeleted &&
        e.type !== "placeholder" &&
        isPayable(e.status) &&
        e.date >= from &&
        e.date <= to
    );

    const runs = await ctx.db
      .query("payrollRuns")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    const paidIds = new Set<string>();
    for (const r of runs) {
      if (r.month !== month) continue;
      for (const id of r.lessonEventIds) paidIds.add(id);
    }
    const unpaid = payable.filter((e) => !paidIds.has(e._id));
    const lastRun = [...runs].sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];

    return {
      month,
      currency,
      rate,
      lessonsThisMonth: payable.length,
      lessonsUnpaid: unpaid.length,
      amountUnpaid: Math.round(unpaid.length * rate * 100) / 100,
      lastPayment: lastRun
        ? {
            amount: lastRun.amount,
            lessons: lastRun.lessonCount,
            paidAt: lastRun.paidAt,
            month: lastRun.month,
          }
        : null,
    };
  },
});

/** Per-teacher rate, set from the teacher page or Payroll. */
export const setTeacherRate = mutation({
  args: {
    teacherId: v.string(),
    // null clears the override → the academy default applies.
    ratePerLesson: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { teacherId, ratePerLesson }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    if (ratePerLesson !== null && ratePerLesson < 0) throw new Error("Rate can't be negative");
    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", teacherId)
      )
      .unique();
    if (!teacher || teacher.role !== "teacher") throw new Error("Teacher not found");
    await ctx.db.patch(teacher._id, {
      payoutPerLesson: ratePerLesson === null ? undefined : ratePerLesson,
    });
  },
});
