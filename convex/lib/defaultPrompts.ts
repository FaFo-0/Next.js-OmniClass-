/** Default AI prompt configs — used by seed and reset-to-default. */
export const defaultPromptConfigs = [
  {
    configId: "lesson_summary",
    name: "Lesson Summary",
    systemPrompt:
      "You are an English language teaching assistant. Summarize the lesson transcript in clear English. Focus on what was taught, key concepts covered, and learning objectives. Keep it concise (2-4 paragraphs).",
    userPromptTemplate:
      "Summarize this English lesson transcript:\n\n{{transcript}}",
    model: "google/gemini-3-flash-preview",
    provider: "openrouter" as const,
    temperature: 0.3,
    maxTokens: 500,
    outputFormat: "text" as const,
  },
  {
    configId: "vocab_extraction",
    name: "Vocabulary Extraction",
    systemPrompt:
      'You are an English language teaching assistant. Extract English vocabulary from the lesson transcript. For each word/phrase, provide: the English word/phrase in the "arabic" field, a pronunciation guide in "transliteration", a Russian translation in "translation", and part of speech. Return valid JSON array.\n\nFormat: [{"arabic": "English word", "transliteration": "pronunciation guide", "translation": "Russian translation", "partOfSpeech": "noun|verb|adjective|phrase|adverb|preposition|interjection|number"}]',
    userPromptTemplate:
      "Extract all key English vocabulary from this lesson transcript. Return a JSON array:\n\n{{transcript}}",
    model: "google/gemini-3-flash-preview",
    provider: "openrouter" as const,
    temperature: 0.2,
    maxTokens: 2000,
    outputFormat: "json" as const,
  },
  {
    configId: "flashcard_generation",
    name: "Flashcard Generation",
    systemPrompt:
      'You are an English language teaching assistant. Generate flashcards from the lesson vocabulary. Front side should be English text, back side should be the Russian translation (concise). Return valid JSON array.\n\nFormat: [{"front": "English text", "back": "Russian translation"}]',
    userPromptTemplate:
      "Generate flashcards from this English lesson transcript. Return a JSON array:\n\n{{transcript}}",
    model: "google/gemini-3-flash-preview",
    provider: "openrouter" as const,
    temperature: 0.2,
    maxTokens: 2000,
    outputFormat: "json" as const,
  },
  {
    configId: "quiz_generation",
    name: "Quiz Generation",
    systemPrompt:
      'You are an English language teaching assistant. Generate multiple-choice quiz questions to test comprehension of the lesson content. Each question should have 4 options with exactly one correct answer. Return valid JSON array.\n\nFormat: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}]',
    userPromptTemplate:
      "Generate 3-5 quiz questions from this English lesson transcript. Return a JSON array:\n\n{{transcript}}",
    model: "google/gemini-3-flash-preview",
    provider: "openrouter" as const,
    temperature: 0.4,
    maxTokens: 2000,
    outputFormat: "json" as const,
  },
];
