import assert from "node:assert/strict";
import test from "node:test";
import { CalendarAvailabilityEdits, type AvailabilityCell, type AvailabilityEdit } from "../src/lib/calendarAvailabilityEdits";

const cell: AvailabilityCell = {
  date: "2099-01-05", startTime: "16:00", open: false, editable: true,
  expectedState: JSON.stringify({ override: { value: null }, inherited: [] }),
};
function fixture() {
  let visible: readonly AvailabilityEdit[] = [];
  const requests: { edit: AvailabilityEdit; resolve: (id: string) => void; reject: (error: Error) => void }[] = [];
  const receipts: string[] = [], errors: unknown[] = [];
  const queue = new CalendarAvailabilityEdits<string>({
    save: (edit) => new Promise((resolve, reject) => requests.push({ edit, resolve, reject })),
    changed: (pending) => { visible = pending; },
    saved: (id) => { receipts.push(id); },
    failed: (error) => { errors.push(error); },
  });
  return { queue, requests, receipts, errors, visible: () => visible };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("rapid open/close gestures appear synchronously, serialize saves, and keep separate Undo receipts", async () => {
  const f = fixture();
  f.queue.enqueue([cell], true, "open-request");
  assert.equal(f.visible().at(-1)?.cells[0].open, true);
  f.queue.enqueue([cell], false, "close-request");
  assert.equal(f.visible().at(-1)?.cells[0].open, false);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve("open-receipt");
  await tick();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].edit.changes[0].expectedState, f.requests[0].edit.cells[0].expectedState);
  assert.equal(f.visible().at(-1)?.cells[0].open, false);
  f.requests[1].resolve("close-receipt");
  await tick();
  assert.deepEqual(f.receipts, ["open-receipt", "close-receipt"]);
  assert.equal(f.visible().at(-1)?.cells[0].open, false);
  f.queue.observe(f.requests[1].edit.cells);
  assert.deepEqual(f.visible(), []);
  assert.equal(f.queue.busy, false);
});

test("save rejection rolls back every unsaved gesture and never submits dependent versions", async () => {
  const f = fixture();
  f.queue.enqueue([cell], true, "open-request");
  f.queue.enqueue([cell], false, "close-request");
  f.requests[0].reject(new Error("Changed elsewhere"));
  await tick();
  assert.deepEqual(f.visible(), []);
  assert.equal(f.requests.length, 1);
  assert.equal(f.errors.length, 1);
  f.queue.enqueue([cell], true, "retry-request");
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].edit.changes[0].expectedState, cell.expectedState);
});

test("dated editing protects bookings, time off and past cells and deduplicates midnight fragments", () => {
  const f = fixture();
  f.queue.enqueue([
    cell, { ...cell },
    { ...cell, startTime: "16:30", busy: true },
    { ...cell, startTime: "17:00", eventId: "lesson" },
    { ...cell, startTime: "17:30", timeOff: true },
    { ...cell, startTime: "18:00", editable: false },
  ], true, "paint-request");
  assert.equal(f.requests[0].edit.changes.length, 1);
});

test("restore usual hours previews inherited availability, and leaving the page drops unsent writes", async () => {
  const f = fixture();
  f.queue.enqueue([{ ...cell, expectedState: JSON.stringify({
    override: { value: false, token: "previous-edit" }, inherited: ["16:00:18:00:2020-01-01:"],
  }) }], null, "restore-request");
  assert.equal(f.visible()[0].cells[0].open, true);
  assert.deepEqual(JSON.parse(f.visible()[0].cells[0].expectedState).override, { value: null });
  f.queue.enqueue([cell], false, "close-request");
  f.queue.pause();
  f.requests[0].resolve("restore-receipt");
  await tick();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.receipts, []);
});


test("a completed drag stays painted through a stale subscription and the next gesture chains its saved version", async () => {
  const f = fixture();
  f.queue.observe([cell]);
  f.queue.enqueue([cell, { ...cell, startTime: "16:30" }], true, "drag-open");
  f.requests[0].resolve("drag-receipt");
  await tick();
  assert.equal(f.queue.busy, false);
  assert.equal(f.visible()[0].cells.length, 2);
  assert.equal(f.visible()[0].cells[0].open, true);
  f.queue.observe([cell]);
  assert.equal(f.visible()[0].cells[0].open, true);
  f.queue.enqueue([cell], false, "next-click");
  assert.equal(f.requests[1].edit.changes[0].expectedState, f.requests[0].edit.cells[0].expectedState);
  f.requests[1].resolve("click-receipt");
  await tick();
  f.queue.observe([cell]);
  assert.equal(f.visible().at(-1)?.cells[0].open, false);
  f.queue.observe(f.requests[0].edit.cells);
  assert.equal(f.visible().at(-1)?.cells[0].open, false);
  f.queue.observe(f.requests[1].edit.cells);
  assert.deepEqual(f.visible(), []);
});

test("an acknowledged edit yields to a newer edit from elsewhere and never bypasses its version check", async () => {
  const f = fixture();
  f.queue.enqueue([cell], true, "our-drag");
  f.requests[0].resolve("receipt");
  await tick();
  const external = { ...cell, expectedState: JSON.stringify({ override: { value: false, token: "someone-else" }, inherited: [] }) };
  f.queue.observe([external]);
  assert.deepEqual(f.visible(), []);
  f.queue.enqueue([external], true, "new-drag");
  assert.equal(f.requests[1].edit.changes[0].expectedState, external.expectedState);
});
