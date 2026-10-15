// Audio backup for live lessons. Each upload is a complete WebM snapshot,
// including its header. The latest durable snapshot is linked to the lesson;
// previous snapshots remain recoverable in storage if a later upload fails.

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireTenant } from "./lib/tenant";

/** Generate a one-time signed upload URL for an audio chunk. */
export const generateUploadUrl = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId) {
      throw new Error("Lesson not found");
    }
    if (
      lesson.teacherId !== user.externalId &&
      user.role !== "admin"
    ) {
      throw new Error("Only the lesson teacher can upload audio");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * After the client uploads the blob, call this to point
 * lessons.audioFileId at the latest complete snapshot. Old audioFileId rows
 * remain in storage for recovery; admin can prune later.
 */
export const setAudioFile = mutation({
  args: {
    lessonId: v.id("lessons"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { lessonId, storageId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId) {
      throw new Error("Lesson not found");
    }
    if (
      lesson.teacherId !== user.externalId &&
      user.role !== "admin"
    ) {
      throw new Error("Only the lesson teacher can attach audio");
    }
    await ctx.db.patch(lessonId, { audioFileId: storageId });
  },
});
