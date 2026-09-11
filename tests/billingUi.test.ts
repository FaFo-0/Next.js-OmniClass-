import assert from "node:assert/strict";
import test from "node:test";
import { billingOfferState, orderStatusKey } from "../src/components/billing/billingView.ts";

test("billing offer state disables every alternative while a pending order exists", () => {
  assert.deepEqual(billingOfferState(true, "version-1", "version-1"), {
    disabled: true,
    selected: true,
    reason: "pending",
  });
  assert.deepEqual(billingOfferState(true, "version-2"), {
    disabled: true,
    selected: false,
    reason: "pending",
  });
  assert.deepEqual(billingOfferState(false, "version-2"), {
    disabled: false,
    selected: false,
    reason: null,
  });
});

test("billing order statuses map to stable locale keys", () => {
  assert.equal(orderStatusKey("pending_verification"), "statusPending");
  assert.equal(orderStatusKey("granted"), "statusGranted");
  assert.equal(orderStatusKey("rejected"), "statusRejected");
  assert.equal(orderStatusKey("cancelled"), "statusCancelled");
});
