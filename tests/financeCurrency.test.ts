import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCurrencyTotals } from "../convex/finance.ts";

test("finance summaries do not aggregate an unconverted KZT sale into USD", () => {
  const totals = summarizeCurrencyTotals(
    [
      { direction: "in", amount: 144.7, amountBase: 144.7, currency: "USD" },
      { direction: "in", amount: 20_000, amountBase: 20_000, currency: "KZT" },
    ],
    "USD",
  );

  assert.deepEqual(totals, {
    USD: { income: 144.7, costs: 0, net: 144.7 },
    KZT: { income: 20_000, costs: 0, net: 20_000 },
  });
});