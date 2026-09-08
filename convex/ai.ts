import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireTenantAction } from "./lib/tenant";
import { userHasPermission } from "./lib/permissions";
import { getAiTask } from "./lib/aiTasks";
import { callOpenRouter } from "./lib/aiProvider";

export const _canGenerate = internalQuery({
  args: { tokenIdentifier: v.string(), organizationId: v.string(), taskId: v.string() },
  handler: async (ctx, { tokenIdentifier, organizationId, taskId }) => {
    if (!getAiTask(taskId)) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (!user || user.organizationId !== organizationId) return false;
    return userHasPermission(
      user,
      taskId === "library_vocabulary" || taskId === "word_gloss"
        ? "library.upload"
        : "lessons.edit"
    );
  },
});

/** Generic server-owned AI generation for the lesson review surface. */
export const generate = action({
  args: {
    taskId: v.string(),
    input: v.string(),
  },
  handler: async (ctx, { taskId, input }) => {
    const { orgId, tokenIdentifier } = await requireTenantAction(ctx);
    const allowed = await ctx.runQuery(internal.ai._canGenerate, {
      organizationId: orgId,
      tokenIdentifier,
      taskId,
    });
    if (!allowed) throw new Error("Access denied for this AI task");
    if (!input.trim() || input.length > 20_000) {
      throw new Error("AI input must contain 1–20000 characters");
    }
    const config = await ctx.runQuery(
      internal.promptConfigs.resolveForGeneration,
      { taskId }
    );
    const result = await callOpenRouter(config, input);
    return {
      content: result.content,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
    };
  },
});
