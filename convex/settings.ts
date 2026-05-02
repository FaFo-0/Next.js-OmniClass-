import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { defaultPromptConfigs } from "./lib/defaultPrompts";
import { requireAuth, requirePermission } from "./lib/auth";

// ── Queries ──────────────────────────────────────────────────────────

export const listPromptConfigs = query({
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("promptConfigs").collect();
  },
});

export const getPromptConfig = query({
  args: { configId: v.string() },
  handler: async (ctx, { configId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("promptConfigs")
      .withIndex("by_configId", (q) => q.eq("configId", configId))
      .first();
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const updatePromptConfig = mutation({
  args: {
    configId: v.string(),
    name: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    userPromptTemplate: v.optional(v.string()),
    model: v.optional(v.string()),
    provider: v.optional(
      v.union(
        v.literal("openrouter"),
        v.literal("openai"),
        v.literal("anthropic")
      )
    ),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    outputFormat: v.optional(
      v.union(v.literal("text"), v.literal("json"))
    ),
  },
  handler: async (ctx, { configId, ...updates }) => {
    await requirePermission(ctx, "ai.configure");
    const doc = await ctx.db
      .query("promptConfigs")
      .withIndex("by_configId", (q) => q.eq("configId", configId))
      .first();
    if (!doc) return;

    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) patch[k] = val;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(doc._id, patch);
    }
  },
});

export const resetPromptConfig = mutation({
  args: { configId: v.string() },
  handler: async (ctx, { configId }) => {
    await requirePermission(ctx, "ai.configure");
    const defaultConfig = defaultPromptConfigs.find(
      (p) => p.configId === configId
    );
    if (!defaultConfig) return;

    const doc = await ctx.db
      .query("promptConfigs")
      .withIndex("by_configId", (q) => q.eq("configId", configId))
      .first();
    if (!doc) return;

    await ctx.db.patch(doc._id, {
      name: defaultConfig.name,
      systemPrompt: defaultConfig.systemPrompt,
      userPromptTemplate: defaultConfig.userPromptTemplate,
      model: defaultConfig.model,
      provider: defaultConfig.provider,
      temperature: defaultConfig.temperature,
      maxTokens: defaultConfig.maxTokens,
      outputFormat: defaultConfig.outputFormat,
    });
  },
});
