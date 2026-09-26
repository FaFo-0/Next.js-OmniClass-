import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = ".";
const studentCalendar = readFileSync(`${root}/src/app/student/calendar/page.tsx`, "utf8");
const availability = readFileSync(`${root}/src/components/calendar/AvailabilityBoard.tsx`, "utf8");
const adminCalendar = readFileSync(`${root}/src/app/admin/calendar/page.tsx`, "utf8");
const agenda = readFileSync(`${root}/src/components/calendar/CalendarAgenda.tsx`, "utf8");
const vacancies = readFileSync(`${root}/convex/vacancies.ts`, "utf8");
const calendar = readFileSync(`${root}/convex/calendar.ts`, "utf8");

test("student draft is canonical, repairable, and receipt-bound", () => {
  assert.match(studentCalendar, /canonicalizeBookings/);
  assert.match(studentCalendar, /canonicalizeViewerBooking/);
  assert.match(studentCalendar, /projectBookingForViewer/);
  assert.match(studentCalendar, /if \(conflicts && conflicts\.length > 0\)/);
  assert.match(studentCalendar, /preserves every intention for repair/);
  assert.match(studentCalendar, /function removeStaged/);
  assert.match(studentCalendar, /function replaceStaged/);
  assert.match(studentCalendar, /removeOccurrence/);
  assert.match(studentCalendar, /replaceOccurrence/);
  assert.match(studentCalendar, /expectedTeacherId/);
  assert.match(studentCalendar, /requestId/);
  assert.match(calendar, /getBookingRequest/);
  assert.match(calendar, /calendarBookingRequests/);
  assert.doesNotMatch(studentCalendar, /filter\(\(s\).*conflictKeys/);
});

test("availability editor uses source preconditions and explicit save/reset", () => {
  assert.match(availability, /api\.vacancies\.getSourceForTeacher/);
  assert.match(availability, /api\.vacancies\.replaceForTeacher/);
  assert.match(availability, /expectedSourceState/);
  assert.match(availability, /Reset/);
  assert.match(availability, /Save/);
  assert.doesNotMatch(availability, /setSlotsBulk/);
  assert.doesNotMatch(availability, /label: ["']Undo/);
  assert.match(vacancies, /Availability changed in another editor/);
  assert.match(vacancies, /strand the booked lesson/);
});

test("admin all-teacher mode uses a readable grouped agenda", () => {
  assert.match(adminCalendar, /CalendarAgenda/);
  assert.match(adminCalendar, /allMode \? \(/);
  assert.match(adminCalendar, /Read-only overview/);
  assert.match(agenda, /teacherName/);
  assert.match(agenda, /data-testid=["']calendar-agenda["']/);
});

test("touched calendar paths avoid timezone-less date-time parsing", () => {
  for (const source of [studentCalendar, adminCalendar]) {
    assert.doesNotMatch(source, /new Date\(`\$\{[^}]+\}T(?:12:00:00|00:00:00)`\)/);
  }
  assert.match(calendar, /wallTimeToMs\(item\.date, item\.startTime/);
  assert.match(calendar, /ordinaryBookingBoundary/);
});
