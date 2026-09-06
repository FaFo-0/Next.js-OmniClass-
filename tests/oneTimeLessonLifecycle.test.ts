import assert from "node:assert/strict";
import test from "node:test";
import { isStartCreatedEvent } from "../convex/lib/lessonLifecycle.ts";

const LESSON_AT = "2026-09-06T10:15:00.000Z";

test("a booking event (no adHoc) is never start-created", () => {
  assert.equal(
    isStartCreatedEvent({ adHoc: false, createdAt: LESSON_AT }, LESSON_AT),
    false
  );
});

test("an explicit one_time_start event is start-created even long after the lesson", () => {
  assert.equal(
    isStartCreatedEvent(
      { adHoc: true, adHocSource: "one_time_start", createdAt: "2026-09-06T09:00:00.000Z" },
      LESSON_AT
    ),
    true
  );
});

test("a one_time_booking event survives discard no matter how close to the lesson", () => {
  // This is the exact regression that used to delete a real booking: the
  // teacher places a one-time lesson and starts it a second later, then
  // discards — the event must stay.
  assert.equal(
    isStartCreatedEvent(
      { adHoc: true, adHocSource: "one_time_booking", createdAt: LESSON_AT },
      LESSON_AT
    ),
    false
  );
});

test("legacy ad-hoc events within the 2-minute window count as start-created", () => {
  assert.equal(
    isStartCreatedEvent(
      { adHoc: true, createdAt: "2026-09-06T10:13:30.000Z" },
      LESSON_AT
    ),
    true
  );
});

test("legacy ad-hoc events older than 2 minutes are treated as bookings", () => {
  assert.equal(
    isStartCreatedEvent(
      { adHoc: true, createdAt: "2026-09-06T09:00:00.000Z" },
      LESSON_AT
    ),
    false
  );
});

test("legacy non-adHoc events are never start-created", () => {
  assert.equal(
    isStartCreatedEvent({ createdAt: LESSON_AT }, LESSON_AT),
    false
  );
});

test("the refund decision is exactly-once: a spend without a refund refunds, a refunded event never double-refunds", () => {
  const txs = (types: string[]) =>
    types.map((type, i) => ({
      type,
      amount: type === "spend" ? -10 : 10,
      scheduleEventId: "evt-1",
      _id: `tx-${i}`,
    }));

  const spendOnly = txs(["spend"]);
  const spendThenRefunded = txs(["spend", "refund"]);
  const none = txs([]);

  const shouldRefund = (list: { type: string; scheduleEventId: string }[]) => {
    const spend = list.find((t) => t.scheduleEventId === "evt-1" && t.type === "spend");
    const alreadyRefunded = list.some(
      (t) => t.scheduleEventId === "evt-1" && t.type === "refund"
    );
    return Boolean(spend && !alreadyRefunded);
  };

  assert.equal(shouldRefund(spendOnly), true);
  assert.equal(shouldRefund(spendThenRefunded), false);
  assert.equal(shouldRefund(none), false);
});