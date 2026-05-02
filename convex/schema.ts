import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Reusable validators
const contentSectionStatus = v.union(
  v.literal("pending"),
  v.literal("generating"),
  v.literal("review"),
  v.literal("approved")
);

export default defineSchema({
  // ── Users ──────────────────────────────────────────────────────────
  users: defineTable({
    externalId: v.string(), // stable user ID — Clerk user ID for real users
    tokenIdentifier: v.optional(v.string()), // Clerk token identity (e.g. "https://xxx.clerk.accounts.dev|user_abc")
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("teacher"),
      v.literal("student"),
      v.literal("admin")
    ),
    avatarUrl: v.optional(v.string()),
    teacherId: v.optional(v.string()), // student's teacher (externalId)
    onboardingComplete: v.optional(v.boolean()),
    studentStatus: v.optional(v.union(v.literal("trial"), v.literal("active"), v.literal("paused"), v.literal("cancelled"))),
    createdAt: v.string(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_teacherId", ["teacherId"]),

  // ── Lessons (core — no unbounded arrays) ───────────────────────────
  lessons: defineTable({
    externalId: v.string(), // "lesson-1" etc. for migration
    teacherId: v.string(), // users.externalId
    studentId: v.string(), // users.externalId
    title: v.string(),
    status: v.union(
      v.literal("recording"),
      v.literal("processing"),
      v.literal("review"),
      v.literal("published")
    ),
    transcript: v.string(),
    summary: v.string(),
    contentStatus: v.object({
      summary: contentSectionStatus,
      vocabulary: contentSectionStatus,
      flashcards: contentSectionStatus,
      quiz: contentSectionStatus,
    }),
    durationSeconds: v.number(),
    order: v.number(),
    createdAt: v.string(),
    publishedAt: v.optional(v.string()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_teacherId", ["teacherId"])
    .index("by_studentId", ["studentId"])
    .index("by_studentId_and_status", ["studentId", "status"]),

  // ── Lesson content (normalized — one row per item) ─────────────────
  lessonVocabulary: defineTable({
    lessonId: v.id("lessons"),
    externalId: v.string(), // "v1-1" etc.
    arabic: v.string(),
    transliteration: v.string(),
    translation: v.string(),
    partOfSpeech: v.string(),
  }).index("by_lessonId", ["lessonId"]),

  lessonFlashcards: defineTable({
    lessonId: v.id("lessons"),
    externalId: v.string(),
    front: v.string(),
    back: v.string(),
  }).index("by_lessonId", ["lessonId"]),

  lessonQuizQuestions: defineTable({
    lessonId: v.id("lessons"),
    externalId: v.string(),
    question: v.string(),
    options: v.array(v.string()), // bounded (4 choices)
    correctIndex: v.number(),
    explanation: v.string(),
  }).index("by_lessonId", ["lessonId"]),

  // ── SRS (spaced repetition) ────────────────────────────────────────
  srsCards: defineTable({
    cardId: v.string(),
    deckId: v.string(), // lesson externalId or imported deck id
    ownerId: v.string(), // student externalId
    front: v.string(),
    back: v.string(),
    interval: v.number(),
    easeFactor: v.number(),
    repetitions: v.number(),
    nextReviewDate: v.string(), // "YYYY-MM-DD"
    lastReviewDate: v.union(v.string(), v.null()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_deckId", ["deckId"])
    .index("by_ownerId_and_nextReviewDate", ["ownerId", "nextReviewDate"]),

  reviewLogs: defineTable({
    ownerId: v.string(), // student externalId
    cardId: v.string(),
    rating: v.union(
      v.literal("again"),
      v.literal("hard"),
      v.literal("good"),
      v.literal("easy")
    ),
    reviewedAt: v.string(),
    intervalBefore: v.number(),
    intervalAfter: v.number(),
    easeFactorBefore: v.number(),
    easeFactorAfter: v.number(),
  })
    .index("by_cardId", ["cardId"])
    .index("by_ownerId", ["ownerId"]),

  // ── Quiz attempts ──────────────────────────────────────────────────
  quizAttempts: defineTable({
    lessonId: v.string(),
    studentId: v.string(),
    score: v.number(),
    total: v.number(),
    completedAt: v.string(),
  })
    .index("by_studentId", ["studentId"])
    .index("by_lessonId", ["lessonId"]),

  // ── Achievements ───────────────────────────────────────────────────
  achievements: defineTable({
    externalId: v.string(), // "first_lesson", "five_lessons", etc.
    name: v.string(),
    description: v.string(),
    icon: v.string(), // emoji
    conditionType: v.union(
      v.literal("lessons_completed"),
      v.literal("cards_reviewed"),
      v.literal("quiz_perfect"),
      v.literal("streak_days"),
      v.literal("vocab_learned")
    ),
    conditionThreshold: v.number(),
    reward: v.optional(v.string()),
  }).index("by_externalId", ["externalId"]),

  studentAchievements: defineTable({
    achievementId: v.string(), // achievements.externalId
    studentId: v.string(),
    unlockedAt: v.string(),
  })
    .index("by_studentId", ["studentId"])
    .index("by_studentId_and_achievementId", ["studentId", "achievementId"]),

  // ── Streaks ────────────────────────────────────────────────────────
  streaks: defineTable({
    studentId: v.string(),
    currentStreak: v.number(),
    longestStreak: v.number(),
    lastActivityDate: v.optional(v.string()), // "YYYY-MM-DD"
    activityDates: v.array(v.string()), // bounded ~365 days
  }).index("by_studentId", ["studentId"]),

  // ── Study sessions ─────────────────────────────────────────────────
  studySessions: defineTable({
    studentId: v.string(),
    type: v.union(v.literal("flashcard"), v.literal("quiz")),
    cardsReviewed: v.number(),
    startedAt: v.string(),
    endedAt: v.string(),
    durationMinutes: v.number(),
  }).index("by_studentId", ["studentId"]),

  // ── Schedule ───────────────────────────────────────────────────────
  scheduleEvents: defineTable({
    teacherId: v.string(),
    studentId: v.string(),
    title: v.string(),
    date: v.string(), // "YYYY-MM-DD"
    startTime: v.string(), // "HH:mm"
    endTime: v.string(), // "HH:mm"
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("rescheduled")
    ),
    createdAt: v.string(),
  })
    .index("by_teacherId", ["teacherId"])
    .index("by_studentId", ["studentId"])
    .index("by_date", ["date"]),

  schedulePolicy: defineTable({
    rescheduleWindowHours: v.number(),
    cancelWindowHours: v.number(),
    lessonDurationMinutes: v.number(),
  }),

  // ── AI prompt configs ──────────────────────────────────────────────
  promptConfigs: defineTable({
    configId: v.string(), // "lesson_summary", "vocab_extraction", etc.
    name: v.string(),
    systemPrompt: v.string(),
    userPromptTemplate: v.string(),
    model: v.string(),
    provider: v.union(
      v.literal("openrouter"),
      v.literal("openai"),
      v.literal("anthropic")
    ),
    temperature: v.number(),
    maxTokens: v.number(),
    outputFormat: v.union(v.literal("text"), v.literal("json")),
  }).index("by_configId", ["configId"]),

  // ── Certificates ─────────────────────────────────────────────────
  certificateTemplates: defineTable({
    name: v.string(),
    description: v.string(),
    fileId: v.optional(v.id("_storage")), // uploaded PDF template
    createdAt: v.string(),
  }),

  issuedCertificates: defineTable({
    templateId: v.id("certificateTemplates"),
    studentId: v.string(), // users.externalId
    issuedBy: v.string(), // admin externalId
    issuedAt: v.string(),
  })
    .index("by_studentId", ["studentId"])
    .index("by_templateId", ["templateId"]),

  // ── Student profiles (onboarding questionnaire) ──────────────────
  studentProfiles: defineTable({
    studentId: v.string(), // users.externalId
    phoneCountryCode: v.string(), // "+7", "+966", etc.
    phoneNumber: v.string(),
    country: v.string(),
    age: v.number(),
    englishLevel: v.union(
      v.literal("beginner"),
      v.literal("intermediate"),
      v.literal("advanced")
    ),
    studiedBefore: v.optional(v.union(v.string(), v.boolean())),
    studyReason: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    completedAt: v.string(),
  }).index("by_studentId", ["studentId"]),

  // ── Billing records (one per payment cycle) ──────────────────────
  billingRecords: defineTable({
    studentId: v.string(), // users.externalId
    monthlyAmount: v.number(), // in KGS
    teacherPayment: v.number(), // in KGS
    lessonsPerMonth: v.optional(v.number()),
    paymentDate: v.optional(v.string()), // ISO date when paid
    renewalDate: v.string(), // next payment due date (YYYY-MM-DD)
    status: v.union(v.literal("paid"), v.literal("unpaid")),
    currency: v.optional(v.string()), // "KGS" or "USD", defaults to "KGS"
    notes: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_studentId", ["studentId"])
    .index("by_status", ["status"]),

  // ── Expenses (ads, subscriptions, salaries, etc.) ───────────────
  expenses: defineTable({
    category: v.union(
      v.literal("ads"),
      v.literal("subscriptions"),
      v.literal("salary"),
      v.literal("trial_lessons"),
      v.literal("other")
    ),
    amount: v.number(), // in KGS
    date: v.string(), // YYYY-MM-DD
    note: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_date", ["date"])
    .index("by_category", ["category"]),

  // ── Exchange rates ──────────────────────────────────────────────
  exchangeRates: defineTable({
    fromCurrency: v.string(), // "KGS"
    toCurrency: v.string(), // "USD"
    rate: v.number(), // how many KGS per 1 USD
    isManual: v.boolean(), // true if admin overrode
    updatedAt: v.string(),
  }),
});
