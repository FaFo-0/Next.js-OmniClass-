import test from "node:test";
import assert from "node:assert/strict";
import type { Doc } from "../convex/_generated/dataModel";
import { fixture } from "./helpers/libraryFixture";
import { createWork, getUnit, getWork, saveProgress } from "../convex/libraryWorks";
import { begin, chapter, finish } from "../convex/libraryImport";
import { batch } from "../convex/libraryBodyMigration";
import { claim, commitBatch, reserveAttempt } from "../convex/libraryPreparation";
import { preparationBatches } from "../convex/lib/libraryText";
const invoke = <R = unknown>(fn: unknown, ctx: unknown, args: unknown = {}): Promise<R> => (fn as { _handler(ctx: unknown, args: unknown): Promise<R> })._handler(ctx, args);
type Reading = { unit: Doc<"libraryUnits">; vocabulary: Doc<"libraryVocabularyBatches">["words"] };
const text = "A sunny garden. ".repeat(1500);

test("contents and reading progress avoid all chapter-body reads; one reader fetches one body", async () => {
  const f = fixture();
  const workId = await invoke<string>(createWork, f.ctx, { title: "Book", kind: "book", topicTags: [], units: Array.from({ length: 20 }, (_, i) => ({ title: `Chapter ${i}`, externalId: `c${i}`, contentMarkdown: text })) });
  await f.ctx.db.patch(workId, { isPublished: true });
  f.reads.length = 0;
  const contents = await invoke<{ units: Doc<"libraryUnits">[] }>(getWork, f.ctx, { id: workId });
  assert.equal(contents.units.length, 20);
  assert.ok(contents.units.every((u: { contentMarkdown: string }) => u.contentMarkdown === ""));
  assert.equal(f.reads.filter(r => r.table === "libraryUnitBodies").length, 0);
  assert.ok(f.reads.reduce((sum, r) => sum + r.bytes, 0) < 20000, "navigation must not scan the 480 KB of chapter text");
  f.reads.length = 0;
  const unitId = contents.units[0]._id;
  const reading = await invoke<Reading>(getUnit, f.ctx, { id: unitId });
  assert.equal(reading.unit.contentMarkdown, text.trim());
  assert.equal(f.reads.filter(r => r.table === "libraryUnitBodies").length, 1);
  f.reads.length = 0;
  await invoke(saveProgress, f.ctx, { workId, unitId, lastUnitPosition: 0 });
  assert.equal(f.reads.filter(r => r.table === "libraryUnitBodies").length, 0);
  assert.equal(f.reads.filter(r => r.table === "libraryUnits").reduce((sum, r) => sum + r.count, 0), 1);
});

test("adding a chapter never rereads earlier bodies; repeat imports preserve prepared revisions", async () => {
  const f = fixture();
  const workId = await invoke<string>(begin, f.ctx, { item: { externalId: "book", title: "Book", kind: "book", topicTags: [] } });
  for (let position = 0; position < 20; position++) {
    f.reads.length = 0;
    await invoke(chapter, f.ctx, { workId, position, unit: { externalId: `c${position}`, title: `Chapter ${position}`, contentMarkdown: text } });
    assert.equal(f.reads.filter(r => r.table === "libraryUnitBodies").length, 0);
    assert.equal(f.reads.filter(r => r.table === "libraryUnits").reduce((sum, r) => sum + r.count, 0), 0);
  }
  const unit = f.rows.libraryUnits[0];
  await f.ctx.db.patch(String(unit._id), { preparationState: "ready" });
  const revision = unit.revision;
  f.reads.length = 0;
  await invoke(chapter, f.ctx, { workId, position: 0, unit: { externalId: "c0", title: "Chapter 0", contentMarkdown: text } });
  assert.equal(unit.revision, revision);
  assert.equal(unit.preparationState, "ready");
  assert.equal(f.reads.filter(r => r.table === "libraryUnitBodies").length, 1);
  f.reads.length = 0;
  await invoke(finish, f.ctx, { workId, chapterIds: Array.from({ length: 20 }, (_, i) => `c${i}`), publish: false });
  assert.equal(f.reads.filter(r => r.table === "libraryUnitBodies").length, 0);
});

test("moving existing bodies is idempotent and reversible with identical chapter IDs, text and progress", async () => {
  const f = fixture();
  const workId = await f.add("libraryWorks", { title: "Legacy", isPublished: true });
  const unitId = await f.add("libraryUnits", { workId, externalId: "first", position: 0, title: "Legacy", contentMarkdown: text, contentHtml: "<p>Preserved</p>", revision: 7, preparationState: "ready" });
  const progressId = await f.add("libraryProgress", { workId, lastUnitId: unitId, ownerId: "actor", lastUnitPosition: 0 });
  const before = structuredClone(await invoke<Reading>(getUnit, f.ctx, { id: unitId }));
  assert.equal((await invoke<{ changed: number }>(batch, f.ctx, { cursor: null, restore: false })).changed, 1);
  assert.equal((await invoke<{ changed: number }>(batch, f.ctx, { cursor: null, restore: false })).changed, 0);
  const after = await invoke<Reading>(getUnit, f.ctx, { id: unitId });
  assert.equal(after.unit.contentMarkdown, before.unit.contentMarkdown);
  assert.equal(after.unit.contentHtml, before.unit.contentHtml);
  assert.equal(after.unit._id, unitId);
  assert.equal(after.unit.revision, 7);
  assert.equal((await f.ctx.db.get(progressId))?.lastUnitId, unitId);
  await invoke<{ changed: number }>(batch, f.ctx, { cursor: null, restore: true });
  assert.equal((await f.ctx.db.get(unitId))?.contentMarkdown, text);
  assert.equal((await f.ctx.db.get(unitId))?.bodyId, undefined);
});

test("preparation works with separated bodies and metadata reservations never load text", async () => {
  const f = fixture();
  const workId = await invoke<string>(createWork, f.ctx, { title: "Garden", kind: "story", topicTags: [], units: [{ title: "Garden", contentMarkdown: "A sunny garden." }] });
  const unit = f.rows.libraryUnits[0];
  await f.ctx.db.patch(String(unit._id), { preparationState: "queued" });
  const run = await invoke<Doc<"libraryUnits">>(claim, f.ctx, { unitId: unit._id });
  assert.equal(run.contentMarkdown, "A sunny garden.");
  const args = { unitId: unit._id, revision: run.revision, runId: run.preparationRun, batchIndex: 0 };
  f.reads.length = 0;
  assert.equal(await invoke(reserveAttempt, f.ctx, args), true);
  assert.equal(f.reads.filter(r => r.table === "libraryUnitBodies").length, 0);
  const words = preparationBatches(run.title, run.contentMarkdown)[0].words.map(w => ({ key: w.key, word: w.word, sentence: w.sentences[0], lemma: w.word, senseId: "meaning", definition: "meaning", partOfSpeech: "noun", translations: { ru: "слово", ar: "كلمة", kk: "сөз" } }));
  await invoke(commitBatch, f.ctx, { ...args, words });
  assert.equal((await f.ctx.db.get(String(unit._id)))?.preparationState, "ready");
  assert.equal((await invoke<Reading>(getUnit, f.ctx, { id: unit._id })).vocabulary.length, words.length);
  assert.equal((await f.ctx.db.get(workId))?.isPublished, false);
});
