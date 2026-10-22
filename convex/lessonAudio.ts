// Audio backup for live lessons. Each upload is a complete WebM snapshot,
// including its header. The latest durable snapshot is linked to the lesson;
// previous snapshots remain recoverable in storage if a later upload fails.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant } from "./lib/tenant";
import { canPlayLessonAudio } from "./lib/lessonAudioAccess";

/**
 * Playable URL for the lesson's saved recording, with the two honest lengths:
 * `recordedSeconds` is the audio actually captured, `durationSeconds` is the
 * teaching time of the session.
 *
 * Teacher (their own lesson) and admins only — a student never receives lesson
 * audio, not even for their own published lesson (see ./lib/lessonAudioAccess).
 * Returns null rather than throwing when there is nothing to play.
 */
export const getRecording = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId || lesson.isDeleted) return null;
    if (!canPlayLessonAudio(user, lesson)) return null;
    if (!lesson.audioFileId) return null;
    const url = await ctx.storage.getUrl(lesson.audioFileId);
    if (!url) return null;
    return {
      url,
      recordedSeconds: lesson.recordedSeconds ?? null,
      durationSeconds: lesson.durationSeconds,
      savedAt: lesson.createdAt,
      recordingMode: lesson.recordingMode ?? "live",
    };
  },
});

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
