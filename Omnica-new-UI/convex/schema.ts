import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  tenants: defineTable({
    name: v.string(),
    slug: v.string(),
    primaryColor: v.string(),
    tagline: v.string(),
    logo: v.optional(v.string()),
    gamificationEnabled: v.boolean(),
    terminology: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  users: defineTable({
    clerkId: v.string(),
    tenantId: v.id("tenants"),
    role: v.union(v.literal("student"), v.literal("instructor"), v.literal("admin"), v.literal("super_admin")),
    firstName: v.string(),
    fullName: v.string(),
    email: v.string(),
    assignedInstructorId: v.optional(v.id("users")),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled"), v.literal("trial")),
  }).index("by_clerk", ["clerkId"]).index("by_tenant", ["tenantId"]),

  lessons: defineTable({
    tenantId: v.id("tenants"),
    title: v.string(),
    studentId: v.id("users"),
    instructorId: v.id("users"),
    date: v.string(),
    duration: v.number(),
    status: v.union(v.literal("scheduled"), v.literal("recorded"), v.literal("draft"), v.literal("finalized")),
    workflowStatus: v.union(v.literal("pending"), v.literal("transcribing"), v.literal("generating"), v.literal("review"), v.literal("approved")),
    transcript: v.optional(v.string()),
    summary: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
  }).index("by_student", ["studentId"]).index("by_instructor", ["instructorId"]).index("by_tenant", ["tenantId"]),

  vocabulary: defineTable({
    tenantId: v.id("tenants"),
    lessonId: v.id("lessons"),
    word: v.string(),
    translation: v.string(),
    partOfSpeech: v.string(),
    phonetic: v.optional(v.string()),
  }).index("by_lesson", ["lessonId"]),

  flashcards: defineTable({
    tenantId: v.id("tenants"),
    lessonId: v.id("lessons"),
    front: v.string(),
    back: v.string(),
    example: v.optional(v.string()),
  }).index("by_lesson", ["lessonId"]),

  quizQuestions: defineTable({
    tenantId: v.id("tenants"),
    lessonId: v.id("lessons"),
    question: v.string(),
    options: v.array(v.string()),
    correctIndex: v.number(),
  }).index("by_lesson", ["lessonId"]),

  srsCards: defineTable({
    userId: v.id("users"),
    flashcardId: v.id("flashcards"),
    ease: v.float64(),
    interval: v.float64(),
    due: v.string(),
    reps: v.number(),
  }).index("by_user_due", ["userId", "due"]),

  achievements: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.string(),
    conditionType: v.string(),
    threshold: v.number(),
    icon: v.string(),
    reward: v.optional(v.string()),
  }).index("by_tenant", ["tenantId"]),

  userAchievements: defineTable({
    userId: v.id("users"),
    achievementId: v.id("achievements"),
    progress: v.number(),
    unlocked: v.boolean(),
    unlockedAt: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  decks: defineTable({
    tenantId: v.id("tenants"),
    userId: v.id("users"),
    name: v.string(),
    lessonId: v.optional(v.id("lessons")),
    isCustom: v.boolean(),
  }).index("by_user", ["userId"]),

  deckCards: defineTable({
    deckId: v.id("decks"),
    vocabularyId: v.id("vocabulary"),
    flashcardId: v.optional(v.id("flashcards")),
  }).index("by_deck", ["deckId"]),

  calendarEvents: defineTable({
    tenantId: v.id("tenants"),
    title: v.string(),
    instructorId: v.optional(v.id("users")),
    studentId: v.optional(v.id("users")),
    start: v.string(),
    end: v.string(),
    type: v.union(v.literal("1on1"), v.literal("group"), v.literal("offline"), v.literal("global")),
    status: v.union(v.literal("upcoming"), v.literal("live"), v.literal("completed"), v.literal("cancelled")),
  }).index("by_tenant", ["tenantId"]).index("by_instructor", ["instructorId"]),

  invoices: defineTable({
    tenantId: v.id("tenants"),
    studentId: v.id("users"),
    number: v.string(),
    amount: v.number(),
    status: v.union(v.literal("paid"), v.literal("unpaid"), v.literal("overdue")),
    date: v.string(),
  }).index("by_tenant", ["tenantId"]),

  subscriptions: defineTable({
    tenantId: v.id("tenants"),
    studentId: v.id("users"),
    plan: v.string(),
    sessionsTotal: v.number(),
    sessionsUsed: v.number(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled")),
    startDate: v.string(),
    endDate: v.string(),
  }).index("by_student", ["studentId"]),

  aiConfigs: defineTable({
    tenantId: v.id("tenants"),
    type: v.union(v.literal("summary"), v.literal("vocabulary"), v.literal("flashcards"), v.literal("quiz")),
    model: v.string(),
    temperature: v.float64(),
    maxTokens: v.number(),
    promptTemplate: v.string(),
  }).index("by_tenant", ["tenantId"]),
})
