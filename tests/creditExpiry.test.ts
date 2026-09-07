import assert from "node:assert/strict";
import test from "node:test";
import {
  addDaysToDate,
  activationForLessonStart,
  stateAfterUnstart,
  NO_EXPIRY,
} from "../convex/lib/creditExpiry.ts";

test("addDaysToDate crosses month and year boundaries", () => {
  assert.equal(addDaysToDate("2026-09-07", 60), "2026-11-06");
  assert.equal(addDaysToDate("2026-12-15", 60), "2027-02-13");
  assert.equal(addDaysToDate("2026-11-06", -60), "2026-09-07");
});

test("addDaysToDate leaves malformed input unchanged", () => {
  assert.equal(addDaysToDate("not-a-date", 60), "not-a-date");
});

test("activation uses the academy-local date, not UTC (Asia/Almaty +05)", () => {
  // 2026-09-07T18:30:00Z = 2026-09-07 23:30 in Almaty → +60d = 2026-11-06
  const a = activationForLessonStart("2026-09-07T18:30:00.000Z", "Asia/Almaty", 60);
  assert.equal(a.activatedAt, "2026-09-07T18:30:00.000Z");
  assert.equal(a.expiresAt, "2026-11-06");
});

test("activation rolls into the next academy day across midnight", () => {
  // 2026-09-07T20:30:00Z = 2026-09-08 01:30 in Almaty → expiry from Sep 8
  const a = activationForLessonStart("2026-09-07T20:30:00.000Z", "Asia/Almaty", 60);
  assert.equal(a.expiresAt, "2026-11-07");
});

test("activation falls back to the UTC date for an unknown timezone", () => {
  // "Nowhere/Nowhere" is invalid → instantToZoned falls back to UTC.
  const a = activationForLessonStart("2026-09-07T18:30:00.000Z", "Nowhere/Nowhere", 60);
  assert.equal(a.expiresAt, "2026-11-06");
});

test("un-starting the only started lesson resets the grant to NO_EXPIRY", () => {
  const next = stateAfterUnstart({
    grantExpiryDays: 60,
    unstartedEventId: "evt-1",
    spendReferences: [{ eventId: "evt-1", type: "spend" }],
    startedByEvent: {},
    orgTz: "Asia/Almaty",
  });
  assert.equal(next.activatedAt, undefined);
  assert.equal(next.expiresAt, NO_EXPIRY);
});

test("un-starting one lesson keeps the clock at the earliest OTHER started lesson", () => {
  const next = stateAfterUnstart({
    grantExpiryDays: 60,
    unstartedEventId: "evt-2",
    spendReferences: [
      { eventId: "evt-1", type: "spend" },
      { eventId: "evt-2", type: "spend" },
    ],
    startedByEvent: {
      "evt-1": "2026-09-01T10:00:00.000Z",
    },
    orgTz: "Asia/Almaty",
  });
  assert.equal(next.activatedAt, "2026-09-01T10:00:00.000Z");
  assert.equal(next.expiresAt, "2026-10-31"); // Sep 1 Almaty + 60d
});

test("un-starting ignores bookings that have not actually started", () => {
  const next = stateAfterUnstart({
    grantExpiryDays: 60,
    unstartedEventId: "evt-3",
    spendReferences: [
      { eventId: "evt-3", type: "spend" },
      { eventId: "evt-4", type: "spend" }, // booked, never started
    ],
    startedByEvent: {},
    orgTz: "Asia/Almaty",
  });
  assert.equal(next.activatedAt, undefined);
  assert.equal(next.expiresAt, NO_EXPIRY);
});

test("non-expiring grants never receive an expiry date", () => {
  const next = stateAfterUnstart({
    grantExpiryDays: undefined,
    unstartedEventId: "evt-1",
    spendReferences: [{ eventId: "evt-1", type: "spend" }],
    startedByEvent: {},
    orgTz: "Asia/Almaty",
  });
  assert.equal(next.expiresAt, NO_EXPIRY);
});