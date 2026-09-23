import test from "node:test";
import assert from "node:assert/strict";
import { studentHomeworkStatusKey } from "../src/lib/studentHomeworkStatus";

test("server reviewed status wins over the local optimistic submission flag", () => {
  assert.equal(studentHomeworkStatusKey("reviewed", true), "reviewed");
});

test("local submission only shows waiting until the server acknowledges it", () => {
  assert.equal(studentHomeworkStatusKey("in_progress", true), "waiting");
  assert.equal(studentHomeworkStatusKey("submitted", false), "waiting");
  assert.equal(studentHomeworkStatusKey("in_progress", false), "started");
});
