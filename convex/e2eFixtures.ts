import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { seedCleanCatalogue } from "./billingDevelopmentReset";

const PROTECTED_LAUNCH_ORGANIZATION_ID = "org_3DIbJAWeR5CjVaBRlB4AZXL1UpD";
const DEDICATED_FIXTURE_AUTH = "verified";
const NO_EXPIRY = "9999-12-31";
const E2E_WORK_PREFIX = "e2e-student-loop-";
const MAX_RESET_ROWS_PER_TABLE = 500;

const personaValidator = v.union(
  v.literal("Russian"),
  v.literal("Kazakh"),
  v.literal("Arabic"),
);
const actorValidator = v.object({
  externalId: v.string(),
  email: v.string(),
  name: v.string(),
});
const argsValidator = {
  organizationId: v.string(),
  fixtureKey: v.string(),
  persona: personaValidator,
  booking: v.object({
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
  }),
  actors: v.object({
    student: actorValidator,
    teacher: actorValidator,
    admin: actorValidator,
  }),
  teacherMeetLink: v.string(),
} as const;

type FixtureArgs = {
  organizationId: string;
  fixtureKey: string;
  persona: "Russian" | "Kazakh" | "Arabic";
  booking: { date: string; startTime: string; endTime: string };
  actors: {
    student: { externalId: string; email: string; name: string };
    teacher: { externalId: string; email: string; name: string };
    admin: { externalId: string; email: string; name: string };
  };
  teacherMeetLink: string;
};

type PersonaPreset = {
  locale: "ru" | "kk" | "ar";
  l1: "ru" | "kk" | "ar";
  timezone: string;
  expectedLantern: string;
};

const PERSONAS: Record<FixtureArgs["persona"], PersonaPreset> = {
  Russian: {
    locale: "ru",
    l1: "ru",
    timezone: "Asia/Almaty",
    expectedLantern: "фонарь",
  },
  Kazakh: {
    locale: "kk",
    l1: "kk",
    timezone: "Asia/Almaty",
    expectedLantern: "шам",
  },
  Arabic: {
    locale: "ar",
    l1: "ar",
    timezone: "Asia/Riyadh",
    expectedLantern: "فانوس",
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function assertFixtureEnvironment(organizationId: string): void {
  if (process.env.E2E_FIXTURES_ENABLED !== "true") {
    throw new Error("E2E fixtures are disabled (set E2E_FIXTURES_ENABLED=true)");
  }
  const configured = process.env.E2E_ORGANIZATION_ID?.trim();
  if (!configured || configured !== organizationId) {
    throw new Error("E2E fixture organization mismatch");
  }
  if (organizationId === PROTECTED_LAUNCH_ORGANIZATION_ID) {
    throw new Error("Refusing to run E2E fixtures against the launch organization");
  }
  if (
    process.env.E2E_DEDICATED_ORGANIZATION_ID?.trim() !== organizationId ||
    process.env.E2E_DEDICATED_ORGANIZATION_AUTH !== DEDICATED_FIXTURE_AUTH
  ) {
    throw new Error("E2E fixture requires verified dedicated E2E organization authorization");
  }
}

async function authorizedFixtureSettings(
  ctx: MutationCtx | QueryCtx,
  organizationId: string,
): Promise<Doc<"tenantSettings">> {
  assertFixtureEnvironment(organizationId);
  const settings = await ctx.db
    .query("tenantSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .unique();
  const authorization = settings?.e2eFixtureAuthorization;
  if (
    !settings ||
    authorization?.dedicated !== true ||
    authorization.verifiedAt.trim().length === 0
  ) {
    throw new Error("E2E fixture requires verified dedicated E2E organization authorization");
  }
  return settings;
}

function cleanFixtureKey(value: string): string {
  const key = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  if (!key || key.length > 80) {
    throw new Error("fixtureKey must be 1-80 URL-safe characters");
  }
  return key;
}

function assertArgs(args: FixtureArgs): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.booking.date)) {
    throw new Error("booking.date must be YYYY-MM-DD");
  }
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(args.booking.startTime) || !hhmm.test(args.booking.endTime)) {
    throw new Error("booking times must be HH:mm");
  }
  if (args.booking.startTime >= args.booking.endTime) {
    throw new Error("booking.endTime must be after booking.startTime");
  }
  if (!/^https:\/\/meet\.google\.com\//i.test(args.teacherMeetLink.trim())) {
    throw new Error("teacherMeetLink must be an https://meet.google.com/ URL");
  }
  const externalIds = Object.values(args.actors).map((actor) => actor.externalId.trim());
  if (externalIds.some((id) => !id) || new Set(externalIds).size !== 3) {
    throw new Error("fixture actors must have three distinct Clerk external IDs");
  }
}

