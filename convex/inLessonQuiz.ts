// On-the-Spot Quiz Generator (Phase D feature §4.2).
//
// Hard rule: this action runs INDEPENDENTLY of the active Soniox
// transcription socket. The teacher's recording WebSocket lives in the
// browser; this Convex action is a separate call with its own lifetime.
// The UI fires it fire-and-forget so the live transcript is never
// paused or interrupted.

import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant } from "./lib/tenant";

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

async function generateTask(
  ctx: any,
  taskId: "live_quiz" | "conversation_questions",
  transcript: string
): Promise<string> {
  const config = await ctx.runQuery(internal.promptConfigs.resolveForGeneration, {
    taskId,
  });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const input = config.userPromptTemplate
    .split("{{transcript}}")
    .join(transcript);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: input },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const orgId =
      (identity as any).org_id ||
      (identity as any).orgId ||
      (identity as any).organization_id;
    if (!orgId) throw new Error("No active organization");

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
        generatedBy: identity.subject,
        sourceTranscript: transcriptBuffer,
        questions,
      }
    );

    return { draftId, count: questions.length };
  },
});

/** Robust JSON extraction — handles fenced markdown, leading prose, etc. */
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
      const parsed = JSON.parse(candidate);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.questions)
          ? parsed.questions
          : null;
      if (!arr) continue;
      const out: QuizQuestion[] = [];
      for (const q of arr) {
        if (
          typeof q?.question === "string" &&
          Array.isArray(q?.options) &&
          q.options.every((o: any) => typeof o === "string") &&
          typeof q?.correctIndex === "number"
        ) {
          out.push({
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation:
              typeof q.explanation === "string" ? q.explanation : undefined,
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

const CONVERSATION_PROMPT =
  "You are a friendly English language teacher. Given a lesson transcript, " +
  "generate 5-7 conversation questions that the teacher can ask the student. " +
  "Make them personal, open-ended, and natural — the kind of questions that " +
  "spark real discussion, not textbook drills. Tie them to topics and " +
  "vocabulary from the transcript. Return ONLY a JSON array of strings, " +
  'like: ["What do you think about...?", "Have you ever...?"]';

export const generateConversationQuestions = action({
  args: {
    lessonId: v.id("lessons"),
    transcriptBuffer: v.string(),
  },
  handler: async (
    ctx,
    { lessonId, transcriptBuffer }
  ): Promise<{ questions: string[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const orgId =
      (identity as any).org_id ||
      (identity as any).orgId ||
      (identity as any).organization_id;
    if (!orgId) throw new Error("No active organization");

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
      const parsed = JSON.parse(c);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.questions)
          ? parsed.questions
          : null;
      if (arr && arr.every((q: any) => typeof q === "string")) {
        return arr;
      }
    } catch {
      // try next
    }
  }
  return [];
}
