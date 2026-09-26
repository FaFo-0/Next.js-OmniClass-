import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = ".";
const studentCalendar = readFileSync(`${root}/src/app/student/calendar/page.tsx`, "utf8");
const availability = readFileSync(`${root}/src/components/calendar/AvailabilityBoard.tsx`, "utf8");
const adminCalendar = readFileSync(`${root}/src/app/admin/calendar/page.tsx`, "utf8");
const agenda = readFileSync(`${root}/src/components/calendar/CalendarAgenda.tsx`, "utf8");
const month = readFileSync(`${root}/src/components/calendar/MonthCalendar.tsx`, "utf8");
const bookingPanel = readFileSync(`${root}/src/components/calendar/StudentBookingPanel.tsx`, "utf8");
const bookingReview = readFileSync(`${root}/src/components/calendar/BookingReview.tsx`, "utf8");
const calendarShared = readFileSync(`${root}/src/components/calendar/calendarShared.tsx`, "utf8");
const vacancies = readFileSync(`${root}/convex/vacancies.ts`, "utf8");
const calendar = readFileSync(`${root}/convex/calendar.ts`, "utf8");

test("student calendar uses one month-first booking surface with real start buttons", () => {
  assert.match(studentCalendar, /<StudentBookingPanel/);
  assert.match(studentCalendar, /useRememberedView\("omnic\.cal\.view\.student\.v2", "month"\)/);
  assert.match(calendarShared, /initialView === "week"/);
  assert.match(studentCalendar, /selectedDate=/);
  assert.match(studentCalendar, /selectedOwnBusy/);
  assert.match(studentCalendar, /stagedKeys/);
  assert.match(studentCalendar, /weeklyOccurrenceStates/);
  assert.match(studentCalendar, /weeklyCoverage/);
  assert.match(bookingPanel, /availableStartsTitle/);
  assert.match(bookingPanel, /student-booking-start/);
  assert.match(bookingPanel, /Choose individual dates|chooseIndividualDates/);
  assert.match(bookingPanel, /Weekly schedule|weeklySchedule/);
  assert.match(bookingPanel, /onReview/);
  assert.doesNotMatch(studentCalendar, /student-calendar-booking-actions-bottom/);
  assert.doesNotMatch(studentCalendar, /Repeat the staged/);
});

test("student review stays in the contextual panel and mobile action clears bottom navigation", () => {
  assert.match(bookingReview, /student-booking-inline-review/);
  assert.match(bookingReview, /alreadyBooked/);
  assert.match(bookingReview, /outsideBookingWindow/);
  assert.match(bookingReview, /conflictState/);
  assert.match(bookingPanel, /reviewCount/);
  assert.match(bookingPanel, /student-booking-mobile-review/);
  assert.match(bookingPanel, /weeklyCoverageSummary/);
  assert.match(studentCalendar, /open=\{reviewOpen && isPhone\}/);
  assert.match(studentCalendar, /<BookingReview/);
  assert.match(studentCalendar, /reviewCount/);
  const globals = readFileSync(`${root}/src/app/globals.css`, "utf8");
  assert.match(globals, /bottom: calc\(var\(--bottom-nav-h\)/);
});

test("student month view is compact and does not force a desktop-width grid", () => {
  assert.match(month, /student-month-grid/);
  assert.match(month, /student-month-day/);
  assert.doesNotMatch(month, /min-w-\[560px\]|min-w-\[700px\]|min-width:\s*560px|min-width:\s*700px/);
  assert.match(month, /attentionDates/);
  assert.match(month, /aria-selected/);
});

test("student draft is canonical, repairable, and receipt-bound", () => {
  assert.match(studentCalendar, /canonicalizeBookings/);
  assert.match(studentCalendar, /canonicalizeViewerBooking/);
  assert.match(studentCalendar, /projectBookingForViewer/);
  assert.match(studentCalendar, /if \(conflicts && conflicts\.length > 0\)/);
  assert.match(studentCalendar, /preserves every intention for repair/);
  assert.match(studentCalendar, /function removeStaged/);
  assert.match(studentCalendar, /function replaceStaged/);
  assert.match(bookingReview, /removeOccurrence/);
  assert.match(bookingReview, /replaceOccurrence/);
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
  assert.match(adminCalendar, /setTeacherId\(ALL_TEACHERS\)/);
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
