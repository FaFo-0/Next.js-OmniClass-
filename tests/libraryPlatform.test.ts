import assert from "node:assert/strict";
import test from "node:test";
import { listFlashcards, listAllFlashcards, listQuiz, listVocab } from "../convex/lessonContent";
import { listMyWords, listDecks, listCardsInDeck, getWordSet, listDueCards, recordReview } from "../convex/srs";
import { createWork, replaceUnits, publish, saveProgress, touchUnit, prepareChapter, cancelPreparation } from "../convex/libraryWorks";
import { claim, commitBatch, failed } from "../convex/libraryPreparation";
import { begin, chapter, finish } from "../convex/libraryImport";
import { upsertSavedVocabulary } from "../convex/lib/vocabulary";
import { readingTokens, tokenKey, preparationBatches, parseGroupVocabulary, expandGroupVocabulary } from "../convex/lib/libraryText";
import { assertLibraryUrl } from "../convex/lib/libraryLinks";
import { fixture } from "./helpers/libraryFixture";
import { ACADEMY_ID } from "../convex/lib/tenant";
import type { MutationCtx } from "../convex/_generated/server";

type Row = Record<string, unknown>;
type FunctionHandler = { _handler(ctx: unknown, args: unknown): Promise<unknown> };
const invoke = (fn: unknown, ctx: unknown, args: unknown = {}) => (fn as FunctionHandler)._handler(ctx, args);

test("students cannot read another learner's decks, cards or reading word set", async () => {
  const f = fixture("student");
  const deckId = await f.add("srsDecks", { ownerId: "other" });
  await f.add("srsCards", { ownerId: "other", deckId, front: "secret" });
  for (const [fn, args] of [[listMyWords, { studentId: "other" }], [listDecks, { ownerId: "other" }], [listCardsInDeck, { deckId }], [getWordSet, { studentId: "other" }]] as const) await assert.rejects(invoke(fn, f.ctx, args), /Not your/);
});

test("teachers can read assigned learners only, including unassigned-student rejection", async () => {
  const f = fixture("teacher");
  await f.add("users", { externalId: "assigned", role: "student", teacherId: "actor" });
  await f.add("users", { externalId: "unassigned", role: "student" });
  const deckId = await f.add("srsDecks", { ownerId: "assigned" });
  await f.add("srsCards", { ownerId: "assigned", deckId, front: "word" });
  assert.equal((await invoke(listCardsInDeck, f.ctx, { deckId }) as Row[]).length, 1);
  await assert.rejects(invoke(listDecks, f.ctx, { ownerId: "unassigned" }), /assigned/);
});

test("new-card daily limit counts introductions already scheduled into the future", async () => {
  const f = fixture("student");
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 15; i++) await f.add("srsCards", { ownerId: "actor", firstReviewedAt: today, nextReviewDate: "2099-01-01" });
  const id = await f.add("srsCards", { ownerId: "actor", front: "extra", nextReviewDate: today });
  assert.deepEqual(await invoke(listDueCards, f.ctx), []);
  await assert.rejects(invoke(recordReview, f.ctx, { cardDocId: id, rating: "good", requestId: "new" }), /limit/);
});

test("retrying a review request writes exactly one review and one interval change", async () => {
  const f = fixture("student");
  const id = await f.add("srsCards", { ownerId: "actor", cardId: "word", front: "word", back: "meaning", interval: 2, repetitions: 1, easeFactor: 2.5, firstReviewedAt: "2020-01-01", lastReviewDate: "2020-01-01", nextReviewDate: "2020-01-02" });
  await invoke(recordReview, f.ctx, { cardDocId: id, rating: "good", requestId: "same-request" });
  const interval = (await f.ctx.db.get(id))?.interval;
  await invoke(recordReview, f.ctx, { cardDocId: id, rating: "good", requestId: "same-request" });
  assert.equal(f.rows.reviewLogs.length, 1);
  assert.equal((await f.ctx.db.get(id))?.interval, interval);
});

