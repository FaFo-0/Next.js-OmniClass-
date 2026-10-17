import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { telegramMessage } from "../convex/lib/notificationRegistry.ts";

test("Telegram notification buttons use the customer-facing academy name", () => {
  const message = telegramMessage("homework_assigned", { title: "Practice" }, undefined, "student", "en");
  assert.equal(message.buttonLabel, "Open Omnica English");
});

test("library, Telegram, translated profiles and calendar exports never expose the internal software name", () => {
  for (const path of [
    "src/app/admin/library/works/page.tsx",
    "src/app/admin/library/works/[id]/page.tsx",
    "src/app/student/profile/page.tsx",
    "convex/telegram.ts",
    "convex/lib/notificationRegistry.ts",
    "convex/http.ts",
    ...["en", "ru", "ar", "kk"].map((locale) => `messages/${locale}.json`),
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /omni[\s-]?class/i, path);
  }
});
