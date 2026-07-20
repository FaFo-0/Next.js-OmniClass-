// Phase J — Homework module.
// Teacher creates a homework doc tied to a lesson, types prose +
// inserts fillable nodes, hits Save. Student opens the doc from the
// lesson page, types into the fillable nodes, hits Submit. Teacher
// reviews + leaves a free-form comment.
//
// `contentJson` is shaped as a TipTap Prosemirror doc. Custom nodes:
//   - studentBlank        (inline; student fills label/answer)
//   - studentCheckbox     (block list)
//   - studentMultiChoice  (block; teacher options, student selection)
//   - studentVocabList    (block; student-added words)
//
// We don't parse it server-side — just persist verbatim. The client
// owns the node schemas.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant } from "./lib/tenant";

const NOW = () => new Date().toISOString();

export const emptyDoc = () => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

// ── Queries ──────────────────────────────────────────────────────

export const getById = query({
  args: { id: v.id("homework") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) return null;
    // Students can only see their own; teachers see ones they own;
    // admins see everything in the org.
    if (user.role === "student" && row.studentId !== user.externalId) {
      return null;
    }
    if (user.role === "teacher" && row.teacherId !== user.externalId) {
      return null;
    }
    return row;
  },
});

export const listForLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("homework")
      .withIndex("by_organization_and_lessonId", (q) =>
        q.eq("organizationId", orgId).eq("lessonId", lessonId)
      )
      .collect();
    if (user.role === "student") {
      return rows.filter((r) => r.studentId === user.externalId);
    }
    if (user.role === "teacher") {
      return rows.filter((r) => r.teacherId === user.externalId);
    }
    return rows;
  },
});

export const listForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    if (
      target !== user.externalId &&
      user.role !== "admin" &&
      user.role !== "teacher"
    ) {
      throw new Error("Cannot list another student's homework");
    }
    return await ctx.db
      .query("homework")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", target)
      )
      .order("desc")
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────

export const create = mutation({
  args: {
    studentId: v.string(),
    lessonId: v.optional(v.id("lessons")),
    title: v.string(),
    contentJson: v.optional(v.any()),
    dueAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new Error("Only teachers/admins create homework");
    }
    const now = NOW();
    return await ctx.db.insert("homework", {
      organizationId: orgId,
      lessonId: args.lessonId,
      teacherId: user.externalId,
      studentId: args.studentId,
      title: args.title,
      contentJson: args.contentJson ?? emptyDoc(),
      status: "draft",
      dueAt: args.dueAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateContent = mutation({
  args: {
    id: v.id("homework"),
    contentJson: v.any(),
  },
  handler: async (ctx, { id, contentJson }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Homework not found");
    }
    const isTeacher =
      user.role === "teacher" && row.teacherId === user.externalId;
    const isStudent =
      user.role === "student" && row.studentId === user.externalId;
    const isAdmin = user.role === "admin";
    if (!isTeacher && !isStudent && !isAdmin) {
      throw new Error("Cannot edit this homework");
    }
    // Students can only edit while assigned/in_progress, and their
    // first save flips status to in_progress.
    if (isStudent && row.status !== "assigned" && row.status !== "in_progress") {
      throw new Error("Homework is not editable in its current status");
    }
    const patch: any = { contentJson, updatedAt: NOW() };
    if (isStudent && row.status === "assigned") {
      patch.status = "in_progress";
    }
    await ctx.db.patch(id, patch);
  },
});

export const assign = mutation({
  args: { id: v.id("homework") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Homework not found");
    }
    if (user.role !== "teacher" || row.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can assign");
    }
    const now = NOW();
    await ctx.db.patch(id, {
      status: "assigned",
      assignedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notifications", {
      organizationId: orgId,
      recipientId: row.studentId,
      kind: "homework_assigned",
      payload: { homeworkId: id, title: row.title },
      // Standalone route — lesson pages only list PUBLISHED lessons, so a
      // lesson link can point at a page the student cannot open yet.
      link: `/student/homework/${id}`,
      createdAt: now,
    });
  },
});

export const submit = mutation({
  args: { id: v.id("homework") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Homework not found");
    }
    if (user.role !== "student" || row.studentId !== user.externalId) {
      throw new Error("Only the owning student can submit");
    }
    const now = NOW();
    await ctx.db.patch(id, {
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notifications", {
      organizationId: orgId,
      recipientId: row.teacherId,
      kind: "homework_submitted",
      payload: { homeworkId: id, title: row.title },
      link: `/teacher/sessions/${row.lessonId ?? ""}`,
      createdAt: now,
    });
  },
});

export const review = mutation({
  args: { id: v.id("homework"), comment: v.optional(v.string()) },
  handler: async (ctx, { id, comment }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Homework not found");
    }
    if (user.role !== "teacher" || row.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can review");
    }
    const now = NOW();
    await ctx.db.patch(id, {
      status: "reviewed",
      teacherComment: comment,
      reviewedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notifications", {
      organizationId: orgId,
      recipientId: row.studentId,
      kind: "homework_reviewed",
      payload: { homeworkId: id, title: row.title },
      link: `/student/lessons/${row.lessonId ?? ""}`,
      createdAt: now,
    });
  },
});
