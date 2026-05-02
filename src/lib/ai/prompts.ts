interface PromptConfig {
  id: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  provider: string;
  temperature: number;
  maxTokens: number;
  outputFormat: "text" | "json";
}

export const defaultPromptConfigs: PromptConfig[] = [
  {
    id: "lesson_summary",
    name: "Lesson Summary",
    systemPrompt:
      "You are an Arabic language teaching assistant. Summarize the lesson transcript in clear English. Focus on what was taught, key concepts covered, and learning objectives. Keep it concise (2-4 paragraphs).",
    userPromptTemplate:
      "Summarize this Arabic lesson transcript:\n\n{{transcript}}",
    model: "google/gemini-3-flash-preview",
    provider: "openrouter",
    temperature: 0.3,
    maxTokens: 500,
    outputFormat: "text",
  },
  {
    id: "vocab_extraction",
    name: "Vocabulary Extraction",
    systemPrompt:
      'You are an Arabic language teaching assistant. Extract Arabic vocabulary from the lesson transcript. For each word/phrase, provide: the Arabic text, transliteration, English translation, and part of speech. Return valid JSON array.\n\nFormat: [{"arabic": "...", "transliteration": "...", "translation": "...", "partOfSpeech": "noun|verb|adjective|phrase|adverb|preposition|interjection|number"}]',
    userPromptTemplate:
      "Extract all Arabic vocabulary from this lesson transcript. Return a JSON array:\n\n{{transcript}}",
    model: "google/gemini-3-flash-preview",
    provider: "openrouter",
    temperature: 0.2,
    maxTokens: 2000,
    outputFormat: "json",
  },
  {
    id: "flashcard_generation",
    name: "Flashcard Generation",
    systemPrompt:
      'You are an Arabic language teaching assistant. Generate flashcards from the lesson vocabulary. Front side should be Arabic text, back side should be the English translation (concise). Return valid JSON array.\n\nFormat: [{"front": "Arabic text", "back": "English translation"}]',
    userPromptTemplate:
      "Generate flashcards from this Arabic lesson transcript. Return a JSON array:\n\n{{transcript}}",
    model: "google/gemini-3-flash-preview",
    provider: "openrouter",
    temperature: 0.2,
    maxTokens: 2000,
    outputFormat: "json",
  },
  {
    id: "quiz_generation",
    name: "Quiz Generation",
    systemPrompt:
      'You are an Arabic language teaching assistant. Generate multiple-choice quiz questions to test comprehension of the lesson content. Each question should have 4 options with exactly one correct answer. Return valid JSON array.\n\nFormat: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}]',
    userPromptTemplate:
      "Generate 3-5 quiz questions from this Arabic lesson transcript. Return a JSON array:\n\n{{transcript}}",
    model: "google/gemini-3-flash-preview",
    provider: "openrouter",
    temperature: 0.4,
    maxTokens: 2000,
    outputFormat: "json",
  },
];
