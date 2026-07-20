// POLICY §7 — admin retention triage. At ~50 students an admin who can read
// a good list beats an auto-status machine, so this query surfaces the four
// signals that need a human decision. It NEVER transitions a student.

import { query } from "./_generated/server";
import { requireTenantPermission } from "./lib/tenant";
import type { Id } from "./_generated/dataModel";

const DORMANT_DAYS = 14; // no completed lesson in this many days → surface
const EXPIRY_WARN_DAYS = 14; // credits lapsing within this window → surface

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  if (Number.isNaN(from)) return Infinity;
  return Math.floor((to.getTime() - from) / 86_400_000);
}

export const adminAttention = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "users.view.any");
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const warnCutoff = new Date(today.getTime() + EXPIRY_WARN_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const students = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "student")
      )
      .collect();
    const nameOf = new Map(students.map((s) => [s.externalId, s.name]));

    // Balance per student (unexpired grants) — one pass over the org's grants.
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const balanceOf = new Map<string, number>();
    const expiringSoon: {
      studentId: string;
      studentName: string | null;
      lessons: number;
      expiresAt: string;
    }[] = [];
    for (const g of grants) {
      if (g.isExpired || g.remainingPoints <= 0 || g.expiresAt < todayStr) continue;
      balanceOf.set(g.studentId, (balanceOf.get(g.studentId) ?? 0) + g.remainingPoints);
      // Only activated grants have a real clock (POLICY §2); NO_EXPIRY never warns.
      if (g.activatedAt && g.expiresAt <= warnCutoff) {
        expiringSoon.push({
          studentId: g.studentId,
          studentName: nameOf.get(g.studentId) ?? null,
          lessons: g.remainingPoints,
          expiresAt: g.expiresAt,
        });
      }
    }
    expiringSoon.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

    // Dormant: an active/trial student with credit but no recent lesson is
    // the one to nudge — they've paid and gone quiet. Paused/cancelled are
    // excluded (paused is deliberate; cancelled is gone).
    const dormant: {
      studentId: string;
      studentName: string;
      balance: number;
      lastLessonDate: string | null;
      daysSince: number | null;
    }[] = [];
    for (const s of students) {
      const status = s.studentStatus ?? "active";
      if (status === "paused" || status === "cancelled") continue;
      const balance = balanceOf.get(s.externalId) ?? 0;
      if (balance <= 0) continue; // no credit → nothing to retain yet

      const events = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", s.externalId)
        )
        .collect();
      let lastLessonDate: string | null = null;
      for (const e of events) {
        if (e.isDeleted || e.status !== "completed") continue;
        if (lastLessonDate === null || e.date > lastLessonDate) lastLessonDate = e.date;
      }
      const daysSince = lastLessonDate ? daysBetween(lastLessonDate, today) : null;
      // Never-attended or quiet ≥ threshold.
      if (daysSince === null || daysSince >= DORMANT_DAYS) {
        dormant.push({
          studentId: s.externalId,
          studentName: s.name,
          balance,
          lastLessonDate,
          daysSince,
        });
      }
    }
    dormant.sort((a, b) => (b.daysSince ?? 1e9) - (a.daysSince ?? 1e9));

    // Weekly schedules that will skip because the student has no balance.
    const recurring = await ctx.db
      .query("recurringBookings")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", orgId).eq("status", "active")
      )
      .collect();
    const lowBalanceRecurring: {
      _id: Id<"recurringBookings">;
      studentId: string;
      studentName: string | null;
      dayOfWeek: number;
      startTime: string;
    }[] = [];
    for (const r of recurring) {
      if ((balanceOf.get(r.studentId) ?? 0) > 0) continue;
      lowBalanceRecurring.push({
        _id: r._id,
        studentId: r.studentId,
        studentName: nameOf.get(r.studentId) ?? null,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
      });
    }

    // Unpaid one-time lessons (created against an empty balance) awaiting
    // settlement in Billing.
    const unpaidEvents = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const unpaid: {
      _id: Id<"scheduleEvents">;
      studentName: string | null;
      date: string;
      startTime: string;
    }[] = [];
    for (const e of unpaidEvents) {
      if (!e.unpaid || e.isDeleted || e.status === "cancelled") continue;
      unpaid.push({
        _id: e._id,
        studentName: e.studentId ? (nameOf.get(e.studentId) ?? null) : null,
        date: e.date,
        startTime: e.startTime,
      });
    }
    unpaid.sort((a, b) => a.date.localeCompare(b.date));

    return {
      dormant,
      expiringSoon,
      lowBalanceRecurring,
      unpaid,
      total:
        dormant.length +
        expiringSoon.length +
        lowBalanceRecurring.length +
        unpaid.length,
    };
  },
});
