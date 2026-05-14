// I.1 — Audio backup for live lessons.
// Client captures the same MediaStream Soniox is consuming via
// MediaRecorder (audio/webm; codecs=opus) and uploads chunks to
// Convex storage. Each chunk is its own _storage row; on stop we
// link the latest chunk id to lessons.audioFileId. Earlier chunks
// stay in storage in case the final upload fails.
//
// Why per-chunk uploads rather than one final blob: lets us survive
// a tab close mid-lesson — every 2-minute slice is durable. Cheap
// at Convex storage prices, and the chunks share the same
// `audioFileId` only as a "latest" pointer.

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
 * lessons.audioFileId at the latest chunk. Old audioFileId rows
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
