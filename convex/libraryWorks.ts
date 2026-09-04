// Library 2.0 — works (readings) composed of ordered units (chapters/sections).
//
// A work is the catalogue card (book, article, story, dialog, transcript); its
// units are the readable bodies. Catalogue queries return metadata only — a
// unit's Markdown body is fetched on open — so lists never ship full text.
//
// Access model:
//   - Published works and their units are readable by any tenant member.
//   - Draft works (and their units) are readable only by `library.upload`.
//   - All writes require `library.upload`.
//   - Student progress is written by the owning student, read by the owner or
//     staff with `library.upload`.

import { v } from "convex/values";
import { query, mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireTenant, requireTenantPermission, tenantTable } from "./lib/tenant";
import { userHasPermission } from "./lib/permissions";
import { splitMarkdownIntoUnits, normalizeTopicTags } from "./lib/libraryContent";

const workKind = v.union(
  v.literal("book"),
  v.literal("article"),
  v.literal("story"),
  v.literal("dialog"),
  v.literal("transcript")
);

const cefr = v.union(
  v.literal("A1"),
  v.literal("A2"),
  v.literal("B1"),
  v.literal("B2"),
  v.literal("C1"),
  v.literal("C2")
);

const unitInput = v.object({
  title: v.string(),
  contentMarkdown: v.string(),
});

/** Whether the caller may read this work's content (draft vs published). */
function canReadWork(user: Doc<"users">, work: Doc<"libraryWorks">): boolean {
  return work.isPublished || userHasPermission(user, "library.upload");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ── Queries ──────────────────────────────────────────────────────

/** Metadata-only catalogue: published works, no unit bodies. */
export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("libraryWorks")
      .withIndex("by_organization_and_isPublished", (q) =>
        q.eq("organizationId", orgId).eq("isPublished", true)
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/** Admin catalogue: includes drafts; metadata only. */
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const rows = await ctx.db
      .query("libraryWorks")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/** Work metadata + ordered unit titles (no bodies). */
export const getWork = query({
  args: { id: v.id("libraryWorks") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenant(ctx);
    const work = await ctx.db.get(id);
    if (!work || work.organizationId !== orgId || work.isDeleted) return null;
    if (!canReadWork(user, work)) return null;
    const units = await ctx.db
      .query("libraryUnits")
      .withIndex("by_workId_and_position", (q) => q.eq("workId", id))
      .collect();
    return { work, units };
  },
});

/** A single unit's body. Drafts are staff-only. */
export const getUnit = query({
  args: { id: v.id("libraryUnits") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenant(ctx);
    const unit = await ctx.db.get(id);
    if (!unit || unit.organizationId !== orgId) return null;
    const work = await ctx.db.get(unit.workId);
    if (!work || work.organizationId !== orgId || work.isDeleted) return null;
    if (!canReadWork(user, work)) return null;
    return { unit, work };
  },
});

/** A student's reading position within a work. */
export const getProgress = query({
  args: { workId: v.id("libraryWorks") },
  handler: async (ctx, { workId }) => {
    const { orgId, user } = await requireTenant(ctx);
    return await ctx.db
      .query("libraryProgress")
      .withIndex("by_organization_and_ownerId_and_workId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", user.externalId).eq("workId", workId)
      )
      .first();
  },
});

// ── Mutations ────────────────────────────────────────────────────

export const createWork = mutation({
  args: {
    title: v.string(),
    kind: workKind,
    levelCEFR: v.optional(cefr),
    topicTags: v.array(v.string()),
    description: v.optional(v.string()),
    author: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    license: v.optional(v.string()),
    attribution: v.optional(v.string()),
    coverImageId: v.optional(v.id("_storage")),
    // Either explicit units or a raw Markdown document to split on `##`.
    units: v.optional(v.array(unitInput)),
    contentMarkdown: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "library.upload");
    const now = new Date().toISOString();
    const coverImageUrl = args.coverImageId
      ? ((await ctx.storage.getUrl(args.coverImageId)) ?? undefined)
      : undefined;

    const base = args.title.trim();
    if (!base) throw new Error("Title is required");
    const externalId = `${slugify(base) || "work"}-${Date.now()}`;

    const workId = await ctx.db.insert("libraryWorks", {
      organizationId: orgId,
      externalId,
      title: base,
      description: args.description,
      author: args.author,
      kind: args.kind,
      levelCEFR: args.levelCEFR,
      topicTags: normalizeTopicTags(args.topicTags),
      coverImageId: args.coverImageId,
      coverImageUrl,
      sourceUrl: args.sourceUrl,
      license: args.license,
      attribution: args.attribution,
      uploadedBy: user.externalId,
      isPublished: false,
      createdAt: now,
    });

    const units = args.units
      ? args.units
      : args.contentMarkdown
        ? splitMarkdownIntoUnits(args.contentMarkdown, base)
        : [];
    await writeUnits(ctx, orgId, workId, units);

    return workId;
  },
});

