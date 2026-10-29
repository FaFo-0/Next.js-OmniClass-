// Phase J.2 — AI-generate homework from a lesson transcript.
// Returns a TipTap-shaped doc JSON with teacher prose + student-blank
// nodes the student fills out.

import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
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
import { EXERCISE_TYPES, normalizeWorkbookSection, workbookIssues, WORKBOOK_OUTPUT_CONTRACT } from "./lib/workbook";
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
    if (user.role === "removed") throw new Error("This account no longer has access to the academy");
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
    const profile = await tenantTable(ctx, orgId, "studentOnboarding").query()
      .withIndex("by_organization_and_studentId", q => q.eq("organizationId", orgId).eq("studentId", homework.studentId)).unique();
    return { transcript, source, level: profile?.cefrSelfAssessed ?? "" };
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
      approvedAt?: string;
      contentJson: unknown;
      updatedAt: string;
      title?: string;
    } = { contentJson: normalizedContent, updatedAt: now, approvedAt: undefined };
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
      approvedAt: undefined,
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

/** Preview-only: never mutates a teacher's draft after a delayed provider response. */
export const generateWorkbookDraft = action({
  args: {
    homeworkId: v.id("homework"), lessonId: v.id("lessons"),
    sourceText: v.optional(v.string()), includeTranscript: v.optional(v.boolean()),
    mode: v.union(v.literal("practice"), v.literal("convert")),
    kinds: v.array(v.string()), count: v.number(), level: v.optional(v.string()),
    objective: v.string(), vocabulary: v.optional(v.string()), instructions: v.optional(v.string()),
    source: v.union(v.literal("lesson"), v.literal("paste"), v.literal("topic")),
  },
  handler: async (ctx, args): Promise<{ doc: HomeworkDoc | null; warnings: string[]; level: string }> => {
    if (!args.kinds.length || args.kinds.length > 10 || new Set(args.kinds).size !== args.kinds.length || args.kinds.some(k => !(EXERCISE_TYPES as readonly string[]).includes(k))) throw new Error("Choose valid exercise types");
    if (!Number.isInteger(args.count) || args.count < 1 || args.count > 15 || (args.mode === "practice" && args.kinds.length * args.count > 30)) throw new Error("Generate up to 30 questions at a time");
    if (args.objective.length > 2000 || (args.sourceText?.length ?? 0) > 12000 || (args.instructions?.length ?? 0) > 2000 || (args.vocabulary?.length ?? 0) > 2000) throw new Error("Source or instructions are too long");
    if (args.level && !["A1", "A2", "B1", "B2", "C1", "C2"].includes(args.level)) throw new Error("Choose a CEFR level");
    if (args.mode === "convert" && (args.source !== "paste" || !args.sourceText?.trim())) throw new Error("Paste the original exercise to convert it");
    if (args.source === "topic" && !args.objective.trim()) throw new Error("Describe the language objective or topic");
    if (args.source === "paste" && !args.sourceText?.trim()) throw new Error("Paste source material first");
    const prepared: { source: string; level: string } = await ctx.runQuery(internal.homeworkAi._prepareGeneration, {
      homeworkId: args.homeworkId, lessonId: args.lessonId,
      sourceText: args.source === "topic" ? args.objective : args.source === "paste" ? args.sourceText : undefined,
      includeTranscript: args.source === "lesson" ? true : args.source === "paste" ? args.includeTranscript === true && args.mode !== "convert" : false,
    });
    const level = args.level || prepared.level;
    if (!level || !["A1", "A2", "B1", "B2", "C1", "C2"].includes(level.toUpperCase())) throw new Error("Choose the student's CEFR level");
    const config = await ctx.runQuery(internal.promptConfigs.resolveForGeneration, { taskId: "homework_builder" });
    const request = JSON.stringify({ mode: args.mode, selectedTypes: args.kinds, countPerSection: args.count, level: level.toUpperCase(), objective: args.objective, vocabulary: args.vocabulary, teacherInstructions: args.instructions,
      conversion: args.mode === "convert" ? "Preserve all source questions and original formats; selected types/count do not justify dropping source questions. Report material that cannot be converted." : undefined });
    const output = await callOpenRouter({ ...config, outputContract: WORKBOOK_OUTPUT_CONTRACT }, `TEACHER REQUEST\n${request}\n\nSOURCE MATERIAL\n${prepared.source}`);
    let parsed: { sections?: unknown; warnings?: unknown };
    try { parsed = JSON.parse(output.content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")); }
    catch { throw new Error("AI returned an incomplete draft. Your worksheet is unchanged; try fewer questions."); }
    if (!Array.isArray(parsed.sections) || parsed.sections.length > 12) throw new Error("AI returned an invalid workbook draft");
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((s): s is string => typeof s === "string").slice(0, 20) : [];
    const nonce = `wb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sections = parsed.sections.map((value: unknown, i: number) => {
      const s = normalizeWorkbookSection(value, true);
      if (!s) throw new Error("AI returned an invalid exercise section");
      s.id = `${nonce}-${i}`;
      s.items = s.items.map((q, j) => ({ ...q, id: `${s.id}-${j}` }));
      const issues = workbookIssues(s);
      if (issues.length) throw new Error(`AI draft needs correction: ${issues.slice(0, 3).join(" ")} Your worksheet is unchanged.`);
      if (args.mode === "practice" && !args.kinds.includes(s.kind)) throw new Error("AI returned an exercise type you did not select");
      return s;
    });
    if (sections.reduce((n, s) => n + s.items.length, 0) > 60) throw new Error("Draft is too large; convert a shorter exercise");
    if (args.mode === "practice" && sections.length > 0 && (sections.length !== args.kinds.length || args.kinds.some(kind => sections.filter(s => s.kind === kind).length !== 1) || sections.some(s => s.items.length !== args.count))) throw new Error("AI did not follow the selected exercise types and counts. Your worksheet is unchanged; try again.");
    if (!sections.length) return { doc: null, warnings: warnings.length ? warnings : ["The supplied material could not support this exercise."], level };
    return { doc: { type: "doc", content: sections.map(attrs => ({ type: "workbookSection", attrs })) }, warnings, level };
  },
});

export const workbookContext = query({
  args: { homeworkId: v.id("homework") },
  handler: async (ctx, { homeworkId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await tenantTable(ctx, orgId, "homework").get(homeworkId);
    if (!row || (user.role !== "admin" && (user.role !== "teacher" || row.teacherId !== user.externalId))) throw new Error("Only the owning teacher can author homework");
    const profile = await tenantTable(ctx, orgId, "studentOnboarding").query().withIndex("by_organization_and_studentId", q => q.eq("organizationId", orgId).eq("studentId", row.studentId)).unique();
    return { level: profile?.cefrSelfAssessed?.toUpperCase() ?? "" };
  },
});
