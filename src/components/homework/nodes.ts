// Homework exercise nodes. Three cover essentially all language homework:
//   studentBlank  — inline fill-in-the-blank (auto-graded when the teacher
//                   sets an expected answer, otherwise teacher-graded)
//   studentChoice — block multiple choice (auto-graded via a correct index)
//   studentText   — block short/long open answer (always teacher-graded)
//
// Answers live in the node attrs so there's no second store. `mark` is the
// teacher's per-item override, applied during review. Expected answers and
// the correct index are stripped server-side before a student sees the doc
// pre-review (see convex/homework.ts sanitizeForStudent) so the answer key
// never reaches their browser.

import { Node, mergeAttributes } from "@tiptap/core";

export const StudentBlank = Node.create({
  name: "studentBlank",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      label: { default: "" }, // hint shown to the student
      expected: { default: "" }, // teacher's answer; empty → manual grade
      answer: { default: "" }, // what the student typed
      mark: { default: null as null | string }, // teacher override
    };
  },

  parseHTML() {
    return [{ tag: "span[data-omnic='student-blank']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-omnic": "student-blank" }),
      "____",
    ];
  },
});

export const StudentChoice = Node.create({
  name: "studentChoice",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      question: { default: "" },
      options: { default: [] as string[] },
      correct: { default: -1 }, // index of the correct option; -1 → manual
      selected: { default: -1 }, // index the student picked
      mark: { default: null as null | string },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-omnic='student-choice']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-omnic": "student-choice" }),
    ];
  },
});

export const StudentText = Node.create({
  name: "studentText",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      prompt: { default: "" },
      answer: { default: "" },
      long: { default: false }, // multi-line textarea vs single line
      mark: { default: null as null | string },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-omnic='student-text']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-omnic": "student-text" }),
    ];
  },
});

export const HOMEWORK_NODES = [StudentBlank, StudentChoice, StudentText];