test("library and lesson encounters merge by meaning without resetting reviews; different meanings remain separate", async () => {
  const f = fixture();
  const ctx = f.ctx as unknown as MutationCtx;
  const input = { lexeme: { surface: "services", lemma: "service", language: "en" as const, partOfSpeech: "noun" }, sense: { senseId: "assistance", definition: "help" }, translation: "помощь", translationLocale: "ru" as const, occurrence: { sourceType: "library" as const, sourceId: "work", unitId: "unit", sentence: "We offer services." }, addedBy: "self" as const };
  const id = await upsertSavedVocabulary(ctx, ACADEMY_ID, "student", input);
  await f.ctx.db.patch(id, { interval: 21, repetitions: 5, firstReviewedAt: "2020-01-01" });
  const again = await upsertSavedVocabulary(ctx, ACADEMY_ID, "student", { ...input, lexeme: { ...input.lexeme, surface: "service" }, sense: { senseId: "help-to-others", definition: "help given" }, occurrence: { sourceType: "live_lesson", sourceId: "lesson", sentence: "Good service." }, addedBy: "system" });
  assert.equal(again, id);
  assert.equal((await f.ctx.db.get(id))?.interval, 21);
  assert.equal(f.rows.vocabularyOccurrences.length, 2);
  const different = await upsertSavedVocabulary(ctx, ACADEMY_ID, "student", { ...input, sense: { senseId: "religious-ceremony", definition: "a ceremony" }, translation: "служба" });
  assert.notEqual(different, id);
  assert.equal((await f.ctx.db.get(id))?.cardId, id);
  await f.ctx.db.patch(id, { isDeleted: true });
  assert.equal(await upsertSavedVocabulary(ctx, ACADEMY_ID, "student", input), id);
  assert.equal((await f.ctx.db.get(id))?.isDeleted, false);
  assert.equal((await f.ctx.db.get(id))?.interval, 21);
});

test("publication prepares only the opening chapter; edited openings wait again", async () => {
  const f = fixture();
  const id = await invoke(createWork, f.ctx, { title: "A reading", kind: "story", topicTags: [], units: [{ externalId: "first", title: "Chapter", contentMarkdown: "A bank beside the river." }, { externalId: "second", title: "Next", contentMarkdown: "A sunny day." }] }) as string;
  const unit = f.rows.libraryUnits[0];
  assert.equal(unit.preparationState, undefined);
  assert.equal(f.jobs.length, 0, "draft editing must not spend");
  await invoke(publish, f.ctx, { id, isPublished: true });
  assert.equal((await f.ctx.db.get(id))?.isPublished, false);
  assert.equal(unit.preparationState, "queued");
  assert.equal(f.rows.libraryUnits[1].preparationState, undefined, "do not prepare the whole book on upload");
  await f.ctx.db.patch(unit._id as string, { preparationState: "ready" });
  await invoke(publish, f.ctx, { id, isPublished: true });
  assert.equal((await f.ctx.db.get(id))?.isPublished, true);
  await invoke(replaceUnits, f.ctx, { workId: id, units: [{ externalId: "first", title: "Chapter", contentMarkdown: "An edited text." }] });
  assert.equal((await f.ctx.db.get(id))?.isPublished, false);
  assert.equal(unit.preparationState, "queued");
  assert.equal(unit.revision, 2);
});

test("stale preparation cannot write vocabulary for a chapter that has been edited", async () => {
  const f = fixture();
  const id = await invoke(createWork, f.ctx, { title: "Reading", kind: "story", topicTags: [], units: [{ externalId: "first", title: "Chapter", contentMarkdown: "A bank beside the river." }] }) as string;
  const unit = f.rows.libraryUnits[0];
  const chapterId = unit._id as string;
  await invoke(prepareChapter, f.ctx, { unitId: chapterId });
  const run = await invoke(claim, f.ctx, { unitId: chapterId }) as Row;
  const tokens = readingTokens(String(unit.title), String(unit.contentMarkdown));
  const words = tokens.map(token => ({ ...token, lemma: token.word, senseId: "meaning", definition: "meaning", partOfSpeech: "noun", translations: { ru: "значение", ar: "معنى", kk: "мағына" } }));
  await invoke(replaceUnits, f.ctx, { workId: id, units: [{ externalId: "first", title: "Chapter", contentMarkdown: "An edited text." }] });
  await invoke(commitBatch, f.ctx, { unitId: chapterId, revision: 1, batchIndex: 0, runId: run.preparationRun, words });
  assert.equal((f.rows.libraryVocabularyBatches ?? []).length, 0, "a revision-1 batch must not land on revision 2");
});

