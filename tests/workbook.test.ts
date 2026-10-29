import test from "node:test";
import assert from "node:assert/strict";
import { newWorkbookSection, normalizeWorkbookSection, workbookForStudent, workbookIssues, workbookResult, shuffled, type WorkbookSection } from "../convex/lib/workbook";
import { mergeStudentAnswers, sanitizeForStudent } from "../convex/homework";
import { normalizeHomeworkDocument } from "../convex/lib/homeworkOutput";
import { scoreDoc } from "../src/components/homework/grading";

function section(kind: WorkbookSection["kind"] = "gaps", id = "section-a"): WorkbookSection {
  const s = newWorkbookSection(kind, id);
  s.instructions = "Complete the sentence.";
  s.items[0] = { ...s.items[0], prompt: "She ___ every day.", accepted: ["walks", "goes walking"], explanation: "Third person singular", modelAnswer: "She walks every day.", comment: "Private feedback", mark: "correct" };
  return s;
}
const doc = (...sections: WorkbookSection[]) => ({ type: "doc", content: sections.map(attrs => ({ type: "workbookSection", attrs })) });

test("workbook answer-key allowlist holds at every new field and preserves public matching options", () => {
  const s = section("matching"); s.items[0].prompt = "walk"; s.items[0].accepted = ["go on foot"];
  s.items.push({ ...s.items[0], id: "q2", prompt: "run", accepted: ["move quickly"] });
  const visible = sanitizeForStudent(doc(s));
  const serialized = JSON.stringify(visible);
  for (const secret of ["accepted", "explanation", "modelAnswer", "Private feedback", '"mark"', "ignorePunctuation"]) assert.equal(serialized.includes(secret), false, secret);
  assert.deepEqual([...visible.content[0].attrs.items[0].options].sort(), ["go on foot", "move quickly"].sort());
  assert.equal(visible.content[0].attrs.items[0].answer, "");
  assert.deepEqual(workbookForStudent(s), visible.content[0].attrs);
});

test("reordered sections and questions merge by id; prompt, keys and marks cannot be overwritten", () => {
  const a = section(), b = section("short", "section-b");
  a.items.push({ ...a.items[0], id: "question-2", prompt: "He ___ every day." });
  const stored = doc(a, b), incoming = sanitizeForStudent(stored);
  incoming.content.reverse();
  incoming.content[1].attrs.items.reverse();
  incoming.content[1].attrs.items[0].answer = "goes walking";
  incoming.content[1].attrs.items[0].accepted = ["fake key"];
  incoming.content[1].attrs.items[0].prompt = "fake prompt";
  incoming.content[1].attrs.items[0].mark = "incorrect";
  incoming.content[0].attrs.items[0].answer = "My response";
  const merged = mergeStudentAnswers(stored, incoming) as typeof stored;
  assert.equal(merged.content[0].attrs.items[1].answer, "goes walking");
  assert.equal(merged.content[0].attrs.items[0].answer, "");
  assert.equal(merged.content[1].attrs.items[0].answer, "My response");
  assert.deepEqual(merged.content[0].attrs.items[1].accepted, a.items[1].accepted);
  assert.equal(merged.content[0].attrs.items[1].mark, "correct");
  assert.equal(merged.content[0].attrs.items[1].prompt, "He ___ every day.");
  assert.deepEqual(mergeStudentAnswers(merged, sanitizeForStudent(merged)), merged);
});

test("forged ids, objects and oversized answers do not change saved workbook answers", () => {
  const s = section(), stored = doc(s), input = sanitizeForStudent(stored);
  for (const answer of [42, {}, "a".repeat(20001)]) {
    input.content[0].attrs.items[0].answer = answer;
    assert.deepEqual(mergeStudentAnswers(stored, input), stored);
  }
  input.content[0].attrs.items[0].id = "unknown";
  input.content[0].attrs.items[0].answer = "hacked";
  assert.deepEqual(mergeStudentAnswers(stored, input), stored);
});

test("alternatives, contractions and teacher overrides grade without accepting apostrophe errors", () => {
  const s = section(); const q = { ...s.items[0], mark: null, answer: "  GOES   WALKING  " };
  assert.equal(workbookResult(q, s), "correct");
  assert.equal(workbookResult({ ...q, accepted: ["doesn't"], answer: "doesn’t" }, s), "correct");
  assert.equal(workbookResult({ ...q, accepted: ["doesn't"], answer: "doesnt" }, { ignorePunctuation: true }), "incorrect");
  assert.equal(workbookResult({ ...q, accepted: ["I work."], answer: "I work" }, s), "incorrect");
  assert.equal(workbookResult({ ...q, accepted: ["I work."], answer: "I work" }, { ignorePunctuation: true }), "correct");
  assert.equal(workbookResult({ ...q, accepted: [], answer: "Open response" }, s), "open");
  assert.equal(workbookResult({ ...q, mark: "partial", answer: "Wrong" }, s), "partial");
});

test("mixed legacy and workbook exercises score every question exactly once", () => {
  const s = section(); s.items[0].mark = null; s.items[0].answer = "walks";
  s.items.push({ ...s.items[0], id: "q2", accepted: [], answer: "Open", mark: "partial" });
  const mixed = doc(s) as { type: string; content: unknown[] };
  mixed.content.push({ type: "studentChoice", attrs: { correct: 1, selected: 1 } });
  assert.deepEqual(scoreDoc(mixed), { correct: 2.5, total: 3, open: 0, percent: 83 });
  s.items[1].mark = null;
  assert.equal(scoreDoc(doc(s)).open, 1);
});

test("normalization never trusts provider answers and requires answerable exercise structures", () => {
  const s = section(); s.items[0].answer = "pre-filled";
  const normalized = normalizeHomeworkDocument(doc(s));
  assert.ok(normalized);
  const attrs = normalized.content[0].attrs as WorkbookSection;
  assert.equal(attrs.items[0].answer, ""); assert.equal(attrs.items[0].mark, null); assert.equal(attrs.items[0].comment, "");
  assert.deepEqual(workbookIssues(attrs), []);
  assert.equal(normalizeWorkbookSection({ ...s, items: [s.items[0], s.items[0]] }), null);
  const choice = section("choice"); choice.items[0].options = ["one", "one"];
  assert.ok(workbookIssues(choice).some(s => s.includes("distinct options")));
  const reading = section("reading"); assert.ok(workbookIssues(reading).some(s => s.includes("passage")));
  const order = section("ordering"); order.items[0].accepted = ["I like very very hot tea."]; order.items[0].tokens = ["very", "I", "hot", "tea.", "like", "very"];
  assert.deepEqual(workbookIssues(order), []);
  order.items[0].tokens.pop(); assert.ok(workbookIssues(order).some(s => s.includes("words must match")));
});

test("word-order shuffle is stable and preserves repeated tokens", () => {
  const tokens = ["I", "very", "very", "much", "like", "tea."];
  assert.deepEqual(shuffled(tokens, "q"), shuffled(tokens, "q"));
  assert.deepEqual([...shuffled(tokens, "q")].sort(), [...tokens].sort());
  assert.deepEqual(tokens, ["I", "very", "very", "much", "like", "tea."]);
});
