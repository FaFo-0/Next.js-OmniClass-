// Phase J.2 — AI-generate homework from a lesson transcript.
// Returns a TipTap-shaped doc JSON with teacher prose + student-blank
// nodes the student fills out.

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant, tenantTable } from "./lib/tenant";
import { callOpenRouter } from "./lib/aiProvider";

type GenerationConfig = {
  inputKey: "transcript" | "text";
  outputFormat: "text" | "json";
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  provider: "openrouter" | "openai" | "anthropic";
  temperature: number;
  maxTokens: number;
};

type HomeworkDoc = {
  type: "doc";
  content: unknown[];
  [key: string]: unknown;
};

// ── Internal helpers ────────────────────────────────────────────

export const _prepareGeneration = internalQuery({
  args: {
    homeworkId: v.id("homework"),
    lessonId: v.id("lessons"),
  },
  handler: async (ctx, { homeworkId, lessonId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const homework = await tenantTable(ctx, orgId, "homework").get(homeworkId);
    if (!homework) throw new Error("Homework not found");
    if (user.role !== "admin" && homework.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can generate this homework");
    }
    if (homework.status !== "draft") {
      throw new Error("Only draft homework can be generated");
    }
    if (homework.lessonId !== lessonId) {
      throw new Error("Homework is not attached to this lesson");
    }

    const lesson = await tenantTable(ctx, orgId, "lessons").get(lessonId);
    if (!lesson) throw new Error("Lesson not found");
    if (user.role !== "admin" && lesson.teacherId !== user.externalId) {
      throw new Error("Only the lesson teacher can generate homework");
    }
    const transcript = lesson.transcript ?? "";
    if (!transcript.trim()) throw new Error("Lesson has no transcript yet");
    return { transcript };
  },
});

export const _replaceContent = internalMutation({
  args: {
    homeworkId: v.id("homework"),
    contentJson: v.any(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { homeworkId, contentJson, title }) => {
    const { orgId, user } = await requireTenant(ctx);
    const table = tenantTable(ctx, orgId, "homework");
    const row = await table.get(homeworkId);
    if (!row) throw new Error("Homework not found");
    if (user.role !== "admin" && row.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can generate this homework");
    }
    if (row.status !== "draft") {
      throw new Error("Only draft homework can be generated");
    }
    const now = new Date().toISOString();
    const patch: {
      contentJson: unknown;
      updatedAt: string;
      title?: string;
    } = { contentJson, updatedAt: now };
    if (title) patch.title = title;
    await table.patch(homeworkId, patch);
  },
});

export const _appendQuizContent = internalMutation({
  args: {
    homeworkId: v.id("homework"),
    quizContent: v.array(v.any()),
  },
  handler: async (ctx, { homeworkId, quizContent }) => {
    const { orgId, user } = await requireTenant(ctx);
    const table = tenantTable(ctx, orgId, "homework");
    const row = await table.get(homeworkId);
    if (!row) throw new Error("Homework not found");
    if (user.role !== "admin" && row.teacherId !== user.externalId) {
      throw new Error("Only the owning teacher can generate this homework");
    }
    if (row.status !== "draft") {
      throw new Error("Only draft homework can be generated");
    }
    const current = asRecord(row.contentJson);
    const existingContent = Array.isArray(current?.content) ? current.content : [];
    await table.patch(homeworkId, {
      contentJson: {
        ...(current ?? {}),
        type: "doc",
        content: [...existingContent, ...quizContent],
      },
      updatedAt: new Date().toISOString(),
    });
  },
});


// ── Actions ──────────────────────────────────────────────────────

export const generateFromLesson = action({
  args: {
    homeworkId: v.id("homework"),
    lessonId: v.id("lessons"),
  },
  handler: async (ctx, { homeworkId, lessonId }) => {
    const { transcript } = await ctx.runQuery(
      internal.homeworkAi._prepareGeneration,
      { homeworkId, lessonId }
    );
    const config: GenerationConfig = await ctx.runQuery(
      internal.promptConfigs.resolveForGeneration,
      { taskId: "homework_worksheet" }
    );
    const content = (await callOpenRouter(config, transcript.slice(-12000))).content;
    const doc = parseDoc(content);
    if (!doc) throw new Error("AI returned an invalid worksheet — please try again");
    await ctx.runMutation(internal.homeworkAi._replaceContent, { homeworkId, contentJson: doc });
    return { ok: true };
  },
});

export const generateQuizContent = action({
  args: {
    homeworkId: v.id("homework"),
    lessonId: v.id("lessons"),
  },
  handler: async (ctx, { homeworkId, lessonId }) => {
    const { transcript } = await ctx.runQuery(
      internal.homeworkAi._prepareGeneration,
      { homeworkId, lessonId }
    );
    const config: GenerationConfig = await ctx.runQuery(
      internal.promptConfigs.resolveForGeneration,
      { taskId: "homework_quiz" }
    );
    const content = (await callOpenRouter(config, transcript.slice(-12000))).content;
    const quizDoc = parseDoc(content);
    if (!quizDoc) throw new Error("AI returned an invalid quiz — please try again");
    await ctx.runMutation(internal.homeworkAi._appendQuizContent, {
      homeworkId,
      quizContent: quizDoc.content,
    });
    return { ok: true };
  },
});

// ── Parser ───────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeDoc(value: unknown): HomeworkDoc | null {
  if (Array.isArray(value)) return { type: "doc", content: value };
  const record = asRecord(value);
  if (!record || !Array.isArray(record.content)) return null;
  return { ...record, type: "doc", content: record.content };
}

function parseDoc(raw: string): HomeworkDoc | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.unshift(fence[1].trim());

  for (const c of candidates) {
    try {
      const parsed: unknown = JSON.parse(c);
      const direct = normalizeDoc(parsed);
      if (direct) return direct;
      const record = asRecord(parsed);
      for (const value of Object.values(record ?? {})) {
        const nested = normalizeDoc(value);
        if (nested) return nested;
      }
    } catch {}
  }
  // No raw-text fallback: an unparseable response is almost always
  // truncated JSON — inserting it as text fills the editor with garbage.
  return null;
}
