import { mutation } from "./_generated/server";
import { defaultPromptConfigs } from "./lib/defaultPrompts";

/**
 * Seed just prompt configs + achievements + schedule policy.
 * Safe to run on a non-empty DB.
 */
export const seedConfigs = mutation({
  handler: async (ctx) => {
    // Prompt configs — skip if already present
    const existing = await ctx.db.query("promptConfigs").collect();
    if (existing.length === 0) {
      for (const config of defaultPromptConfigs) {
        await ctx.db.insert("promptConfigs", config);
      }
    }

    // Achievements — skip if already present
    const existingAch = await ctx.db.query("achievements").collect();
    if (existingAch.length === 0) {
      const achievements = [
        { externalId: "first_lesson", name: "First Steps", description: "Complete your first lesson", icon: "🎯", conditionType: "lessons_completed" as const, conditionThreshold: 1 },
        { externalId: "five_lessons", name: "Getting Serious", description: "Complete 5 lessons", icon: "📚", conditionType: "lessons_completed" as const, conditionThreshold: 5 },
        { externalId: "eight_lessons", name: "Dedicated Learner", description: "Complete 8 lessons (2 free lessons reward!)", icon: "🏆", conditionType: "lessons_completed" as const, conditionThreshold: 8, reward: "2 free lessons" },
        { externalId: "fifty_cards", name: "Card Collector", description: "Review 50 flashcards", icon: "🃏", conditionType: "cards_reviewed" as const, conditionThreshold: 50 },
        { externalId: "two_hundred_cards", name: "Memory Master", description: "Review 200 flashcards", icon: "🧠", conditionType: "cards_reviewed" as const, conditionThreshold: 200 },
        { externalId: "perfect_quiz", name: "Perfect Score", description: "Get 100% on a quiz", icon: "💯", conditionType: "quiz_perfect" as const, conditionThreshold: 1 },
        { externalId: "three_perfects", name: "Quiz Ace", description: "Get 100% on 3 quizzes", icon: "⭐", conditionType: "quiz_perfect" as const, conditionThreshold: 3 },
        { externalId: "streak_3", name: "On a Roll", description: "3-day study streak", icon: "🔥", conditionType: "streak_days" as const, conditionThreshold: 3 },
        { externalId: "streak_7", name: "Week Warrior", description: "7-day study streak", icon: "💪", conditionType: "streak_days" as const, conditionThreshold: 7 },
        { externalId: "streak_30", name: "Monthly Master", description: "30-day study streak", icon: "👑", conditionType: "streak_days" as const, conditionThreshold: 30 },
        { externalId: "vocab_50", name: "Word Explorer", description: "Learn 50 vocabulary words", icon: "📖", conditionType: "vocab_learned" as const, conditionThreshold: 50 },
      ];
      for (const ach of achievements) {
        await ctx.db.insert("achievements", ach);
      }
    }

    // Schedule policy — skip if already present
    const existingPolicy = await ctx.db.query("schedulePolicy").collect();
    if (existingPolicy.length === 0) {
      await ctx.db.insert("schedulePolicy", {
        rescheduleWindowHours: 6,
        cancelWindowHours: 24,
        lessonDurationMinutes: 60,
      });
    }

    return { status: "configs_seeded" };
  },
});

/**
 * Force-update all prompt configs from defaults (overwrites DB values).
 */
export const refreshPromptConfigs = mutation({
  handler: async (ctx) => {
    // Delete existing prompt configs
    const existing = await ctx.db.query("promptConfigs").collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
    // Re-insert from defaults
    for (const config of defaultPromptConfigs) {
      await ctx.db.insert("promptConfigs", config);
    }
    return { status: "refreshed", count: defaultPromptConfigs.length };
  },
});

/**
 * Seed mutation — inserts all mock data into Convex tables.
 * Safe to call multiple times: checks if users already exist before inserting.
 *
 * Call from dashboard or via: npx convex run seed
 */
