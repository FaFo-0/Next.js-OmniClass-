import assert from "node:assert/strict";
import test from "node:test";
import {
  parseJsonCollection,
  parseJsonArrayValue,
  describeJsonAnswer,
} from "../convex/lib/jsonCollection.ts";
import * as clientMirror from "../src/lib/ai/jsonCollection.ts";

// Captured verbatim from a real OpenRouter response on 2026-10-22
// (deepseek/deepseek-v4.1-flash, response_format json_object, the live
// vocab_extraction prompt). The model wrapped the requested array in an object
// and echoed the request parameter as a key; the old parser sliced from this
// payload's first "[" and returned zero rows, which the teacher saw as
// "Vocabulary generation returned no usable suggestions".
const LIVE_DEEPSEEK_ANSWER =
  '{"type": "json_object", "items": [{"word": "weekend", "lemma": "weekend", "utteranceId": "u0", "partOfSpeech": "noun", "translation": "выходные", "senseLabel": "Saturday and Sunday period", "definition": "the period of Saturday and Sunday"}, {"word": "mountains", "lemma": "mountain", "utteranceId": "u1", "partOfSpeech": "noun", "translation": "горы", "senseLabel": "large natural elevations", "definition": "very high natural hills"}]}';

test("wrapped JSON-object answer (real DeepSeek shape) yields its items", () => {
  const rows = parseJsonCollection(LIVE_DEEPSEEK_ANSWER);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].utteranceId, "u0");
  assert.equal(rows[1].word, "mountains");
});

test("a bare JSON array answer still works", () => {
  const rows = parseJsonCollection('[{"word":"book","utteranceId":"u3"}]');
  assert.deepEqual(rows, [{ word: "book", utteranceId: "u3" }]);
});

test("the model's own wrapper key is accepted when it is not a known one", () => {
  assert.equal(parseJsonCollection('{"response":[{"word":"hike"}]}').length, 1);
  assert.equal(parseJsonCollection('{"vocabulary":[{"word":"steep"}]}').length, 1);
  assert.equal(parseJsonCollection('{"questions":[{"question":"Why?"}]}').length, 1);
});

test("fenced and prose-prefixed answers are read", () => {
  assert.equal(
    parseJsonCollection('Here are the words:\n```json\n{"items":[{"word":"cabin"}]}\n```').length,
    1
  );
  assert.equal(parseJsonCollection('Sure! {"items":[{"word":"cabin"}]}').length, 1);
});

test("a truncated answer keeps the objects that closed cleanly", () => {
  const rows = parseJsonCollection('{"items":[{"word":"cabin"},{"word":"road"');
  assert.deepEqual(rows, [{ word: "cabin" }]);
});

test("primitive lists unwrap for the questions path", () => {
  assert.deepEqual(parseJsonArrayValue('{"questions":["Why?","How?"]}'), ["Why?", "How?"]);
});

test("no usable list is reported with the shape that actually arrived", () => {
  assert.equal(parseJsonCollection('{"items":[]}').length, 0);
  assert.equal(parseJsonCollection("Sorry, I cannot help with that.").length, 0);
  assert.match(describeJsonAnswer(LIVE_DEEPSEEK_ANSWER), /keys: type, items/);
  assert.match(describeJsonAnswer("{}"), /JSON object/);
  assert.match(describeJsonAnswer(""), /returned nothing/);
});

test("the client mirror parses exactly like the server module", () => {
  const samples = [
    LIVE_DEEPSEEK_ANSWER,
    '[{"word":"book"}]',
    '{"words":[{"w":"book"}]}',
    '```json\n{"items":[{"word":"cabin"}]}\n```',
    '{"items":[{"word":"cabin"},{"word":"road"',
    "not json at all",
  ];
  for (const sample of samples) {
    assert.deepEqual(
      clientMirror.parseJsonCollection(sample),
      parseJsonCollection(sample),
      `mirror disagreement on ${sample.slice(0, 40)}`
    );
    assert.deepEqual(clientMirror.parseJsonArrayValue(sample), parseJsonArrayValue(sample));
  }
});
