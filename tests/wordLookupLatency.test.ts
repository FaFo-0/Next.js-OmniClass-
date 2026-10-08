import assert from "node:assert/strict";
import test from "node:test";
import { getWordLookup } from "../convex/library";

test("uncached dictionary and translation requests overlap, while inflected cards retain base-form translations", { timeout: 1000 }, async (t) => {
  let dictionaryStarted = false;
  let translationStarted = false;
  let releaseDictionary!: () => void;
  const dictionaryGate = new Promise<void>((resolve) => { releaseDictionary = resolve; });
  const writes: Array<Record<string, unknown>> = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("dictionaryapi")) {
      dictionaryStarted = true;
      await dictionaryGate;
      return new Response(JSON.stringify([{ word: "service", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "help" }] }] }]));
    }
    translationStarted = true;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(dictionaryStarted, true, "dictionary must start before translation finishes");
    releaseDictionary();
    return new Response(JSON.stringify({ responseData: { translatedText: url.includes("q=services") ? "услуги" : "услуга" } }));
  });
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "qa" }) },
    runQuery: async () => null,
    runMutation: async (_fn: unknown, args: Record<string, unknown>) => { writes.push(args); },
  };
  const result = await (getWordLookup as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<{ word: string; translation?: string }> })._handler(ctx, { word: "services", locale: "en", translateTo: "ru" });
  assert.equal(translationStarted, true);
  assert.equal(result.word, "service");
  assert.equal(result.translation, "услуга");
  assert.equal(writes.length, 2);
  assert.equal(writes[1].baseForm, "service");
});
