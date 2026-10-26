import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireTenantAction } from "./lib/tenant";
import { userHasPermission } from "./lib/permissions";
import { getAiTask } from "./lib/aiTasks";
import { callOpenRouter } from "./lib/aiProvider";
import { parseLessonSummary } from "./lib/lessonTitles";

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
    lessonId: v.optional(v.id("lessons")),
  },
  handler: async (ctx, { taskId, input, lessonId }) => {
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
    let target: { teacherId: string } | null = null;
    if (taskId === "lesson_summary" && lessonId) {
      target = await ctx.runQuery(internal.ai._summaryTarget, { lessonId, organizationId: orgId, tokenIdentifier });
    }
    const config = await ctx.runQuery(
      internal.promptConfigs.resolveForGeneration,
      { taskId }
    );
    const result = await callOpenRouter(config, input);
    if (target && lessonId) await ctx.runMutation(internal.lessons.saveGeneratedSummary, {
      id: lessonId, organizationId: orgId, teacherId: target.teacherId, content: result.content,
    });
    return {
      // Keep already-open older review pages working during backend-first rollout.
      content: taskId === "lesson_summary" && !lessonId ? parseLessonSummary(result.content).summary : result.content,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
    };
  },
});

export const _summaryTarget = internalQuery({
  args: { lessonId: v.id("lessons"), organizationId: v.string(), tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", args.tokenIdentifier)).unique();
    const lesson = await ctx.db.get(args.lessonId);
    if (!user || user.organizationId !== args.organizationId || !lesson || lesson.organizationId !== args.organizationId || lesson.isDeleted || (user.role !== "admin" && lesson.teacherId !== user.externalId)) throw new Error("Access denied");
    return { teacherId: lesson.teacherId };
  },
});
