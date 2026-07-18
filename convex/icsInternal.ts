// Internal query used by the public /ics HTTP endpoint. Splits from
// convex/ics.ts so the public route handler doesn't need tenant auth.

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const eventsForToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    // Token-only lookup: the public endpoint never knows the org.
    const user = await ctx.db
      .query("users")
      .withIndex("by_icsToken", (q) => q.eq("icsToken", token))
      .unique();
    if (!user) return null;
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .unique();
    const today = new Date().toISOString().slice(0, 10);
    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("studentId", user.externalId)
      )
      .collect();
    return {
      // Times are stored as academy wall-clock; the caller needs the zone
      // to turn them into the absolute instants an .ics feed requires.
      orgTz: settings?.timezone ?? "UTC",
      events: events
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
          location: e.googleMeetLink ?? undefined,
        })),
    };
  },
});
