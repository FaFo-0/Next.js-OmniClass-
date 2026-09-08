import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenantAction, requireTenantPermission } from "./lib/tenant";
import { userHasPermission } from "./lib/permissions";
import {
  callOpenRouter,
  normalizeOpenRouterModels,
  type OpenRouterModel,
} from "./lib/aiProvider";

export const _canConfigure = internalQuery({
  args: { tokenIdentifier: v.string(), organizationId: v.string() },
  handler: async (ctx, { tokenIdentifier, organizationId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    return Boolean(
      user && user.organizationId === organizationId && userHasPermission(user, "ai.configure")
    );
  },
});

export const list = query({
  args: { includeUnlisted: v.optional(v.boolean()) },
  handler: async (ctx, { includeUnlisted }) => {
    const { orgId } = await requireTenantPermission(ctx, "ai.configure");
    const rows = await ctx.db
      .query("aiModelCatalog")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .take(500);
    return includeUnlisted ? rows : rows.filter((row) => row.isListed);
  },
});

function sameModel(a: OpenRouterModel, b: { name?: string; contextLength?: number; promptPrice?: number; completionPrice?: number; supportedParameters?: string[]; modality?: string; created?: number; expiration?: string | null }): boolean {
  return a.name === b.name &&
    a.contextLength === b.contextLength &&
    a.promptPrice === b.promptPrice &&
    a.completionPrice === b.completionPrice &&
    JSON.stringify(a.supportedParameters ?? []) === JSON.stringify(b.supportedParameters ?? []) &&
    a.modality === b.modality &&
    a.created === b.created &&
    a.expiration === b.expiration;
}

export const _storeRefresh = internalMutation({
  args: {
    organizationId: v.string(),
    models: v.array(v.object({
      id: v.string(),
      name: v.optional(v.string()),
      contextLength: v.optional(v.number()),
      promptPrice: v.optional(v.number()),
      completionPrice: v.optional(v.number()),
      supportedParameters: v.optional(v.array(v.string())),
      modality: v.optional(v.string()),
      created: v.optional(v.number()),
      expiration: v.optional(v.union(v.string(), v.null())),
    })),
    refreshedAt: v.string(),
  },
  handler: async (ctx, { organizationId, models, refreshedAt }) => {
    const existing = await ctx.db
      .query("aiModelCatalog")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(1000);
    const byId = new Map(existing.map((row) => [row.modelId, row]));
    let added = 0;
    let changed = 0;
    for (const model of models) {
      const row = byId.get(model.id);
      if (!row) {
        added += 1;
        await ctx.db.insert("aiModelCatalog", {
          organizationId,
          modelId: model.id,
          ...model,
          isListed: true,
          firstSeenAt: refreshedAt,
          lastSeenAt: refreshedAt,
        });
        continue;
      }
      if (!sameModel(model, row) || !row.isListed) changed += 1;
      await ctx.db.patch(row._id, { ...model, isListed: true, lastSeenAt: refreshedAt });
    }
    let noLongerListed = 0;
    const seen = new Set(models.map((model) => model.id));
    for (const row of existing) {
      if (row.isListed && !seen.has(row.modelId)) {
        noLongerListed += 1;
        await ctx.db.patch(row._id, { isListed: false });
      }
    }
    return { fetched: models.length, added, changed, noLongerListed, refreshedAt };
  },
});

export const refresh = action({
  args: {},
  handler: async (ctx): Promise<{ fetched: number; added: number; changed: number; noLongerListed: number; refreshedAt: string }> => {
    const { orgId, tokenIdentifier } = await requireTenantAction(ctx);
    const allowed = await ctx.runQuery(internal.aiModels._canConfigure, {
      organizationId: orgId,
      tokenIdentifier,
    });
    if (!allowed) throw new Error('Access denied: missing permission "ai.configure"');
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OpenRouter model refresh failed (${response.status})`);
    const models = normalizeOpenRouterModels(await response.json());
    if (models.length === 0) throw new Error("OpenRouter returned no usable models");
    return await ctx.runMutation(internal.aiModels._storeRefresh, {
      organizationId: orgId,
      models,
      refreshedAt: new Date().toISOString(),
    });
  },
});

export const testPrompt = action({
  args: { configId: v.string(), sampleInput: v.string() },
  handler: async (ctx, { configId, sampleInput }) => {
    const { orgId, tokenIdentifier } = await requireTenantAction(ctx);
    const allowed = await ctx.runQuery(internal.aiModels._canConfigure, {
      organizationId: orgId,
      tokenIdentifier,
    });
    if (!allowed) throw new Error('Access denied: missing permission "ai.configure"');
    if (!sampleInput.trim() || sampleInput.length > 4000) {
      throw new Error("Sample input must contain 1–4000 characters");
    }
    const config = await ctx.runQuery(internal.promptConfigs.resolveForGeneration, { taskId: configId });
    const result = await callOpenRouter(config, sampleInput);
    return { content: result.content, model: result.model, fallbackUsed: result.fallbackUsed };
  },
});
