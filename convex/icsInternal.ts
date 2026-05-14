// Internal query used by the public /ics HTTP endpoint. Splits from
// convex/ics.ts so the public route handler doesn't need tenant auth.

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const eventsForToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    // Find the user owning this token (across orgs)
    const all = await ctx.db.query("users").collect();
    const user = all.find((u) => u.icsToken === token);
    if (!user) return null;
    const today = new Date().toISOString().slice(0, 10);
    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("studentId", user.externalId)
      )
      .collect();
    return events
      .filter((e) => !e.isDeleted && e.status !== "cancelled" && e.date >= today)
      .map((e) => ({
        uid: e._id,
        title: e.title,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        description: e.googleMeetLink
          ? `Google Meet: ${e.googleMeetLink}`
          : undefined,
      }));
  },
});
