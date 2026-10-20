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
import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireTenant, requireTenantPermission, tenantTable } from "./lib/tenant";
import { userHasPermission } from "./lib/permissions";
import { splitMarkdownIntoUnits, normalizeTopicTags, estimateReadMinutes } from "./lib/libraryContent";
import { assertLibraryUrl } from "./lib/libraryLinks";
import { internal } from "./_generated/api";
import { ACADEMY_ID } from "./lib/tenant";

const workKind = v.union(
  v.literal("book"),
  v.literal("article"),
  v.literal("story"),
  v.literal("dialog"),
  v.literal("transcript"),
  v.literal("video"),
  v.literal("resource")
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
  externalId: v.optional(v.string()),
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

/** Published catalogue ordered by a student's explicitly shared interests. */
export const listRecommendedForStudent = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const onboarding = await ctx.db
      .query("studentOnboarding")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .first();
    const interests = new Set((onboarding?.interests ?? []).map((value) => value.toLowerCase().trim()));
    const rows = (await ctx.db
      .query("libraryWorks")
      .withIndex("by_organization_and_isPublished", (q) =>
        q.eq("organizationId", orgId).eq("isPublished", true)
      )
      .collect()).filter((row) => !row.isDeleted);
    return rows
      .map((row) => ({
        row,
        score: row.topicTags.reduce(
          (total, tag) => total + (interests.has(tag.toLowerCase().trim()) ? 1 : 0),
          0
        ),
      }))
      .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title))
      .map(({ row }) => row);
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
  args: { id: v.id("libraryWorks"), includeContent: v.optional(v.boolean()) },
  handler: async (ctx, { id, includeContent }) => {
    const { orgId, user } = await requireTenant(ctx);
    const work = await ctx.db.get(id);
    if (!work || work.organizationId !== orgId || work.isDeleted) return null;
    if (!canReadWork(user, work)) return null;
    const units = await ctx.db
      .query("libraryUnits")
      .withIndex("by_workId_and_position", (q) => q.eq("workId", id))
      .collect();
    const bodies = includeContent !== false && userHasPermission(user, "library.upload");
    return { work, units: units.filter(u => !u.isDeleted).map(u => ({ ...u, contentMarkdown: bodies ? u.contentMarkdown : "" })) };
  },
});

/** A single unit's body. Drafts are staff-only. */
export const getUnit = query({
  args: { id: v.id("libraryUnits") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenant(ctx);
    const unit = await ctx.db.get(id);
    if (!unit || unit.organizationId !== orgId || unit.isDeleted) return null;
    const work = await ctx.db.get(unit.workId);
    if (!work || work.organizationId !== orgId || work.isDeleted) return null;
    if (!canReadWork(user, work)) return null;
    const batches = await ctx.db.query("libraryVocabularyBatches").withIndex("by_unitId_and_revision", q => q.eq("unitId", id).eq("revision", unit.revision ?? 1)).collect();
    return { unit, work, vocabulary: batches.flatMap(b => b.words) };
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

export const generateCoverUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireTenantPermission(ctx, "library.upload");
    return await ctx.storage.generateUploadUrl();
  },
});

