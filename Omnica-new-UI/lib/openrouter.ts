const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

interface LLMRequest {
  model: string
  messages: { role: string; content: string }[]
  temperature?: number
  max_tokens?: number
}

export async function generateContent(req: LLMRequest) {
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.max_tokens ?? 500,
    }),
  })
  return res.json()
}

export const AI_MODELS = {
  summary: "google/gemini-3-flash-preview",
  vocabulary: "google/gemini-3-flash-preview",
  flashcards: "google/gemini-3-flash-preview",
  quiz: "google/gemini-3-flash-preview",
} as const
