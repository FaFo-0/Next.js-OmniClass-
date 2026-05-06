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

const SYSTEM_PROMPT =
  "You are an English language teaching assistant. Given a snippet of " +
  "live lesson transcript, generate a short multiple-choice quiz that " +
  "tests vocabulary, grammar, or comprehension from the snippet. " +
  "Return ONLY a JSON array (no prose) of 3-5 objects with shape: " +
  '[{"question":"...","options":["a","b","c","d"],"correctIndex":0,"explanation":"..."}]';

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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey)
      throw new Error(
        "OPENROUTER_API_KEY not configured. Run: npx convex env set OPENROUTER_API_KEY <key>"
      );

    const res = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: transcriptBuffer },
          ],
          temperature: 0.4,
          max_tokens: 800,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenRouter error (${res.status}): ${txt}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";

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