export const createWork = mutation({
  args: {
    title: v.string(),
    kind: workKind,
    levelCEFR: v.optional(cefr),
    topicTags: v.array(v.string()),
    description: v.optional(v.string()),
    author: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
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

    if (!args.contentMarkdown?.trim() && !args.units?.some(u => u.contentMarkdown.trim()) && !args.externalUrl) throw new Error("Add text or an external link");
    const base = args.title.trim();
    if (!base) throw new Error("Title is required");
    const externalUrl = assertLibraryUrl(args.externalUrl);
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
      sourceUrl: assertLibraryUrl(args.sourceUrl),
      externalUrl,
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
      externalUrl: v.optional(v.union(v.string(), v.null())),
      license: v.optional(v.string()),
      attribution: v.optional(v.string()),
      coverImageId: v.optional(v.id("_storage")),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const existing = await ctx.db.get(id);
    if (!existing || existing.organizationId !== orgId) throw new Error("Work not found");
    const externalUrl = assertLibraryUrl(patch.externalUrl === undefined ? existing.externalUrl : patch.externalUrl);
    if (patch.title !== undefined && !patch.title.trim()) throw new Error("Title is required");
    const t = tenantTable(ctx, orgId, "libraryWorks");
    const extra: { coverImageUrl?: string } = {};
    if (patch.coverImageId) {
      if (existing?.coverImageId && existing.coverImageId !== patch.coverImageId) {
        await ctx.storage.delete(existing.coverImageId).catch(() => {});
      }
      extra.coverImageUrl = (await ctx.storage.getUrl(patch.coverImageId)) ?? undefined;
    }
    if (!externalUrl && existing.hasText === false) throw new Error("Add text or an external link");
    const clean = { ...patch, externalUrl, ...(patch.sourceUrl !== undefined ? { sourceUrl: assertLibraryUrl(patch.sourceUrl) } : {}) };
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
    const work = await t.get(id);
    if (!work || work.isDeleted) throw new Error("Work not found");
    if (!isPublished) { await t.patch(id, { isPublished: false, publishRequested: false }); return; }
    await ctx.db.patch(id, { publishRequested: true });
    await requestPreparation(ctx, orgId, id);
    await finishPublication(ctx, id);
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
    unitId: v.optional(v.id("libraryUnits")),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, { workId, lastUnitPosition, lastAnchor, completed, unitId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const work = await ctx.db.get(workId);
    if (!work || work.organizationId !== orgId || work.isDeleted || !canReadWork(user, work)) throw new Error("Work not found");
    const units = (await ctx.db.query("libraryUnits").withIndex("by_workId_and_position", q => q.eq("workId", workId)).collect()).filter(u => !u.isDeleted);
    const unit = unitId ? units.find(u => u._id === unitId) : units.find(u => u.position === lastUnitPosition);
    if (!unit || unit.position !== lastUnitPosition) throw new Error("Chapter not found");
    if (completed && unit._id !== units.at(-1)?._id) throw new Error("Finish the final chapter first");
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
        lastUnitId: unit._id,
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
        lastUnitId: unit._id,
        lastAnchor,
        wordsSaved: 0,
        lastReadAt: now,
        completedAt: completed ? now : undefined,
      });
    }
  },
});

// ── Internal helpers ─────────────────────────────────────────────

export async function writeUnits(
  ctx: MutationCtx, orgId: string, workId: Id<"libraryWorks">,
  units: Array<{ title: string; contentMarkdown: string; externalId?: string }>
): Promise<void> {
  if (units.length > 200) throw new Error("Import at most 200 chapters at once");
  const existing = await ctx.db.query("libraryUnits").withIndex("by_workId", q => q.eq("workId", workId)).collect();
  const retained = new Set<string>();
  const now = new Date().toISOString();
  let position = 0;
  let minutes = 0;
  for (const u of units) {
    const contentMarkdown = u.contentMarkdown.trim();
    if (!contentMarkdown) continue;
    if (contentMarkdown.length > 40000) throw new Error("Split chapters longer than 40,000 characters into smaller sections");
    const externalId = u.externalId ?? `unit-${position}`;
    if (retained.has(externalId)) throw new Error("Duplicate chapter identifier");
    retained.add(externalId);
    const old = existing.find(row => row.externalId === externalId);
    const title = u.title.trim() || `Part ${position + 1}`;
    const estimatedReadMinutes = estimateReadMinutes(contentMarkdown);
    minutes += estimatedReadMinutes;
    const changed = !old || old.title !== title || old.contentMarkdown !== contentMarkdown;
    const row = { position, title, contentMarkdown, estimatedReadMinutes, isDeleted: false, updatedAt: now };
    if (old) {
      await ctx.db.patch(old._id, { ...row, ...(changed ? { revision: (old.revision ?? 1) + 1, preparationState: "queued" as const, preparationCursor: 0, preparationError: undefined, preparationLease: undefined } : {}) });
      if (changed) await ctx.scheduler.runAfter(0, internal.libraryPreparation.prepareUnit, { unitId: old._id });
    } else {
      const id = await ctx.db.insert("libraryUnits", { organizationId: orgId, workId, externalId, ...row, revision: 1, preparationState: "queued", preparationCursor: 0, createdAt: now });
      await ctx.scheduler.runAfter(0, internal.libraryPreparation.prepareUnit, { unitId: id });
    }
    position++;
  }
  for (const old of existing) if (!retained.has(old.externalId)) await ctx.db.patch(old._id, { isDeleted: true });
  const work = await ctx.db.get(workId);
  if (!work || work.organizationId !== orgId) throw new Error("Work not found");
  if (!position && !work.externalUrl) throw new Error("Add text or an external link");
  const current = (await ctx.db.query("libraryUnits").withIndex("by_workId", q => q.eq("workId", workId)).collect()).filter(u => !u.isDeleted);
  const ready = current.every(u => u.preparationState === "ready");
  await ctx.db.patch(workId, { hasText: position > 0, estimatedReadMinutes: position ? minutes : undefined,
    isPublished: ready && work.isPublished, publishRequested: work.publishRequested || work.isPublished, updatedAt: now });
  await finishPublication(ctx, workId);
}

