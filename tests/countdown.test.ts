import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "next-intl";
import russianMessages from "../messages/ru.json";
import { formatGap } from "../src/lib/countdown.ts";

test("countdown units follow the learner locale", () => {
  const gapMs = (18 * 60 + 35) * 60_000;
  const russianDashboard = createTranslator({
    locale: "ru",
    messages: russianMessages,
    namespace: "app.dashboard",
  });

  assert.equal(
    russianDashboard("untilLesson", { time: formatGap(gapMs, "ru") }),
    "18 часов 35 минут до урока",
  );
  assert.equal(formatGap(gapMs), "18 hours 35 minutes");
  assert.equal(formatGap(gapMs, "kk"), "18 сағат 35 минут");
  assert.equal(formatGap(gapMs, "ar"), "18 ساعة 35 دقيقة");
});

test("countdown localizes the mixed day and hour branch", () => {
  const gapMs = 25 * 60 * 60_000;

  assert.equal(formatGap(gapMs, "ru"), "1 день 1 час");
  assert.equal(formatGap(gapMs, "kk"), "1 күн 1 сағат");
  assert.equal(formatGap(gapMs, "ar"), "يوم ساعة");
});
