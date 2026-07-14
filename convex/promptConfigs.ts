// Prompt configs are seeded per-org via seed.ts. Listing + per-config
// lookup is read-only here. Editor UI in /admin/ai (Phase F) will write
// via dedicated admin mutations.

import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { requireTenant } from "./lib/tenant";
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
        'You are an English language teaching assistant. Extract English vocabulary from the lesson transcript. For each word/phrase, provide the English word, a Russian translation, and the part of speech. Return ONLY a valid JSON array.\n\nFormat: [{"word": "English word", "translation": "Russian translation", "partOfSpeech": "noun|verb|adjective|phrase|adverb|preposition|interjection"}]',
      userPromptTemplate:
        "Extract all key English vocabulary from this lesson transcript. Return a JSON array with word, translation, and partOfSpeech:\n\n{{transcript}}",
    });
    return "Vocab prompt fixed";
  },
});
