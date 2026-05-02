import { action } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthAction } from "./lib/auth";

/**
 * Calls OpenRouter (OpenAI-compatible) to generate content.
 * Replaces the /api/ai/generate Next.js route.
 * API key is stored in Convex environment variables.
 */
export const generate = action({
  args: {
    promptConfigId: v.string(),
    transcript: v.string(),
    systemPrompt: v.string(),
    userPromptTemplate: v.string(),
    model: v.string(),
    temperature: v.number(),
    maxTokens: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuthAction(ctx);
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY not configured. Set it via: npx convex env set OPENROUTER_API_KEY <key>"
      );
    }

    const userPrompt = args.userPromptTemplate.replace(
      "{{transcript}}",
      args.transcript
    );

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: args.model || "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: args.temperature ?? 0.3,
          max_tokens: args.maxTokens ?? 500,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        }
      : undefined;

    return { content, usage };
  },
});
