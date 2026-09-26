import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeBookings,
  generateWeeklyOccurrences,
  generateWeeklyOccurrencesInZone,
  lastDayOfMonth,
  monthPeriod,
  nextMonthBoundaryDate,
  projectBookingForViewer,
  canonicalizeViewerBooking,
} from "../src/lib/calendarBookingPlan.ts";

test("calendar-month boundary is exclusive and handles year rollover/leap February", () => {
  assert.equal(nextMonthBoundaryDate("2026-12-15"), "2027-02-01");
  assert.equal(nextMonthBoundaryDate("2028-01-09"), "2028-03-01");
  assert.equal(lastDayOfMonth("2028-02-09"), "2028-02-29");
});

test("weekly patterns expand the whole chosen period and deduplicate exact starts", () => {
  const result = generateWeeklyOccurrences(
    monthPeriod("2026-09-15"),
    [
      { dayOfWeek: 2, startTime: "18:00" },
      { dayOfWeek: 2, startTime: "18:00" },
      { dayOfWeek: 4, startTime: "19:00" },
    ],
  );
  assert.equal(result[0].date, "2026-09-01");
  assert.equal(result.at(-1)?.date, "2026-09-29");
  assert.equal(result.length, 9);
  assert.deepEqual(canonicalizeBookings([...result, result[0]]), result);
});

test("weekly patterns convert each local occurrence into academy dates", () => {
  const result = generateWeeklyOccurrencesInZone(
    monthPeriod("2026-10-15"),
    [{ dayOfWeek: 0, startTime: "20:00" }],
    "America/Los_Angeles",
    "Asia/Almaty",
  );
  assert.ok(result.length > 0);
  assert.ok(result.every((item) => item.date >= "2026-10-01" && item.date <= "2026-10-31"));
  assert.ok(result.every((item) => item.startTime === "08:00"));
  assert.ok(result.every((item) => new Date(`${item.date}T12:00:00Z`).getUTCDay() === 1));
});

test("canonical staged starts do not shift when the viewer timezone changes", () => {
  const canonical = { date: "2026-10-05", startTime: "08:00" };
  const losAngeles = projectBookingForViewer(canonical, "Asia/Almaty", "America/Los_Angeles");
  const dubai = projectBookingForViewer(canonical, "Asia/Almaty", "Asia/Dubai");
  assert.notDeepEqual(losAngeles, dubai);
  assert.deepEqual(canonicalizeViewerBooking(losAngeles, "America/Los_Angeles", "Asia/Almaty"), canonical);
  assert.deepEqual(canonicalizeViewerBooking(dubai, "Asia/Dubai", "Asia/Almaty"), canonical);
});