export default mutation({
  handler: async (ctx) => {
    // Guard: skip if already seeded
    const existingUsers = await ctx.db.query("users").collect();
    if (existingUsers.length > 0) {
      return { status: "already_seeded", counts: { users: existingUsers.length } };
    }

    // ── 1. Users ───────────────────────────────────────────────────
    const users = [
      {
        externalId: "teacher-1",
        name: "Ahmed Hassan",
        email: "ahmed@example.com",
        role: "teacher" as const,
        createdAt: "2024-01-15T10:00:00Z",
      },
      {
        externalId: "student-1",
        name: "Anna Petrova",
        email: "anna@example.com",
        role: "student" as const,
        teacherId: "teacher-1",
        createdAt: "2024-02-01T10:00:00Z",
      },
      {
        externalId: "student-2",
        name: "Dmitri Volkov",
        email: "dmitri@example.com",
        role: "student" as const,
        teacherId: "teacher-1",
        createdAt: "2024-02-15T10:00:00Z",
      },
      {
        externalId: "student-3",
        name: "Maria Sokolova",
        email: "maria@example.com",
        role: "student" as const,
        teacherId: "teacher-1",
        createdAt: "2024-03-01T10:00:00Z",
      },
      {
        externalId: "admin-1",
        name: "Moumen",
        email: "moumen@example.com",
        role: "admin" as const,
        createdAt: "2024-01-01T10:00:00Z",
      },
    ];

    for (const user of users) {
      await ctx.db.insert("users", user);
    }

    // ── 2. Lessons (core fields only — content goes in separate tables) ─
    const lessonsData = [
      {
        externalId: "lesson-1",
        teacherId: "teacher-1",
        studentId: "student-1",
        title: "Greetings & Introductions",
        status: "published" as const,
        transcript:
          "بسم الله الرحمن الرحيم. مرحباً بكم في الدرس الأول. اليوم سنتعلم التحيات والتعارف. السلام عليكم تعني peace be upon you. وعليكم السلام هي الرد. كيف حالك تعني how are you. أنا بخير والحمد لله تعني I am fine, praise be to God.",
        summary:
          "This lesson covers basic Arabic greetings and introductions. Students learn essential phrases for meeting people, including formal and informal greetings. Key expressions covered: السلام عليكم (peace be upon you), كيف حالك (how are you), and appropriate responses.",
        contentStatus: {
          summary: "approved" as const,
          vocabulary: "approved" as const,
          flashcards: "approved" as const,
          quiz: "approved" as const,
        },
        durationSeconds: 420,
        order: 1,
        createdAt: "2024-03-01T14:00:00Z",
        publishedAt: "2024-03-01T15:00:00Z",
      },
      {
        externalId: "lesson-2",
        teacherId: "teacher-1",
        studentId: "student-1",
        title: "Numbers 1-10",
        status: "published" as const,
        transcript:
          "اليوم سنتعلم الأرقام من واحد إلى عشرة. واحد، اثنان، ثلاثة، أربعة، خمسة، ستة، سبعة، ثمانية، تسعة، عشرة. هيا نكررها معاً.",
        summary:
          "This lesson teaches Arabic numerals from 1 to 10. Students practice pronunciation and learn to count in Arabic. The lesson includes repetition exercises and number recognition.",
        contentStatus: {
          summary: "approved" as const,
          vocabulary: "approved" as const,
          flashcards: "approved" as const,
          quiz: "approved" as const,
        },
        durationSeconds: 360,
        order: 2,
        createdAt: "2024-03-08T14:00:00Z",
        publishedAt: "2024-03-08T15:00:00Z",
      },
      {
        externalId: "lesson-3",
        teacherId: "teacher-1",
        studentId: "student-1",
        title: "Colors in Arabic",
        status: "published" as const,
        transcript:
          "في هذا الدرس سنتعلم الألوان. أحمر، أزرق، أخضر، أصفر، أبيض، أسود. ما لونك المفضل؟",
        summary:
          "Students learn the names of basic colors in Arabic. The lesson covers six primary colors with pronunciation practice and a discussion about favorite colors.",
        contentStatus: {
          summary: "approved" as const,
          vocabulary: "approved" as const,
          flashcards: "approved" as const,
          quiz: "approved" as const,
        },
        durationSeconds: 300,
        order: 3,
        createdAt: "2024-03-15T14:00:00Z",
        publishedAt: "2024-03-15T15:00:00Z",
      },
      {
        externalId: "lesson-4",
        teacherId: "teacher-1",
        studentId: "student-2",
        title: "Arabic Alphabet Part 1",
        status: "published" as const,
        transcript:
          "اليوم سنبدأ بتعلم الحروف العربية. ألف، باء، تاء، ثاء. كل حرف له شكل مختلف في بداية الكلمة ووسطها ونهايتها.",
        summary:
          "Introduction to the first four letters of the Arabic alphabet: Alif, Ba, Ta, Tha. Students learn the different forms each letter takes depending on its position in a word.",
        contentStatus: {
          summary: "approved" as const,
          vocabulary: "approved" as const,
          flashcards: "approved" as const,
          quiz: "approved" as const,
        },
        durationSeconds: 380,
        order: 1,
        createdAt: "2024-03-05T14:00:00Z",
        publishedAt: "2024-03-05T15:00:00Z",
      },
    ];

    // Insert lessons and collect their Convex IDs for child tables
    const lessonIds: Record<string, any> = {};
    for (const lesson of lessonsData) {
      const id = await ctx.db.insert("lessons", lesson);
      lessonIds[lesson.externalId] = id;
    }

    // ── 3. Lesson Vocabulary ──────────────────────────────────────────
    const vocabData: Record<
      string,
      Array<{
        externalId: string;
        arabic: string;
        transliteration: string;
        translation: string;
        partOfSpeech: string;
      }>
    > = {
      "lesson-1": [
        { externalId: "v1-1", arabic: "السلام عليكم", transliteration: "As-salamu alaykum", translation: "Peace be upon you", partOfSpeech: "phrase" },
        { externalId: "v1-2", arabic: "مرحباً", transliteration: "Marhaban", translation: "Hello / Welcome", partOfSpeech: "interjection" },
        { externalId: "v1-3", arabic: "كيف حالك", transliteration: "Kayfa haluk", translation: "How are you", partOfSpeech: "phrase" },
        { externalId: "v1-4", arabic: "أنا بخير", transliteration: "Ana bikhayr", translation: "I am fine", partOfSpeech: "phrase" },
        { externalId: "v1-5", arabic: "شكراً", transliteration: "Shukran", translation: "Thank you", partOfSpeech: "interjection" },
      ],
      "lesson-2": [
        { externalId: "v2-1", arabic: "واحد", transliteration: "Wahid", translation: "One", partOfSpeech: "number" },
        { externalId: "v2-2", arabic: "اثنان", transliteration: "Ithnan", translation: "Two", partOfSpeech: "number" },
        { externalId: "v2-3", arabic: "ثلاثة", transliteration: "Thalatha", translation: "Three", partOfSpeech: "number" },
        { externalId: "v2-4", arabic: "أربعة", transliteration: "Arba'a", translation: "Four", partOfSpeech: "number" },
        { externalId: "v2-5", arabic: "خمسة", transliteration: "Khamsa", translation: "Five", partOfSpeech: "number" },
      ],
      "lesson-3": [
        { externalId: "v3-1", arabic: "أحمر", transliteration: "Ahmar", translation: "Red", partOfSpeech: "adjective" },
        { externalId: "v3-2", arabic: "أزرق", transliteration: "Azraq", translation: "Blue", partOfSpeech: "adjective" },
        { externalId: "v3-3", arabic: "أخضر", transliteration: "Akhdar", translation: "Green", partOfSpeech: "adjective" },
        { externalId: "v3-4", arabic: "أصفر", transliteration: "Asfar", translation: "Yellow", partOfSpeech: "adjective" },
      ],
      "lesson-4": [
        { externalId: "v4-1", arabic: "ألف", transliteration: "Alif", translation: "First letter (A)", partOfSpeech: "noun" },
        { externalId: "v4-2", arabic: "باء", transliteration: "Ba", translation: "Second letter (B)", partOfSpeech: "noun" },
        { externalId: "v4-3", arabic: "تاء", transliteration: "Ta", translation: "Third letter (T)", partOfSpeech: "noun" },
        { externalId: "v4-4", arabic: "حرف", transliteration: "Harf", translation: "Letter", partOfSpeech: "noun" },
      ],
    };

    for (const [lessonExtId, items] of Object.entries(vocabData)) {
      const lessonId = lessonIds[lessonExtId];
      for (const item of items) {
        await ctx.db.insert("lessonVocabulary", { lessonId, ...item });
      }
    }

    // ── 4. Lesson Flashcards ──────────────────────────────────────────
    const flashcardData: Record<
      string,
      Array<{ externalId: string; front: string; back: string }>
    > = {
      "lesson-1": [
        { externalId: "f1-1", front: "السلام عليكم", back: "Peace be upon you" },
        { externalId: "f1-2", front: "مرحباً", back: "Hello / Welcome" },
        { externalId: "f1-3", front: "كيف حالك", back: "How are you" },
        { externalId: "f1-4", front: "أنا بخير", back: "I am fine" },
        { externalId: "f1-5", front: "شكراً", back: "Thank you" },
      ],
      "lesson-2": [
        { externalId: "f2-1", front: "واحد", back: "One" },
        { externalId: "f2-2", front: "اثنان", back: "Two" },
        { externalId: "f2-3", front: "ثلاثة", back: "Three" },
        { externalId: "f2-4", front: "أربعة", back: "Four" },
        { externalId: "f2-5", front: "خمسة", back: "Five" },
      ],
      "lesson-3": [
        { externalId: "f3-1", front: "أحمر", back: "Red" },
        { externalId: "f3-2", front: "أزرق", back: "Blue" },
        { externalId: "f3-3", front: "أخضر", back: "Green" },
        { externalId: "f3-4", front: "أصفر", back: "Yellow" },
      ],
      "lesson-4": [
        { externalId: "f4-1", front: "ألف", back: "Alif — First letter (A)" },
        { externalId: "f4-2", front: "باء", back: "Ba — Second letter (B)" },
        { externalId: "f4-3", front: "تاء", back: "Ta — Third letter (T)" },
      ],
    };

    for (const [lessonExtId, items] of Object.entries(flashcardData)) {
      const lessonId = lessonIds[lessonExtId];
      for (const item of items) {
        await ctx.db.insert("lessonFlashcards", { lessonId, ...item });
      }
    }

    // ── 5. Lesson Quiz Questions ──────────────────────────────────────
    const quizData: Record<
      string,
      Array<{
        externalId: string;
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>
    > = {
      "lesson-1": [
        {
          externalId: "q1-1",
          question: "What does 'السلام عليكم' mean?",
          options: ["Goodbye", "Peace be upon you", "How are you", "Thank you"],
          correctIndex: 1,
          explanation: "السلام عليكم (As-salamu alaykum) is the traditional Islamic greeting meaning 'Peace be upon you'.",
        },
        {
          externalId: "q1-2",
          question: "How do you say 'How are you?' in Arabic?",
          options: ["شكراً", "مرحباً", "كيف حالك", "أنا بخير"],
          correctIndex: 2,
          explanation: "كيف حالك (Kayfa haluk) means 'How are you?' in Arabic.",
        },
        {
          externalId: "q1-3",
          question: "What is the correct response to 'السلام عليكم'?",
          options: ["مرحباً", "شكراً", "كيف حالك", "وعليكم السلام"],
          correctIndex: 3,
          explanation: "وعليكم السلام (Wa alaykum as-salam) means 'And upon you peace' — the standard response.",
        },
      ],
      "lesson-2": [
        {
          externalId: "q2-1",
          question: "What number is 'ثلاثة'?",
          options: ["One", "Two", "Three", "Four"],
          correctIndex: 2,
          explanation: "ثلاثة (Thalatha) means Three.",
        },
        {
          externalId: "q2-2",
          question: "How do you say 'Five' in Arabic?",
          options: ["واحد", "اثنان", "أربعة", "خمسة"],
          correctIndex: 3,
          explanation: "خمسة (Khamsa) means Five.",
        },
      ],
      "lesson-3": [
        {
          externalId: "q3-1",
          question: "What color is 'أخضر'?",
          options: ["Red", "Blue", "Green", "Yellow"],
          correctIndex: 2,
          explanation: "أخضر (Akhdar) means Green.",
        },
      ],
      "lesson-4": [
        {
          externalId: "q4-1",
          question: "What is the first letter of the Arabic alphabet?",
          options: ["باء", "ألف", "تاء", "ثاء"],
          correctIndex: 1,
          explanation: "ألف (Alif) is the first letter of the Arabic alphabet.",
        },
      ],
    };

    for (const [lessonExtId, items] of Object.entries(quizData)) {
      const lessonId = lessonIds[lessonExtId];
      for (const item of items) {
        await ctx.db.insert("lessonQuizQuestions", { lessonId, ...item });
      }
    }

    // ── 6. Achievements ───────────────────────────────────────────────
    const achievements = [
      { externalId: "first_lesson", name: "First Steps", description: "Complete your first lesson", icon: "🎯", conditionType: "lessons_completed" as const, conditionThreshold: 1 },
      { externalId: "five_lessons", name: "Getting Serious", description: "Complete 5 lessons", icon: "📚", conditionType: "lessons_completed" as const, conditionThreshold: 5 },
      { externalId: "eight_lessons", name: "Dedicated Learner", description: "Complete 8 lessons (2 free lessons reward!)", icon: "🏆", conditionType: "lessons_completed" as const, conditionThreshold: 8, reward: "2 free lessons" },
      { externalId: "fifty_cards", name: "Card Collector", description: "Review 50 flashcards", icon: "🃏", conditionType: "cards_reviewed" as const, conditionThreshold: 50 },
      { externalId: "two_hundred_cards", name: "Memory Master", description: "Review 200 flashcards", icon: "🧠", conditionType: "cards_reviewed" as const, conditionThreshold: 200 },
      { externalId: "perfect_quiz", name: "Perfect Score", description: "Get 100% on a quiz", icon: "💯", conditionType: "quiz_perfect" as const, conditionThreshold: 1 },
      { externalId: "three_perfects", name: "Quiz Ace", description: "Get 100% on 3 quizzes", icon: "⭐", conditionType: "quiz_perfect" as const, conditionThreshold: 3 },
      { externalId: "streak_3", name: "On a Roll", description: "3-day study streak", icon: "🔥", conditionType: "streak_days" as const, conditionThreshold: 3 },
      { externalId: "streak_7", name: "Week Warrior", description: "7-day study streak", icon: "💪", conditionType: "streak_days" as const, conditionThreshold: 7 },
      { externalId: "streak_30", name: "Monthly Master", description: "30-day study streak", icon: "👑", conditionType: "streak_days" as const, conditionThreshold: 30 },
      { externalId: "vocab_50", name: "Word Explorer", description: "Learn 50 vocabulary words", icon: "📖", conditionType: "vocab_learned" as const, conditionThreshold: 50 },
    ];

    for (const ach of achievements) {
      await ctx.db.insert("achievements", ach);
    }

    // ── 7. Schedule Policy (singleton) ────────────────────────────────
    await ctx.db.insert("schedulePolicy", {
      rescheduleWindowHours: 6,
      cancelWindowHours: 24,
      lessonDurationMinutes: 60,
    });

    // ── 8. Prompt Configs ─────────────────────────────────────────────
    const promptConfigs = [
      {
        configId: "lesson_summary",
        name: "Lesson Summary",
        systemPrompt:
          "You are an Arabic language teaching assistant. Summarize the lesson transcript in clear English. Focus on what was taught, key concepts covered, and learning objectives. Keep it concise (2-4 paragraphs).",
        userPromptTemplate:
          "Summarize this Arabic lesson transcript:\n\n{{transcript}}",
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
          'You are an Arabic language teaching assistant. Extract Arabic vocabulary from the lesson transcript. For each word/phrase, provide: the Arabic text, transliteration, English translation, and part of speech. Return valid JSON array.\n\nFormat: [{"arabic": "...", "transliteration": "...", "translation": "...", "partOfSpeech": "noun|verb|adjective|phrase|adverb|preposition|interjection|number"}]',
        userPromptTemplate:
          "Extract all Arabic vocabulary from this lesson transcript. Return a JSON array:\n\n{{transcript}}",
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
          'You are an Arabic language teaching assistant. Generate flashcards from the lesson vocabulary. Front side should be Arabic text, back side should be the English translation (concise). Return valid JSON array.\n\nFormat: [{"front": "Arabic text", "back": "English translation"}]',
        userPromptTemplate:
          "Generate flashcards from this Arabic lesson transcript. Return a JSON array:\n\n{{transcript}}",
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
          'You are an Arabic language teaching assistant. Generate multiple-choice quiz questions to test comprehension of the lesson content. Each question should have 4 options with exactly one correct answer. Return valid JSON array.\n\nFormat: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}]',
        userPromptTemplate:
          "Generate 3-5 quiz questions from this Arabic lesson transcript. Return a JSON array:\n\n{{transcript}}",
        model: "google/gemini-3-flash-preview",
        provider: "openrouter" as const,
        temperature: 0.4,
        maxTokens: 2000,
        outputFormat: "json" as const,
      },
    ];

    for (const config of promptConfigs) {
      await ctx.db.insert("promptConfigs", config);
    }

    // ── Summary ───────────────────────────────────────────────────────
    return {
      status: "seeded",
      counts: {
        users: users.length,
        lessons: lessonsData.length,
        vocabulary: Object.values(vocabData).flat().length,
        flashcards: Object.values(flashcardData).flat().length,
        quizQuestions: Object.values(quizData).flat().length,
        achievements: achievements.length,
        promptConfigs: promptConfigs.length,
        schedulePolicy: 1,
      },
    };
  },
});