test("a preparation failure is visible and resumes only on an explicit retry", async () => {
  const f = fixture();
  const id = await invoke(createWork, f.ctx, { title: "Reading", kind: "article", topicTags: [], contentMarkdown: "Text about a river bank." }) as string;
  const chapterId = f.rows.libraryUnits[0]._id as string;
  await invoke(prepareChapter, f.ctx, { unitId: chapterId });
  for (let i = 0; i < 3; i++) {
    await f.ctx.db.patch(chapterId, { preparationRetryAt: undefined });
    const run = await invoke(claim, f.ctx, { unitId: chapterId }) as Row;
    await invoke(failed, f.ctx, { unitId: chapterId, revision: 1, batchIndex: 0, runId: run.preparationRun });
  }
  assert.equal((await f.ctx.db.get(chapterId))?.preparationState, "failed");
  await invoke(publish, f.ctx, { id, isPublished: true });
  assert.equal((await f.ctx.db.get(chapterId))?.preparationState, "failed", "publishing must not retry a failed chapter");
  await invoke(prepareChapter, f.ctx, { unitId: chapterId });
  assert.equal((await f.ctx.db.get(chapterId))?.preparationState, "queued");
  assert.equal((await f.ctx.db.get(chapterId))?.preparationCursor, 0);
});

test("opening a chapter prepares it once, only while the reading is published", async () => {
  const f = fixture("student");
  const id = await f.add("libraryWorks", { title: "Live", isPublished: true });
  const unitId = await f.add("libraryUnits", { workId: id, position: 0, externalId: "u1", title: "Chapter", contentMarkdown: "A river bank." });
  assert.deepEqual(await invoke(touchUnit, f.ctx, { unitId }), { queued: true });
  assert.equal(f.jobs.length, 1);
  await f.ctx.db.patch(unitId, { preparationState: "queued" });
  assert.equal(await invoke(touchUnit, f.ctx, { unitId }), null, "a queued chapter must not queue twice");
  await f.ctx.db.patch(unitId, { preparationState: undefined });
  await f.ctx.db.patch(id, { isPublished: false });
  assert.equal(await invoke(touchUnit, f.ctx, { unitId }), null, "drafts never spend");
  await f.ctx.db.patch(id, { isPublished: true });
});

test("stopping preparation clears queued chapters and lets nothing land afterwards", async () => {
  const f = fixture();
  const id = await f.add("libraryWorks", { title: "Live", isPublished: true, publishRequested: true });
  const unitId = await f.add("libraryUnits", { workId: id, position: 0, externalId: "u1", title: "Chapter", contentMarkdown: "A river bank.", preparationState: "preparing" });
  await invoke(cancelPreparation, f.ctx, { id });
  assert.equal((await f.ctx.db.get(unitId))?.preparationState, "cancelled");
  assert.equal(await invoke(touchUnit, f.ctx, { unitId }), null, "opening must not undo Stop");
  const words = [{ key: "k", word: "river", sentence: "A river bank.", lemma: "river", senseId: "s", definition: "d", partOfSpeech: "noun", translations: { ru: "r", ar: "a", kk: "k" } }];
  await invoke(commitBatch, f.ctx, { unitId, revision: 1, batchIndex: 0, words });
  assert.equal((f.rows.libraryVocabularyBatches ?? []).length, 0, "a cancelled chapter must not store a late batch");
});

test("repeat imports reuse chapter IDs and link-only resources can publish without preparation", async () => {
  const f = fixture();
  const item = { externalId: "same-book", title: "Book", kind: "book", topicTags: [] };
  const workId = await invoke(begin, f.ctx, { item });
  const unit = { externalId: "stable-chapter", title: "First", contentMarkdown: "Read this." };
  await invoke(chapter, f.ctx, { workId, unit });
  await invoke(finish, f.ctx, { workId, chapterIds: [unit.externalId], publish: false });
  const unitId = f.rows.libraryUnits[0]._id;
  await invoke(begin, f.ctx, { item });
  await invoke(chapter, f.ctx, { workId, unit: { ...unit, title: "Renamed" } });
  await invoke(finish, f.ctx, { workId, chapterIds: [unit.externalId], publish: false });
  assert.equal(f.rows.libraryUnits[0]._id, unitId);
  assert.equal(f.rows.libraryUnits.length, 1);
  const link = await invoke(createWork, f.ctx, { title: "Video", kind: "video", topicTags: [], externalUrl: "https://www.youtube.com/watch?v=example" });
  await invoke(publish, f.ctx, { id: link, isPublished: true });
  assert.equal((await f.ctx.db.get(String(link)))?.isPublished, true);
});

test("reading progress rejects drafts and cannot mark an unrelated chapter complete", async () => {
  const f = fixture("student");
  const id = await f.add("libraryWorks", { title: "Draft", isPublished: false });
  await assert.rejects(invoke(saveProgress, f.ctx, { workId: id, lastUnitPosition: 0 }), /not found/);
  await f.ctx.db.patch(id, { isPublished: true });
  await assert.rejects(invoke(saveProgress, f.ctx, { workId: id, unitId: "other", lastUnitPosition: 0, completed: true }), /Chapter/);
});

