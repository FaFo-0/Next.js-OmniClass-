import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studentCalendar = readFileSync("src/app/student/calendar/page.tsx", "utf8");
const weeklyCalendar = readFileSync("src/components/calendar/WeeklyCalendar.tsx", "utf8");
const profile = readFileSync("src/app/student/profile/page.tsx", "utf8");

test("student calendar repeats conflict details at the bottom booking boundary", () => {
  assert.match(studentCalendar, /data-testid="student-calendar-booking-conflicts-bottom"/);
  assert.match(studentCalendar, /batchConflicts\.slice\(0, 2\)/);
});

test("staged calendar lessons clear the snap preview and stay above it", () => {
  assert.match(weeklyCalendar, /setSnapHover\(null\);/);
  assert.match(weeklyCalendar, /data-testid="calendar-staged-lesson"/);
  assert.match(weeklyCalendar, /zIndex: 3/);
});

test("calendar subscription explains purpose, status, and subscription setup", () => {
  assert.match(profile, /data-testid="calendar-subscription-instructions"/);
  for (const key of ["calendarSubPurpose", "calendarSubActive", "calendarSubNotConnected", "calendarSubInstructions"]) {
    assert.match(profile, new RegExp(`t\\(\\"${key}\\"`));
  }
});
