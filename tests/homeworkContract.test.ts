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