test("preparation keeps different sentence meanings separate and covers names/common words", () => {
  const text = "The bank lends money. We sat on the bank beside the river. They saw Maya.";
  const batch = preparationBatches("Chapter", text)[0];
  assert.equal(batch.words.filter(w => w.word === "bank").length, 2);
  assert.ok(batch.words.some(w => w.word === "the"));
  assert.ok(batch.words.some(w => w.word === "maya"));
  const answer = batch.words.map(w => ({ key: w.key, word: w.word, lemma: w.word, senseId: w.sentences[0].includes("lends") ? "financial" : "riverside", definition: "definition", partOfSpeech: "noun", ru: "слово", ar: "كلمة", kk: "сөз" }));
  const expanded = expandGroupVocabulary(batch.group, parseGroupVocabulary(JSON.stringify({ words: answer }), batch.words));
  assert.deepEqual(expanded.map(w => w.key).sort(), readingTokens("Chapter", text).map(t => t.key).sort());
  assert.ok(expanded.every(w => w.key === tokenKey(w.word, w.sentence)));
  assert.deepEqual(expanded.filter(w => w.word === "bank").map(w => w.senseId), ["financial", "riverside"]);
});

test("incomplete answers cannot be marked ready, even when only one translation is missing", () => {
  const batch = preparationBatches("Chapter", "A bank by the river. A torrent of water. A meadow beyond.")[0];
  const complete = batch.words.map(w => ({ key: w.key, word: w.word, lemma: w.word, senseId: "s", definition: "d", partOfSpeech: "noun", ru: "r", ar: "a", kk: "k" }));
  assert.throws(() => parseGroupVocabulary('{"words":[]}', batch.words), /Incomplete/);
  assert.throws(() => parseGroupVocabulary(JSON.stringify({ words: complete.slice(1) }), batch.words), /Incomplete/);
  const withHole = complete.map((row, i) => i === 0 ? { ...row, ar: "" } : row);
  assert.throws(() => parseGroupVocabulary(JSON.stringify({ words: withHole }), batch.words), /Incomplete/);
  assert.equal(parseGroupVocabulary(JSON.stringify({ words: complete }), batch.words).size, batch.words.length);
});

test("unified external resources accept HTTPS Drive, YouTube and articles while rejecting executable URLs", () => {
  for (const url of ["https://drive.google.com/file/d/example/view", "https://www.youtube.com/watch?v=example", "https://example.com/article"]) assert.equal(assertLibraryUrl(url), url);
  for (const url of ["javascript:alert(1)", "data:text/html,test", "http://example.com", "https://user:secret@example.com"]) assert.throws(() => assertLibraryUrl(url));
});


test("legacy lesson cards, quizzes and vocabulary cannot bypass learner privacy", async () => {
  const f = fixture("student");
  const lessonId = await f.add("lessons", { teacherId: "teacher", studentId: "other", status: "published" });
  await f.add("lessonFlashcards", { lessonId, front: "private" });
  await f.add("lessonQuizQuestions", { lessonId, question: "private" });
  await f.add("lessonVocabulary", { lessonId, word: "private" });
  for (const fn of [listFlashcards, listQuiz, listVocab]) assert.deepEqual(await invoke(fn, f.ctx, { lessonId }), []);
  assert.deepEqual(await invoke(listAllFlashcards, f.ctx, { lessonIds: [lessonId] }), []);
  await f.ctx.db.patch(lessonId, { studentId: "actor", status: "transcribed" });
  assert.deepEqual(await invoke(listFlashcards, f.ctx, { lessonId }), []);
  await f.ctx.db.patch(lessonId, { status: "published" });
  assert.equal((await invoke(listFlashcards, f.ctx, { lessonId }) as Row[]).length, 1);
});

// The staff vocabulary surface uses the same assignment boundary as reading.
test("teacher word lists include assigned learners and reject unassigned learners", async () => {
  const f = fixture("teacher");
  await f.add("users", { externalId: "assigned", role: "student", teacherId: "actor" });
  await f.add("users", { externalId: "unassigned", role: "student", teacherId: "someone-else" });
  await f.add("srsCards", { ownerId: "assigned", front: "garden", translation: "сад", back: "сад", nextReviewDate: "2026-01-01", interval: 1 });
  const words = await invoke(listMyWords, f.ctx, { studentId: "assigned" }) as Array<{ word: string }>;
  assert.deepEqual(words.map(w => w.word), ["garden"]);
  await assert.rejects(invoke(listMyWords, f.ctx, { studentId: "unassigned" }), /Not your assigned student/);
});
