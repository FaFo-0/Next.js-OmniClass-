import assert from "node:assert/strict";
import test from "node:test";
import {
  parseShareWindowState,
  serializeShareWindowState,
  shareStateKey,
  shareWindowUrl,
} from "../src/lib/shareWindowState.ts";

test("share state round-trips with its position", () => {
  const state = { kind: "reading" as const, workId: "w1", unitId: "u3", scrollRatio: 0.42 };
  assert.deepEqual(parseShareWindowState(serializeShareWindowState(state)), {
    kind: "reading",
    workId: "w1",
    unitId: "u3",
    scrollRatio: 0.42,
  });
});

test("unusable stored values degrade to starting at the top", () => {
  assert.equal(parseShareWindowState(null), null);
  assert.equal(parseShareWindowState(""), null);
  assert.equal(parseShareWindowState("{not json"), null);
  assert.equal(parseShareWindowState('"reading"'), null);
  assert.equal(parseShareWindowState('{"kind":"history"}'), null);
  // Wrong types are dropped field by field, and the state stays usable.
  assert.deepEqual(parseShareWindowState('{"kind":"quiz","questionIndex":"second","workId":7}'), {
    kind: "quiz",
  });
});

test("out-of-range and fractional positions are clamped, not trusted", () => {
  assert.equal(parseShareWindowState('{"kind":"reading","scrollRatio":9}')?.scrollRatio, 1);
  assert.equal(parseShareWindowState('{"kind":"reading","scrollRatio":-3}')?.scrollRatio, 0);
  assert.equal(parseShareWindowState('{"kind":"quiz","questionIndex":-4}')?.questionIndex, 0);
  assert.equal(parseShareWindowState('{"kind":"quiz","questionIndex":2.7}')?.questionIndex, 2);
});

test("a resumed window opens on its saved chapter", () => {
  const lessonId = "lesson-1";
  assert.equal(shareWindowUrl("reading", lessonId), "/teacher/share/reading?lessonId=lesson-1");
  assert.equal(
    shareWindowUrl("reading", lessonId, { kind: "reading", workId: "w1", unitId: "u3" }),
    "/teacher/share/reading?lessonId=lesson-1&workId=w1&unitId=u3"
  );
  assert.equal(
    shareWindowUrl("quiz", lessonId, { kind: "quiz", questionIndex: 4 }),
    "/teacher/share/quiz?lessonId=lesson-1&q=4"
  );
  assert.equal(shareWindowUrl("quiz", lessonId), "/teacher/share/quiz?lessonId=lesson-1");
});

test("state is keyed per lesson and kind", () => {
  assert.equal(shareStateKey("reading", "l1"), "omnic-share:reading:l1");
  assert.notEqual(shareStateKey("reading", "l1"), shareStateKey("quiz", "l1"));
});