async function resetSimpleTables(ctx: MutationCtx, organizationId: string): Promise<number> {
  let deleted = 0;

  const scheduleEvents = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of scheduleEvents) { await ctx.db.delete(row._id); deleted += 1; }

  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of lessons) { await ctx.db.delete(row._id); deleted += 1; }

  const lessonVocabulary = await ctx.db
    .query("lessonVocabulary")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of lessonVocabulary) { await ctx.db.delete(row._id); deleted += 1; }

  const lessonTranscriptUtterances = await ctx.db
    .query("lessonTranscriptUtterances")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of lessonTranscriptUtterances) { await ctx.db.delete(row._id); deleted += 1; }

  const lessonFlashcards = await ctx.db
    .query("lessonFlashcards")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of lessonFlashcards) { await ctx.db.delete(row._id); deleted += 1; }

  const lessonQuizQuestions = await ctx.db
    .query("lessonQuizQuestions")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of lessonQuizQuestions) { await ctx.db.delete(row._id); deleted += 1; }

  const inLessonQuizDrafts = await ctx.db
    .query("inLessonQuizDrafts")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of inLessonQuizDrafts) { await ctx.db.delete(row._id); deleted += 1; }

  const homework = await ctx.db
    .query("homework")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of homework) { await ctx.db.delete(row._id); deleted += 1; }

  const libraryProgress = await ctx.db
    .query("libraryProgress")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of libraryProgress) { await ctx.db.delete(row._id); deleted += 1; }

  const srsCards = await ctx.db
    .query("srsCards")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of srsCards) { await ctx.db.delete(row._id); deleted += 1; }

  const srsDecks = await ctx.db
    .query("srsDecks")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of srsDecks) { await ctx.db.delete(row._id); deleted += 1; }

  const reviewLogs = await ctx.db
    .query("reviewLogs")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of reviewLogs) { await ctx.db.delete(row._id); deleted += 1; }

  const studySessions = await ctx.db
    .query("studySessions")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of studySessions) { await ctx.db.delete(row._id); deleted += 1; }

  const quizAttempts = await ctx.db
    .query("quizAttempts")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of quizAttempts) { await ctx.db.delete(row._id); deleted += 1; }

  const vocabularyOccurrences = await ctx.db
    .query("vocabularyOccurrences")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of vocabularyOccurrences) { await ctx.db.delete(row._id); deleted += 1; }

  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of notifications) { await ctx.db.delete(row._id); deleted += 1; }

  const attentionDismissals = await ctx.db
    .query("attentionDismissals")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of attentionDismissals) { await ctx.db.delete(row._id); deleted += 1; }

  const streaks = await ctx.db
    .query("streaks")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of streaks) { await ctx.db.delete(row._id); deleted += 1; }

  const studentAchievements = await ctx.db
    .query("studentAchievements")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of studentAchievements) { await ctx.db.delete(row._id); deleted += 1; }

  const studentProfiles = await ctx.db
    .query("studentProfiles")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of studentProfiles) { await ctx.db.delete(row._id); deleted += 1; }

  const studentPauses = await ctx.db
    .query("studentPauses")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of studentPauses) { await ctx.db.delete(row._id); deleted += 1; }

  const expenses = await ctx.db
    .query("expenses")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of expenses) { await ctx.db.delete(row._id); deleted += 1; }

  const payrollRuns = await ctx.db
    .query("payrollRuns")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of payrollRuns) { await ctx.db.delete(row._id); deleted += 1; }

  const rescheduleRequests = await ctx.db
    .query("rescheduleRequests")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of rescheduleRequests) { await ctx.db.delete(row._id); deleted += 1; }

  const studentRescheduleQuota = await ctx.db
    .query("studentRescheduleQuota")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of studentRescheduleQuota) { await ctx.db.delete(row._id); deleted += 1; }

  const makeupCredits = await ctx.db
    .query("makeupCredits")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of makeupCredits) { await ctx.db.delete(row._id); deleted += 1; }

  const scheduleEnrollments = await ctx.db
    .query("scheduleEnrollments")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of scheduleEnrollments) { await ctx.db.delete(row._id); deleted += 1; }

  const slotExceptions = await ctx.db
    .query("slotExceptions")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of slotExceptions) { await ctx.db.delete(row._id); deleted += 1; }

  const recurringBookings = await ctx.db
    .query("recurringBookings")
    .withIndex("by_organization_and_status", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of recurringBookings) { await ctx.db.delete(row._id); deleted += 1; }

  const financeReminders = await ctx.db
    .query("financeReminders")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const row of financeReminders) { await ctx.db.delete(row._id); deleted += 1; }

  return deleted;
}

