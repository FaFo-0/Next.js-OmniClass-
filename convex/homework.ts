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
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireTenant, tenantTable } from "./lib/tenant";
import { wallTimeToMs } from "./lib/time";
import {
  canCreateHomeworkForLesson,
  shouldAssignApprovedHomework,
} from "./lib/homeworkAuthorization";

const NOW = () => new Date().toISOString();

/**
 * When homework is due, by default: the student's next lesson.
 *
 * POLICY §10 defines the obligation as "check the student's submitted
 * homework before the next lesson", so that lesson IS the deadline — asking
 * a teacher to invent a date every time would only produce worse answers.
 * Stored as a real instant (the lesson start converted from academy
 * wall-clock), never a bare date string.
 *
 * Returns null when nothing is scheduled — then the homework simply has no
 * deadline, which is honest.
 */
async function nextLessonDueAt(
  ctx: MutationCtx,
  orgId: string,
  studentId: string
): Promise<string | null> {
  const settings = await ctx.db
    .query("tenantSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .unique();
  const tz = settings?.timezone ?? "UTC";

  const events = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId)
    )
    .collect();

  const now = Date.now();
  let soonest: number | null = null;
  for (const e of events) {
    if (e.isDeleted || e.type === "placeholder") continue;
    if (e.status !== "scheduled" && e.status !== "makeup") continue;
    const ms = wallTimeToMs(e.date, e.startTime, tz);
    if (Number.isNaN(ms) || ms <= now) continue;
    if (soonest === null || ms < soonest) soonest = ms;
  }
  return soonest === null ? null : new Date(soonest).toISOString();
}

export const emptyDoc = () => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

/**
 * Student serialization is an allowlist, not a blacklist. Stored homework may
 * contain legacy or malformed fields, so only the TipTap schema and the
 * student-visible exercise attrs are copied into the student response.
 */
