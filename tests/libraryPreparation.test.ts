import assert from "node:assert/strict";
import test from "node:test";
import { claim, commitBatch, dispatch, failed, recoverLease, reserveAttempt, resumeQueue, MAX_ATTEMPTS_PER_DAY } from "../convex/libraryPreparation";
import { touchUnit, prepareChapter, cancelPreparation, finishPublication } from "../convex/libraryWorks";
import { preparationBatches, PREPARATION_VERSION } from "../convex/lib/libraryText";
import { callOpenRouter } from "../convex/lib/aiProvider";
import { ACADEMY_ID } from "../convex/lib/tenant";
import { fixture } from "./helpers/libraryFixture";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
type Row = Record<string, unknown>;
const invoke = (fn: unknown, ctx: unknown, args: unknown = {}) => (fn as { _handler(ctx: unknown, args: unknown): Promise<unknown> })._handler(ctx, args);
async function chapter(f: ReturnType<typeof fixture>, state = "queued") {
  const workId = await f.add("libraryWorks", { title: "Reading", isPublished: true, publishRequested: true });
  const unitId = await f.add("libraryUnits", { workId, title: "Garden", contentMarkdown: "A sunny garden.", externalId: "first", position: 0, revision: 1, preparationState: state, preparationVersion: PREPARATION_VERSION });
  return { workId, unitId };
}
function answers(unit: Row) {
  const batch = preparationBatches(String(unit.title), String(unit.contentMarkdown))[Number(unit.preparationCursor ?? 0)];
  return batch.words.map(w => ({ key: w.key, word: w.word, sentence: w.sentences[0], lemma: w.word, senseId: "s", definition: "meaning", partOfSpeech: "noun", translations: { ru: "слово", ar: "كلمة", kk: "сөз" } }));
}
function args(unit: Row) { return { unitId: unit._id, revision: unit.revision ?? 1, batchIndex: unit.preparationCursor ?? 0, runId: unit.preparationRun }; }

test("opening a prepared chapter prefetches only its successor and shares that run", async () => {
  const f = fixture("student"); const { workId, unitId } = await chapter(f, "ready");
  const second = await f.add("libraryUnits", { workId, position: 1, title: "Rain", contentMarkdown: "Rain falls." });
  const third = await f.add("libraryUnits", { workId, position: 2, title: "Sun", contentMarkdown: "Sun shines." });
  await invoke(touchUnit, f.ctx, { unitId });
  assert.equal((await f.ctx.db.get(second))?.preparationState, "queued");
  assert.equal((await f.ctx.db.get(third))?.preparationState, undefined);
  assert.equal(await invoke(touchUnit, f.ctx, { unitId }), null);
  const firstRun = await invoke(claim, f.ctx, { unitId: second });
  assert.ok(firstRun);
  assert.equal(await invoke(claim, f.ctx, { unitId: second }), null);
});

test("fourth chapter resumes across works when a concurrency slot becomes free", async () => {
  const f = fixture(); const chapters = await Promise.all(Array.from({ length: 4 }, () => chapter(f)));
  const active = [];
  for (const c of chapters.slice(0, 3)) active.push(await invoke(claim, f.ctx, { unitId: c.unitId }) as Row);
  assert.equal(await invoke(claim, f.ctx, { unitId: chapters[3].unitId }), null);
  await invoke(dispatch, f.ctx, { organizationId: ACADEMY_ID });
  const before = f.jobs.length;
  await invoke(commitBatch, f.ctx, { ...args(active[0]), words: answers(active[0]) });
  assert.ok(f.jobs.length > before, "a completion wakes the shared queue");
  await invoke(dispatch, f.ctx, { organizationId: ACADEMY_ID });
  const jobs = JSON.stringify(f.jobs);
  assert.ok(jobs.includes(chapters[3].unitId));
  assert.ok(await invoke(claim, f.ctx, { unitId: chapters[3].unitId }));
});

