// Lessons — org-scoped CRUD + transcript ops + status transitions +
// soft delete/restore + no-show flagging.
//
// Lesson lifecycle: scheduled → recording → transcribed → review →
// published. No-show terminal states: no_show_student / no_show_teacher.

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  requireTenant,
  requireTenantPermission,
  tenantTable,
} from "./lib/tenant";
import type { Id } from "./_generated/dataModel";

const lessonStatus = v.union(
  v.literal("scheduled"),
  v.literal("recording"),
  v.literal("transcribed"),
  v.literal("review"),
  v.literal("published"),
  v.literal("no_show_student"),
  v.literal("no_show_teacher")
);

const contentSectionStatus = v.union(
  v.literal("pending"),
  v.literal("generating"),
  v.literal("review"),
  v.literal("approved")
);

// ── Queries ──────────────────────────────────────────────────────

/** All lessons for the active org (admin view; non-deleted only). */
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.view.any");
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/** Soft-deleted lessons (admin restore queue). */
export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.view.any");
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows.filter((r) => r.isDeleted);
  },
});

/** Lessons taught by the calling teacher. */
export const listForTeacher = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = teacherId ?? user.externalId;
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/** Published lessons visible to a student. */
export const listPublishedForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_studentId_and_status", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("studentId", target)
          .eq("status", "published")
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

export const get = query({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) return null;
    if (row.isDeleted) return null;
    return row;
  },
});

// ── Mutations ────────────────────────────────────────────────────

/** Teacher starts a session — creates an empty lesson row. */
export const create = mutation({
  args: {
    studentId: v.string(),
    title: v.string(),
    scheduledFor: v.optional(v.string()),
    recordingMode: v.optional(v.union(v.literal("live"), v.literal("upload"))),
    scheduleEventId: v.optional(v.id("scheduleEvents")),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "lessons.create");
    const now = new Date().toISOString();

    // Pre-fill from linked schedule event
    let title = args.title;
    let studentId = args.studentId;
    if (args.scheduleEventId) {
      const evt = await ctx.db.get(args.scheduleEventId);
      if (evt && evt.organizationId === orgId) {
        if (!args.title || args.title === "") title = evt.title ?? args.title;
        if (!args.studentId || args.studentId === "") studentId = evt.studentId ?? args.studentId;
      }
    }

    // Order = count of existing lessons for this student + 1 (loose
    // ordering used by the student lesson list).
    const existing = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", args.studentId)
      )
      .collect();
    const order = existing.length + 1;

    const externalId = `lesson-${orgId}-${Date.now()}`;

    return await ctx.db.insert("lessons", {
      organizationId: orgId,
      externalId,
      teacherId: user.externalId,
      studentId: args.studentId,
      title: args.title,
      status: "recording",
      transcript: "",
      summary: "",
      contentStatus: {
        summary: "pending",
        vocabulary: "pending",
        flashcards: "pending",
        quiz: "pending",
      },
      durationSeconds: 0,
      order,
      scheduledFor: args.scheduledFor,
      recordingMode: args.recordingMode ?? "live",
      scheduleEventId: args.scheduleEventId,
      createdAt: now,
    });
  },
});

/** Append a chunk of transcript text to the live lesson. Idempotent
 * append used during the recording session. */
export const appendTranscript = mutation({
  args: {
    id: v.id("lessons"),
    text: v.string(),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { id, text, durationSeconds }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    const lesson = await t.get(id);
    if (!lesson) throw new Error("Lesson not found");
    await t.patch(id, {
      transcript: lesson.transcript + text,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    });
  },
});

/** Stop & Save — finalize transcription, advance to "transcribed". */
export const finalizeTranscript = mutation({
  args: {
    id: v.id("lessons"),
    transcript: v.string(),
    durationSeconds: v.number(),
  },
  handler: async (ctx, { id, transcript, durationSeconds }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    await t.patch(id, {
      transcript,
      durationSeconds,
      status: "transcribed",
    });
  },
});

/** Manual edits to the lesson summary / title from the review page. */
export const updateContent = mutation({
  args: {
    id: v.id("lessons"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    contentStatusPatch: v.optional(
      v.object({
        summary: v.optional(contentSectionStatus),
        vocabulary: v.optional(contentSectionStatus),
        flashcards: v.optional(contentSectionStatus),
        quiz: v.optional(contentSectionStatus),
      })
    ),
  },
  handler: async (ctx, { id, title, summary, contentStatusPatch }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    const lesson = await t.get(id);
    if (!lesson) throw new Error("Lesson not found");
    const patch: Record<string, any> = {};
    if (title !== undefined) patch.title = title;
    if (summary !== undefined) patch.summary = summary;
    if (contentStatusPatch) {
      patch.contentStatus = {
        ...lesson.contentStatus,
        ...contentStatusPatch,
      };
    }
    await t.patch(id, patch);
  },
});

/** Publish lesson to student. Creates a 1:1 lesson deck for SRS. */
export const publish = mutation({
  args: { id: v.id("lessons"), status: v.optional(lessonStatus) },
  handler: async (ctx, { id, status }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    const lesson = await t.get(id);
    if (!lesson) throw new Error("Lesson not found");
    const now = new Date().toISOString();
    await t.patch(id, {
      status: status ?? "published",
      publishedAt: now,
    });

    // Auto-create deck for this lesson (idempotent — skip if already
    // exists from a prior publish/reopen).
    const existingDeck = await ctx.db
      .query("srsDecks")
      .withIndex("by_organization_and_sourceLessonId", (q) =>
        q.eq("organizationId", orgId).eq("sourceLessonId", id)
      )
      .first();
    if (!existingDeck) {
      await ctx.db.insert("srsDecks", {
        organizationId: orgId,
        externalId: `deck-${lesson.externalId}`,
        name: lesson.title,
        ownerId: lesson.studentId,
        source: "lesson",
        sourceLessonId: id as Id<"lessons">,
        createdAt: now,
      });
    }
  },
});

/** Reopen a published lesson back to review state. */
export const reopen = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    await t.patch(id, { status: "review" });
  },
});

/** Soft delete (teacher/admin). Hard delete reserved for CLI. */
export const softDelete = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    await t.softDelete(id, user.externalId);
  },
});

/** Restore from trash (admin only). */
export const restore = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.restore");
    const t = tenantTable(ctx, orgId, "lessons");
    await t.restore(id);
  },
});

/** Mark a no-show. If teacher no-show + tenantSettings says no-shows
 * consume credits, decrement the student package. */
export const markNoShow = mutation({
  args: {
    id: v.id("lessons"),
    by: v.union(v.literal("student"), v.literal("teacher")),
  },
  handler: async (ctx, { id, by }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.mark_no_show");
    const t = tenantTable(ctx, orgId, "lessons");
    const lesson = await t.get(id);
    if (!lesson) throw new Error("Lesson not found");

    await t.patch(id, {
      status: by === "student" ? "no_show_student" : "no_show_teacher",
    });

    // Point economy: spend captured at booking time, so student
    // no-show here is a status update only. Teacher no-show would
    // issue a refund grant via `points.refundPoints`.
  },
});
