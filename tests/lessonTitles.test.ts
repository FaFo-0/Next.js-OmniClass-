import assert from "node:assert/strict";
import test from "node:test";
import { automaticLessonTitle, parseLessonSummary, planLessonNumbers, type NumberedEvent } from "../convex/lib/lessonTitles.ts";
import { saveGeneratedSummary } from "../convex/lessons.ts";

type Handler = { _handler(ctx: unknown, args: unknown): Promise<unknown> };
const generated = JSON.stringify({ title: "Talking About Weekend Plans", summary: "Practised future plans using going to." });

function fixture(source: "automatic" | "teacher", title: string) {
  const lesson = { _id: "lesson", organizationId: "org", teacherId: "teacher", title, titleSource: source, lessonNumber: 12, summary: "Old summary", contentStatus: { summary: "approved", vocabulary: "approved" } };
  return { lesson, ctx: { db: { get: async () => lesson, patch: async (_id: string, patch: object) => Object.assign(lesson, patch) } } };
}
const args = { id: "lesson", organizationId: "org", teacherId: "teacher", content: generated };

test("paired summary generation applies a topic to an automatic title", async () => {
  const f = fixture("automatic", "English Lesson 12");
  await (saveGeneratedSummary as unknown as Handler)._handler(f.ctx, args);
  assert.equal(f.lesson.title, "Lesson 12 · Talking About Weekend Plans");
  assert.equal(f.lesson.summary, "Practised future plans using going to.");
  assert.equal(f.lesson.contentStatus.summary, "review");
});

test("a teacher rename during generation survives and still receives the suggestion", async () => {
  const f = fixture("teacher", "My Travel Story");
  await (saveGeneratedSummary as unknown as Handler)._handler(f.ctx, args);
  assert.equal(f.lesson.title, "My Travel Story");
  assert.equal((f.lesson as unknown as { aiSuggestedTitle: string }).aiSuggestedTitle, "Talking About Weekend Plans");
  await (saveGeneratedSummary as unknown as Handler)._handler(f.ctx, { ...args, content: JSON.stringify({ title: "Asking Questions About Travel", summary: "Revised summary" }) });
  assert.equal(f.lesson.title, "My Travel Story");
});

test("malformed or empty summaries never replace existing reviewed content", async () => {
  for (const content of ["unfinished {", '{"summary":""}', '{"title":"Weekend Plans"}']) {
    const f = fixture("automatic", "English Lesson 12");
    await assert.rejects((saveGeneratedSummary as unknown as Handler)._handler(f.ctx, { ...args, content }));
    assert.equal(f.lesson.summary, "Old summary");
    assert.equal(f.lesson.title, "English Lesson 12");
  }
});

test("insufficient title evidence keeps the numbered fallback and saves a useful summary", async () => {
  const f = fixture("automatic", "English Lesson 12");
  await (saveGeneratedSummary as unknown as Handler)._handler(f.ctx, { ...args, content: '{"title":null,"summary":"Brief introduction."}' });
  assert.equal(f.lesson.title, "English Lesson 12");
  assert.equal(f.lesson.summary, "Brief introduction.");
  assert.equal(parseLessonSummary('{"title":"English Practice","summary":"Hello"}').title, undefined);
  assert.equal(automaticLessonTitle(12), "English Lesson 12");
});

const event = (id: string, date: string, extra: Partial<NumberedEvent> = {}): NumberedEvent => ({ _id: id, date, startTime: "10:00", status: "scheduled", ...extra });
test("upcoming bookings reorder around earlier bookings, cancellations and moves", () => {
  const history = event("done", "2026-10-01", { status: "completed", lessonNumber: 4 });
  const later = event("later", "2026-10-10");
  const earlier = event("earlier", "2026-10-08");
  assert.deepEqual([...planLessonNumbers([later, earlier, history])], [["done", 4], ["earlier", 5], ["later", 6]]);
  assert.equal(planLessonNumbers([later, { ...earlier, status: "cancelled" }, history]).get("later"), 5);
  assert.equal(planLessonNumbers([later, { ...earlier, date: "2026-10-12" }, history]).get("later"), 5);
});

test("completed, started and student no-show numbers freeze; teacher no-shows do not consume a number", () => {
  const rows = [event("done", "2026-10-01", { status: "completed", lessonNumber: 1 }), event("missed", "2026-10-02", { status: "no_show_student", lessonNumber: 2 }), event("teacherMissed", "2026-10-03", { status: "no_show_teacher", lessonNumber: 3 }), event("live", "2026-10-05", { teacherStartedAt: "2026-10-05T05:00:00Z", lessonNumber: 3 }), event("next", "2026-10-06")];
  const numbers = planLessonNumbers(rows);
  assert.deepEqual([...numbers], [["done", 1], ["missed", 2], ["live", 3], ["next", 4]]);
});

test("summary persistence rejects a different academy or teacher", async () => {
  const f = fixture("automatic", "English Lesson 12");
  await assert.rejects((saveGeneratedSummary as unknown as Handler)._handler(f.ctx, { ...args, organizationId: "other" }));
  await assert.rejects((saveGeneratedSummary as unknown as Handler)._handler(f.ctx, { ...args, teacherId: "other" }));
  assert.equal(f.lesson.summary, "Old summary");
});
