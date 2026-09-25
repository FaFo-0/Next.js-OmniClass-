// Phase J.2 — AI-generate homework from a lesson transcript.
// Returns a TipTap-shaped doc JSON with teacher prose + student-blank
// nodes the student fills out.

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant, tenantTable } from "./lib/tenant";
import { callOpenRouter } from "./lib/aiProvider";
import { composeHomeworkSource } from "./lib/homeworkSource";
import { canGenerateHomework, studentsMatch } from "./lib/homeworkAuthorization";
import {
  normalizeHomeworkDocument,
  normalizeHomeworkNodes,
  parseHomeworkOutput,
} from "./lib/homeworkOutput";
import type { HomeworkDoc } from "./lib/homeworkOutput";

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

// ── Internal helpers ────────────────────────────────────────────

export const _prepareGeneration = internalQuery({
  args: {
    homeworkId: v.id("homework"),
    lessonId: v.id("lessons"),
    sourceText: v.optional(v.string()),
    includeTranscript: v.optional(v.boolean()),
  },
  handler: async (ctx, { homeworkId, lessonId, sourceText, includeTranscript }) => {
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
    if (!canGenerateHomework(
      { organizationId: orgId, externalId: user.externalId, role: user.role },
      homework,
      lesson,
    )) {
      throw new Error("Only the lesson teacher can generate homework");
    }
    if (!studentsMatch(homework.studentId, lesson.studentId)) {
      throw new Error("Homework student does not match lesson student");
    }
    const transcript = lesson.transcript ?? "";
    const source = composeHomeworkSource({ transcript, sourceText, includeTranscript });
    return { transcript, source };
  },
});

export const _replaceContent = internalMutation({
  args: {
    homeworkId: v.id("homework"),
    contentJson: v.any(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { homeworkId, contentJson, title }) => {
    const normalizedContent = normalizeHomeworkDocument(contentJson);
    if (!normalizedContent) {
      throw new Error("AI returned an invalid worksheet — please try again");
    }
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
    } = { contentJson: normalizedContent, updatedAt: now };
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
    const normalizedQuizContent = normalizeHomeworkNodes(quizContent);
    if (!normalizedQuizContent) {
      throw new Error("AI returned an invalid quiz — please try again");
    }
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
    const current = normalizeHomeworkDocument(row.contentJson);
    if (!current) {
      throw new Error("Stored homework has invalid content — please repair it before generating a quiz");
    }
    await table.patch(homeworkId, {
      contentJson: {
        type: "doc",
        content: [...current.content, ...normalizedQuizContent],
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
    sourceText: v.optional(v.string()),
    includeTranscript: v.optional(v.boolean()),
  },
  handler: async (ctx, { homeworkId, lessonId, sourceText, includeTranscript }) => {
    const { source } = await ctx.runQuery(
      internal.homeworkAi._prepareGeneration,
      {
        homeworkId,
        lessonId,
        sourceText: sourceText?.trim() || undefined,
        includeTranscript,
      }
    );
    const config: GenerationConfig = await ctx.runQuery(
      internal.promptConfigs.resolveForGeneration,
      { taskId: "homework_worksheet" }
    );
    const content = (await callOpenRouter(config, source)).content;
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
    sourceText: v.optional(v.string()),
    includeTranscript: v.optional(v.boolean()),
  },
  handler: async (ctx, { homeworkId, lessonId, sourceText, includeTranscript }) => {
    const { source } = await ctx.runQuery(
      internal.homeworkAi._prepareGeneration,
      {
        homeworkId,
        lessonId,
        sourceText: sourceText?.trim() || undefined,
        includeTranscript,
      }
    );
    const config: GenerationConfig = await ctx.runQuery(
      internal.promptConfigs.resolveForGeneration,
      { taskId: "homework_quiz" }
    );
    const content = (await callOpenRouter(config, source)).content;
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

function parseDoc(raw: string): HomeworkDoc | null {
  // HOMEWORK_NODE_TYPES validation and the No raw-text fallback live in the
  // pure helper so the storage boundary and parser share one contract.
  return parseHomeworkOutput(raw);
}