export async function requestPreparation(ctx: MutationCtx, orgId: string, workId: Id<"libraryWorks">) {
  const units = await ctx.db.query("libraryUnits").withIndex("by_workId", q => q.eq("workId", workId)).collect();
  for (const unit of units) {
    if (unit.organizationId !== orgId || unit.isDeleted || unit.preparationState === "ready") continue;
    if (unit.preparationState !== "preparing" || (unit.preparationLease ?? 0) < Date.now()) {
      await ctx.db.patch(unit._id, { preparationState: "queued", preparationError: undefined, preparationLease: undefined, revision: unit.revision ?? 1 });
      await ctx.scheduler.runAfter(0, internal.libraryPreparation.prepareUnit, { unitId: unit._id });
    }
  }
}

export async function finishPublication(ctx: MutationCtx, workId: Id<"libraryWorks">) {
  const work = await ctx.db.get(workId);
  if (!work || work.isDeleted || work.importInProgress || !work.publishRequested) return;
  const units = (await ctx.db.query("libraryUnits").withIndex("by_workId", q => q.eq("workId", workId)).collect()).filter(u => !u.isDeleted);
  if (!units.length && !work.externalUrl) throw new Error("Add text or an external link");
  const ready = units.every(u => u.preparationState === "ready");
  await ctx.db.patch(workId, { isPublished: ready, hasText: units.length > 0, estimatedReadMinutes: units.length ? units.reduce((sum,u) => sum + (u.estimatedReadMinutes ?? 1), 0) : undefined });
}

/** Owner-operated release command; never exposed to a learner. */
export const prepareCatalogue = internalMutation({
  args: { publishDrafts: v.optional(v.boolean()) },
  handler: async (ctx, { publishDrafts }) => {
    const works = await ctx.db.query("libraryWorks").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID)).collect();
    for (const work of works.filter(w => !w.isDeleted)) {
      await ctx.db.patch(work._id, { publishRequested: work.isPublished || work.publishRequested || (publishDrafts && work.levelCEFR === "B2") || false, isPublished: false });
      await requestPreparation(ctx, ACADEMY_ID, work._id);
      await finishPublication(ctx, work._id);
    }
    return { requested: works.filter(w => !w.isDeleted).length };
  },
});

export const myReadingActivity = query({
  args: {},
  handler: async ctx => {
    const { orgId, user } = await requireTenant(ctx);
    const progress = await ctx.db.query("libraryProgress").withIndex("by_organization_and_ownerId", q => q.eq("organizationId", orgId).eq("ownerId", user.externalId)).collect();
    const items = [];
    for (const p of progress.sort((a,b) => b.lastReadAt.localeCompare(a.lastReadAt))) {
      const work = await ctx.db.get(p.workId);
      if (!work || work.isDeleted || !work.isPublished || work.organizationId !== orgId) continue;
      const units = (await ctx.db.query("libraryUnits").withIndex("by_workId_and_position", q => q.eq("workId", work._id)).collect()).filter(u => !u.isDeleted);
      const unit = units.find(u => u._id === p.lastUnitId) ?? units.find(u => u.position === p.lastUnitPosition) ?? units[0];
      items.push({ workId: work._id, title: work.title, unitId: unit?._id, completed: !!p.completedAt });
    }
    return { completed: progress.filter(p => p.completedAt).length, continueReading: items.filter(i => !i.completed && i.unitId).slice(0,3) };
  },
});
