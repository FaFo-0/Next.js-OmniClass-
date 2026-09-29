import assert from "node:assert/strict";
import test from "node:test";
import {
  isOpenBillingOrder,
  transitionBillingOrder,
} from "../convex/lib/billingState.ts";

test("billing orders have one pending state and terminal transitions", () => {
  assert.equal(transitionBillingOrder("pending_verification", "grant"), "granted");
  assert.equal(transitionBillingOrder("pending_verification", "reject"), "rejected");
  assert.equal(transitionBillingOrder("pending_verification", "cancel"), "cancelled");
  assert.throws(() => transitionBillingOrder("granted", "reject"), /Cannot/);
  assert.equal(isOpenBillingOrder("pending_verification"), true);
  assert.equal(isOpenBillingOrder("rejected"), false);
});

test("a terminal order cannot be treated as an open selection lock", () => {
  const orders = [
    { buyerStudentId: "student-a", status: "rejected" as const },
    { buyerStudentId: "student-a", status: "granted" as const },
  ];
  assert.equal(orders.some((order) => order.buyerStudentId === "student-a" && isOpenBillingOrder(order.status)), false);
});
