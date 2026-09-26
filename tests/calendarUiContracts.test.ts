import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studentCalendar = readFileSync("src/app/student/calendar/page.tsx", "utf8");
const bookingReview = readFileSync("src/components/calendar/BookingReview.tsx", "utf8");
const weeklyCalendar = readFileSync("src/components/calendar/WeeklyCalendar.tsx", "utf8");
const profile = readFileSync("src/app/student/profile/page.tsx", "utf8");

test("student calendar keeps conflict repair in the single review surface", () => {
  assert.match(studentCalendar, /<StudentBookingPanel/);
  assert.match(studentCalendar, /reviewOpen/);
  assert.match(studentCalendar, /batchConflicts\.length > 0/);
  assert.match(bookingReview, /replaceOccurrence/);
  assert.doesNotMatch(studentCalendar, /student-calendar-booking-conflicts-bottom/);
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
