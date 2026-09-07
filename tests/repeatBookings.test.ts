import assert from "node:assert/strict";
import test from "node:test";
import {
  expandFiniteWeeklyBookings,
  MAX_REPEAT_WEEKS,
} from "../convex/lib/repeatBookings.ts";

test("repeat expands an initial staged pattern into exactly three calendar weeks", () => {
  const result = expandFiniteWeeklyBookings(
    [
      { date: "2026-09-08", startTime: "10:00" },
      { date: "2026-09-10", startTime: "15:30" },
    ],
    true
  );

  assert.equal(MAX_REPEAT_WEEKS, 3);
  assert.deepEqual(result, [
    { date: "2026-09-08", startTime: "10:00", repeatOccurrence: false },
    { date: "2026-09-10", startTime: "15:30", repeatOccurrence: false },
    { date: "2026-09-15", startTime: "10:00", repeatOccurrence: true },
    { date: "2026-09-17", startTime: "15:30", repeatOccurrence: true },
    { date: "2026-09-22", startTime: "10:00", repeatOccurrence: true },
    { date: "2026-09-24", startTime: "15:30", repeatOccurrence: true },
  ]);
});

test("ordinary batches are never expanded or marked as a repeat occurrence", () => {
  assert.deepEqual(
    expandFiniteWeeklyBookings([{ date: "2026-09-08", startTime: "10:00" }], false),
    [{ date: "2026-09-08", startTime: "10:00", repeatOccurrence: false }]
  );
});
