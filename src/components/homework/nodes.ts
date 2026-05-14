// Phase J.1 — Custom TipTap nodes for homework. Each node ships with
// a React renderer (in `<HomeworkEditor>`) and persists its filled-in
// answer inside the node's attrs so we don't need a second store.

import { Node, mergeAttributes } from "@tiptap/core";

export const StudentBlank = Node.create({
  name: "studentBlank",
  inline: true,
  group: "inline",
  atom: false,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      label: { default: "" },
      answer: { default: "" },
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

export const StudentCheckbox = Node.create({
  name: "studentCheckbox",
  group: "block",
  atom: false,
  defining: true,

  addAttributes() {
    return {
      items: { default: [] as { label: string; checked: boolean }[] },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-omnic='student-checkbox']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-omnic": "student-checkbox" }),
    ];
  },
});

export const StudentMultiChoice = Node.create({
  name: "studentMultiChoice",
  group: "block",
  atom: false,
  defining: true,

  addAttributes() {
    return {
      question: { default: "" },
      options: { default: [] as string[] },
      selected: { default: -1 },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-omnic='student-multi-choice']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-omnic": "student-multi-choice" }),
    ];
  },
});

export const StudentVocabList = Node.create({
  name: "studentVocabList",
  group: "block",
  atom: false,
  defining: true,

  addAttributes() {
    return {
      words: { default: [] as string[] },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-omnic='student-vocab-list']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-omnic": "student-vocab-list" }),
    ];
  },
});

export const HOMEWORK_NODES = [
  StudentBlank,
  StudentCheckbox,
  StudentMultiChoice,
  StudentVocabList,
];
