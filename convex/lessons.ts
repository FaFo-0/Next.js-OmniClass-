import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";

// ── Queries ──────────────────────────────────────────────────────────

export const getLesson = query({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("lessons")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .unique();
  },
});

export const getLessonsForStudent = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("lessons")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .collect();
  },
});

export const getPublishedLessonsForStudent = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("lessons")
      .withIndex("by_studentId_and_status", (q) =>
        q.eq("studentId", studentId).eq("status", "published")
      )
      .collect();
  },
});

export const getLessonsForTeacher = query({
  args: { teacherId: v.string() },
  handler: async (ctx, { teacherId }) => {
    await requirePermission(ctx, "lessons.view.any");
    return await ctx.db
      .query("lessons")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", teacherId))
      .collect();
  },
});

export const listAllLessons = query({
  handler: async (ctx) => {
    await requirePermission(ctx, "lessons.view.any");
    return await ctx.db.query("lessons").collect();
  },
});

/** Compute vocab/flashcard/quiz totals for a student's published lessons. */
export const getStudentContentStats = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_studentId_and_status", (q) =>
        q.eq("studentId", studentId).eq("status", "published")
      )
      .collect();

    let totalVocab = 0;
    let totalFlashcards = 0;
    let totalQuiz = 0;

    for (const lesson of lessons) {
      const vocab = await ctx.db
        .query("lessonVocabulary")
        .withIndex("by_lessonId", (q) => q.eq("lessonId", lesson._id))
        .collect();
      totalVocab += vocab.length;

      const flash = await ctx.db
        .query("lessonFlashcards")
        .withIndex("by_lessonId", (q) => q.eq("lessonId", lesson._id))
        .collect();
      totalFlashcards += flash.length;

      const quiz = await ctx.db
        .query("lessonQuizQuestions")
        .withIndex("by_lessonId", (q) => q.eq("lessonId", lesson._id))
        .collect();
      totalQuiz += quiz.length;
    }

    return { totalVocab, totalFlashcards, totalQuiz };
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const createLesson = mutation({
  args: {
    externalId: v.string(),
    teacherId: v.string(),
    studentId: v.string(),
    title: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "lessons.create");
    return await ctx.db.insert("lessons", {
      ...args,
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
      createdAt: new Date().toISOString(),
    });
  },
});

export const finalizeTranscript = mutation({
  args: {
    id: v.id("lessons"),
    transcript: v.string(),
    durationSeconds: v.number(),
  },
  handler: async (ctx, { id, transcript, durationSeconds }) => {
    await requirePermission(ctx, "lessons.edit");
    await ctx.db.patch(id, {
      transcript,
      durationSeconds,
      status: "processing",
    });
  },
});

export const updateSummary = mutation({
  args: {
    id: v.id("lessons"),
    summary: v.string(),
  },
  handler: async (ctx, { id, summary }) => {
    await requirePermission(ctx, "lessons.edit");
    await ctx.db.patch(id, { summary });
  },
});

export const setContentSectionStatus = mutation({
  args: {
    id: v.id("lessons"),
    section: v.union(
      v.literal("summary"),
      v.literal("vocabulary"),
      v.literal("flashcards"),
      v.literal("quiz")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("review"),
      v.literal("approved")
    ),
  },
  handler: async (ctx, { id, section, status }) => {
    await requirePermission(ctx, "lessons.edit");
    const lesson = await ctx.db.get(id);
    if (!lesson) throw new Error("Lesson not found");
    await ctx.db.patch(id, {
      contentStatus: { ...lesson.contentStatus, [section]: status },
    });
  },
});

export const publishLesson = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "lessons.edit");
    await ctx.db.patch(id, {
      status: "published",
      publishedAt: new Date().toISOString(),
    });
  },
});

export const deleteLesson = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "lessons.delete");
    // Delete associated content
    const vocab = await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", id))
      .collect();
    for (const v of vocab) await ctx.db.delete(v._id);

    const flashcards = await ctx.db
      .query("lessonFlashcards")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", id))
      .collect();
    for (const f of flashcards) await ctx.db.delete(f._id);

    const quiz = await ctx.db
      .query("lessonQuizQuestions")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", id))
      .collect();
    for (const q of quiz) await ctx.db.delete(q._id);

    await ctx.db.delete(id);
  },
});