const STUDENT_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "text",
  "studentBlank",
  "studentChoice",
  "studentText",
]);
const STUDENT_MARK_TYPES = new Set(["bold", "italic", "strike", "code"]);
const STUDENT_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "studentChoice",
  "studentText",
]);
const STUDENT_INLINE_TYPES = new Set(["text", "studentBlank"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validChoiceSelection(value: unknown, options: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (value === -1 || (Array.isArray(options) && value >= 0 && value < options.length))
  );
}

function sanitizeStudentAttrs(type: string, value: unknown): Record<string, unknown> | undefined {
  const attrs = isRecord(value) ? value : {};
  const out: Record<string, unknown> = {};

  if (type === "heading") {
    if (typeof attrs.level === "number" && Number.isInteger(attrs.level) && attrs.level >= 1 && attrs.level <= 6) {
      out.level = attrs.level;
    }
  } else if (type === "orderedList") {
    if (typeof attrs.start === "number" && Number.isInteger(attrs.start) && attrs.start >= 1) out.start = attrs.start;
  } else if (type === "studentBlank") {
    if (typeof attrs.label === "string") out.label = attrs.label;
    if (typeof attrs.answer === "string") out.answer = attrs.answer;
  } else if (type === "studentChoice") {
    if (typeof attrs.question === "string") out.question = attrs.question;
    const validOptions = Array.isArray(attrs.options) &&
      attrs.options.every((option: unknown) => typeof option === "string");
    if (validOptions) out.options = attrs.options;
    if (validChoiceSelection(attrs.selected, validOptions ? attrs.options : undefined)) {
      out.selected = attrs.selected;
    } else if (attrs.selected !== undefined) {
      out.selected = -1;
    }
  } else if (type === "studentText") {
    if (typeof attrs.prompt === "string") out.prompt = attrs.prompt;
    if (typeof attrs.answer === "string") out.answer = attrs.answer;
    if (typeof attrs.long === "boolean") out.long = attrs.long;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeStudentNode(value: unknown, allowedTypes: ReadonlySet<string>): Record<string, unknown> | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const type = value.type;
  if (!STUDENT_NODE_TYPES.has(type) || !allowedTypes.has(type)) return null;

  const out: Record<string, unknown> = { type };
  if (type === "text") {
    if (typeof value.text !== "string") return null;
    out.text = value.text;
    if ("marks" in value && Array.isArray(value.marks)) {
      const marks = value.marks
        .filter((mark: unknown): mark is { type: string } =>
          isRecord(mark) && typeof mark.type === "string" && STUDENT_MARK_TYPES.has(mark.type)
        )
        .map((mark) => ({ type: mark.type }));
      if (marks.length > 0) out.marks = marks;
    }
  }

  const attrs = sanitizeStudentAttrs(type, value.attrs);
  if (attrs) out.attrs = attrs;

  if ("content" in value) {
    if (!Array.isArray(value.content)) return null;
    const childTypes =
      type === "paragraph" || type === "heading" ? STUDENT_INLINE_TYPES :
      type === "bulletList" || type === "orderedList" ? new Set(["listItem"]) :
      type === "listItem" || type === "doc" ? STUDENT_BLOCK_TYPES : null;
    if (!childTypes) return null;
    const content = value.content
      .map((child: unknown) => sanitizeStudentNode(child, childTypes))
      .filter((child): child is Record<string, unknown> => child !== null);
    if ((type === "bulletList" || type === "orderedList" || type === "listItem") && content.length === 0) {
      return null;
    }
    out.content = content;
  } else if (type === "bulletList" || type === "orderedList" || type === "listItem") {
    return null;
  }

  return out;
}

// The Convex JSON boundary intentionally remains untyped for existing callers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeForStudent(doc: unknown): any {
  if (!isRecord(doc) || doc.type !== "doc" || !Array.isArray(doc.content)) {
    return { type: "doc", content: [] };
  }
  const content = doc.content
    .map((node: unknown) => sanitizeStudentNode(node, STUDENT_BLOCK_TYPES))
    .filter((node): node is Record<string, unknown> => node !== null);
  return { type: "doc", content };
}

/** Strip the key from a row for a student caller, unless already reviewed. */
function forStudent<T extends { status?: string; contentJson?: unknown }>(
  row: T,
): T & { contentJson: ReturnType<typeof sanitizeForStudent> } {
  if (row.status === "reviewed") return row as T & { contentJson: ReturnType<typeof sanitizeForStudent> };
  return { ...row, contentJson: sanitizeForStudent(row.contentJson) };
}

/**
 * Merge a student's incoming doc onto the authoritative stored doc, copying
 * only validated answer attrs. The student's browser holds a sanitized doc
 * (without expected/correct), so the stored key and structure remain intact.
 */
export function mergeStudentAnswers(stored: unknown, incoming: unknown): unknown {
  if (!stored || typeof stored !== "object") return stored;
  const storedRecord = stored as Record<string, unknown>;
  const out: Record<string, unknown> | unknown[] = Array.isArray(stored) ? [] : {};
  const nodeType = typeof storedRecord.type === "string" ? storedRecord.type : "";
  const incomingAt = (key: string): unknown =>
    isRecord(incoming) ? incoming[key] : Array.isArray(incoming) ? incoming[Number(key)] : undefined;
  const assign = (key: string, value: unknown) => {
    if (Array.isArray(out)) out[Number(key)] = value;
    else out[key] = value;
  };
  for (const [key, value] of Object.entries(storedRecord)) {
    if (key === "attrs" && isRecord(value)) {
      const merged: Record<string, unknown> = { ...value };
      const inAttrsValue = incomingAt("attrs");
      const inAttrs = isRecord(inAttrsValue) ? inAttrsValue : null;
      if (nodeType === "studentBlank" || nodeType === "studentText") {
        if (typeof merged.answer !== "string") merged.answer = "";
        if (inAttrs && typeof inAttrs.answer === "string") merged.answer = inAttrs.answer;
      } else if (nodeType === "studentChoice") {
        const options = Array.isArray(merged.options) &&
          merged.options.every((option) => typeof option === "string")
          ? merged.options
          : [];
        if (!validChoiceSelection(merged.selected, options)) merged.selected = -1;
        if (inAttrs && validChoiceSelection(inAttrs.selected, options)) {
          merged.selected = inAttrs.selected;
        }
      }
      assign(key, merged);
    } else if (Array.isArray(value)) {
      const incomingValue = incomingAt(key);
      const inArr = Array.isArray(incomingValue) ? incomingValue : [];
      assign(key, value.map((child, index) => mergeStudentAnswers(child, inArr[index])));
    } else if (value && typeof value === "object") {
      assign(key, mergeStudentAnswers(value, incomingAt(key)));
    } else {
      assign(key, value);
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
    if (args.lessonId) {
      const lesson = await tenantTable(ctx, orgId, "lessons").get(args.lessonId);
      if (!lesson) throw new Error("Lesson not found");
      if (args.studentId !== lesson.studentId) {
        throw new Error("Homework student must match lesson student");
      }
      if (!canCreateHomeworkForLesson(
        { organizationId: orgId, externalId: user.externalId, role: user.role },
        lesson,
        args.studentId,
      )) {
        throw new Error("Only the assigned teacher or an admin can create lesson homework");
      }
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

/** Dev/CI helper — author + assign a homework without the teacher UI. */
export const _seedCli = internalMutation({
  args: {
    organizationId: v.string(),
    teacherEmail: v.string(),
    studentEmail: v.string(),
    title: v.string(),
    dueAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.teacherEmail)
      )
      .first();
    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.studentEmail)
      )
      .first();
    if (!teacher || !student) throw new Error("teacher or student not found");

    const now = NOW();
    const due =
      args.dueAt ??
      (await nextLessonDueAt(ctx, args.organizationId, student.externalId)) ??
      undefined;
    const id = await ctx.db.insert("homework", {
      organizationId: args.organizationId,
      teacherId: teacher.externalId,
      studentId: student.externalId,
      title: args.title,
      contentJson: emptyDoc(),
      status: "assigned",
      assignedAt: now,
      dueAt: due,
      createdAt: now,
      updatedAt: now,
    });
    return { id, dueAt: due };
  },
});

export const assign = mutation({
  args: {
    id: v.id("homework"),
    /** Explicit deadline (ISO instant). Omitted → the next lesson. */
    dueAt: v.optional(v.string()),
  },
  handler: async (ctx, { id, dueAt }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Homework not found");
    }
    if (user.role !== "teacher" || row.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can assign");
    }
    const now = NOW();
    const due =
      dueAt ??
      row.dueAt ??
      (await nextLessonDueAt(ctx, orgId, row.studentId)) ??
      undefined;
    await ctx.db.patch(id, {
      status: "assigned",
      assignedAt: now,
      dueAt: due,
      updatedAt: now,
    });
    await ctx.db.insert("notifications", {
      organizationId: orgId,
      recipientId: row.studentId,
      kind: "homework_assigned",
      payload: { homeworkId: id, title: row.title, dueAt: due },
      // Standalone route — lesson pages only list PUBLISHED lessons, so a
      // lesson link can point at a page the student cannot open yet.
      link: `/student/homework/${id}`,
      createdAt: now,
    });
  },
});

