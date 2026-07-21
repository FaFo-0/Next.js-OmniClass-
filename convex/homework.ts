// Phase J — Homework module.
// Teacher authors a homework doc (prose + exercises), assigns it. Student
// fills it and submits. Teacher grades per-item and reviews.
//
// `contentJson` is a TipTap doc. Exercise nodes (client owns the schemas):
//   - studentBlank   (inline; expected answer → auto-graded)
//   - studentChoice  (block; correct index → auto-graded)
//   - studentText    (block; open answer → teacher-graded)
//
// We don't parse it server-side except to strip the answer key before a
// student sees it pre-review (sanitizeForStudent).

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireTenant } from "./lib/tenant";

const NOW = () => new Date().toISOString();

export const emptyDoc = () => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

/**
 * Remove the answer key from a doc before a student sees it. `expected`
 * (blanks) and `correct` (choices) would otherwise ride to the student's
 * browser inside contentJson. Teacher `mark` overrides are stripped too —
 * those are internal grading state. Applied only pre-review; once reviewed,
 * the student is meant to see the correct answers to learn from them.
 */
function sanitizeForStudent(doc: any): any {
  if (!doc || typeof doc !== "object") return doc;
  const clone: any = Array.isArray(doc) ? [] : {};
  for (const [k, v2] of Object.entries(doc)) {
    if (k === "attrs" && v2 && typeof v2 === "object") {
      const attrs: any = { ...v2 };
      delete attrs.expected;
      delete attrs.correct;
      delete attrs.mark;
      clone[k] = attrs;
    } else if (v2 && typeof v2 === "object") {
      clone[k] = sanitizeForStudent(v2);
    } else {
      clone[k] = v2;
    }
  }
  return clone;
}

/** Strip the key from a row for a student caller, unless already reviewed. */
function forStudent(row: any) {
  if (row.status === "reviewed") return row;
  return { ...row, contentJson: sanitizeForStudent(row.contentJson) };
}

/** Only these node attrs may be written by a student. */
const STUDENT_WRITABLE = new Set(["answer", "selected"]);

/**
 * Merge a student's incoming doc onto the AUTHORITATIVE stored doc, copying
 * only their answers. The student's browser holds a sanitized doc (no
 * expected/correct), so letting them replace the stored doc would erase the
 * answer key. We walk both trees in lockstep and overlay just the writable
 * attrs, keeping the teacher's key and structure intact. If the shapes have
 * diverged for any reason, the stored node wins.
 */
function mergeStudentAnswers(stored: any, incoming: any): any {
  if (!stored || typeof stored !== "object") return stored;
  const out: any = Array.isArray(stored) ? [] : {};
  for (const [k, v2] of Object.entries(stored)) {
    if (k === "attrs" && v2 && typeof v2 === "object") {
      const merged: any = { ...v2 };
      const inAttrs = incoming?.attrs;
      if (inAttrs && typeof inAttrs === "object") {
        for (const key of STUDENT_WRITABLE) {
          if (key in inAttrs) merged[key] = inAttrs[key];
        }
      }
      out[k] = merged;
    } else if (Array.isArray(v2)) {
      const inArr = Array.isArray(incoming?.[k]) ? incoming[k] : [];
      out[k] = v2.map((child, i) => mergeStudentAnswers(child, inArr[i]));
    } else if (v2 && typeof v2 === "object") {
      out[k] = mergeStudentAnswers(v2, incoming?.[k]);
    } else {
      out[k] = v2;
    }
  }
  return out;
}

// ── Queries ──────────────────────────────────────────────────────

export const getById = query({
  args: { id: v.id("homework") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) return null;
    // Students can only see their own; teachers see ones they own;
    // admins see everything in the org.
    if (user.role === "student") {
      if (row.studentId !== user.externalId) return null;
      return forStudent(row);
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
      return rows
        .filter((r) => r.studentId === user.externalId)
        .map(forStudent);
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
    const rows = await ctx.db
      .query("homework")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", target)
      )
      .order("desc")
      .collect();
    return user.role === "student" ? rows.map(forStudent) : rows;
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
    // A student's incoming doc is the sanitized copy — merge only their
    // answers onto the stored doc so the answer key is never lost. Teachers
    // own the doc outright.
    const nextContent = isStudent
      ? mergeStudentAnswers(row.contentJson, contentJson)
      : contentJson;
    const patch: any = { contentJson: nextContent, updatedAt: NOW() };
    if (isStudent && row.status === "assigned") {
      patch.status = "in_progress";
    }
    await ctx.db.patch(id, patch);
  },
});

/** Dev/CI helper — reset a homework to draft with a known content doc. */
export const _resetCli = internalMutation({
  args: { id: v.id("homework"), contentJson: v.optional(v.any()) },
  handler: async (ctx, { id, contentJson }) => {
    await ctx.db.patch(id, {
      status: "draft",
      contentJson: contentJson ?? emptyDoc(),
      teacherComment: undefined,
      score: undefined,
      maxScore: undefined,
      assignedAt: undefined,
      submittedAt: undefined,
      reviewedAt: undefined,
      updatedAt: NOW(),
    });
    return null;
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
      payload: { homeworkId: id, title: row.title, lessonId: row.lessonId },
      link: row.lessonId ? `/teacher/sessions/${row.lessonId}` : `/teacher/students`,
      createdAt: now,
    });
  },
});

export const review = mutation({
  args: {
    id: v.id("homework"),
    comment: v.optional(v.string()),
    // Graded doc — carries the teacher's per-item `mark` overrides. Optional
    // so a plain comment-only review still works.
    contentJson: v.optional(v.any()),
    // Computed by the client from the graded doc (grading.ts scoreDoc).
    score: v.optional(v.number()),
    maxScore: v.optional(v.number()),
  },
  handler: async (ctx, { id, comment, contentJson, score, maxScore }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Homework not found");
    }
    if (user.role !== "teacher" || row.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can review");
    }
    const now = NOW();
    const patch: any = {
      status: "reviewed",
      teacherComment: comment,
      reviewedAt: now,
      updatedAt: now,
    };
    if (contentJson !== undefined) patch.contentJson = contentJson;
    if (score !== undefined) patch.score = score;
    if (maxScore !== undefined) patch.maxScore = maxScore;
    await ctx.db.patch(id, patch);
    await ctx.db.insert("notifications", {
      organizationId: orgId,
      recipientId: row.studentId,
      kind: "homework_reviewed",
      payload: { homeworkId: id, title: row.title },
      // Standalone route, not the published-lesson page (which a student
      // may not be able to open).
      link: `/student/homework/${id}`,
      createdAt: now,
    });
  },
});
