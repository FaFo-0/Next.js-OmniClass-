// Phase J.2 — AI-generate homework from a lesson transcript.
// Returns a TipTap-shaped doc JSON with teacher prose + student-blank
// nodes the student fills out. Pattern mirrors inLessonQuiz.

import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
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

interface ReplaceArgs {
  homeworkId: string;
  contentJson: unknown;
  title?: string;
}

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

export const generateFromLesson = action({
  args: {
    homeworkId: v.id("homework"),
    lessonId: v.id("lessons"),
    extraInstruction: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { homeworkId, lessonId, extraInstruction }
  ): Promise<{ ok: true }> => {
    await ctx.runQuery(internal.homeworkAi._ensureCanEdit, { homeworkId });

    // Pull the lesson's transcript via an internal query (action has
    // no direct DB access).
    const transcript: string = await ctx.runQuery(
      internal.homeworkAi._getTranscript,
      { lessonId }
    );
    if (!transcript.trim()) {
      throw new Error("Lesson has no transcript yet");
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY not configured. Run: npx convex env set OPENROUTER_API_KEY <key>"
      );
    }
    const userPrompt = [
      "TRANSCRIPT:",
      transcript.slice(-4000),
      "",
      extraInstruction ? `EXTRA INSTRUCTIONS: ${extraInstruction}` : "",
    ]
      .filter(Boolean)
      .join("\n");

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
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 1200,
          response_format: { type: "json_object" },
        }),
      }
    );
    if (!res.ok) {
      throw new Error(
        `OpenRouter error (${res.status}): ${await res.text()}`
      );
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const doc = parseDoc(content);
    if (!doc) throw new Error("Model returned no parseable doc");
    await ctx.runMutation(internal.homeworkAi._replaceContent, {
      homeworkId,
      contentJson: doc,
    });
    return { ok: true };
  },
});

export const _getTranscript = internalQuery({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const l = await ctx.db.get(lessonId);
    return (l?.transcript as string | undefined) ?? "";
  },
});

function parseDoc(raw: string): unknown | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && (parsed as any).type === "doc") {
        return parsed;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}