/**
 * Approve / un-approve a draft. Mirrors the summary and vocabulary sections:
 * the teacher marks it ready, and Publish is what actually sends it.
 */
export const setApproved = mutation({
  args: { id: v.id("homework"), approved: v.boolean() },
  handler: async (ctx, { id, approved }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) throw new Error("Homework not found");
    if (user.role !== "admin" && row.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can approve");
    }
    await ctx.db.patch(id, {
      approvedAt: approved ? NOW() : undefined,
      updatedAt: NOW(),
    });
    return null;
  },
});

/**
 * Publish-time hand-off: every approved draft attached to this lesson goes to
 * the student at once. Called from `lessons.publish` — never from the client.
 */
export async function assignApprovedForLesson(
  ctx: MutationCtx,
  orgId: string,
  lessonId: Id<"lessons">,
  studentId: string
): Promise<number> {
  const rows = await ctx.db
    .query("homework")
    .withIndex("by_organization_and_lessonId", (q) =>
      q.eq("organizationId", orgId).eq("lessonId", lessonId)
    )
    .collect();

  const now = NOW();
  let sent = 0;
  for (const row of rows) {
    if (
      row.status !== "draft" ||
      !row.approvedAt ||
      !shouldAssignApprovedHomework(row.studentId, studentId)
    ) continue;
    const due =
      row.dueAt ?? (await nextLessonDueAt(ctx, orgId, studentId)) ?? undefined;
    await ctx.db.patch(row._id, {
      status: "assigned",
      assignedAt: now,
      dueAt: due,
      updatedAt: now,
    });
    await ctx.db.insert("notifications", {
      organizationId: orgId,
      recipientId: studentId,
      kind: "homework_assigned",
      payload: { homeworkId: row._id, title: row.title, dueAt: due },
      link: `/student/homework/${row._id}`,
      createdAt: now,
    });
    sent++;
  }
  return sent;
}

/**
 * Reopening a lesson pulls its homework back to draft so it can be edited —
 * unless the student has already started, in which case their work is theirs
 * and must not be yanked away mid-answer.
 */
export async function reopenForLesson(
  ctx: MutationCtx,
  orgId: string,
  lessonId: Id<"lessons">
): Promise<number> {
  const rows = await ctx.db
    .query("homework")
    .withIndex("by_organization_and_lessonId", (q) =>
      q.eq("organizationId", orgId).eq("lessonId", lessonId)
    )
    .collect();
  let n = 0;
  for (const row of rows) {
    if (row.status !== "assigned") continue;
    await ctx.db.patch(row._id, {
      status: "draft",
      assignedAt: undefined,
      updatedAt: NOW(),
    });
    n++;
  }
  return n;
}

/** Change (or clear) the deadline after assigning. */
export const setDueDate = mutation({
  args: { id: v.id("homework"), dueAt: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, dueAt }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Homework not found");
    }
    if (user.role !== "admin" && row.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can change the due date");
    }
    await ctx.db.patch(id, {
      dueAt: dueAt ?? undefined,
      updatedAt: NOW(),
    });
    return null;
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
    if (row.status !== "assigned" && row.status !== "in_progress") {
      throw new Error("Homework is not editable in its current status");
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
