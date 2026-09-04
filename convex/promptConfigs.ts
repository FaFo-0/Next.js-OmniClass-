// Prompt configs are seeded per-org via seed.ts. Listing + per-config
// lookup is read-only here. Editor UI in /admin/ai (Phase F) will write
// via dedicated admin mutations.

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import { defaultPromptConfigs } from "./lib/defaultPrompts";

// Orgs whose DB was never seeded (or is missing a config) fall back to the
// code defaults so AI generation never hard-fails on a missing config row.
export const listForOrg = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("promptConfigs")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const have = new Set(rows.map((r) => r.configId));
    const fallbacks = defaultPromptConfigs
      .filter((c) => !have.has(c.configId))
      .map((c) => ({ ...c, organizationId: orgId }));
    return [...rows, ...fallbacks];
  },
});

export const getByConfigId = query({
  args: { configId: v.string() },
  handler: async (ctx, { configId }) => {
    const { orgId } = await requireTenant(ctx);
    const row = await ctx.db
      .query("promptConfigs")
      .withIndex("by_organization_and_configId", (q) =>
        q.eq("organizationId", orgId).eq("configId", configId)
      )
      .unique();
    if (row) return row;
    const fallback = defaultPromptConfigs.find((c) => c.configId === configId);
    return fallback ? { ...fallback, organizationId: orgId } : null;
  },
});

/**
 * Save an edited prompt. The list mixes stored rows with code fallbacks for
 * configs an org was never seeded with, so editing a fallback has to insert
 * the row rather than patch one — hence upsert by `configId`.
 */
export const upsert = mutation({
  args: {
    configId: v.string(),
    name: v.string(),
    systemPrompt: v.string(),
    userPromptTemplate: v.string(),
    model: v.string(),
    temperature: v.number(),
    maxTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "ai.configure");
    if (args.temperature < 0 || args.temperature > 2) {
      throw new Error("Temperature must be between 0 and 2");
    }
    if (args.maxTokens < 1 || args.maxTokens > 32000) {
      throw new Error("Max tokens must be between 1 and 32000");
    }
    const existing = await ctx.db
      .query("promptConfigs")
      .withIndex("by_organization_and_configId", (q) =>
        q.eq("organizationId", orgId).eq("configId", args.configId)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    // Never seeded — take the rest of the shape from the code default.
    const fallback = defaultPromptConfigs.find(
      (c) => c.configId === args.configId
    );
    if (!fallback) throw new Error("Unknown prompt config");
    return await ctx.db.insert("promptConfigs", {
      ...fallback,
      ...args,
      organizationId: orgId,
    });
  },
});

/** Drop an org's override so the code default applies again. */
export const resetToDefault = mutation({
  args: { configId: v.string() },
  handler: async (ctx, { configId }) => {
    const { orgId } = await requireTenantPermission(ctx, "ai.configure");
    if (!defaultPromptConfigs.some((c) => c.configId === configId)) {
      throw new Error("No code default exists for this prompt");
    }
    const existing = await ctx.db
      .query("promptConfigs")
      .withIndex("by_organization_and_configId", (q) =>
        q.eq("organizationId", orgId).eq("configId", configId)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Fix the vocab_extraction prompt — was using "arabic" field for English word. */
export const fixVocabPrompt = internalMutation({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    const config = await ctx.db
      .query("promptConfigs")
      .withIndex("by_organization_and_configId", (q) =>
        q.eq("organizationId", orgId).eq("configId", "vocab_extraction")
      )
      .unique();
    if (!config) return "No vocab_extraction config found";
    await ctx.db.patch(config._id, {
      systemPrompt:
        'You are an English language teaching assistant. From the supplied, ID-labelled lesson utterances, suggest a short list of teachable English words or multi-word phrases that genuinely occur in the lesson. For each item give its exact surface form, the matching utteranceId, part of speech, a student-language translation, and a SHORT English definition. Do not invent sentences, do not use teacher notes as evidence, and do not return a word unless it occurs verbatim in the referenced utterance. Return ONLY a valid JSON array.\n\nFormat: [{"word": "exact English word or phrase", "utteranceId": "the supplied utterance ID", "partOfSpeech": "noun|verb|adjective|phrase|adverb|other", "translation": "translation", "definition": "short English meaning"}]',
      userPromptTemplate:
        "Suggest teachable vocabulary only from these ID-labelled lesson utterances. Return word, utteranceId, partOfSpeech, translation and definition:\n\n{{transcript}}",
    });
    return "Vocab prompt fixed";
  },
});
