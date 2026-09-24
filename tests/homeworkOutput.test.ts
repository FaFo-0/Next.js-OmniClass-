import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHomeworkDocument,
  normalizeHomeworkNodes,
  parseHomeworkOutput,
} from "../convex/lib/homeworkOutput.ts";

const validNodes = [
  {
    type: "paragraph",
    content: [
      { type: "text", text: "Complete the exercises." },
      {
        type: "studentBlank",
        attrs: {
          label: "fruit",
          expected: "apple",
          answer: "provider answer",
          mark: "correct",
        },
      },
    ],
  },
  {
    type: "bulletList",
    content: [{
      type: "listItem",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "A list item." }],
      }],
    }],
  },
  {
    type: "studentChoice",
    attrs: {
      question: "Pick one",
      options: ["one", "two"],
      correct: 1,
      selected: 0,
      mark: "incorrect",
    },
  },
  {
    type: "studentText",
    attrs: {
      prompt: "Explain why.",
      answer: "provider answer",
      long: true,
      mark: "partial",
    },
  },
];

test("normalizes valid generated homework while preserving teacher keys", () => {
  assert.deepEqual(normalizeHomeworkDocument({ type: "doc", content: validNodes }), {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Complete the exercises." },
          { type: "studentBlank", attrs: { label: "fruit", expected: "apple", answer: "" } },
        ],
      },
      validNodes[1],
      {
        type: "studentChoice",
        attrs: { question: "Pick one", options: ["one", "two"], correct: 1, selected: -1 },
      },
      {
        type: "studentText",
        attrs: { prompt: "Explain why.", answer: "", long: true },
      },
    ],
  });
});

test("accepts omitted exercise attrs because TipTap supplies their defaults", () => {
  assert.deepEqual(normalizeHomeworkDocument({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "studentBlank" }] },
      { type: "studentChoice" },
      { type: "studentText" },
    ],
  }), {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "studentBlank" }] },
      { type: "studentChoice" },
      { type: "studentText" },
    ],
  });
});

test("accepts parser formats used by provider responses", () => {
  const doc = { type: "doc", content: validNodes };
  const cases = [
    JSON.stringify(doc),
    JSON.stringify(validNodes),
    `\n\`\`\`json\n${JSON.stringify(doc)}\n\`\`\`\n`,
    JSON.stringify({ provider: { output: doc } }),
  ];

  for (const raw of cases) {
    assert.deepEqual(parseHomeworkOutput(raw), normalizeHomeworkDocument(doc));
  }
});

test("rejects malformed node attributes before storage", () => {
  const malformed = [
    { type: "studentBlank", attrs: { label: 1 } },
    { type: "studentBlank", attrs: { expected: ["answer"] } },
    { type: "studentChoice", attrs: { question: 1 } },
    { type: "studentChoice", attrs: { options: "one,two" } },
    { type: "studentChoice", attrs: { options: undefined } },
    { type: "studentChoice", attrs: { options: ["one", 2] } },
    { type: "studentChoice", attrs: { options: ["one"], correct: 0.5 } },
    { type: "studentChoice", attrs: { options: ["one"], correct: 1 } },
    { type: "studentChoice", attrs: { options: [], correct: 0 } },
    { type: "text", text: 1 },
    { type: "studentText", attrs: { prompt: 1 } },
    { type: "studentText", attrs: { long: "true" } },
    { type: "studentChoice", attrs: null },
  ];

  for (const node of malformed) {
    assert.equal(normalizeHomeworkDocument({ type: "doc", content: [node] }), null, JSON.stringify(node));
  }
});

test("strips unknown document, node, and exercise attributes while preserving supported output", () => {
  assert.deepEqual(normalizeHomeworkDocument({
    type: "doc",
    title: "provider-controlled title",
    content: [{
      type: "paragraph",
      attrs: { hiddenAnswer: "do not store" },
      content: [{
        type: "text",
        text: "Question text",
        unknown: "do not store",
        marks: [{ type: "bold", unknown: "do not store" }, { type: "unsupported" }],
      }],
      }, {
        type: "paragraph",
        content: [{
          type: "studentBlank",
          attrs: {
            label: "fruit",
            expected: "apple",
            answerKey: "secret",
            hiddenAnswer: "secret",
            unknown: "do not store",
          },
        }],
      }],
  }), {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "text", text: "Question text", marks: [{ type: "bold" }] }],
      }, {
        type: "paragraph",
        content: [{
          type: "studentBlank",
          attrs: { label: "fruit", expected: "apple", answer: "" },
        }],
      }],
  });
});

test("normalizes learner-writable generated values instead of trusting them", () => {
  const normalized = normalizeHomeworkNodes([
    { type: "paragraph", content: [{ type: "studentBlank", attrs: { answer: "filled", mark: "trusted?" } }] },
    { type: "studentChoice", attrs: { options: ["one"], correct: -1, selected: 0, mark: "trusted?" } },
    { type: "studentText", attrs: { answer: "filled", mark: "trusted?" } },
  ]);

  assert.deepEqual(normalized, [
    { type: "paragraph", content: [{ type: "studentBlank", attrs: { answer: "" } }] },
    { type: "studentChoice", attrs: { options: ["one"], correct: -1, selected: -1 } },
    { type: "studentText", attrs: { answer: "", long: false } },
  ]);
});

test("accepts valid block, list, and inline exercise grammar", () => {
  assert.notEqual(normalizeHomeworkDocument({
    type: "doc",
    content: [{
      type: "orderedList",
      content: [{
        type: "listItem",
        content: [{
          type: "paragraph",
          content: [{ type: "text", text: "Fill this " }, { type: "studentBlank" }],
        }],
      }],
    }, {
      type: "studentChoice",
      attrs: { options: ["one", "two"], correct: -1 },
    }],
  }), null);
});

test("rejects invalid TipTap parent-child relationships and leaf content", () => {
  const malformed = [
    { type: "paragraph", content: [{ type: "doc", content: [{ type: "paragraph" }] }] },
    { type: "paragraph", content: [{ type: "studentChoice" }] },
    { type: "text", text: "text", content: [{ type: "text", text: "nested" }] },
    { type: "studentBlank", content: [] },
    { type: "studentChoice", content: [] },
    { type: "studentText", content: [] },
  ];

  for (const node of malformed) {
    assert.equal(normalizeHomeworkDocument({ type: "doc", content: [node] }), null, JSON.stringify(node));
  }
});

test("parser does not recover a nested document from an invalid TipTap tree", () => {
  assert.equal(parseHomeworkOutput(JSON.stringify({
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "doc", content: [{ type: "paragraph" }] }],
    }],
  })), null);
});

test("rejects unsupported custom TipTap node types", () => {
  assert.equal(normalizeHomeworkDocument({
    type: "doc",
    content: [{ type: "answerKey", attrs: { value: "secret" } }],
  }), null);
});
