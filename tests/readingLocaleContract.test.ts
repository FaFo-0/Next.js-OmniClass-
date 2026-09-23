import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const teacherReader = fs.readFileSync(
  "src/app/teacher/library/work/[workId]/[unitId]/page.tsx",
  "utf8"
);
const shareReader = fs.readFileSync(
  "src/app/teacher/share/reading/page.tsx",
  "utf8"
);
const popover = fs.readFileSync("src/components/library/WordLookupPopover.tsx", "utf8");

test("teacher readers resolve the same learner locale as the student's word list", () => {
  assert.match(teacherReader, /getLearnerLocale[\s\S]*?activeStudentId \? \{ studentId: activeStudentId \}/);
  assert.match(teacherReader, /learnerLocale=\{learnerLocale\}/);
  assert.match(shareReader, /const studentId = lesson\?\.studentId/);
  assert.match(shareReader, /getLearnerLocale[\s\S]*?\{ studentId \}/);
  assert.match(shareReader, /activeStudentId=\{studentId\}[\s\S]*?learnerLocale=\{learnerLocale\}/);
});

test("missing-language fallback is not shown while the locale query is loading", () => {
  assert.match(popover, /learnerLocale === null/);
  assert.doesNotMatch(popover, /!learnerLocale\s*\?\s*mode === "live-teach"/);
});
