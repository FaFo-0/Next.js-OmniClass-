import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeForStudent } from "../convex/homework";

test("homework student contract removes answer keys and teacher marks without changing student answers", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "studentBlank",
        attrs: { label: "food", expected: "apple", answer: "pear", mark: "incorrect" },
      }, {
        type: "studentChoice",
        attrs: { correct: 1, selected: 0, mark: "partial" },
      }],
    };

    assert.deepEqual(sanitizeForStudent(doc), {
      type: "doc",
      content: [{
        type: "studentBlank",
        attrs: { label: "food", answer: "pear" },
      }, {
        type: "studentChoice",
        attrs: { selected: 0 },
      }],
    });
});

test("homework student sanitization removes arbitrary answer-key fields at every depth", () => {
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
          answer: "nested student response",
          prompt: "keep this prompt",
        },
      },
      metadata: {
        modelAnswer: "secret",
        question: "keep this question",
      },
    }],
  }), {
    type: "doc",
    content: [{
      type: "studentChoice",
      attrs: {
        question: "What is the answer?",
        answer: "student response",
        nested: {
          answer: "nested student response",
          prompt: "keep this prompt",
        },
      },
      metadata: {
        question: "keep this question",
      },
    }],
  });
});
