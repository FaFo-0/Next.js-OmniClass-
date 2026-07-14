// Phase J.2 — AI-generate homework from a lesson transcript.
// Returns a TipTap-shaped doc JSON with teacher prose + student-blank
// nodes the student fills out.

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const SYSTEM_PROMPT =
  "You are an English language teacher. Given a recent lesson transcript, " +
  "produce a homework worksheet that the student fills out. Output ONLY a " +
  "JSON object shaped like a TipTap document: " +
  '{"type":"doc","content":[ ... ]}. ' +
  "Use these node types:\n" +
  '  • {"type":"paragraph","content":[{"type":"text","text":"..."}]}\n' +
  '  • {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"..."}]}\n' +
  '  • {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"..."}]}]}]}\n' +
  '  • {"type":"studentBlank","attrs":{"label":"hint","answer":""}}  ←  inline blank for the student\n' +
  "Aim for 5–8 fill-in-the-blank sentences pulled from the transcript, " +
  'an instruction heading, a short bullet list of vocabulary words, and a "Reflection" prompt at the bottom. ' +
  "Place studentBlank nodes WITHIN paragraphs as inline children alongside text nodes. " +
  "Return ONLY the JSON, no markdown fences, no commentary.";

const QUIZ_PROMPT =
  "You are an English language teacher. Given a lesson transcript, " +
  "produce a multiple-choice quiz worksheet. Output ONLY a JSON object " +
  "shaped like a TipTap document: " +
  '{"type":"doc","content":[ ... ]}. ' +
  "Include: a 'Quiz' heading (level 2), each question as a bold paragraph " +
  "followed by a bulletList of 3-4 options. Mark the correct option by " +
  "appending ' ✓' to its text. Generate 4-6 questions. " +
  "Return ONLY the JSON, no markdown fences, no commentary.";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

// ── Internal helpers ────────────────────────────────────────────

export const _ensureCanEdit = internalQuery({
  args: { homeworkId: v.id("homework") },
  handler: async (ctx, { homeworkId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const orgId =
      (identity as any).org_id ||
      (identity as any).orgId ||
      (identity as any).organization_id;
    if (!orgId) throw new Error("No active organization");
    const row = await ctx.db.get(homeworkId);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Homework not found");
    }
    return { orgId, row };
  },
});

export const _replaceContent = internalMutation({
  args: {
    homeworkId: v.id("homework"),
    contentJson: v.any(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { homeworkId, contentJson, title }) => {
    const now = new Date().toISOString();
    const patch: any = { contentJson, updatedAt: now };
    if (title) patch.title = title;
    await ctx.db.patch(homeworkId, patch);
  },
});

export const _getTranscript = internalQuery({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const l = await ctx.db.get(lessonId);
    return (l?.transcript as string | undefined) ?? "";
  },
});

export const _getContent = internalQuery({
  args: { homeworkId: v.id("homework") },
  handler: async (ctx, { homeworkId }) => {
    const row = await ctx.db.get(homeworkId);
    return (row?.contentJson as any) ?? { type: "doc", content: [] };
  },
});

async function callAI(
  systemPrompt: string,
  userContent: string,
  model: string,
  jsonMode: boolean
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured.");
  const body: any = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.4,
    max_tokens: 4000,
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Actions ──────────────────────────────────────────────────────

export const generateFromLesson = action({
  args: {
    homeworkId: v.id("homework"),
    lessonId: v.id("lessons"),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { homeworkId, lessonId, model }) => {
    await ctx.runQuery(internal.homeworkAi._ensureCanEdit, { homeworkId });
    const transcript = await ctx.runQuery(internal.homeworkAi._getTranscript, { lessonId });
    if (!transcript.trim()) throw new Error("Lesson has no transcript yet");

    const content = await callAI(
      SYSTEM_PROMPT,
      `TRANSCRIPT:\n${transcript.slice(-12000)}`,
      model || DEFAULT_MODEL,
      true
    );
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
    model: v.optional(v.string()),
  },
  handler: async (ctx, { homeworkId, lessonId, model }) => {
    await ctx.runQuery(internal.homeworkAi._ensureCanEdit, { homeworkId });
    const transcript = await ctx.runQuery(internal.homeworkAi._getTranscript, { lessonId });
    if (!transcript.trim()) throw new Error("Lesson has no transcript yet");

    const content = await callAI(
      QUIZ_PROMPT,
      `TRANSCRIPT:\n${transcript.slice(-12000)}`,
      model || DEFAULT_MODEL,
      true
    );
    const quizDoc = parseDoc(content);
    if (!quizDoc) throw new Error("AI returned an invalid quiz — please try again");

    const existing = await ctx.runQuery(internal.homeworkAi._getContent, { homeworkId });
    const existingContent = Array.isArray((existing as any)?.content)
      ? (existing as any).content
      : [];
    const separator = existingContent.length > 0
      ? [{ type: "heading" as const, attrs: { level: 2 }, content: [{ type: "text" as const, text: "Quiz" }] }]
      : [];
    const quizNodes = quizDoc && (quizDoc as any).content ? (quizDoc as any).content : [];

    const merged = {
      type: "doc",
      content: [...existingContent, ...separator, ...quizNodes],
    };
    await ctx.runMutation(internal.homeworkAi._replaceContent, { homeworkId, contentJson: merged });
    return { ok: true };
  },
});

// ── Parser ───────────────────────────────────────────────────────

function parseDoc(raw: string): unknown | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.unshift(fence[1].trim());

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (!parsed || typeof parsed !== "object") continue;
      if ((parsed as any).type === "doc") return parsed;
      if (Array.isArray((parsed as any).content)) return parsed;
      if (Array.isArray(parsed)) return { type: "doc", content: parsed };
      for (const value of Object.values(parsed)) {
        if (value && typeof value === "object" && (value as any).type === "doc") return value;
      }
    } catch {}
  }
  // No raw-text fallback: an unparseable response is almost always
  // truncated JSON — inserting it as text fills the editor with garbage.
  return null;
}
