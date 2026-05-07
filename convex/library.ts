// Library & Reading Hub — admin uploads materials; students browse +
// study; teachers open the same view live and push words straight into
// the student's deck.
//
// All access goes through `tenantTable()` so cross-org leaks are
// structurally impossible.

import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant, requireTenantPermission, tenantTable } from "./lib/tenant";

const kind = v.union(
  v.literal("article"),
  v.literal("story"),
  v.literal("dialog"),
  v.literal("transcript"),
  v.literal("pdf")
);

const cefr = v.union(
  v.literal("A1"),
  v.literal("A2"),
  v.literal("B1"),
  v.literal("B2"),
  v.literal("C1"),
  v.literal("C2")
);

// ── Queries ──────────────────────────────────────────────────────

/** All published materials for this org. Hides soft-deleted. */
export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("libraryMaterials")
      .withIndex("by_organization_and_isPublished", (q) =>
        q.eq("organizationId", orgId).eq("isPublished", true)
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/** Admin view — includes drafts, excludes soft-deleted. */
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const rows = await ctx.db
      .query("libraryMaterials")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

export const get = query({
  args: { id: v.id("libraryMaterials") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId || row.isDeleted) return null;
    return row;
  },
});

// ── Mutations ────────────────────────────────────────────────────

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    kind,
    levelCEFR: v.optional(cefr),
    topicTags: v.array(v.string()),
    contentMarkdown: v.string(),
    audioFileId: v.optional(v.id("_storage")),
    sourceUrl: v.optional(v.string()),
    estimatedReadMinutes: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "library.upload");
    const now = new Date().toISOString();
    return await ctx.db.insert("libraryMaterials", {
      organizationId: orgId,
      ...args,
      isPublished: args.isPublished ?? false,
      uploadedBy: user.externalId,
      createdAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("libraryMaterials"),
    patch: v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      kind: v.optional(kind),
      levelCEFR: v.optional(cefr),
      topicTags: v.optional(v.array(v.string())),
      contentMarkdown: v.optional(v.string()),
      audioFileId: v.optional(v.id("_storage")),
      sourceUrl: v.optional(v.string()),
      estimatedReadMinutes: v.optional(v.number()),
      isPublished: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryMaterials");
    await t.patch(id, { ...patch, updatedAt: new Date().toISOString() });
  },
});

export const softDelete = mutation({
  args: { id: v.id("libraryMaterials") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryMaterials");
    await t.softDelete(id, user.externalId);
  },
});

export const restore = mutation({
  args: { id: v.id("libraryMaterials") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryMaterials");
    await t.restore(id);
  },
});

// ── Storage URL helpers ──────────────────────────────────────────

/** Generate a one-shot upload URL the client uses to PUT a file. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireTenantPermission(ctx, "library.upload");
    return await ctx.storage.generateUploadUrl();
  },
});

export const audioUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireTenant(ctx);
    return await ctx.storage.getUrl(storageId);
  },
});

// ════════════════════════════════════════════════════════════════
//  Word lookup (Free Dictionary API, cached in libraryWordLookups)
// ════════════════════════════════════════════════════════════════

/** Internal — cache check. */
export const _findCached = internalQuery({
  args: {
    organizationId: v.string(),
    word: v.string(),
    locale: v.string(),
  },
  handler: async (ctx, { organizationId, word, locale }) => {
    return await ctx.db
      .query("libraryWordLookups")
      .withIndex("by_organization_and_word_and_locale", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("word", word.toLowerCase())
          .eq("locale", locale)
      )
      .first();
  },
});

/** Internal — write cache hit. */
export const _writeCached = internalMutation({
  args: {
    organizationId: v.string(),
    word: v.string(),
    locale: v.string(),
    definition: v.string(),
    ipa: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    partsOfSpeech: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("libraryWordLookups", {
      ...args,
      word: args.word.toLowerCase(),
      fetchedAt: new Date().toISOString(),
      source: "free-dictionary",
    });
  },
});

interface WordLookupResult {
  word: string;
  ipa?: string;
  audioUrl?: string;
  definition: string;
  partsOfSpeech: string[];
  examples: string[];
  source: "free-dictionary" | "cache";
}

/**
 * Look up a word. Free Dictionary API (api.dictionaryapi.dev). Cached
 * per (org, word, locale) so the same word doesn't re-bill the upstream
 * service. Locale defaults to "en"; the upstream API only supports a
 * handful — fall back to "en" if the requested locale isn't supported.
 */
export const getWordLookup = action({
  args: {
    word: v.string(),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, { word, locale }): Promise<WordLookupResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const orgId =
      (identity as any).org_id ||
      (identity as any).orgId ||
      (identity as any).organization_id;
    if (!orgId) throw new Error("No active organization");

    const lc = (locale ?? "en").toLowerCase();
    const w = word.toLowerCase().trim();
    if (!w) throw new Error("Empty word");

    // Cache check
    const cached = await ctx.runQuery(internal.library._findCached, {
      organizationId: orgId,
      word: w,
      locale: lc,
    });
    if (cached) {
      return {
        word: cached.word,
        ipa: cached.ipa,
        audioUrl: cached.audioUrl,
        definition: cached.definition,
        partsOfSpeech: cached.partsOfSpeech,
        examples: [],
        source: "cache",
      };
    }

    // Upstream
    const url = `https://api.dictionaryapi.dev/api/v2/entries/${encodeURIComponent(lc)}/${encodeURIComponent(w)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Word "${w}" not found (${res.status})`);
    }
    const data = (await res.json()) as Array<{
      word: string;
      phonetic?: string;
      phonetics?: Array<{ text?: string; audio?: string }>;
      meanings?: Array<{
        partOfSpeech: string;
        definitions: Array<{ definition: string; example?: string }>;
      }>;
    }>;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Word "${w}" not found`);
    }
    const entry = data[0];

    const ipa =
      entry.phonetic ??
      entry.phonetics?.find((p) => p.text)?.text ??
      undefined;
    const audioUrl =
      entry.phonetics?.find((p) => p.audio && p.audio.length > 0)?.audio ??
      undefined;

    const partsOfSpeech: string[] = [];
    const definitions: string[] = [];
    const examples: string[] = [];
    for (const m of entry.meanings ?? []) {
      partsOfSpeech.push(m.partOfSpeech);
      for (const d of m.definitions.slice(0, 2)) {
        definitions.push(`(${m.partOfSpeech}) ${d.definition}`);
        if (d.example) examples.push(d.example);
      }
    }
    const definition = definitions.slice(0, 3).join("\n\n");

    await ctx.runMutation(internal.library._writeCached, {
      organizationId: orgId,
      word: w,
      locale: lc,
      definition,
      ipa,
      audioUrl,
      partsOfSpeech,
    });

    return {
      word: w,
      ipa,
      audioUrl,
      definition,
      partsOfSpeech,
      examples,
      source: "free-dictionary",
    };
  },
});