test("Stop survives reading and stale completion/failure after an explicit restart", async () => {
  const f = fixture(); const c = await chapter(f);
  const old = await invoke(claim, f.ctx, { unitId: c.unitId }) as Row;
  await invoke(cancelPreparation, f.ctx, { id: c.workId });
  assert.equal(await invoke(touchUnit, f.ctx, { unitId: c.unitId }), null);
  await invoke(prepareChapter, f.ctx, { unitId: c.unitId });
  const fresh = await invoke(claim, f.ctx, { unitId: c.unitId }) as Row;
  await invoke(commitBatch, f.ctx, { ...args(old), words: answers(old) });
  await invoke(failed, f.ctx, args(old));
  await invoke(recoverLease, f.ctx, { unitId: c.unitId, runId: old.preparationRun });
  assert.equal((await f.ctx.db.get(c.unitId))?.preparationState, "preparing");
  assert.equal((await f.ctx.db.get(c.unitId))?.preparationRun, fresh.preparationRun);
  assert.equal((f.rows.libraryVocabularyBatches ?? []).length, 0);
  assert.equal(await invoke(reserveAttempt, f.ctx, args(old)), false, "stale workers may not spend on a fallback");
});

test("commit rejects partial vocabulary and only a complete opening publishes", async () => {
  const f = fixture(); const c = await chapter(f);
  await f.ctx.db.patch(c.workId, { isPublished: false });
  const run = await invoke(claim, f.ctx, { unitId: c.unitId }) as Row;
  await assert.rejects(invoke(commitBatch, f.ctx, { ...args(run), words: answers(run).slice(1) }), /coverage/);
  assert.equal((await f.ctx.db.get(c.workId))?.isPublished, false);
  await invoke(commitBatch, f.ctx, { ...args(run), words: answers(run) });
  assert.equal((await f.ctx.db.get(c.workId))?.isPublished, true);
});

test("every paid attempt is reserved, exhaustion pauses, and next day resumes", async () => {
  const f = fixture(); const c = await chapter(f);
  const row = await f.add("libraryPreparationUsage", { day: new Date().toISOString().slice(0, 10), attempts: MAX_ATTEMPTS_PER_DAY - 1 });
  const run = await invoke(claim, f.ctx, { unitId: c.unitId }) as Row;
  assert.equal(await invoke(reserveAttempt, f.ctx, args(run)), true);
  assert.equal(await invoke(reserveAttempt, f.ctx, args(run)), false);
  assert.equal((await f.ctx.db.get(row))?.attempts, MAX_ATTEMPTS_PER_DAY);
  assert.equal((await f.ctx.db.get(c.unitId))?.preparationState, "queued");
  await invoke(failed, f.ctx, args(run));
  assert.equal((await f.ctx.db.get(c.unitId))?.preparationState, "queued", "budget pause is not a quality failure");
  assert.equal(await invoke(claim, f.ctx, { unitId: c.unitId }), null);
  await f.ctx.db.patch(row, { day: "2000-01-01" });
  const before = f.jobs.length;
  await invoke(resumeQueue, f.ctx);
  assert.ok(f.jobs.length > before);
  assert.ok(await invoke(claim, f.ctx, { unitId: c.unitId }));
});

test("cancelled opening chapters cannot publish until an operator retries", async () => {
  const f = fixture(); const c = await chapter(f, "cancelled");
  await f.ctx.db.patch(c.workId, { isPublished: false });
  await finishPublication(f.ctx as unknown as MutationCtx, c.workId as Id<"libraryWorks">);
  assert.equal((await f.ctx.db.get(c.workId))?.isPublished, false);
  assert.equal((await f.ctx.db.get(c.unitId))?.preparationState, "cancelled");
});

