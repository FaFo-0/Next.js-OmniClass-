import assert from "node:assert/strict";
import test from "node:test";
import { telegramFailureState } from "../convex/lib/telegramDelivery.ts";

test("Telegram blocks permanent chat failures and retains a concise diagnostic", () => {
  const state = telegramFailureState("Telegram sendMessage failed (403): bot was blocked", 0, "2026-09-06T00:00:00.000Z");
  assert.equal(state.telegramAttemptCount, 1);
  assert.equal(state.telegramFailedAt, "2026-09-06T00:00:00.000Z");
  assert.match(state.telegramLastError, /403/);
});

test("Telegram retries transient failures only through the bounded outbox limit", () => {
  const retry = telegramFailureState("Telegram sendMessage failed (502)", 2, "2026-09-06T00:00:00.000Z");
  assert.equal(retry.telegramAttemptCount, 3);
  assert.equal(retry.telegramFailedAt, undefined);

  const exhausted = telegramFailureState("Telegram sendMessage failed (502)", 7, "2026-09-06T00:00:00.000Z");
  assert.equal(exhausted.telegramAttemptCount, 8);
  assert.equal(exhausted.telegramFailedAt, "2026-09-06T00:00:00.000Z");
});
