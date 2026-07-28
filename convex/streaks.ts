import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireTenant } from "./lib/tenant";
import { todayInTz } from "./lib/sm2";

/**
 * A streak day is a day in the STUDENT'S life, not UTC's — someone studying
 * at 11pm in Almaty hasn't studied "tomorrow".
 */
async function studentLocalToday(
  ctx: MutationCtx,
  orgId: string,
  user: { timezone?: string }
): Promise<string> {
  let tz = user.timezone;
  if (!tz) {
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    tz = settings?.timezone ?? "UTC";
  }
  return todayInTz(tz);
}

/**
 * Record "studied today" for a learner. Called by everything that counts as
 * studying (flashcard sessions, quizzes) — the streak has no mutation of its
 * own to call from the client, so it can never be gamed or forgotten.
 */
export async function bumpStreak(
  ctx: MutationCtx,
  orgId: string,
  user: { externalId: string; timezone?: string }
): Promise<{ currentStreak: number; longestStreak: number }> {
  const today = await studentLocalToday(ctx, orgId, user);
  return await applyStreakDay(ctx, orgId, user.externalId, today);
}

async function applyStreakDay(
  ctx: MutationCtx,
  organizationId: string,
  studentId: string,
  today: string
): Promise<{ currentStreak: number; longestStreak: number }> {
  const existing = await ctx.db
    .query("streaks")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", organizationId).eq("studentId", studentId)
    )
    .unique();

  if (!existing) {
    await ctx.db.insert("streaks", {
      organizationId,
      studentId,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: today,
      activityDates: [today],
    });
    return { currentStreak: 1, longestStreak: 1 };
  }

  // Pure calendar math on the local date string — no timezones involved.
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

  let newCurrent = existing.currentStreak;
  if (existing.lastActivityDate === today) {
    // Already counted today — but a zero from the pre-wiring era still heals.
    if (newCurrent === 0) newCurrent = 1;
  } else if (existing.lastActivityDate === yesterday) {
    newCurrent = existing.currentStreak + 1;
  } else {
    newCurrent = 1;
  }

  const newLongest = Math.max(existing.longestStreak, newCurrent);
  // Keep the trailing year of activity days — enough for any heatmap, bounded
  // so the doc can't grow forever.
  const dates = [...(existing.activityDates ?? []), today]
    .filter((d, i, a) => a.indexOf(d) === i)
    .slice(-366);

  await ctx.db.patch(existing._id, {
    currentStreak: newCurrent,
    longestStreak: newLongest,
    lastActivityDate: today,
    activityDates: dates,
  });

  return { currentStreak: newCurrent, longestStreak: newLongest };
}

export const getForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const sid = studentId ?? user.externalId;
    return await ctx.db
      .query("streaks")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", sid)
      )
      .unique();
  },
});
