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
