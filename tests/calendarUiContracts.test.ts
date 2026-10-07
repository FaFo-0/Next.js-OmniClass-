import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync("src/app/student/profile/page.tsx", "utf8");

test("calendar subscription explains purpose, status, and subscription setup", () => {
  assert.match(profile, /data-testid="calendar-subscription-instructions"/);
  for (const key of ["calendarSubPurpose", "calendarSubActive", "calendarSubNotConnected", "calendarSubInstructions"]) {
    assert.match(profile, new RegExp(`t\\(\\"${key}\\"`));
  }
});
