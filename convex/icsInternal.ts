// Internal query used by the public /ics HTTP endpoint. Splits from
// convex/ics.ts so the public route handler doesn't need tenant auth.

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { userHasPermission } from "./lib/permissions";
import { instantToZoned } from "./lib/time";

export const eventsForToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    // Token-only lookup: the public endpoint never knows the org.
    const user = await ctx.db
      .query("users")
      .withIndex("by_icsToken", (q) => q.eq("icsToken", token))
      .unique();
    if (!user || !user.tokenIdentifier) return null;
    if (user.role === "admin" && !userHasPermission(user, "lessons.view.any")) return null;
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .unique();
    const orgTz = settings?.timezone ?? "Asia/Almaty";
    const today = instantToZoned(new Date(), orgTz).date;
    const eventsQuery = ctx.db.query("scheduleEvents");
    const events = user.role === "teacher"
      ? await eventsQuery.withIndex("by_organization_and_teacherId", (q) => q.eq("organizationId", user.organizationId).eq("teacherId", user.externalId)).collect()
      : user.role === "admin"
        ? await eventsQuery.withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId)).collect()
        : await eventsQuery.withIndex("by_organization_and_studentId", (q) => q.eq("organizationId", user.organizationId).eq("studentId", user.externalId)).collect();
    return {
      // Times are stored as academy wall-clock; the caller needs the zone
      // to turn them into the absolute instants an .ics feed requires.
      orgTz,
      events: events
        .filter((e) => !e.isDeleted && e.type !== "placeholder" && (e.status === "scheduled" || e.status === "makeup") && e.date >= today)
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