async function upsertActor(
  ctx: MutationCtx,
  organizationId: string,
  actor: FixtureArgs["actors"][keyof FixtureArgs["actors"]],
  patch: Omit<Partial<Doc<"users">>, "organizationId" | "externalId" | "email" | "name" | "role"> &
    Pick<Doc<"users">, "role">,
): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_organization_and_externalId", (q) =>
      q.eq("organizationId", organizationId).eq("externalId", actor.externalId.trim()),
    )
    .unique();
  const base = {
    name: actor.name.trim(),
    email: actor.email.trim().toLowerCase(),
    ...patch,
  };
  if (existing) {
    await ctx.db.patch(existing._id, base);
    return existing._id;
  }
  return await ctx.db.insert("users", {
    organizationId,
    externalId: actor.externalId.trim(),
    createdAt: nowIso(),
    ...base,
  });
}

async function provisionCore(ctx: MutationCtx, rawArgs: FixtureArgs) {
  const settings = await authorizedFixtureSettings(ctx, rawArgs.organizationId);
  assertArgs(rawArgs);
  const fixtureKey = cleanFixtureKey(rawArgs.fixtureKey);
  const args = { ...rawArgs, fixtureKey };
  const preset = PERSONAS[args.persona];
  const now = nowIso();
  const organizationId = args.organizationId;

  await ctx.db.patch(settings._id, {
    trialPolicy: {
      enabled: true,
      points: 1,
      durationDays: 0,
    },
    updatedAt: now,
  });

  const actorExternalIds = new Set(
    Object.values(args.actors).map((actor) => actor.externalId.trim()),
  );
  let deleted = await resetSimpleTables(ctx, organizationId);

  const orgUsers = await ctx.db
    .query("users")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  for (const user of orgUsers) {
    if (actorExternalIds.has(user.externalId)) continue;
    await ctx.db.delete(user._id);
    deleted += 1;
  }

  const studentId = await upsertActor(ctx, organizationId, args.actors.student, {
    role: "student",
    teacherId: args.actors.teacher.externalId.trim(),
    onboardingComplete: false,
    studentStatus: "trial",
    locale: preset.locale,
    timezone: preset.timezone,
    timeFormat: "24h",
    pausedFrom: undefined,
    pausedUntil: undefined,
    pauseReason: undefined,
  });
  const teacherId = await upsertActor(ctx, organizationId, args.actors.teacher, {
    role: "teacher",
    onboardingComplete: true,
    locale: "en",
    timezone: settings.timezone,
    timeFormat: "24h",
    meetLink: args.teacherMeetLink.trim(),
    bio: "OmniClass E2E teacher",
    ieltsCertified: false,
    recordingConsentAt: now,
  });
  const adminId = await upsertActor(ctx, organizationId, args.actors.admin, {
    role: "admin",
    onboardingComplete: true,
    locale: "en",
    timezone: settings.timezone,
    timeFormat: "24h",
  });

  const onboardingRows = await ctx.db
    .query("studentOnboarding")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  const existingOnboarding = onboardingRows.find(
    (row) => row.studentId === args.actors.student.externalId,
  );
  for (const row of onboardingRows) {
    if (row._id === existingOnboarding?._id) continue;
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  const onboardingPatch = {
    studentId: args.actors.student.externalId.trim(),
    l1: preset.l1,
    completedAt: undefined,
    consentAcceptedAt: undefined,
    age: undefined,
    phoneWhatsapp: undefined,
    guardianName: undefined,
    guardianPhone: undefined,
    cefrSelfAssessed: undefined,
    goal: undefined,
    preferredDaysTimes: undefined,
    preferredDays: undefined,
    preferredTimeOfDay: undefined,
    interests: undefined,
    country: undefined,
    referralSource: undefined,
  };
  if (existingOnboarding) {
    await ctx.db.patch(existingOnboarding._id, onboardingPatch);
  } else {
    await ctx.db.insert("studentOnboarding", {
      organizationId,
      ...onboardingPatch,
    });
  }

  const existingFamilies = await ctx.db
    .query("billingFamilies")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  let catalogueSeeded = false;
  if (existingFamilies.length === 0) {
    await seedCleanCatalogue(ctx, organizationId);
    catalogueSeeded = true;
  }

  // This is a free, fixed test credit to reach the booking boundary. It is
  // deliberately not a purchase and writes neither a payment event nor a
  // finance sale; paid lesson grants must come from billing.grantOrder.
  const grants = await ctx.db
    .query("pointGrants")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  const trialCreditNote = `E2E free trial credit:${fixtureKey}`;
  const existingTrialGrant = grants.find((grant) => grant.notes === trialCreditNote);
  for (const grant of grants) {
    if (grant._id === existingTrialGrant?._id) continue;
    await ctx.db.delete(grant._id);
    deleted += 1;
  }
  const trialGrantFields = {
    organizationId,
    studentId: args.actors.student.externalId.trim(),
    points: 1,
    remainingPoints: 1,
    purchasedAt: now,
    expiresAt: NO_EXPIRY,
    source: "trial" as const,
    grantedBy: args.actors.admin.externalId.trim(),
    notes: trialCreditNote,
  };
  const trialGrantId = existingTrialGrant
    ? existingTrialGrant._id
    : await ctx.db.insert("pointGrants", trialGrantFields);
  if (existingTrialGrant) await ctx.db.patch(trialGrantId, trialGrantFields);

  const transactions = await ctx.db
    .query("pointTransactions")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  const existingTrialTransaction = transactions.find(
    (transaction) => transaction.grantId === trialGrantId && transaction.type === "grant",
  );
  for (const transaction of transactions) {
    if (transaction._id === existingTrialTransaction?._id) continue;
    await ctx.db.delete(transaction._id);
    deleted += 1;
  }
  const trialTransactionFields = {
    organizationId,
    studentId: args.actors.student.externalId.trim(),
    type: "grant" as const,
    amount: 1,
    balanceAfter: 1,
    grantId: trialGrantId,
    performedBy: args.actors.admin.externalId.trim(),
    reason: "E2E free trial credit",
    createdAt: now,
  };
  if (existingTrialTransaction) {
    await ctx.db.patch(existingTrialTransaction._id, trialTransactionFields);
  } else {
    await ctx.db.insert("pointTransactions", trialTransactionFields);
  }

  const bookingDay = new Date(`${args.booking.date}T00:00:00Z`).getUTCDay();
  const vacancies = await ctx.db
    .query("teacherVacancies")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  const matchingVacancies = vacancies.filter(
    (row) =>
      row.teacherId === args.actors.teacher.externalId &&
      row.dayOfWeek === bookingDay &&
      row.startTime === args.booking.startTime &&
      row.endTime === args.booking.endTime,
  );
  const existingVacancy = matchingVacancies[0];
  for (const vacancy of vacancies) {
    if (vacancy._id === existingVacancy?._id) continue;
    await ctx.db.delete(vacancy._id);
    deleted += 1;
  }
  const vacancyFields = {
    teacherId: args.actors.teacher.externalId.trim(),
    dayOfWeek: bookingDay,
    startTime: args.booking.startTime,
    endTime: args.booking.endTime,
    validFrom: args.booking.date,
    validUntil: args.booking.date,
    isActive: true,
    createdAt: now,
  };
  let teacherVacancyId: Id<"teacherVacancies">;
  if (existingVacancy) {
    await ctx.db.patch(existingVacancy._id, vacancyFields);
    teacherVacancyId = existingVacancy._id;
  } else {
    teacherVacancyId = await ctx.db.insert("teacherVacancies", {
      organizationId,
      ...vacancyFields,
    });
  }

  const workExternalId = `${E2E_WORK_PREFIX}${fixtureKey}`;
  const works = await ctx.db
    .query("libraryWorks")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  const existingWork = works.find((work) => work.externalId === workExternalId);
  for (const work of works) {
    if (!work.externalId.startsWith(E2E_WORK_PREFIX) || work._id === existingWork?._id) {
      continue;
    }
    const oldUnits = await ctx.db
      .query("libraryUnits")
      .withIndex("by_workId", (q) => q.eq("workId", work._id))
      .take(MAX_RESET_ROWS_PER_TABLE);
    for (const unit of oldUnits) { await ctx.db.delete(unit._id); deleted += 1; }
    await ctx.db.delete(work._id);
    deleted += 1;
  }
  const workFields = {
    title: "The Lantern Market",
    description: "A deterministic A2 reading for the full student loop.",
    author: "OmniClass E2E",
    kind: "story" as const,
    levelCEFR: "A2" as const,
    topicTags: ["travel", "daily-life"],
    sourceUrl: "https://example.com/omniclass-e2e-lantern-market",
    license: "E2E fixture",
    attribution: "Generated for OmniClass testing",
    uploadedBy: args.actors.admin.externalId.trim(),
    isPublished: true,
    isDeleted: false,
    deletedBy: undefined,
    deletedAt: undefined,
    updatedAt: now,
  };
  let libraryWorkId: Id<"libraryWorks">;
  if (existingWork) {
    await ctx.db.patch(existingWork._id, workFields);
    libraryWorkId = existingWork._id;
  } else {
    libraryWorkId = await ctx.db.insert("libraryWorks", {
      organizationId,
      externalId: workExternalId,
      createdAt: now,
      ...workFields,
    });
  }

  const units = await ctx.db
    .query("libraryUnits")
    .withIndex("by_workId", (q) => q.eq("workId", libraryWorkId))
    .take(MAX_RESET_ROWS_PER_TABLE);
  const unitExternalId = `${workExternalId}-unit-0`;
  const existingUnit = units.find((unit) => unit.externalId === unitExternalId);
  for (const unit of units) {
    if (unit._id === existingUnit?._id) continue;
    await ctx.db.delete(unit._id);
    deleted += 1;
  }
  const unitFields = {
    position: 0,
    title: "A Light in the Market",
    contentMarkdown:
      "The curious student carries a lantern through the quiet market. She pauses beside a baker and asks why the bread smells warm. The baker explains that patience helps the dough rise. She writes the word lantern in her notebook.",
    estimatedReadMinutes: 2,
    updatedAt: now,
  };
  let libraryUnitId: Id<"libraryUnits">;
  if (existingUnit) {
    await ctx.db.patch(existingUnit._id, unitFields);
    libraryUnitId = existingUnit._id;
  } else {
    libraryUnitId = await ctx.db.insert("libraryUnits", {
      organizationId,
      workId: libraryWorkId,
      externalId: unitExternalId,
      createdAt: now,
      ...unitFields,
    });
  }

  const lookups = await ctx.db
    .query("libraryWordLookups")
    .withIndex("by_organization_and_word_and_locale", (q) =>
      q.eq("organizationId", organizationId).eq("word", "lantern").eq("locale", "en"),
    )
    .take(10);
  const lookupFields = {
    definition: "a portable light protected by a transparent case",
    ipa: "/ˈlæn.tən/",
    partsOfSpeech: ["noun"],
    translations: {
      ru: PERSONAS.Russian.expectedLantern,
      kk: PERSONAS.Kazakh.expectedLantern,
      ar: PERSONAS.Arabic.expectedLantern,
    },
    isValid: true,
    fetchedAt: now,
    source: "manual" as const,
  };
  if (lookups[0]) {
    await ctx.db.patch(lookups[0]._id, lookupFields);
    for (const duplicate of lookups.slice(1)) {
      await ctx.db.delete(duplicate._id);
      deleted += 1;
    }
  } else {
    await ctx.db.insert("libraryWordLookups", {
      organizationId,
      word: "lantern",
      locale: "en",
      ...lookupFields,
    });
  }

  return {
    ok: true,
    fixtureKey,
    organizationId,
    persona: {
      name: args.persona,
      locale: preset.locale,
      l1: preset.l1,
      expectedLibraryWord: "lantern",
      expectedLibraryTranslation: preset.expectedLantern,
    },
    actorKeys: {
      student: `${fixtureKey}:student`,
      teacher: `${fixtureKey}:teacher`,
      admin: `${fixtureKey}:admin`,
    },
    actors: {
      studentExternalId: args.actors.student.externalId.trim(),
      teacherExternalId: args.actors.teacher.externalId.trim(),
      adminExternalId: args.actors.admin.externalId.trim(),
    },
    booking: args.booking,
    expected: {
      initialBalance: 1,
      catalogueFamilyOrder: ["standard_tutoring", "ielts"],
      catalogueLessonOrder: [4, 8, 12],
    },
    ids: {
      student: studentId,
      teacher: teacherId,
      admin: adminId,
      trialGrant: trialGrantId,
      libraryWork: libraryWorkId,
      libraryUnit: libraryUnitId,
      teacherVacancy: teacherVacancyId,
    },
    reset: { deleted, catalogueSeeded },
  };
}

/**
 * CLI-only deterministic reset/provision for the dedicated student-loop org.
 * The environment guard is evaluated inside every invocation.
 */
export const provisionStudentLoop = internalMutation({
  args: argsValidator,
  handler: async (ctx, args) => await provisionCore(ctx, args),
});

/** CLI-only, cross-role read model used by the runbook's functional probes. */
export const snapshotStudentLoop = internalQuery({
  args: {
    organizationId: v.string(),
    fixtureKey: v.string(),
  },
  handler: async (ctx, args) => {
    await authorizedFixtureSettings(ctx, args.organizationId);
    const fixtureKey = cleanFixtureKey(args.fixtureKey);
    const organizationId = args.organizationId;

    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(20);
    const student = users.find((user) => user.role === "student") ?? null;
    const teacher = users.find((user) => user.role === "teacher") ?? null;
    const admin = users.find((user) => user.role === "admin") ?? null;
    const onboarding = student
      ? await ctx.db
          .query("studentOnboarding")
          .withIndex("by_organization_and_studentId", (q) =>
            q.eq("organizationId", organizationId).eq("studentId", student.externalId),
          )
          .first()
      : null;

    const families = await ctx.db
      .query("billingFamilies")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(50);
    const plans = await ctx.db
      .query("billingPlans")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(100);
    const versions = await ctx.db
      .query("billingPlanVersions")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(100);
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);

    const pointTransactions = await ctx.db
      .query("pointTransactions")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const financeEntries = await ctx.db
      .query("financeEntries")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const scheduleEvents = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const vacancies = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(50);
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(100);
    const vocabulary = await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const flashcards = await ctx.db
      .query("lessonFlashcards")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const quizQuestions = await ctx.db
      .query("lessonQuizQuestions")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const transcriptUtterances = await ctx.db
      .query("lessonTranscriptUtterances")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const homework = await ctx.db
      .query("homework")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(100);
    const works = await ctx.db
      .query("libraryWorks")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(100);
    const work = works.find(
      (candidate) => candidate.externalId === `${E2E_WORK_PREFIX}${fixtureKey}`,
    ) ?? null;
    const units = work
      ? await ctx.db
          .query("libraryUnits")
          .withIndex("by_workId", (q) => q.eq("workId", work._id))
          .take(20)
      : [];
    const libraryProgress = await ctx.db
      .query("libraryProgress")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(50);
    const cards = await ctx.db
      .query("srsCards")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const reviews = await ctx.db
      .query("reviewLogs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(200);
    const studySessions = await ctx.db
      .query("studySessions")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(100);
    const quizAttempts = await ctx.db
      .query("quizAttempts")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .take(100);

    const today = nowIso().slice(0, 10);
    const balance = grants
      .filter(
        (grant) =>
          grant.studentId === student?.externalId &&
          !grant.isExpired &&
          grant.expiresAt >= today,
      )
      .reduce((sum, grant) => sum + grant.remainingPoints, 0);

    return {
      fixtureKey,
      organizationId,
      actors: {
        student: student
          ? {
              rowId: student._id,
              externalId: student.externalId,
              name: student.name,
              locale: student.locale ?? null,
              l1: onboarding?.l1 ?? null,
              onboardingComplete: student.onboardingComplete === true,
              teacherId: student.teacherId ?? null,
            }
          : null,
        teacher: teacher
          ? {
              rowId: teacher._id,
              externalId: teacher.externalId,
              name: teacher.name,
              onboardingComplete: teacher.onboardingComplete === true,
              meetLinkSet: Boolean(teacher.meetLink),
            }
          : null,
        admin: admin
          ? { rowId: admin._id, externalId: admin.externalId, name: admin.name }
          : null,
      },
      billing: {
        balance,
        catalogue: families
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((family) => ({
            id: family._id,
            key: family.key,
            label: family.labels.default,
            plans: plans
              .filter((plan) => plan.familyId === family._id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((plan) => ({
                id: plan._id,
                key: plan.key,
                versions: versions
                  .filter((version) => version.planId === plan._id && version.status === "published")
                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                  .map((version) => ({
                    id: version._id,
                    lessons: version.lessonCount,
                    price: version.listPrice,
                    currency: version.currency,
                  })),
              })),
          })),
        grants: grants.map((grant) => ({
          id: grant._id,
          source: grant.source,
          lessons: grant.points,
          remaining: grant.remainingPoints,
          billingOrderId: grant.billingOrderId ?? null,
        })),
        transactionCount: pointTransactions.length,
        financeEntryCount: financeEntries.length,
      },
      calendar: {
        vacancies: vacancies.map((vacancy) => ({
          id: vacancy._id,
          teacherId: vacancy.teacherId,
          dayOfWeek: vacancy.dayOfWeek,
          startTime: vacancy.startTime,
          endTime: vacancy.endTime,
          validFrom: vacancy.validFrom,
          validUntil: vacancy.validUntil ?? null,
          active: vacancy.isActive,
        })),
        events: scheduleEvents.map((event) => ({
          id: event._id,
          teacherId: event.teacherId ?? null,
          studentId: event.studentId ?? null,
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          status: event.status,
          lessonStartedAt: event.teacherStartedAt ?? null,
          completedAt: event.completedAt ?? null,
        })),
      },
      lessons: lessons.map((lesson) => ({
        id: lesson._id,
        status: lesson.status,
        title: lesson.title,
        recordingMode: lesson.recordingMode ?? null,
        transcriptChars: lesson.transcript.trim().length,
        utterances: transcriptUtterances.filter((row) => row.lessonId === lesson._id).length,
        vocabulary: vocabulary.filter((row) => row.lessonId === lesson._id).length,
        flashcards: flashcards.filter((row) => row.lessonId === lesson._id).length,
        quizQuestions: quizQuestions.filter((row) => row.lessonId === lesson._id).length,
        publishedAt: lesson.publishedAt ?? null,
      })),
      homework: homework.map((item) => ({
        id: item._id,
        lessonId: item.lessonId ?? null,
        status: item.status,
        title: item.title,
        score: item.score ?? null,
        maxScore: item.maxScore ?? null,
        teacherComment: item.teacherComment ?? null,
      })),
      reading: {
        work: work
          ? { id: work._id, title: work.title, published: work.isPublished }
          : null,
        units: units.map((unit) => ({ id: unit._id, title: unit.title, position: unit.position })),
        progress: libraryProgress.map((progress) => ({
          workId: progress.workId,
          ownerId: progress.ownerId,
          wordsSaved: progress.wordsSaved,
          lastUnitPosition: progress.lastUnitPosition,
        })),
        cards: cards.map((card) => ({
          id: card._id,
          front: card.front,
          translation: card.translation ?? null,
          translationLocale: card.translationLocale ?? null,
          repetitions: card.repetitions,
          sourceWorkId: card.sourceWorkId ?? null,
        })),
        reviewCount: reviews.length,
        studySessionCount: studySessions.length,
        quizAttemptCount: quizAttempts.length,
      },
    };
  },
});
