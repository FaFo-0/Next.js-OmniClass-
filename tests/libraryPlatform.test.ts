import assert from "node:assert/strict";
import test from "node:test";
import { listFlashcards, listAllFlashcards, listQuiz, listVocab } from "../convex/lessonContent";
import { listMyWords, listDecks, listCardsInDeck, getWordSet, listDueCards, recordReview } from "../convex/srs";
import { createWork, replaceUnits, publish, saveProgress } from "../convex/libraryWorks";
import { commitBatch, failed } from "../convex/libraryPreparation";
import { begin, chapter, finish } from "../convex/libraryImport";
import { upsertSavedVocabulary } from "../convex/lib/vocabulary";
import { readingTokens, parsePreparedWords } from "../convex/lib/libraryText";
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

test("publication waits for complete vocabulary and stale preparation cannot publish edited text", async () => {
  const f = fixture();
  const id = await invoke(createWork, f.ctx, { title: "A reading", kind: "story", topicTags: [], units: [{ externalId: "first", title: "Chapter", contentMarkdown: "A bank beside the river." }] }) as string;
  await invoke(publish, f.ctx, { id, isPublished: true });
  assert.equal((await f.ctx.db.get(id))?.isPublished, false);
  const unit = f.rows.libraryUnits[0];
  const tokens = readingTokens(String(unit.title), String(unit.contentMarkdown));
  const words = tokens.map(token => ({ ...token, lemma: token.word, senseId: "meaning", definition: "meaning", partOfSpeech: "noun", translations: { ru: "значение", ar: "معنى", kk: "мағына" } }));
  await invoke(replaceUnits, f.ctx, { workId: id, units: [{ externalId: "first", title: "Chapter", contentMarkdown: "An edited text." }] });
  assert.equal(f.rows.libraryUnits.length, 1);
  await invoke(commitBatch, f.ctx, { unitId: unit._id, revision: 1, offset: 0, words, total: tokens.length });
  assert.equal((await f.ctx.db.get(id))?.isPublished, false);
  const current = readingTokens(String(unit.title), String(unit.contentMarkdown));
  await invoke(commitBatch, f.ctx, { unitId: unit._id, revision: 2, offset: 0, words: current.map(t => ({ ...words[0], ...t })), total: current.length });
  assert.equal((await f.ctx.db.get(id))?.isPublished, true);
});

test("a preparation failure retains its cursor and can be resumed by publishing again", async () => {
  const f = fixture();
  const id = await invoke(createWork, f.ctx, { title: "Reading", kind: "article", topicTags: [], contentMarkdown: "Text." }) as string;
  const unit = f.rows.libraryUnits[0];
  await invoke(failed, f.ctx, { unitId: unit._id, revision: 1, offset: 0, attempt: 2 });
  assert.equal(unit.preparationState, "failed");
  await invoke(publish, f.ctx, { id, isPublished: true });
  assert.equal(unit.preparationState, "queued");
  assert.equal(unit.preparationCursor, 0);
  assert.equal((await f.ctx.db.get(id))?.isPublished, false);
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

test("contextual preparation requires every occurrence and every learner translation", () => {
  const tokens = readingTokens("Bank", "A bank by the river. A bank lends money.");
  assert.equal(tokens.filter(t => t.word === "bank").length, 3);
  assert.throws(() => parsePreparedWords('{"words":[]}', tokens), /Incomplete/);
  const rows = tokens.map(t => ({ key: t.key, lemma: t.word, senseId: "sense", definition: "definition", ru: "слово", ar: "كلمة", kk: "сөз" }));
  assert.equal(parsePreparedWords(JSON.stringify({ words: rows }), tokens).length, tokens.length);
  rows[0].kk = "";
  assert.throws(() => parsePreparedWords(JSON.stringify(rows), tokens), /Incomplete/);
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
