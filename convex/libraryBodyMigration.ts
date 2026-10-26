/** Operator-only, bounded, reversible move; no chapter IDs or vocabulary change. */
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ACADEMY_ID } from "./lib/tenant";
import { storeUnitBody, withUnitBody } from "./lib/libraryBodies";

export const batch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), restore: v.boolean() },
  handler: async (ctx, { cursor, restore }) => {
    const page = await ctx.db.query("libraryUnits").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID))
      .paginate({ cursor, numItems: 10 });
    let changed = 0;
    for (const unit of page.page) {
      if (restore) {
        if (!unit.bodyId) continue;
        const body = await withUnitBody(ctx, unit);
        await ctx.db.patch(unit._id, { bodyId: undefined, contentMarkdown: body.contentMarkdown, contentHtml: body.contentHtml });
        // Keep the detached copy for recovery; it is never served without its pointer.
      } else {
        if (unit.bodyId) continue;
        await storeUnitBody(ctx, unit);
      }
      changed++;
    }
    return { changed, cursor: page.continueCursor, done: page.isDone };
  },
});

export const run = internalAction({
  args: { restore: v.optional(v.boolean()) },
  handler: async (ctx, { restore }): Promise<{ changed: number }> => {
    let cursor: string | null = null;
    let changed = 0;
    for (;;) {
      const result: { changed: number; cursor: string; done: boolean } = await ctx.runMutation(internal.libraryBodyMigration.batch, { cursor, restore: restore ?? false });
      changed += result.changed;
      if (result.done) return { changed };
      cursor = result.cursor;
    }
  },
});
