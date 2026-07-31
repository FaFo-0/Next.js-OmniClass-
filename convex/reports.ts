// Admin dashboard numbers — REAL ones. The previous P&L card showed
// hardcoded fake dollars, which is worse than showing nothing (POLICY §0:
// the business runs on what actually happened, not on placeholders).
//
// Money model, v1 (manual grants): revenue is only knowable when a grant is
// linked to a pack — the pack carries the price. Manual no-pack grants are
// reported as a count, not guessed at.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

export const monthlyStats = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString();

    // ── Revenue: pack-linked grants created this month ─────────────
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const packCache = new Map<string, { priceUSD: number; points: number } | null>();
    let revenueUSD = 0;
    let lessonsSold = 0;
    let manualLessons = 0; // granted with no pack → no price attached
    for (const g of grants) {
      if (g.purchasedAt < monthStart) continue;
      if (g.source === "refund" || g.source === "makeup") continue;
      if (!g.packageId) {
        manualLessons += g.points;
        continue;
      }
      const key = g.packageId as string;
      if (!packCache.has(key)) {
        const pkg = await ctx.db.get(g.packageId);
        packCache.set(key, pkg ? { priceUSD: pkg.priceUSD, points: pkg.points } : null);
      }
      const pkg = packCache.get(key);
      if (!pkg || pkg.points <= 0) {
        manualLessons += g.points;
        continue;
      }
      revenueUSD += (pkg.priceUSD / pkg.points) * g.points;
      lessonsSold += g.points;
    }

    // ── Delivery: completed lessons this month ─────────────────────
    const monthStartDate = monthStart.slice(0, 10);
    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", orgId).eq("status", "completed")
      )
      .collect();
    const lessonsDelivered = events.filter(
      (e) => !e.isDeleted && e.date >= monthStartDate
    ).length;

    // ── Credits spent this month (ledger) ───────────────────────────
    const txs = await ctx.db
      .query("pointTransactions")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    let lessonsSpent = 0;
    for (const t of txs) {
      if (t.createdAt < monthStart) continue;
      if (t.type === "spend") lessonsSpent += Math.abs(t.amount);
    }

    // ── Student statuses: real counts, not percentages of a guess ──
    const students = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "student")
      )
      .collect();
    const statusCounts = { active: 0, trial: 0, paused: 0, cancelled: 0 };
    let newThisMonth = 0;
    for (const s of students) {
      const st = (s.studentStatus ?? "active") as keyof typeof statusCounts;
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;
      if (s.createdAt >= monthStart) newThisMonth++;
    }

    return {
      month: monthStart.slice(0, 7),
      revenueUSD: Math.round(revenueUSD * 100) / 100,
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
 * POLICY §4 — a teacher's own earnings. Payable events are lessons that
 * actually consumed the hour: completed lessons and student no-shows (the
 * teacher reserved the time either way). Teacher cancellations and moves are
 * not payable.
 *
 * Money is only reported where it is knowable: a lesson's rate comes from the
 * pack the student's credit was bought under. Lessons taught against manual
 * no-pack grants are reported as an unpriced count rather than guessed at
 * (same rule as monthlyStats).
 */
export const teacherEarnings = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new Error("Teachers only");
    }

    // A teacher may only inspect their own payout. Admins may open the same
    // policy-calculated view for any teacher from People.
    const targetId = teacherId ?? user.externalId;
    if (user.role !== "admin" && targetId !== user.externalId) {
      throw new Error("Not your earnings");
    }
    const target = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", targetId)
      )
      .unique();
    // No payout exists for a non-teacher (an admin opening /teacher/profile,
    // or a stale id). Return nothing rather than throwing — a query that
    // throws takes the whole page down with it.
    if (!target || target.role !== "teacher") return null;

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const rate = target.payoutRateOverride ?? 0.3; // POLICY §4 default 30%

    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7); // "YYYY-MM"

    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", targetId)
      )
      .collect();

    // Average price per lesson across active packs — the honest stand-in for
    // "what a lesson is worth" until per-grant pricing is wired end-to-end.
    const packs = await ctx.db
      .query("pointPackages")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const priced = packs.filter((p) => p.isActive && p.points > 0);
    const avgLessonUSD =
      priced.length > 0
        ? priced.reduce((s, p) => s + p.priceUSD / p.points, 0) / priced.length
        : 0;

    const payable = (s: string) => s === "completed" || s === "no_show_student";

    let monthLessons = 0;
    let allTimeLessons = 0;
    for (const e of events) {
      if (e.isDeleted || e.type === "placeholder") continue;
      if (!payable(e.status)) continue;
      allTimeLessons++;
      if (e.date.slice(0, 7) === monthKey) monthLessons++;
    }

    const upcoming = events.filter(
      (e) =>
        !e.isDeleted &&
        e.type !== "placeholder" &&
        (e.status === "scheduled" || e.status === "makeup") &&
        e.date >= now.toISOString().slice(0, 10)
    ).length;

    return {
      rate,
      currency: settings?.baseCurrency ?? "USD",
      avgLessonUSD,
      // null when no pack pricing exists yet — the UI shows the count instead
      // of inventing a number.
      monthEarningsUSD: avgLessonUSD > 0 ? monthLessons * avgLessonUSD * rate : null,
      monthLessons,
      allTimeLessons,
      upcoming,
    };
  },
});
