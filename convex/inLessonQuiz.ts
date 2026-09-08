// On-the-Spot Quiz Generator (Phase D feature §4.2).
//
// Hard rule: this action runs INDEPENDENTLY of the active Soniox
// transcription socket. The teacher's recording WebSocket lives in the
// browser; this Convex action is a separate call with its own lifetime.
// The UI fires it fire-and-forget so the live transcript is never
// paused or interrupted.

import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant, requireTenantAction } from "./lib/tenant";
import { callOpenRouter } from "./lib/aiProvider";

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

async function generateTask(
  ctx: ActionCtx,
  taskId: "live_quiz" | "conversation_questions",
  transcript: string
): Promise<string> {
  const config = await ctx.runQuery(internal.promptConfigs.resolveForGeneration, {
    taskId,
  });
  return (await callOpenRouter(config, transcript)).content;
}

// ── Internal helpers (DB-only) ───────────────────────────────────

export const _ensureCanGenerate = internalQuery({
  args: { organizationId: v.string(), lessonId: v.id("lessons") },
  handler: async (ctx, { organizationId, lessonId }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== organizationId) {
      throw new Error("Lesson not found in this organization");
    }
    return true;
  },
});

export const _writeDraft = internalMutation({
  args: {
    organizationId: v.string(),
    lessonId: v.id("lessons"),
    generatedBy: v.string(),
    sourceTranscript: v.string(),
    questions: v.array(
      v.object({
        question: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("inLessonQuizDrafts", {
      organizationId: args.organizationId,
      lessonId: args.lessonId,
      generatedBy: args.generatedBy,
      sourceTranscript: args.sourceTranscript,
      questions: args.questions,
      generatedAt: new Date().toISOString(),
    });
  },
});

// ── Public query: live drafts for a lesson ──────────────────────

export const listDraftsForLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId) return [];
    return await ctx.db
      .query("inLessonQuizDrafts")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

// ── Action: generate from current transcript buffer ─────────────

export const generateQuizFromBuffer = action({
  args: {
    lessonId: v.id("lessons"),
    transcriptBuffer: v.string(),
  },
  handler: async (
    ctx,
    { lessonId, transcriptBuffer }
  ): Promise<{ draftId: string; count: number }> => {
    const { orgId, tokenIdentifier } = await requireTenantAction(ctx);

    if (!transcriptBuffer.trim()) {
      throw new Error("Transcript buffer is empty");
    }

    // Verify lesson belongs to caller's org (cross-tenant guard via
    // an internal query that runs in a regular Convex DB context).
    await ctx.runQuery(internal.inLessonQuiz._ensureCanGenerate, {
      organizationId: orgId,
      lessonId,
    });

    const content = await generateTask(ctx, "live_quiz", transcriptBuffer);

    const questions = parseQuizJson(content);
    if (questions.length === 0) {
      throw new Error("Model returned no parseable questions");
    }

    const draftId: string = await ctx.runMutation(
      internal.inLessonQuiz._writeDraft,
      {
        organizationId: orgId,
        lessonId,
        generatedBy: tokenIdentifier,
        sourceTranscript: transcriptBuffer,
        questions,
      }
    );

    return { draftId, count: questions.length };
  },
});

/** Robust JSON extraction — handles fenced markdown, leading prose, etc. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseQuizJson(raw: string): QuizQuestion[] {
  if (!raw) return [];
  // Strip fences
  let txt = raw.trim();
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  // Find first '[' and matching ']' or first '{' and matching '}'.
  const candidates: string[] = [];
  const bracketStart = txt.indexOf("[");
  if (bracketStart >= 0) {
    candidates.push(txt.slice(bracketStart));
  }
  const braceStart = txt.indexOf("{");
  if (braceStart >= 0) {
    candidates.push(txt.slice(braceStart));
  }
  candidates.push(txt);

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const parsedRecord = isRecord(parsed) ? parsed : null;
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsedRecord?.questions)
          ? parsedRecord.questions
          : null;
      if (!arr) continue;
      const out: QuizQuestion[] = [];
      for (const value of arr) {
        const q = isRecord(value) ? value : null;
        const options = q && Array.isArray(q.options) ? q.options : null;
        if (
          q &&
          typeof q.question === "string" &&
          options !== null &&
          options.every((option) => typeof option === "string") &&
          typeof q.correctIndex === "number"
        ) {
          out.push({
            question: q.question,
            options,
            correctIndex: q.correctIndex,
            explanation: typeof q.explanation === "string" ? q.explanation : undefined,
          });
        }
      }
      if (out.length > 0) return out;
    } catch {
      // try next candidate
    }
  }
  return [];
}

// ── Action: generate conversation questions from transcript ─────

export const generateConversationQuestions = action({
  args: {
    lessonId: v.id("lessons"),
    transcriptBuffer: v.string(),
  },
  handler: async (
    ctx,
    { lessonId, transcriptBuffer }
  ): Promise<{ questions: string[] }> => {
    const { orgId } = await requireTenantAction(ctx);

    if (!transcriptBuffer.trim()) {
      throw new Error("Transcript buffer is empty");
    }

    await ctx.runQuery(internal.inLessonQuiz._ensureCanGenerate, {
      organizationId: orgId,
      lessonId,
    });

    const content = await generateTask(ctx, "conversation_questions", transcriptBuffer);

    const questions = parseQuestionsJson(content);
    return { questions };
  },
});

function parseQuestionsJson(raw: string): string[] {
  if (!raw) return [];
  let txt = raw.trim();
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  const candidates: string[] = [];
  const bracketStart = txt.indexOf("[");
  if (bracketStart >= 0) candidates.push(txt.slice(bracketStart));
  const braceStart = txt.indexOf("{");
  if (braceStart >= 0) candidates.push(txt.slice(braceStart));
  candidates.push(txt);

  for (const c of candidates) {
    try {
      const parsed: unknown = JSON.parse(c);
      const parsedRecord = isRecord(parsed) ? parsed : null;
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsedRecord?.questions)
          ? parsedRecord.questions
          : null;
      if (arr && arr.every((value) => typeof value === "string")) {
        return arr;
      }
    } catch {
      // try next
    }
  }
  return [];
}
