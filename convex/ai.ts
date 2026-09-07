import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAuthAction } from "./lib/auth";

/**
 * Calls OpenRouter (OpenAI-compatible) to generate content.
 * Replaces the /api/ai/generate Next.js route.
 * API key is stored in Convex environment variables.
 */
export const generate = action({
  args: {
    taskId: v.string(),
    input: v.string(),
  },
  handler: async (ctx, { taskId, input }) => {
    await requireAuthAction(ctx);
    const config: {
      inputKey: "transcript" | "text";
      outputFormat: "text" | "json";
      systemPrompt: string;
      userPromptTemplate: string;
      model: string;
      temperature: number;
      maxTokens: number;
    } = await ctx.runQuery(
      (internal as any).promptConfigs.resolveForGeneration,
      { taskId }
    );
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY not configured. Set it via: npx convex env set OPENROUTER_API_KEY <key>"
      );
    }

    const userPrompt = config.userPromptTemplate.replace(
      `{{${config.inputKey}}}`,
      input
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
          model: config.model || "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: config.systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: config.temperature ?? 0.3,
          max_tokens: config.maxTokens ?? 500,
          ...(config.outputFormat === "json"
            ? { response_format: { type: "json_object" } }
            : {}),
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
