import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenRouterRequest,
  isRetryableOpenRouterStatus,
  normalizeOpenRouterModels,
  renderTaskPrompt,
} from "../convex/lib/aiProvider.ts";

test("AI task prompts replace every server-owned input placeholder", () => {
  assert.equal(
    renderTaskPrompt(
      { inputKey: "text", userPromptTemplate: "A {{text}} B {{text}}" },
      "value"
    ),
    "A value B value"
  );
});

test("AI task prompts reject a missing required placeholder", () => {
  assert.throws(
    () => renderTaskPrompt({ inputKey: "transcript", userPromptTemplate: "fixed" }, "x"),
    /missing.*transcript/
  );
});

test("OpenRouter request includes registry-owned output contract", () => {
  assert.deepEqual(
    buildOpenRouterRequest(
      {
        inputKey: "transcript",
        userPromptTemplate: "{{transcript}}",
        systemPrompt: "system",
        model: "primary",
        fallbackModel: "fallback",
        temperature: 0.2,
        maxTokens: 100,
        outputFormat: "json",
      },
      "lesson"
    ),
    {
      model: "primary",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "lesson" },
      ],
      temperature: 0.2,
      max_tokens: 100,
      response_format: { type: "json_object" },
    }
  );
});

test("only provider availability failures are eligible for fallback", () => {
  assert.equal(isRetryableOpenRouterStatus(404), true);
  assert.equal(isRetryableOpenRouterStatus(429), true);
  assert.equal(isRetryableOpenRouterStatus(503), true);
  assert.equal(isRetryableOpenRouterStatus(400), false);
  assert.equal(isRetryableOpenRouterStatus(401), false);
});

test("model catalogue normalization keeps useful live metadata and deduplicates IDs", () => {
  const result = normalizeOpenRouterModels({
    data: [
      { id: "provider/model", name: "Model", context_length: 8192, pricing: { prompt: "0.1", completion: "0.2" }, supported_parameters: ["response_format"] },
      { id: "provider/model", name: "Duplicate" },
      { id: "bad", name: "Bad", context_length: "nope" },
    ],
  });
  assert.deepEqual(result, [
    {
      id: "provider/model",
      name: "Model",
      contextLength: 8192,
      promptPrice: 0.1,
      completionPrice: 0.2,
      supportedParameters: ["response_format"],
    },
    { id: "bad", name: "Bad" },
  ]);
});

test("legacy vocabulary prompts still receive the required anchored output contract", async () => {
  const { getAiTask } = await import("../convex/lib/aiTasks.ts");
  const task = getAiTask("vocab_extraction")!;
  const legacyPrompt = 'Return word, Russian translation and partOfSpeech only.';
  const request = buildOpenRouterRequest({
    systemPrompt: legacyPrompt,
    userPromptTemplate: "Extract vocabulary: {{transcript}}",
    model: "configured-model", temperature: 0.2, maxTokens: 2000,
    ...task,
  }, "[turn-1 · Student]: The seller was friendly.");
  assert.equal(request.model, "configured-model");
  assert.ok(request.messages[0].content.startsWith(legacyPrompt));
  assert.ok(request.messages[0].content.endsWith(task.outputContract!));
  for (const field of ["word", "lemma", "utteranceId", "translation", "senseLabel", "definition"]) {
    assert.ok(task.outputContract!.includes(field));
  }
  assert.match(request.messages[0].content, /takes precedence/);
  assert.match(request.messages[1].content, /turn-1/);
});
