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
      'You are an English language teaching assistant. From the supplied, ID-labelled lesson utterances, suggest a short list of teachable English words or multi-word phrases that genuinely occur in the lesson. For each item give its exact surface form, the matching utteranceId, part of speech, a student-language translation, and a SHORT English definition (one clause, the meaning as used in this lesson). Do not invent sentences, do not use teacher notes as evidence, and do not return a word unless it occurs verbatim in the referenced utterance. Return ONLY a valid JSON array.\n\nFormat: [{"word": "exact English word or phrase", "utteranceId": "the supplied utterance ID", "partOfSpeech": "noun|verb|adjective|phrase|adverb|other", "translation": "translation", "definition": "short English meaning"}]',
    userPromptTemplate:
      "Suggest teachable vocabulary only from these ID-labelled lesson utterances. Return word, utteranceId, partOfSpeech, translation and definition:\n\n{{transcript}}",
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
