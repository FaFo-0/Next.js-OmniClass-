/** Shared server-side OpenRouter transport for all configured AI tasks.
 *
 * Producers resolve the task and tenant config first; this module only renders
 * the already-authorized request and classifies provider failures.
 */

export type AiProviderConfig = {
  inputKey: "transcript" | "text";
  outputFormat: "text" | "json";
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  fallbackModel?: string;
  temperature: number;
  maxTokens: number;
};

export type OpenRouterRequest = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_tokens: number;
  response_format?: { type: "json_object" };
};

export type OpenRouterModel = {
  id: string;
  name?: string;
  contextLength?: number;
  promptPrice?: number;
  completionPrice?: number;
  supportedParameters?: string[];
  modality?: string;
  created?: number;
  expiration?: string | null;
};

export function renderTaskPrompt(
  config: Pick<AiProviderConfig, "inputKey" | "userPromptTemplate">,
  input: string
): string {
  const placeholder = `{{${config.inputKey}}}`;
  if (!config.userPromptTemplate.includes(placeholder)) {
    throw new Error(`AI task prompt is missing ${placeholder}`);
  }
  return config.userPromptTemplate.split(placeholder).join(input);
}

export function buildOpenRouterRequest(
  config: AiProviderConfig,
  input: string,
  model = config.model
): OpenRouterRequest {
  const request: OpenRouterRequest = {
    model,
    messages: [
      { role: "system", content: config.systemPrompt },
      { role: "user", content: renderTaskPrompt(config, input) },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
  };
  if (config.outputFormat === "json") {
    request.response_format = { type: "json_object" };
  }
  return request;
}

export function isRetryableOpenRouterStatus(status: number): boolean {
  return status === 404 || status === 408 || status === 409 || status === 429 || status >= 500;
}

export async function callOpenRouter(
  config: AiProviderConfig,
  input: string
): Promise<{ content: string; model: string; fallbackUsed: boolean }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const models = [config.model, config.fallbackModel].filter(
    (model, index, all): model is string => Boolean(model?.trim()) && all.indexOf(model) === index
  );
  if (models.length === 0) throw new Error("AI task has no configured model");

  let lastStatus: number | undefined;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenRouterRequest(config, input, model)),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) {
      const data: unknown = await response.json();
      const choices = data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as { choices?: unknown[] }).choices
        : undefined;
      const first = Array.isArray(choices) && choices[0] !== null && typeof choices[0] === "object"
        ? (choices[0] as { message?: unknown }).message
        : undefined;
      const content = first !== null && typeof first === "object" && !Array.isArray(first)
        && typeof (first as { content?: unknown }).content === "string"
        ? (first as { content: string }).content
        : "";
      return { content, model, fallbackUsed: index > 0 };
    }
    lastStatus = response.status;
    if (!isRetryableOpenRouterStatus(response.status) || index === models.length - 1) break;
  }
  throw new Error(`OpenRouter unavailable (${lastStatus ?? "unknown"})`);
}

export function normalizeOpenRouterModels(payload: unknown): OpenRouterModel[] {
  const rows = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { data?: unknown }).data
    : undefined;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const models: OpenRouterModel[] = [];
  for (const raw of rows) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const model: OpenRouterModel = { id };
    if (typeof row.name === "string" && row.name.trim()) model.name = row.name.trim();
    if (typeof row.context_length === "number" && Number.isFinite(row.context_length)) {
      model.contextLength = row.context_length;
    }
    const pricing = row.pricing;
    if (pricing !== null && typeof pricing === "object" && !Array.isArray(pricing)) {
      const p = pricing as Record<string, unknown>;
      const prompt = typeof p.prompt === "string" ? Number(p.prompt) : p.prompt;
      const completion = typeof p.completion === "string" ? Number(p.completion) : p.completion;
      if (typeof prompt === "number" && Number.isFinite(prompt)) model.promptPrice = prompt;
      if (typeof completion === "number" && Number.isFinite(completion)) model.completionPrice = completion;
    }
    if (Array.isArray(row.supported_parameters)) {
      model.supportedParameters = row.supported_parameters.filter((v): v is string => typeof v === "string");
    }
    if (typeof row.architecture === "object" && row.architecture !== null && !Array.isArray(row.architecture)) {
      const architecture = row.architecture as Record<string, unknown>;
      if (typeof architecture.modality === "string") model.modality = architecture.modality;
    }
    if (typeof row.created === "number") model.created = row.created;
    if (typeof row.expiration === "string" || row.expiration === null) model.expiration = row.expiration;
    models.push(model);
  }
  return models;
}
