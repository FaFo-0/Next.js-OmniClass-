// Achievements — definitions per org, unlocks per student.
//
// The unlock engine is deliberately dumb: whenever something happens that
// could move a counter (a study session, a quiz, a lesson completed), we
// recompute all five counters and insert rows for anything newly crossed.
// At ~50 students and a handful of achievements that costs a few reads and
// can never drift out of sync the way incremental counters do.

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

/** A card counts as learned once SM-2 has pushed it three weeks out. */
const MASTERED_INTERVAL_DAYS = 21;

export type ConditionType =
  | "lessons_completed"
  | "cards_reviewed"
  | "quiz_perfect"
  | "streak_days"
  | "vocab_learned";

/**
 * Where each achievement's progress actually comes from. One place, so the
 * unlock engine and the progress bars can never tell different stories.
 */
async function readCounters(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  studentId: string
): Promise<Record<ConditionType, number>> {
  const events = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId)
    )
    .collect();

  const reviews = await ctx.db
    .query("reviewLogs")
    .withIndex("by_organization_and_ownerId", (q) =>
      q.eq("organizationId", orgId).eq("ownerId", studentId)
    )
    .collect();

  const quizzes = await ctx.db
    .query("quizAttempts")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId)
    )
    .collect();

  const streak = await ctx.db
    .query("streaks")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId)
    )
    .unique();

  const cards = await ctx.db
    .query("srsCards")
    .withIndex("by_organization_and_ownerId", (q) =>
      q.eq("organizationId", orgId).eq("ownerId", studentId)
    )
    .collect();

  return {
    // Attendance, not paperwork: a lesson happened when its event says so.
    lessons_completed: events.filter((e) => e.status === "completed").length,
    cards_reviewed: reviews.length,
    quiz_perfect: quizzes.filter((q) => q.total > 0 && q.score === q.total).length,
    // Longest, not current — a week-long streak earned in March stays earned.
    streak_days: streak?.longestStreak ?? 0,
    vocab_learned: cards.filter(
      (c) => !c.isDeleted && c.interval >= MASTERED_INTERVAL_DAYS
    ).length,
  };
}

/**
 * Unlock everything this student now qualifies for. Idempotent — an
 * already-unlocked achievement is skipped, so this is safe to call from
 * anywhere, as often as you like.
 *
 * Returns the achievements unlocked by THIS call, for callers that want to
 * celebrate them.
 */
export async function evaluateAchievements(
  ctx: MutationCtx,
  orgId: string,
  studentId: string
): Promise<Array<{ externalId: string; name: string; icon: string }>> {
  const defs = await ctx.db
    .query("achievements")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  if (defs.length === 0) return [];

  const already = await ctx.db
    .query("studentAchievements")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId)
    )
    .collect();
  const have = new Set(already.map((a) => a.achievementId));
  const pending = defs.filter((d) => !have.has(d.externalId));
  if (pending.length === 0) return [];

  const counters = await readCounters(ctx, orgId, studentId);
  const now = new Date().toISOString();
  const earned: Array<{ externalId: string; name: string; icon: string }> = [];

  for (const def of pending) {
    const value = counters[def.conditionType as ConditionType] ?? 0;
    if (value < def.conditionThreshold) continue;
    await ctx.db.insert("studentAchievements", {
      organizationId: orgId,
      achievementId: def.externalId,
      studentId,
      unlockedAt: now,
    });
    earned.push({ externalId: def.externalId, name: def.name, icon: def.icon });
  }

  // Tell them. An achievement nobody hears about isn't a reward.
  for (const e of earned) {
    await ctx.db.insert("notifications", {
      organizationId: orgId,
      recipientId: studentId,
      kind: "achievement_unlocked",
      payload: { name: e.name, icon: e.icon },
      link: "/student/achievements",
      readAt: undefined,
      createdAt: now,
    });
  }

  return earned;
}

// ── Queries ──────────────────────────────────────────────────────

export const list = query({
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("achievements")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

/**
 * Every achievement with this student's real standing against it — unlocked
 * flag plus live progress, so the bars mean something instead of sitting at
 * a hardcoded zero.
 */
export const listForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const sid = studentId ?? user.externalId;
    if (user.role === "student" && sid !== user.externalId) {
      throw new Error("Not your achievements");
    }

    const achievements = await ctx.db
      .query("achievements")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();

    const unlocked = await ctx.db
      .query("studentAchievements")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", sid)
      )
      .collect();
    const unlockedMap = new Map(
      unlocked.map((u) => [u.achievementId, u.unlockedAt])
    );

    const counters = await readCounters(ctx, orgId, sid);

    return achievements
      .map((a) => {
        const raw = counters[a.conditionType as ConditionType] ?? 0;
        return {
          ...a,
          unlocked: unlockedMap.has(a.externalId),
          unlockedAt: unlockedMap.get(a.externalId) ?? null,
          // Capped for display: "12 / 10" reads like a bug.
          progress: Math.min(raw, a.conditionThreshold),
        };
      })
      // Closest to done first; unlocked ones sink to the end.
      .sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
        return (
          b.progress / b.conditionThreshold - a.progress / a.conditionThreshold
        );
      });
  },
});

// ── Mutations ────────────────────────────────────────────────────

/**
 * Catch-up for counters that moved without passing through one of our
 * mutations, and for students who predate the engine. Cheap and idempotent;
 * the achievements page calls it on open.
 */
export const syncMine = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") return [];
    return await evaluateAchievements(ctx, orgId, user.externalId);
  },
});

export const create = mutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    conditionType: v.union(
      v.literal("lessons_completed"),
      v.literal("cards_reviewed"),
      v.literal("quiz_perfect"),
      v.literal("streak_days"),
      v.literal("vocab_learned")
    ),
    conditionThreshold: v.number(),
    reward: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "achievements.edit");
    return await ctx.db.insert("achievements", {
      organizationId: orgId,
      ...args,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("achievements") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "achievements.edit");
    const doc = await ctx.db.get(id);
    if (!doc || doc.organizationId !== orgId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
