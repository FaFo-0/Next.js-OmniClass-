import assert from "node:assert/strict";
import test from "node:test";
import { buildTelegramStartUrl, isValidTelegramBotUsername } from "../src/lib/telegramLink";

test("buildTelegramStartUrl creates a Telegram deep link with the exact single-use code", () => {
  assert.equal(
    buildTelegramStartUrl("omnicaclass_bot", "6b523f45-4d73-44e3-8a57-72fd5ae91f70"),
    "https://t.me/omnicaclass_bot?start=6b523f45-4d73-44e3-8a57-72fd5ae91f70"
  );
});

test("isValidTelegramBotUsername accepts Telegram bot usernames and rejects unsafe values", () => {
  assert.equal(isValidTelegramBotUsername("omnicaclass_bot"), true);
  assert.equal(isValidTelegramBotUsername("@omnicaclass_bot"), true);
  assert.equal(isValidTelegramBotUsername("bot?start=other"), false);
  assert.equal(isValidTelegramBotUsername("https://t.me/bot"), false);
});