export const updateWork = mutation({
  args: {
    id: v.id("libraryWorks"),
    patch: v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      author: v.optional(v.string()),
      kind: v.optional(workKind),
      levelCEFR: v.optional(cefr),
      topicTags: v.optional(v.array(v.string())),
      sourceUrl: v.optional(v.string()),
      license: v.optional(v.string()),
      attribution: v.optional(v.string()),
      coverImageId: v.optional(v.id("_storage")),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryWorks");
    const extra: { coverImageUrl?: string } = {};
    if (patch.coverImageId) {
      const existing = await ctx.db.get(id);
      if (existing?.coverImageId && existing.coverImageId !== patch.coverImageId) {
        await ctx.storage.delete(existing.coverImageId).catch(() => {});
      }
      extra.coverImageUrl = (await ctx.storage.getUrl(patch.coverImageId)) ?? undefined;
    }
    const clean = { ...patch };
    if (patch.topicTags) clean.topicTags = normalizeTopicTags(patch.topicTags);
    await t.patch(id, { ...clean, ...extra, updatedAt: new Date().toISOString() });
  },
});

/** Replace a work's units (or split raw Markdown into units). Ordered, idempotent. */
export const replaceUnits = mutation({
  args: {
    workId: v.id("libraryWorks"),
    units: v.optional(v.array(unitInput)),
    contentMarkdown: v.optional(v.string()),
  },
  handler: async (ctx, { workId, units, contentMarkdown }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const work = await ctx.db.get(workId);
    if (!work || work.organizationId !== orgId) throw new Error("Work not found");

    const resolved = units
      ? units
      : contentMarkdown
        ? splitMarkdownIntoUnits(contentMarkdown, work.title)
        : [];
    await writeUnits(ctx, orgId, workId, resolved);
  },
});

export const publish = mutation({
  args: { id: v.id("libraryWorks"), isPublished: v.boolean() },
  handler: async (ctx, { id, isPublished }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryWorks");
    await t.patch(id, { isPublished, updatedAt: new Date().toISOString() });
  },
});

export const softDelete = mutation({
  args: { id: v.id("libraryWorks") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryWorks");
    await t.softDelete(id, user.externalId);
  },
});

export const restore = mutation({
  args: { id: v.id("libraryWorks") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryWorks");
    await t.restore(id);
  },
});

/** Record a student's reading position (resume point). */
export const saveProgress = mutation({
  args: {
    workId: v.id("libraryWorks"),
    lastUnitPosition: v.number(),
    lastAnchor: v.optional(v.string()),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, { workId, lastUnitPosition, lastAnchor, completed }) => {
    const { orgId, user } = await requireTenant(ctx);
    const work = await ctx.db.get(workId);
    if (!work || work.organizationId !== orgId) throw new Error("Work not found");

    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("libraryProgress")
      .withIndex("by_organization_and_ownerId_and_workId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", user.externalId).eq("workId", workId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastUnitPosition,
        lastAnchor,
        lastReadAt: now,
        completedAt: completed ? now : existing.completedAt,
      });
    } else {
      await ctx.db.insert("libraryProgress", {
        organizationId: orgId,
        ownerId: user.externalId,
        workId,
        lastUnitPosition,
        lastAnchor,
        wordsSaved: 0,
        lastReadAt: now,
        completedAt: completed ? now : undefined,
      });
    }
  },
});

// ── Internal helpers ─────────────────────────────────────────────

async function writeUnits(
  ctx: MutationCtx,
  orgId: string,
  workId: Id<"libraryWorks">,
  units: Array<{ title: string; contentMarkdown: string }>
): Promise<void> {
  const existing = await ctx.db
    .query("libraryUnits")
    .withIndex("by_workId", (q) => q.eq("workId", workId))
    .collect();
  for (const row of existing) await ctx.db.delete(row._id);

  const now = new Date().toISOString();
  let position = 0;
  for (const u of units) {
    const contentMarkdown = u.contentMarkdown.trim();
    if (!contentMarkdown) continue;
    await ctx.db.insert("libraryUnits", {
      organizationId: orgId,
      workId,
      externalId: `unit-${position}`,
      position,
      title: u.title.trim() || `Part ${position + 1}`,
      contentMarkdown,
      createdAt: now,
    });
    position += 1;
  }
}
