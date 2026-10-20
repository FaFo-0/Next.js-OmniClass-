/** Operator-only terminal authoring. Public authoring remains permission gated. */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { ACADEMY_ID } from "./lib/tenant";
import { assertLibraryUrl } from "./lib/libraryLinks";
import { normalizeTopicTags } from "./lib/libraryContent";
import { writeUnits, requestPreparation, finishPublication } from "./libraryWorks";

const metadata = {
  externalId: v.string(), title: v.string(), kind: v.union(v.literal("book"), v.literal("article"), v.literal("story"), v.literal("dialog"), v.literal("transcript"), v.literal("video"), v.literal("resource")),
  levelCEFR: v.optional(v.union(v.literal("A1"), v.literal("A2"), v.literal("B1"), v.literal("B2"), v.literal("C1"), v.literal("C2"))),
  topicTags: v.array(v.string()), author: v.optional(v.string()), description: v.optional(v.string()),
  sourceUrl: v.optional(v.string()), externalUrl: v.optional(v.string()), license: v.optional(v.string()), attribution: v.optional(v.string()),
};
export const inspect = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    const work = await ctx.db.query("libraryWorks").withIndex("by_organization_and_externalId", q => q.eq("organizationId", ACADEMY_ID).eq("externalId", externalId)).unique();
    if (!work) return null;
    const units = await ctx.db.query("libraryUnits").withIndex("by_workId_and_position", q => q.eq("workId", work._id)).collect();
    return { work, units: units.filter(u => !u.isDeleted).map(u => ({ externalId: u.externalId, title: u.title, preparationState: u.preparationState, preparationError: u.preparationError, position: u.position })) };
  },
});
/** Operator-only metadata repair: rename every work carrying one exact author string. */
export const setAuthor = internalMutation({
  args: { from: v.string(), to: v.string(), apply: v.boolean() },
  handler: async (ctx, { from, to, apply }) => {
    const works = await ctx.db.query("libraryWorks").withIndex("by_organization_and_externalId", q => q.eq("organizationId", ACADEMY_ID)).collect();
    const matched = works.filter(w => w.author === from);
    if (apply) {
      const updatedAt = new Date().toISOString();
      for (const work of matched) await ctx.db.patch(work._id, { author: to, updatedAt });
    }
    return { matched: matched.length, externalIds: matched.map(w => w.externalId), applied: apply };
  },
});
export const begin = internalMutation({
  args: { item: v.object(metadata) },
  handler: async (ctx, { item }) => {
    if (!item.title.trim() || !/^[a-z0-9][a-z0-9-]{0,100}$/.test(item.externalId)) throw new Error("Provide a title and stable lowercase import identifier");
    const existing = await ctx.db.query("libraryWorks").withIndex("by_organization_and_externalId", q => q.eq("organizationId", ACADEMY_ID).eq("externalId", item.externalId)).unique();
    if (existing?.isDeleted) throw new Error("This identifier belongs to a deleted item. Restore it explicitly or choose a new identifier.");
    const values = { ...item, title: item.title.trim(), topicTags: normalizeTopicTags(item.topicTags), externalUrl: assertLibraryUrl(item.externalUrl), sourceUrl: assertLibraryUrl(item.sourceUrl), importInProgress: true, isPublished: false, updatedAt: new Date().toISOString() };
    if (existing) {
      await ctx.db.patch(existing._id, { ...values, publishRequested: existing.publishRequested || existing.isPublished });
      return existing._id;
    }
    return await ctx.db.insert("libraryWorks", { ...values, organizationId: ACADEMY_ID, uploadedBy: "library-import", createdAt: new Date().toISOString() });
  },
});
export const chapter = internalMutation({
  args: { workId: v.id("libraryWorks"), unit: v.object({ externalId: v.string(), title: v.string(), contentMarkdown: v.string() }) },
  handler: async (ctx, { workId, unit }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.organizationId !== ACADEMY_ID || !work.importInProgress) throw new Error("Begin the import first");
    const existing = await ctx.db.query("libraryUnits").withIndex("by_workId_and_position", q => q.eq("workId", workId)).collect();
    const units = existing.filter(u => !u.isDeleted && u.externalId !== unit.externalId).map(u => ({ externalId: u.externalId, title: u.title, contentMarkdown: u.contentMarkdown }));
    units.push(unit);
    await writeUnits(ctx, ACADEMY_ID, workId, units);
  },
});
export const finish = internalMutation({
  args: { workId: v.id("libraryWorks"), chapterIds: v.array(v.string()), publish: v.boolean() },
  handler: async (ctx, { workId, chapterIds, publish }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.organizationId !== ACADEMY_ID || !work.importInProgress) throw new Error("Begin the import first");
    const units = await ctx.db.query("libraryUnits").withIndex("by_workId", q => q.eq("workId", workId)).collect();
    const ordered = chapterIds.map(externalId => {
      const unit = units.find(u => u.externalId === externalId && !u.isDeleted);
      if (!unit) throw new Error("Missing imported chapter");
      return { externalId, title: unit.title, contentMarkdown: unit.contentMarkdown };
    });
    if (!ordered.length && !work.externalUrl) throw new Error("Add text or a link");
    await writeUnits(ctx, ACADEMY_ID, workId, ordered);
    await ctx.db.patch(workId, { importInProgress: false, publishRequested: publish || work.publishRequested || false });
    await requestPreparation(ctx, ACADEMY_ID, workId);
    await finishPublication(ctx, workId);
    return { workId, chapters: ordered.length, publicationRequested: publish || work.publishRequested || false };
  },
});
