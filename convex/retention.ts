// POLICY §7 — admin retention triage. At ~50 students an admin who can read
// a good list beats an auto-status machine, so this query surfaces the four
// signals that need a human decision. It NEVER transitions a student.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenantPermission } from "./lib/tenant";
import type { Id } from "./_generated/dataModel";

const DORMANT_DAYS = 14; // no completed lesson in this many days → surface
const EXPIRY_WARN_DAYS = 14; // credits lapsing within this window → surface
// A student who signed up and hasn't booked yet is a different problem from
// one who went quiet — and on day one it isn't a problem at all. Give them a
// week before the trial-unused nudge appears.
const NEVER_BOOKED_GRACE_DAYS = 7;
// Dismissing an item hides it for this long rather than forever: the signal
// is recomputed from live data, so "handled" is only true for a while.
const DISMISS_DAYS = 30;

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

    const dismissals = await ctx.db
      .query("attentionDismissals")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const silenced = new Set(
      dismissals.filter((d) => d.until >= todayStr).map((d) => d.key)
    );
    const dismissed = (signal: string, subjectId: string) =>
      silenced.has(`${signal}:${subjectId}`);

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
      if (
        g.activatedAt &&
        g.expiresAt <= warnCutoff &&
        !dismissed("expiring", g.studentId)
      ) {
        expiringSoon.push({
          studentId: g.studentId,
          studentName: nameOf.get(g.studentId) ?? null,
          lessons: g.remainingPoints,
          expiresAt: g.expiresAt,
        });
      }
    }
    expiringSoon.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

    // Two different problems, deliberately not one list:
    //  · dormant      — had lessons, has credit, has gone quiet. Retention.
    //  · neverBooked  — signed up, holds credit (usually the trial) and has
    //                   never booked. A nudge, not a churn risk, and NOT a
    //                   problem on the day they sign up — hence the grace
    //                   period. Lumping these together put every fresh
    //                   signup on the admin dashboard immediately.
    const dormant: {
      studentId: string;
      studentName: string;
      balance: number;
      lastLessonDate: string | null;
      daysSince: number;
    }[] = [];
    const neverBooked: {
      studentId: string;
      studentName: string;
      balance: number;
      daysSinceSignup: number;
      hasUpcoming: boolean;
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
      let hasUpcoming = false;
      for (const e of events) {
        if (e.isDeleted) continue;
        if (e.status === "completed") {
          if (lastLessonDate === null || e.date > lastLessonDate) lastLessonDate = e.date;
        } else if (
          (e.status === "scheduled" || e.status === "makeup") &&
          e.date >= todayStr
        ) {
          hasUpcoming = true;
        }
      }

      if (lastLessonDate === null) {
        // A booked-but-not-yet-taught student needs nothing from an admin.
        if (hasUpcoming) continue;
        const daysSinceSignup = daysBetween(s.createdAt.slice(0, 10), today);
        if (
          daysSinceSignup >= NEVER_BOOKED_GRACE_DAYS &&
          !dismissed("neverBooked", s.externalId)
        ) {
          neverBooked.push({
            studentId: s.externalId,
            studentName: s.name,
            balance,
            daysSinceSignup,
            hasUpcoming,
          });
        }
        continue;
      }

      const daysSince = daysBetween(lastLessonDate, today);
      if (daysSince >= DORMANT_DAYS && !dismissed("dormant", s.externalId)) {
        dormant.push({
          studentId: s.externalId,
          studentName: s.name,
          balance,
          lastLessonDate,
          daysSince,
        });
      }
    }
    dormant.sort((a, b) => b.daysSince - a.daysSince);
    neverBooked.sort((a, b) => b.daysSinceSignup - a.daysSinceSignup);

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
      if (dismissed("lowBalance", r.studentId)) continue;
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
      if (dismissed("unpaid", e._id)) continue;
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
      neverBooked,
      expiringSoon,
      lowBalanceRecurring,
      unpaid,
      total:
        dormant.length +
        neverBooked.length +
        expiringSoon.length +
        lowBalanceRecurring.length +
        unpaid.length,
    };
  },
});

/** What's currently silenced, so a dismissal can be taken back. */
export const listDismissed = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "users.view.any");
    const todayStr = new Date().toISOString().slice(0, 10);
    const rows = await ctx.db
      .query("attentionDismissals")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows
      .filter((r) => r.until >= todayStr)
      .map((r) => ({
        _id: r._id,
        signal: r.key.split(":")[0],
        subjectId: r.key.slice(r.key.indexOf(":") + 1),
        until: r.until,
      }));
  },
});

export const restoreAttention = mutation({
  args: { id: v.id("attentionDismissals") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "users.view.any");
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

/** Hide one attention row for a month. Recomputed signals bring it back. */
export const dismissAttention = mutation({
  args: { signal: v.string(), subjectId: v.string() },
  handler: async (ctx, { signal, subjectId }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "users.view.any");
    const key = `${signal}:${subjectId}`;
    const until = new Date(Date.now() + DISMISS_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const existing = await ctx.db
      .query("attentionDismissals")
      .withIndex("by_organization_and_key", (q) =>
        q.eq("organizationId", orgId).eq("key", key)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        until,
        dismissedAt: new Date().toISOString(),
        dismissedBy: user.externalId,
      });
      return;
    }
    await ctx.db.insert("attentionDismissals", {
      organizationId: orgId,
      key,
      dismissedBy: user.externalId,
      dismissedAt: new Date().toISOString(),
      until,
    });
  },
});
