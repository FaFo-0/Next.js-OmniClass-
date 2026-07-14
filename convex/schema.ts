import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ── Reusable validators ────────────────────────────────────────────
const contentSectionStatus = v.union(
  v.literal("pending"),
  v.literal("generating"),
  v.literal("review"),
  v.literal("approved")
);

const userRole = v.union(
  v.literal("teacher"),
  v.literal("student"),
  v.literal("admin")
);

const studentStatus = v.union(
  v.literal("trial"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("cancelled")
);

const localeCode = v.union(v.literal("en"), v.literal("ru"), v.literal("ar"));

export default defineSchema({
  // ════════════════════════════════════════════════════════════════
  //  Tenants
  // ════════════════════════════════════════════════════════════════
  tenantSettings: defineTable({
    organizationId: v.string(), // Clerk org_id, unique per row

    // Identity
    name: v.string(),
    tagline: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoDarkUrl: v.optional(v.string()),
    faviconUrl: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),

    // Theme
    primaryColor: v.string(), // hex e.g. "#6716A4"
    primaryColorHover: v.optional(v.string()),
    backgroundColor: v.string(), // hex e.g. "#FFCA00"
    themeOverrides: v.optional(v.record(v.string(), v.string())),

    // Localization
    defaultLocale: localeCode,
    enabledLocales: v.array(v.string()),
    timezone: v.string(),
    baseCurrency: v.string(),

    // Operational policies
    maxReschedulesPerMonth: v.number(),
    rescheduleWindowHours: v.number(),
    cancelWindowHours: v.number(),
    defaultLessonDurationMinutes: v.number(),
    noShowConsumesLesson: v.boolean(),

    // Feature flags
    features: v.object({
      gamification: v.boolean(),
      achievements: v.boolean(),
      library: v.boolean(),
      liveQuizGen: v.boolean(),
      payments: v.boolean(),
    }),

    // AI cost calc
    ai: v.object({
      sonioxCostPerMinute: v.number(),
      avgLessonMinutes: v.number(),
    }),

    // H.2 — Activity types catalog (per-tenant lesson kinds)
    activityTypes: v.optional(
      v.array(
        v.object({
          id: v.string(), // stable slug, e.g. "1on1_general"
          name: v.string(),
          pointCost: v.number(),
          recordRequired: v.boolean(),
          isGroup: v.boolean(), // true = uses scheduleEnrollments
          allowedRoles: v.array(v.string()), // roles that can create
          isActive: v.boolean(),
          sortOrder: v.number(),
        })
      )
    ),

    // H.5 — Trial policy (configurable per tenant)
    trialPolicy: v.optional(
      v.object({
        enabled: v.boolean(),
        points: v.number(),
        requiresPayment: v.boolean(),
        priceUSD: v.optional(v.number()), // when requiresPayment=true
        durationDays: v.number(),
      })
    ),

    // H.3 — Multi-currency display config
    currencies: v.optional(
      v.array(
        v.object({
          code: v.string(),
          name: v.string(),
          symbol: v.string(),
          rateToUSD: v.number(),
          isPrimaryDisplay: v.boolean(),
          updatedAt: v.string(),
        })
      )
    ),
    currencyAutoUpdate: v.optional(v.boolean()),

    // H.6 — Teacher invite link
    teacherInviteToken: v.optional(v.string()),

    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  }).index("by_organization", ["organizationId"]),

  // ════════════════════════════════════════════════════════════════
  //  Users
  // ════════════════════════════════════════════════════════════════
  users: defineTable({
    organizationId: v.string(),
    externalId: v.string(), // Clerk user ID for real users
    tokenIdentifier: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    role: userRole,
    permissions: v.optional(v.array(v.string())), // overrides role defaults
    avatarUrl: v.optional(v.string()),
    teacherId: v.optional(v.string()),
    onboardingComplete: v.optional(v.boolean()),
    studentStatus: v.optional(studentStatus),
    locale: v.optional(localeCode),
    // H.4 — per-student locked pricing (snapshot at first purchase per package)
    lockedPriceTier: v.optional(
      v.array(
        v.object({
          packageId: v.id("pointPackages"),
          lockedPriceUSD: v.number(),
          lockedPoints: v.number(),
          lockedAt: v.string(),
        })
      )
    ),
    subscriptionStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("cancelled"),
        v.literal("none")
      )
    ),
    // H.6 — teacher-specific fields
    ieltsCertified: v.optional(v.boolean()),
    payoutRateOverride: v.optional(v.number()), // per-teacher override of tenant default
    phoneWhatsapp: v.optional(v.string()),
    // H.12 — ICS subscription
    icsToken: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_externalId", ["organizationId", "externalId"])
    .index("by_organization_and_email", ["organizationId", "email"])
    .index("by_organization_and_role", ["organizationId", "role"])
    .index("by_organization_and_teacherId", ["organizationId", "teacherId"])
    .index("by_organization_and_icsToken", ["organizationId", "icsToken"]),

  // ════════════════════════════════════════════════════════════════
  //  Lessons (English-only — Arabic-specific fields removed)
  // ════════════════════════════════════════════════════════════════
  lessons: defineTable({
    organizationId: v.string(),
    externalId: v.string(),
    teacherId: v.string(), // users.externalId
    studentId: v.string(),
    title: v.string(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("recording"),
      v.literal("transcribed"),
      v.literal("review"),
      v.literal("published"),
      v.literal("no_show_student"),
      v.literal("no_show_teacher")
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
    scheduledFor: v.optional(v.string()),
    recordingMode: v.optional(v.union(v.literal("live"), v.literal("upload"))),
    audioFileId: v.optional(v.id("_storage")),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
    deletedBy: v.optional(v.string()),
    createdAt: v.string(),
    publishedAt: v.optional(v.string()),
    scheduleEventId: v.optional(v.id("scheduleEvents")),
    teacherNotes: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_externalId", ["organizationId", "externalId"])
    .index("by_organization_and_teacherId", ["organizationId", "teacherId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_studentId_and_status", [
      "organizationId",
      "studentId",
      "status",
    ])
    .index("by_organization_and_isDeleted", ["organizationId", "isDeleted"]),

  // ── Lesson content (normalized) ──────────────────────────────────
  lessonVocabulary: defineTable({
    organizationId: v.string(),
    lessonId: v.id("lessons"),
    externalId: v.string(),
    word: v.string(),
    translation: v.string(),
    translationLocale: localeCode,
    partOfSpeech: v.string(),
    exampleSentence: v.optional(v.string()),
    ipa: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_lessonId", ["lessonId"]),

  lessonFlashcards: defineTable({
    organizationId: v.string(),
    lessonId: v.id("lessons"),
    externalId: v.string(),
    front: v.string(),
    back: v.string(),
    exampleSentence: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_lessonId", ["lessonId"]),

  lessonQuizQuestions: defineTable({
    organizationId: v.string(),
    lessonId: v.id("lessons"),
    externalId: v.string(),
    question: v.string(),
    options: v.array(v.string()),
    correctIndex: v.number(),
    explanation: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_lessonId", ["lessonId"]),

  // ════════════════════════════════════════════════════════════════
  //  In-lesson quiz drafts (async generated mid-recording)
  // ════════════════════════════════════════════════════════════════
  inLessonQuizDrafts: defineTable({
    organizationId: v.string(),
    lessonId: v.id("lessons"),
    questions: v.array(
      v.object({
        question: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.optional(v.string()),
      })
    ),
    sourceTranscript: v.string(),
    generatedAt: v.string(),
    generatedBy: v.string(), // teacher externalId
  })
    .index("by_organization", ["organizationId"])
    .index("by_lessonId", ["lessonId"]),

  // ════════════════════════════════════════════════════════════════
  //  Library & Reading Hub
  // ════════════════════════════════════════════════════════════════
  libraryMaterials: defineTable({
    organizationId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    kind: v.union(
      v.literal("article"),
      v.literal("story"),
      v.literal("dialog"),
      v.literal("transcript"),
      v.literal("pdf")
    ),
    levelCEFR: v.optional(
      v.union(
        v.literal("A1"),
        v.literal("A2"),
        v.literal("B1"),
        v.literal("B2"),
        v.literal("C1"),
        v.literal("C2")
      )
    ),
    topicTags: v.array(v.string()),
    contentMarkdown: v.string(),
    contentHtml: v.optional(v.string()),
    audioFileId: v.optional(v.id("_storage")),
    sourceUrl: v.optional(v.string()),
    estimatedReadMinutes: v.optional(v.number()),
    uploadedBy: v.string(), // users.externalId
    isPublished: v.boolean(),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_isPublished", [
      "organizationId",
      "isPublished",
    ])
    .index("by_organization_and_levelCEFR", ["organizationId", "levelCEFR"]),

  libraryWordLookups: defineTable({
    organizationId: v.string(),
    word: v.string(), // lowercased
    locale: v.string(),
    definition: v.string(),
    ipa: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    partsOfSpeech: v.array(v.string()),
    fetchedAt: v.string(),
    source: v.union(
      v.literal("free-dictionary"),
      v.literal("merriam"),
      v.literal("manual")
    ),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_word_and_locale", [
      "organizationId",
      "word",
      "locale",
    ]),

  // ════════════════════════════════════════════════════════════════
  //  SRS — explicit decks
  // ════════════════════════════════════════════════════════════════
  srsDecks: defineTable({
    organizationId: v.string(),
    externalId: v.string(),
    name: v.string(),
    ownerId: v.string(), // student externalId
    source: v.union(
      v.literal("lesson"),
      v.literal("manual"),
      v.literal("library"),
      v.literal("teacher_push")
    ),
    sourceLessonId: v.optional(v.id("lessons")),
    isDefault: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_ownerId", ["organizationId", "ownerId"])
    .index("by_organization_and_sourceLessonId", [
      "organizationId",
      "sourceLessonId",
    ]),

  srsCards: defineTable({
    organizationId: v.string(),
    cardId: v.string(),
    deckId: v.id("srsDecks"),
    ownerId: v.string(),
    front: v.string(),
    back: v.string(),
    exampleSentence: v.optional(v.string()),
    sourceLessonId: v.optional(v.id("lessons")),
    sourceLibraryMaterialId: v.optional(v.id("libraryMaterials")),
    addedBy: v.optional(
      v.union(v.literal("self"), v.literal("teacher"), v.literal("system"))
    ),
    interval: v.number(),
    easeFactor: v.number(),
    repetitions: v.number(),
    nextReviewDate: v.string(),
    lastReviewDate: v.union(v.string(), v.null()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_ownerId", ["organizationId", "ownerId"])
    .index("by_organization_and_deckId", ["organizationId", "deckId"])
    .index("by_organization_and_ownerId_and_nextReviewDate", [
      "organizationId",
      "ownerId",
      "nextReviewDate",
    ]),

  reviewLogs: defineTable({
    organizationId: v.string(),
    ownerId: v.string(),
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
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_cardId", ["organizationId", "cardId"])
    .index("by_organization_and_ownerId", ["organizationId", "ownerId"]),

  // ════════════════════════════════════════════════════════════════
  //  Quiz attempts
  // ════════════════════════════════════════════════════════════════
  quizAttempts: defineTable({
    organizationId: v.string(),
    lessonId: v.string(),
    studentId: v.string(),
    score: v.number(),
    total: v.number(),
    completedAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_lessonId", ["organizationId", "lessonId"]),

  // ════════════════════════════════════════════════════════════════
  //  Achievements
  // ════════════════════════════════════════════════════════════════
  achievements: defineTable({
    organizationId: v.string(),
    externalId: v.string(),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    conditionType: v.union(
      v.literal("lessons_completed"),
      v.literal("cards_reviewed"),
      v.literal("quiz_perfect"),
      v.literal("streak_days"),
      v.literal("vocab_learned")
    ),
    conditionThreshold: v.number(),
    reward: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_externalId", ["organizationId", "externalId"]),

  studentAchievements: defineTable({
    organizationId: v.string(),
    achievementId: v.string(),
    studentId: v.string(),
    unlockedAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_studentId_and_achievementId", [
      "organizationId",
      "studentId",
      "achievementId",
    ]),

  // ════════════════════════════════════════════════════════════════
  //  Streaks & study sessions
  // ════════════════════════════════════════════════════════════════
  streaks: defineTable({
    organizationId: v.string(),
    studentId: v.string(),
    currentStreak: v.number(),
    longestStreak: v.number(),
    lastActivityDate: v.optional(v.string()),
    activityDates: v.array(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"]),

  studySessions: defineTable({
    organizationId: v.string(),
    studentId: v.string(),
    type: v.union(v.literal("flashcard"), v.literal("quiz")),
    cardsReviewed: v.number(),
    startedAt: v.string(),
    endedAt: v.string(),
    durationMinutes: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"]),

  // ════════════════════════════════════════════════════════════════
  //  Schedule
  // ════════════════════════════════════════════════════════════════
  scheduleEvents: defineTable({
    organizationId: v.string(),
    externalId: v.optional(v.string()),
    type: v.union(
      v.literal("1on1"),
      v.literal("group"),
      v.literal("offline"),
      v.literal("global"),
      v.literal("placeholder")
    ),
    teacherId: v.optional(v.string()),
    studentId: v.optional(v.string()),
    studentIds: v.optional(v.array(v.string())),
    title: v.string(),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("rescheduled"),
      v.literal("no_show_student"),
      v.literal("no_show_teacher"),
      v.literal("makeup")
    ),
    googleMeetLink: v.optional(v.string()),
    rescheduledFromEventId: v.optional(v.id("scheduleEvents")),
    rescheduleRequestId: v.optional(v.id("rescheduleRequests")),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
    // H.2 — point economy fields
    activityTypeId: v.optional(v.string()), // matches tenantSettings.activityTypes[].id
    pointCostSnapshot: v.optional(v.number()), // frozen cost at booking time
    capacity: v.optional(v.number()), // group events only
    // I.4 / I.6 — lifecycle timestamps for no-show automation
    teacherStartedAt: v.optional(v.string()),
    endedAt: v.optional(v.string()),
    sessionReminderSent: v.optional(v.boolean()),
    noShowNotifications: v.optional(
      v.array(
        v.object({
          level: v.number(), // 1=pre-5min, 2=at-start, 3=+10, 4=+20-refund
          sentAt: v.string(),
        })
      )
    ),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_teacherId", ["organizationId", "teacherId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_date", ["organizationId", "date"])
    .index("by_organization_and_status", ["organizationId", "status"]),

  rescheduleRequests: defineTable({
    organizationId: v.string(),
    eventId: v.id("scheduleEvents"),
    requestedBy: v.union(v.literal("teacher"), v.literal("student")),
    requesterId: v.string(),
    fromDate: v.string(),
    fromStartTime: v.string(),
    toDate: v.string(),
    toStartTime: v.string(),
    reason: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    resolvedBy: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_status", ["organizationId", "status"])
    .index("by_organization_and_eventId", ["organizationId", "eventId"]),

  studentRescheduleQuota: defineTable({
    organizationId: v.string(),
    studentId: v.string(),
    yearMonth: v.string(), // "YYYY-MM"
    count: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId_and_yearMonth", [
      "organizationId",
      "studentId",
      "yearMonth",
    ]),

  makeupCredits: defineTable({
    organizationId: v.string(),
    studentId: v.string(),
    reason: v.union(
      v.literal("teacher_no_show"),
      v.literal("admin_grant"),
      v.literal("other")
    ),
    sourceEventId: v.optional(v.id("scheduleEvents")),
    redeemedEventId: v.optional(v.id("scheduleEvents")),
    status: v.union(
      v.literal("issued"),
      v.literal("redeemed"),
      v.literal("expired")
    ),
    issuedBy: v.string(),
    expiresAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId_and_status", [
      "organizationId",
      "studentId",
      "status",
    ]),

  // ════════════════════════════════════════════════════════════════
  //  Point economy — Phase H.1
  //  Replaces the deleted `studentPackages` (session-counter) model.
  //
  //  pointPackages    — admin-managed catalog of buyable bundles
  //  pointGrants      — every credit a student owns lives here (FIFO
  //                     consumed by `remainingPoints` + `expiresAt`)
  //  pointTransactions — append-only ledger of every balance change
  // ════════════════════════════════════════════════════════════════
  pointPackages: defineTable({
    organizationId: v.string(),
    externalId: v.string(),
    name: v.string(),
    points: v.number(),
    priceUSD: v.number(),
    // Optional gateway IDs (deferred — manual grants in v1)
    lemonSqueezyVariantId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    isActive: v.boolean(),
    sortOrder: v.number(),
    // Pricing freeze: when the base price changes, write a new
    // effectiveFrom and keep the old row inactive for audit.
    effectiveFrom: v.string(),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_isActive", ["organizationId", "isActive"]),

  pointGrants: defineTable({
    organizationId: v.string(),
    studentId: v.string(),
    points: v.number(),
    remainingPoints: v.number(),
    purchasedAt: v.string(),
    expiresAt: v.string(),
    source: v.union(
      v.literal("purchase"),
      v.literal("manual"),
      v.literal("refund"),
      v.literal("makeup"),
      v.literal("trial")
    ),
    packageId: v.optional(v.id("pointPackages")),
    grantedBy: v.optional(v.string()), // admin externalId
    externalOrderId: v.optional(v.string()), // Lemon Squeezy / Stripe order id
    notes: v.optional(v.string()),
    isExpired: v.optional(v.boolean()), // set by expire cron once remainingPoints zeroed
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_studentId_and_expiresAt", [
      "organizationId",
      "studentId",
      "expiresAt",
    ])
    .index("by_organization_and_expiresAt", ["organizationId", "expiresAt"]),

  pointTransactions: defineTable({
    organizationId: v.string(),
    studentId: v.string(),
    type: v.union(
      v.literal("grant"),
      v.literal("spend"),
      v.literal("refund"),
      v.literal("expire"),
      v.literal("adjust")
    ),
    // Signed amount: positive for grant/refund, negative for spend/expire.
    amount: v.number(),
    balanceAfter: v.number(),
    scheduleEventId: v.optional(v.id("scheduleEvents")),
    enrollmentId: v.optional(v.id("scheduleEnrollments")),
    grantId: v.optional(v.id("pointGrants")),
    performedBy: v.optional(v.string()), // user externalId or "system"
    reason: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_grantId", ["organizationId", "grantId"]),

  // ════════════════════════════════════════════════════════════════
  //  H.4 — Price-migration audit. Stores the snapshot needed to undo
  //  a "force re-migrate all" action.
  // ════════════════════════════════════════════════════════════════
  priceMigrationAudit: defineTable({
    organizationId: v.string(),
    packageId: v.id("pointPackages"),
    oldPriceUSD: v.number(),
    newPriceUSD: v.number(),
    oldPoints: v.number(),
    newPoints: v.number(),
    performedBy: v.string(),
    performedAt: v.string(),
    affectedUsers: v.array(
      v.object({
        userId: v.string(),
        beforeLockedPriceUSD: v.optional(v.number()),
        beforeLockedPoints: v.optional(v.number()),
      })
    ),
    undone: v.boolean(),
    undoneAt: v.optional(v.string()),
    undoneBy: v.optional(v.string()),
  }).index("by_organization", ["organizationId"]),

  // ════════════════════════════════════════════════════════════════
  //  H.5 — Student onboarding form responses (kept separate so the
  //  users table doesn't grow unbounded with PII).
  // ════════════════════════════════════════════════════════════════
  studentOnboarding: defineTable({
    organizationId: v.string(),
    studentId: v.string(), // externalId
    age: v.optional(v.number()),
    phoneWhatsapp: v.optional(v.string()),
    cefrSelfAssessed: v.optional(v.string()),
    goal: v.optional(v.string()), // open text
    preferredDaysTimes: v.optional(v.string()), // open text
    l1: v.optional(v.string()),
    completedAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"]),

  // ════════════════════════════════════════════════════════════════
  //  H.7 — Teacher recurring weekly vacancies.
  //  Slot granularity = 30 minutes (HH:00 + HH:30). Multiple rows per
  //  teacher per day; UI batch-upserts.
  // ════════════════════════════════════════════════════════════════
  teacherVacancies: defineTable({
    organizationId: v.string(),
    teacherId: v.string(), // externalId
    dayOfWeek: v.number(), // 0 = Sunday … 6 = Saturday
    startTime: v.string(), // "HH:mm"
    endTime: v.string(),
    validFrom: v.string(), // ISO date
    validUntil: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_teacherId", ["organizationId", "teacherId"])
    .index("by_organization_and_teacherId_and_dayOfWeek", [
      "organizationId",
      "teacherId",
      "dayOfWeek",
    ]),

  // ════════════════════════════════════════════════════════════════
  //  H.6 — Teacher invite tokens. One reusable token per tenant
  //  (regenerable by admin). Anyone signing up via /sign-up?invite=…
  //  becomes role=teacher in that tenant.
  // ════════════════════════════════════════════════════════════════
  teacherInvites: defineTable({
    organizationId: v.string(),
    token: v.string(), // matches tenantSettings.teacherInviteToken
    usesCount: v.number(),
    lastUsedAt: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.string(),
    revokedAt: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_token", ["token"]),

  // ════════════════════════════════════════════════════════════════
  //  Group enrollment — Phase H.10
  //  One row per (student, group event). 1on1 events skip this table.
  // ════════════════════════════════════════════════════════════════
  scheduleEnrollments: defineTable({
    organizationId: v.string(),
    eventId: v.id("scheduleEvents"),
    studentId: v.string(),
    pointCostSnapshot: v.number(),
    status: v.union(
      v.literal("enrolled"),
      v.literal("cancelled"),
      v.literal("attended"),
      v.literal("no_show")
    ),
    enrolledAt: v.string(),
    attendanceMarkedBy: v.optional(v.string()),
    attendanceMarkedAt: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_eventId", ["organizationId", "eventId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"]),

  // ════════════════════════════════════════════════════════════════
  //  Notifications & permission requests
  // ════════════════════════════════════════════════════════════════
  notifications: defineTable({
    organizationId: v.string(),
    recipientId: v.string(), // user externalId
    kind: v.union(
      v.literal("session_published"),
      v.literal("reschedule_request"),
      v.literal("reschedule_resolved"),
      v.literal("permission_request"),
      v.literal("achievement_unlocked"),
      v.literal("invoice"),
      v.literal("impersonation"),
      v.literal("teacher_no_show"),
      v.literal("makeup_credit_issued"),
      v.literal("student_assigned"),
      v.literal("student_unassigned"),
      v.literal("points_granted"),
      v.literal("points_refunded"),
      v.literal("booking_reminder"),
      v.literal("homework_assigned"),
      v.literal("homework_submitted"),
      v.literal("homework_reviewed"),
      v.literal("unscheduled_session"),
      v.literal("session_reminder")
    ),
    payload: v.any(),
    link: v.optional(v.string()),
    readAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_recipientId", [
      "organizationId",
      "recipientId",
    ])
    .index("by_organization_and_recipientId_and_readAt", [
      "organizationId",
      "recipientId",
      "readAt",
    ]),

  permissionRequests: defineTable({
    organizationId: v.string(),
    teacherId: v.string(),
    action: v.string(), // permission key, e.g. "calendar.edit.full"
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    resolvedBy: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_status", ["organizationId", "status"]),

  // ════════════════════════════════════════════════════════════════
  //  AI prompt configs
  // ════════════════════════════════════════════════════════════════
  promptConfigs: defineTable({
    organizationId: v.string(),
    configId: v.string(),
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
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_configId", ["organizationId", "configId"]),

  // ════════════════════════════════════════════════════════════════
  //  Certificates
  // ════════════════════════════════════════════════════════════════
  certificateTemplates: defineTable({
    organizationId: v.string(),
    name: v.string(),
    description: v.string(),
    fileId: v.optional(v.id("_storage")),
    createdAt: v.string(),
  }).index("by_organization", ["organizationId"]),

  issuedCertificates: defineTable({
    organizationId: v.string(),
    templateId: v.id("certificateTemplates"),
    studentId: v.string(),
    issuedBy: v.string(),
    issuedAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_templateId", ["organizationId", "templateId"]),

  // ════════════════════════════════════════════════════════════════
  //  Student profiles (onboarding questionnaire)
  // ════════════════════════════════════════════════════════════════
  studentProfiles: defineTable({
    organizationId: v.string(),
    studentId: v.string(),
    phoneCountryCode: v.string(),
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
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"]),

  // ════════════════════════════════════════════════════════════════
  //  Billing
  // ════════════════════════════════════════════════════════════════
  billingRecords: defineTable({
    organizationId: v.string(),
    studentId: v.string(),
    monthlyAmount: v.number(),
    teacherPayment: v.number(),
    lessonsPerMonth: v.optional(v.number()),
    paymentDate: v.optional(v.string()),
    renewalDate: v.string(),
    status: v.union(v.literal("paid"), v.literal("unpaid")),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_status", ["organizationId", "status"]),

  expenses: defineTable({
    organizationId: v.string(),
    category: v.union(
      v.literal("ads"),
      v.literal("subscriptions"),
      v.literal("salary"),
      v.literal("trial_lessons"),
      v.literal("other")
    ),
    amount: v.number(),
    date: v.string(),
    note: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_date", ["organizationId", "date"])
    .index("by_organization_and_category", ["organizationId", "category"]),

  exchangeRates: defineTable({
    organizationId: v.string(),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    isManual: v.boolean(),
    updatedAt: v.string(),
  }).index("by_organization", ["organizationId"]),

  // ════════════════════════════════════════════════════════════════
  //  Phase J — Homework. One doc per (lesson, student) most of the
  //  time; teacher can attach a homework before a lesson too, in
  //  which case lessonId is optional.
  //
  //  contentJson is a TipTap-shaped Prosemirror document. Custom
  //  marks/nodes carry `author: "teacher" | "student"`; teacher-only
  //  nodes render read-only when student opens the doc.
  // ════════════════════════════════════════════════════════════════
  homework: defineTable({
    organizationId: v.string(),
    lessonId: v.optional(v.id("lessons")),
    teacherId: v.string(), // externalId
    studentId: v.string(), // externalId
    title: v.string(),
    contentJson: v.any(), // TipTap JSON
    status: v.union(
      v.literal("draft"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("submitted"),
      v.literal("reviewed")
    ),
    teacherComment: v.optional(v.string()),
    assignedAt: v.optional(v.string()),
    submittedAt: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
    dueAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_studentId", ["organizationId", "studentId"])
    .index("by_organization_and_teacherId", ["organizationId", "teacherId"])
    .index("by_organization_and_lessonId", ["organizationId", "lessonId"])
    .index("by_organization_and_status", ["organizationId", "status"]),
});
