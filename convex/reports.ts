// Admin dashboard numbers — REAL ones. The previous P&L card showed
// hardcoded fake dollars, which is worse than showing nothing (POLICY §0:
// the business runs on what actually happened, not on placeholders).
//
// Money model, v1 (manual grants): revenue is only knowable when a grant is
// linked to a pack — the pack carries the price. Manual no-pack grants are
// reported as a count, not guessed at.

import { query } from "./_generated/server";
import { requireTenantPermission } from "./lib/tenant";

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
