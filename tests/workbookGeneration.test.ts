import test from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import { generateWorkbookDraft } from "../convex/homeworkAi";
import { defaultPromptConfigs } from "../convex/lib/defaultPrompts";
import { getAiTask } from "../convex/lib/aiTasks";
import { newWorkbookSection, WORKBOOK_OUTPUT_CONTRACT } from "../convex/lib/workbook";
import type { ActionCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

type Args = { homeworkId: Id<"homework">; lessonId: Id<"lessons">; mode: "practice" | "convert"; source: "topic" | "paste"; kinds: string[]; count: number; objective: string; sourceText?: string };
const handler = (generateWorkbookDraft as unknown as { _handler(ctx: ActionCtx, args: Args): Promise<{ doc: { content: { attrs?: unknown }[] } | null; warnings: string[]; level: string }> })._handler;
const args: Args = { homeworkId: "homework" as Id<"homework">, lessonId: "lesson" as Id<"lessons">, mode: "practice", source: "topic", kinds: ["gaps"], count: 1, objective: "Third person present simple" };

test("generation enforces contracts over saved prompts and produces previews without mutation", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "fictional-test-key";
  const section = newWorkbookSection("gaps", "provider-id");
  section.instructions = "Complete with the present simple.";
  section.items[0] = { ...section.items[0], prompt: "She ___ to work. (walk)", accepted: ["walks"], answer: "provider answer", mark: "correct" };
  let payload: Record<string, unknown> = { sections: [section], warnings: [] };
  let queryCount = 0;
  const ctx = {
    async runQuery(ref: Parameters<typeof getFunctionName>[0]) {
      queryCount++;
      if (getFunctionName(ref).includes("_prepareGeneration")) return { source: "Practice present simple.", level: "A2" };
      return { ...defaultPromptConfigs.find(c => c.configId === "homework_builder"), ...getAiTask("homework_builder"), systemPrompt: "An old saved prompt asking for TipTap" };
    },
    async runMutation() { assert.fail("Preview generation must never mutate the worksheet"); },
  } as unknown as ActionCtx;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.ok(request.messages[0].content.endsWith(WORKBOOK_OUTPUT_CONTRACT));
    assert.ok(request.messages[1].content.includes('"level":"A2"'));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
  };
  try {
    const result = await handler(ctx, args);
    assert.ok(result.doc); assert.equal(result.level, "A2");
    const s = result.doc.content[0].attrs as typeof section;
    assert.notEqual(s.id, "provider-id"); assert.equal(s.items[0].answer, ""); assert.equal(s.items[0].mark, null);
    await assert.rejects(() => handler(ctx, { ...args, count: 2 }), /counts/);
    payload = { sections: [], warnings: ["The exercise requires a missing listening track."] };
    const missing = await handler(ctx, { ...args, mode: "convert", source: "paste", sourceText: "Listen to track 2 and answer." });
    assert.equal(missing.doc, null); assert.match(missing.warnings[0], /missing listening/);
    const previous = queryCount;
    await assert.rejects(() => handler(ctx, { ...args, kinds: ["arbitrary-client-type"] }), /valid exercise/);
    assert.equal(queryCount, previous, "Invalid requests are rejected before provider work");
    payload = { sections: [section], warnings: [] };
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "truncated JSON" } }] }), { status: 200 });
    await assert.rejects(() => handler(ctx, args), /unchanged/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