test("lease recovery is bounded and unfinished legacy batches restart safely", async () => {
  const f = fixture(); const c = await chapter(f);
  await f.ctx.db.patch(c.unitId, { preparationVersion: undefined, preparationCursor: 1 });
  await f.add("libraryVocabularyBatches", { unitId: c.unitId, revision: 1, offset: 0, words: [] });
  for (let i = 0; i < 3; i++) {
    await f.ctx.db.patch(c.unitId, { preparationRetryAt: undefined });
    const run = await invoke(claim, f.ctx, { unitId: c.unitId }) as Row;
    assert.equal(run.preparationCursor, 0);
    await f.ctx.db.patch(c.unitId, { preparationLease: 1 });
    await invoke(recoverLease, f.ctx, { unitId: c.unitId, runId: run.preparationRun });
  }
  assert.equal((await f.ctx.db.get(c.unitId))?.preparationState, "failed");
  assert.equal((f.rows.libraryVocabularyBatches ?? []).length, 0);
});

test("provider fallback counts separately and cannot run when reservation fails", async () => {
  const oldKey = process.env.OPENROUTER_API_KEY; const oldFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "fictional-test-key";
  let requests = 0; let reserved = 0;
  globalThis.fetch = async () => { requests++; return new Response("unavailable", { status: 503 }); };
  const config = { provider: "openrouter" as const, model: "primary", fallbackModel: "fallback", systemPrompt: "test", userPromptTemplate: "{{text}}", inputKey: "text" as const, maxTokens: 10, temperature: 0, outputFormat: "json" as const };
  try {
    await assert.rejects(callOpenRouter(config, "fictional text", { beforeAttempt: async () => { reserved++; if (reserved > 1) throw new Error("allowance exhausted"); } }), /allowance/);
    assert.equal(reserved, 2);
    assert.equal(requests, 1, "a failed primary consumes its reservation; fallback requires another");
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey; }
});

test("transient provider failures retry hourly; content failures stop for a human", async () => {
  const f = fixture();
  const transient = await chapter(f, "preparing");
  await f.ctx.db.patch(transient.unitId, { preparationRun: 1 });
  const before = Date.now();
  await invoke(failed, f.ctx, { ...args(f.rows.libraryUnits[0]), reason: "OpenRouter unavailable (429)" });
  const row = f.rows.libraryUnits[0];
  assert.equal(row.preparationState, "queued");
  assert.equal(row.preparationFailureKind, "transient");
  assert.ok(Number(row.preparationRetryAt) >= before + 55 * 60 * 1000, "retry waits about an hour");
  assert.match(String(row.preparationError), /Will retry/);

  const content = await chapter(f, "preparing");
  await f.ctx.db.patch(content.unitId, { preparationRun: 1 });
  await invoke(failed, f.ctx, { ...args(f.rows.libraryUnits[1]), reason: "Incomplete vocabulary response (20/40)" });
  const contentRow = f.rows.libraryUnits[1];
  assert.equal(contentRow.preparationFailureKind, "content");
  assert.equal(contentRow.preparationState, "queued", "first content failure retries quickly");
  assert.ok(Number(contentRow.preparationRetryAt) - Date.now() < 60 * 1000);
});

test("a work whose opening chapter failed stays in draft", async () => {
  const f = fixture();
  const { workId, unitId } = await chapter(f, "preparing");
  await f.ctx.db.patch(unitId, { preparationRun: 1 });
  await invoke(failed, f.ctx, { ...args(f.rows.libraryUnits[0]), reason: "Incomplete vocabulary response (20/40)" });
  await f.ctx.db.patch(unitId, { preparationFailures: 3, preparationState: "preparing" });
  await invoke(failed, f.ctx, { ...args(f.rows.libraryUnits[0]), reason: "Incomplete vocabulary response (20/40)" });
  assert.equal((await f.ctx.db.get(unitId))?.preparationState, "failed");
  assert.equal((await f.ctx.db.get(workId))?.isPublished, false, "a failed opening chapter drafts the work");
  assert.match(String((await f.ctx.db.get(unitId))?.preparationError), /Content failure/);
});
