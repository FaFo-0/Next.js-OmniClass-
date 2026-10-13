import test from "node:test";
import assert from "node:assert/strict";
import { mergeStudentAnswers, sanitizeForStudent } from "../convex/homework";

test("homework student contract removes answer keys and teacher marks without changing student answers", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "studentBlank",
          attrs: { label: "food", expected: "apple", answer: "pear", mark: "incorrect" },
        }],
      }, {
        type: "studentChoice",
        attrs: { options: ["one", "two"], correct: 1, selected: 0, mark: "partial" },
      }],
    };

    assert.deepEqual(sanitizeForStudent(doc), {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "studentBlank",
          attrs: { label: "food", answer: "pear" },
        }],
      }, {
        type: "studentChoice",
        attrs: { options: ["one", "two"], selected: 0 },
      }],
    });
});

test("homework student sanitization removes arbitrary fields at every depth", () => {
  assert.deepEqual(sanitizeForStudent({
    type: "doc",
    content: [{
      type: "studentChoice",
      attrs: {
        question: "What is the answer?",
        answer: "student response",
        answerKey: "secret",
        hiddenAnswer: "secret",
        nested: {
          expected: "secret",
          correctAnswer: "secret",
          prompt: "keep this prompt",
        },
      },
    }],
  }), {
    type: "doc",
    content: [{
      type: "studentChoice",
      attrs: {
        question: "What is the answer?",
      },
    }],
  });
});

test("homework student sanitization preserves valid answers while stripping unknown answer keys", () => {
  assert.deepEqual(sanitizeForStudent({
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{
        type: "studentBlank",
        attrs: {
          label: "fruit",
          answer: "pear",
          expected: "apple",
          correctIndex: 1,
          customSolution: { answer: "secret" },
        },
      }],
    }, {
      type: "studentChoice",
      attrs: {
        question: "Pick one",
        options: ["one", "two"],
        selected: 1,
        correct: 0,
        customSolution: "secret",
      },
    }, {
      type: "studentText",
      attrs: {
        prompt: "Explain",
        answer: "Because",
        long: true,
        solution: "secret",
      },
    }],
  }), {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{
        type: "studentBlank",
        attrs: { label: "fruit", answer: "pear" },
      }],
    }, {
      type: "studentChoice",
      attrs: { question: "Pick one", options: ["one", "two"], selected: 1 },
    }, {
      type: "studentText",
      attrs: { prompt: "Explain", answer: "Because", long: true },
    }],
  });
});

test("student answer merging ignores invalid answer and selection writes", () => {
  const stored = {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{
        type: "studentBlank",
        attrs: { expected: "apple", answer: "old" },
      }],
    }, {
      type: "studentChoice",
      attrs: { options: ["one", "two"], correct: 1, selected: -1 },
    }, {
      type: "studentText",
      attrs: { prompt: "Explain", answer: "old text" },
    }],
  };

  assert.deepEqual(mergeStudentAnswers(stored, {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "studentBlank", attrs: { answer: 42 } }],
    }, {
      type: "studentChoice",
      attrs: { selected: 1 },
    }, {
      type: "studentText",
      attrs: { answer: { malicious: true } },
    }],
  }), {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "studentBlank", attrs: { expected: "apple", answer: "old" } }],
    }, {
      type: "studentChoice",
      attrs: { options: ["one", "two"], correct: 1, selected: 1 },
    }, {
      type: "studentText",
      attrs: { prompt: "Explain", answer: "old text" },
    }],
  });

  const invalidSelectionResult = mergeStudentAnswers(stored, {
    content: [{
      type: "studentChoice",
      attrs: { selected: 2.5 },
    }],
  }) as { content: Array<{ attrs: { selected: number } }> };
  assert.equal(invalidSelectionResult.content[1].attrs.selected, -1);
});

test("legacy exercise-first lists keep choice and writing answers through TipTap save and reload", () => {
  const stored = {
    type: "doc",
    content: [{ type: "bulletList", content: [
      { type: "listItem", content: [{ type: "studentChoice", attrs: {
        question: "What did Anna buy?", options: ["apples", "oranges"], correct: 0, selected: -1,
      } }] },
      { type: "listItem", content: [{ type: "studentText", attrs: {
        prompt: "Describe the market.", answer: "", long: true,
      } }] },
    ] }],
  };
  const studentDoc = sanitizeForStudent(stored);
  assert.deepEqual(studentDoc.content[0].content[0].content[0], { type: "paragraph" });
  studentDoc.content[0].content[0].content[1].attrs.selected = 0;
  studentDoc.content[0].content[1].content[1].attrs.answer = "I bought fresh apples.";
  // The browser cannot change the authoritative question or answer key.
  studentDoc.content[0].content[0].content[1].attrs.correct = 1;
  studentDoc.content[0].content[0].content[1].attrs.question = "Changed prompt";
  const saved = mergeStudentAnswers(stored, studentDoc) as typeof studentDoc;
  assert.equal(saved.content[0].content[0].content[1].attrs.correct, 0);
  assert.equal(saved.content[0].content[0].content[1].attrs.question, "What did Anna buy?");
  const reloaded = sanitizeForStudent(saved);
  assert.equal(reloaded.content[0].content[0].content[1].attrs.selected, 0);
  assert.equal(reloaded.content[0].content[1].content[1].attrs.answer, "I bought fresh apples.");
  assert.equal(reloaded.content[0].content[0].content[1].attrs.correct, undefined);
  assert.deepEqual(mergeStudentAnswers(saved, reloaded), saved);
});
