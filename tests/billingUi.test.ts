import assert from "node:assert/strict";
import test from "node:test";
import { packOfferState, orderStatusKey } from "../src/components/billing/billingView.ts";

test("one pending order locks every pack and marks the requested one", () => {
  const locked = packOfferState(true, "pack-4", "pack-4");
  assert.equal(locked.disabled, true);
  assert.equal(locked.selected, true);
  assert.equal(locked.reason, "pending");

  const other = packOfferState(true, "pack-8", "pack-4");
  assert.equal(other.disabled, true);
  assert.equal(other.selected, false);

  const free = packOfferState(false, "pack-8", null);
  assert.equal(free.disabled, false);
  assert.equal(free.selected, false);
  assert.equal(free.reason, null);
});

test("a pack is not marked as requested when no pending order names it", () => {
  assert.equal(packOfferState(false, "pack-4", undefined).selected, false);
  assert.equal(packOfferState(true, "pack-4", null).selected, false);
});

test("billing order statuses map to stable locale keys", () => {
  assert.equal(orderStatusKey("pending_verification"), "statusPending");
  assert.equal(orderStatusKey("granted"), "statusGranted");
  assert.equal(orderStatusKey("rejected"), "statusRejected");
  assert.equal(orderStatusKey("cancelled"), "statusCancelled");
});
