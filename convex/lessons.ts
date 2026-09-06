// Lessons — org-scoped CRUD + transcript ops + status transitions +
// soft delete/restore + no-show flagging.
//
// Lesson lifecycle: scheduled → recording → transcribed → review →
// published. No-show terminal states: no_show_student / no_show_teacher.

import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  requireTenant,
  requireTenantPermission,
  tenantTable,
} from "./lib/tenant";
import { requireLessonOwnerOrAdmin } from "./lib/lessonAccess";
import type { Doc, Id } from "./_generated/dataModel";
import { instantToZoned, timeToMin, minToTime, wallTimeToMs } from "./lib/time";
import { grantPointsInternal, spendPointsInternal } from "./points";
import { evaluateAchievements } from "./achievements";
import { assignApprovedForLesson, reopenForLesson } from "./homework";
import { upsertSavedVocabulary } from "./lib/vocabulary";
import { normalizeLexeme } from "./lib/vocabularyIdentity";
import { userHasPermission } from "./lib/permissions";
import {
  ACTIVE_STATUSES,
  bufferConflict,
  loadTeacherEvents,
} from "./calendar";
import { DEFAULT_ACTIVITY_TYPES } from "./tenantSettings";
import { isStartCreatedEvent } from "./lib/lessonLifecycle";

const NOW = () => new Date().toISOString();

// Event statuses a lesson can no longer transition out of — starting or
// re-marking one of these is a bug, so mutations guard against it.
const TERMINAL_EVENT_STATUSES = [
  "completed",
  "cancelled",
  "no_show_student",
  "no_show_teacher",
];

const lessonStatus = v.union(
  v.literal("scheduled"),
  v.literal("recording"),
  v.literal("transcribed"),
  v.literal("review"),
  v.literal("published"),
  v.literal("no_show_student"),
  v.literal("no_show_teacher")
);

const contentSectionStatus = v.union(
  v.literal("pending"),
  v.literal("generating"),
  v.literal("review"),
  v.literal("approved")
);

const transcriptUtterance = v.object({
  utteranceId: v.string(),
  text: v.string(),
  speaker: v.optional(v.string()),
  startMs: v.optional(v.number()),
  endMs: v.optional(v.number()),
});

// ── Queries ──────────────────────────────────────────────────────

/** All lessons for the active org (admin view; non-deleted only). */
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.view.any");
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/** Soft-deleted lessons (admin restore queue). */
export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.view.any");
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows.filter((r) => r.isDeleted);
  },
});

/** Lessons taught by the calling teacher. */
export const listForTeacher = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = teacherId ?? user.externalId;
    if (target !== user.externalId && !userHasPermission(user, "lessons.view.any")) {
      throw new Error("Access denied: cannot list another teacher's lessons");
    }
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/** Published lessons visible to a student. */
export const listPublishedForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    if (target !== user.externalId && !userHasPermission(user, "lessons.view.any")) {
      throw new Error("Access denied: cannot list another student's lessons");
    }
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_studentId_and_status", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("studentId", target)
          .eq("status", "published")
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

export const get = query({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId || row.isDeleted) return null;
    const isParticipant =
      row.teacherId === user.externalId || row.studentId === user.externalId;
    if (!isParticipant && !userHasPermission(user, "lessons.view.any")) {
      return null;
    }
    return row;
  },
});

/** Final, addressable evidence for the transcript vocabulary review screen. */
export const listTranscriptUtterances = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId || lesson.isDeleted) return [];

    // Raw transcript evidence is more sensitive than the lesson title. Only
    // the assigned teacher/student or staff with broad lesson access may read it.
    const isParticipant =
      lesson.teacherId === user.externalId || lesson.studentId === user.externalId;
    if (!isParticipant && !userHasPermission(user, "lessons.view.any")) {
      throw new Error("Access denied: lesson transcript is private");
    }

    return await ctx.db
      .query("lessonTranscriptUtterances")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────

/** Teacher starts a session — creates an empty lesson row. */
export const create = mutation({
  args: {
    studentId: v.string(),
    title: v.string(),
    scheduledFor: v.optional(v.string()),
    recordingMode: v.optional(v.union(v.literal("live"), v.literal("upload"))),
    scheduleEventId: v.optional(v.id("scheduleEvents")),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "lessons.create");
    const now = new Date().toISOString();

    const finalScheduleEventId = args.scheduleEventId;

    // Pre-fill from linked schedule event
    let title = args.title;
    let studentId = args.studentId;
    if (args.scheduleEventId) {
      const evt = await ctx.db.get(args.scheduleEventId);
      if (evt && evt.organizationId === orgId) {
        // Can't start a lesson that already concluded — done, cancelled, or
        // marked no-show. This is what blocked "start after no-show".
        if (TERMINAL_EVENT_STATUSES.includes(evt.status)) {
          throw new Error(
            `This lesson is already ${evt.status.replace("no_show_", "no-show (")}${evt.status.startsWith("no_show") ? ")" : ""} — it can't be started.`
          );
        }
        // A lesson can't be started long after it should have ended —
        // otherwise a missed lesson gets a retroactive recording instead of
        // being resolved honestly as a no-show (which is what actually
        // happened). Generous window: the lesson's length plus 30 minutes.
        const settingsForWindow = await ctx.db
          .query("tenantSettings")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
          .unique();
        const startMs = wallTimeToMs(
          evt.date,
          evt.startTime,
          settingsForWindow?.timezone ?? "UTC"
        );
        if (!Number.isNaN(startMs)) {
          const lessonMins =
            settingsForWindow?.defaultLessonDurationMinutes ?? 60;
          const minsSinceStart = (Date.now() - startMs) / 60_000;
          if (minsSinceStart > lessonMins + 30) {
            throw new ConvexError(
              "This lesson's time has passed — mark it as a no-show instead of starting it."
            );
          }
        }
        if (!args.title || args.title === "") title = evt.title ?? args.title;
        if (!args.studentId || args.studentId === "") studentId = evt.studentId ?? args.studentId;
        // Stamp teacherStartedAt to prevent no-show cron
        await ctx.db.patch(args.scheduleEventId, { teacherStartedAt: now });
      }
    } else {
      // Deliberately not supported any more. Starting a live session with no
      // booked event used to create a fabricated event here (and previously in
      // a separate calendar mutation) which could drift, double-charge, and
      // send the wrong "Lesson booked" notification. The one atomic entry
      // point for that flow is lessons.startOneTime.
      throw new ConvexError(
        "An unscheduled live session must be started with lessons.startOneTime"
      );
    }

    // Order = count of existing lessons for this student + 1
    const existing = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", studentId)
      )
      .collect();
    const order = existing.length + 1;

    const externalId = `lesson-${orgId}-${Date.now()}`;

    return await ctx.db.insert("lessons", {
      organizationId: orgId,
      externalId,
      teacherId: user.externalId,
      studentId,
      title,
      status: "recording",
      transcript: "",
      summary: "",
      contentStatus: {
        summary: "pending",
        vocabulary: "pending",
        flashcards: "pending",
        quiz: "pending",
      },
      durationSeconds: 0,
      order,
      scheduledFor: args.scheduledFor,
      recordingMode: args.recordingMode ?? "live",
      scheduleEventId: finalScheduleEventId,
      createdAt: now,
    });
  },
});

/**
 * Start a LIVE one-time lesson with a student right now. One atomic mutation:
 *
 *  1. mints the dated calendar event (provenance `one_time_start`, so the
 *     event's own discard can un-create exactly this, never a real booking),
 *  2. charges the student when they have credit (unpaid flag otherwise),
 *  3. creates the recording lesson,
 *  4. notifies admins AND the student that a one-time lesson started — with
 *     concrete IDs, so the bell/Telegram deep-link to the exact lesson.
 *
 * Previously this was two separate mutations (calendar.createOneTimeLesson
 * then lessons.create) which could drift apart, double-charge on retry, and
 * emit the wrong "Lesson booked" notification.
 *
 * `requestId` makes retries idempotent: a repeated call with the same id
 * returns the existing lesson instead of minting duplicates.
 */
export const startOneTime = mutation({
  args: {
    studentId: v.string(),
    title: v.string(),
    requestId: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    overrideBuffer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "lessons.create");
    const now = NOW();

    // Idempotent retries — the whole operation (event + spend + lesson +
    // notifications) must not replicate when the client retries mid-network.
    const idemKey =
      args.requestId?.trim() ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lessonExternalId = `lesson-ot-${orgId}-${idemKey}`;
    const retried = await ctx.db
      .query("lessons")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .filter((q) => q.eq(q.field("externalId"), lessonExternalId))
      .unique();
    if (retried) {
      const evt = retried.scheduleEventId
        ? await ctx.db.get(retried.scheduleEventId)
        : null;
      return {
        lessonId: retried._id,
        eventId: retried.scheduleEventId as Id<"scheduleEvents">,
        unpaid: evt?.unpaid === true,
      };
    }

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", args.studentId)
      )
      .unique();
    if (!student || student.role !== "student") {
      throw new ConvexError("Student not found");
    }

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const orgTz = settings?.timezone ?? "UTC";
    const duration =
      args.durationMinutes ?? settings?.defaultLessonDurationMinutes ?? 60;
    if (duration <= 0 || duration > 24 * 60) {
      throw new ConvexError("Invalid duration");
    }

    // Wall-clock in the academy's zone — never the server's — rounded down to
    // 5 minutes so the grid stays readable (same convention as before).
    const wall = instantToZoned(new Date(), orgTz);
    const startMin = Math.floor(timeToMin(wall.time) / 5) * 5;
    const startTime = minToTime(startMin);
    if (startMin + duration > 24 * 60) {
      throw new ConvexError(
        "A one-time lesson cannot cross midnight — start it again after midnight."
      );
    }
    const endTime = minToTime(startMin + duration);

    // Neither party double-booked; the rest-break is the same soft warn.
    const bufferMinutes = settings?.bufferMinutes ?? 10;
    const teacherDay = await loadTeacherEvents(
      ctx,
      orgId,
      user.externalId,
      wall.date,
      wall.date
    );
    const hit = bufferConflict(
      teacherDay,
      wall.date,
      startMin,
      startMin + duration,
      bufferMinutes
    );
    if (hit?.kind === "overlap") {
      throw new ConvexError(
        `That overlaps the ${hit.startTime}–${hit.endTime} lesson`
      );
    }
    if (hit?.kind === "buffer" && !args.overrideBuffer) {
      throw new ConvexError(
        `BUFFER:${hit.startTime}:${bufferMinutes}:Within ${bufferMinutes} min of the ${hit.startTime}–${hit.endTime} lesson`
      );
    }
    const studentDay = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", args.studentId)
      )
      .collect();
    for (const e of studentDay) {
      if (e.isDeleted || e.date !== wall.date) continue;
      if (!ACTIVE_STATUSES.includes(e.status)) continue;
      if (timeToMin(e.startTime) < startMin + duration && startMin < timeToMin(e.endTime)) {
        throw new ConvexError(`The student already has a lesson at ${e.startTime}`);
      }
    }

    const types = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
    const activity =
      types.find((a) => a.isActive && !a.isGroup) ?? types.find((a) => !a.isGroup);
    if (!activity) throw new ConvexError("No 1-on-1 activity type configured");

    const meetLink = user.meetLink;

    // Can the student pay for it? Checked before insert so we can stamp the flag.
    const today = now.slice(0, 10);
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", args.studentId)
      )
      .collect();
    let balance = 0;
    for (const g of grants) {
      if (g.isExpired || g.expiresAt < today || g.remainingPoints <= 0) continue;
      balance += g.remainingPoints;
    }
    const canPay = balance >= activity.pointCost;

    const eventId = await ctx.db.insert("scheduleEvents", {
      organizationId: orgId,
      externalId: `evt-ot-${orgId}-${idemKey}`,
      type: "1on1",
      teacherId: user.externalId,
      studentId: args.studentId,
      title: args.title || activity.name,
      date: wall.date,
      startTime,
      endTime,
      status: "scheduled",
      activityTypeId: activity.id,
      pointCostSnapshot: activity.pointCost,
      googleMeetLink: meetLink,
      adHoc: true,
      adHocSource: "one_time_start",
      unpaid: !canPay,
      teacherStartedAt: now,
      createdAt: now,
    });

    if (canPay) {
      await spendPointsInternal(ctx, {
        orgId,
        studentId: args.studentId,
        amount: activity.pointCost,
        scheduleEventId: eventId,
        reason: `One-time ${activity.name} started ${wall.date} ${startTime}`,
        performedBy: user.externalId,
      });
    }

    // Order = count of existing lessons for this student + 1
    const existing = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", args.studentId)
      )
      .collect();
    const order = existing.length + 1;

    const lessonId = await ctx.db.insert("lessons", {
      organizationId: orgId,
      externalId: lessonExternalId,
      teacherId: user.externalId,
      studentId: args.studentId,
      title: args.title || "One-time lesson",
      status: "recording",
      transcript: "",
      summary: "",
      contentStatus: {
        summary: "pending",
        vocabulary: "pending",
        flashcards: "pending",
        quiz: "pending",
      },
      durationSeconds: 0,
      order,
      scheduledFor: `${wall.date}T${startTime}`,
      recordingMode: "live",
      scheduleEventId: eventId,
      createdAt: now,
    });

    const payload = {
      teacherId: user.externalId,
      teacherName: user.name,
      studentId: args.studentId,
      studentName: student.name,
      date: wall.date,
      startTime,
      lessonId,
      eventId,
      unpaid: !canPay,
      googleMeetLink: meetLink ?? undefined,
    };

    // The academy always hears about it; unpaid state is called out.
    const admins = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "admin")
      )
      .collect();
    // A legacy data repair can leave duplicate admin rows for the same
    // external identity. Notifications are per recipient, not per user row;
    // dedupe here so one start cannot produce duplicate bell/Telegram cards.
    const adminRecipientIds = [...new Set(admins.map((admin) => admin.externalId))];
    for (const recipientId of adminRecipientIds) {
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId,
        kind: "one_time_lesson_started",
        payload,
        link: `/admin/sessions?lesson=${lessonId}`,
      });
    }

    // The student hears about it truthfully — a lesson started, not booked.
    await ctx.runMutation(internal.notifications._notify, {
      organizationId: orgId,
      recipientId: args.studentId,
      kind: "one_time_lesson_started",
      payload,
      link: "/student/calendar",
    });

    return { lessonId, eventId, unpaid: !canPay };
  },
});

/** Append a chunk of transcript text to the live lesson. Idempotent
 * append used during the recording session. */
export const appendTranscript = mutation({
  args: {
    id: v.id("lessons"),
    text: v.string(),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { id, text, durationSeconds }) => {
    const { lesson, lessons: t } = await requireLessonOwnerOrAdmin(ctx, id);
    await t.patch(id, {
      transcript: lesson.transcript + text,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    });
  },
});

/**
 * Stop & Save — finalize transcription, advance to "transcribed", and persist
 * addressable utterances when the recorder provides them. The readable transcript
 * remains for compatibility; the utterance rows are the durable vocabulary source.
 */
export const finalizeTranscript = mutation({
  args: {
    id: v.id("lessons"),
    transcript: v.string(),
    durationSeconds: v.number(),
    utterances: v.optional(v.array(transcriptUtterance)),
  },
  handler: async (ctx, { id, transcript, durationSeconds, utterances }) => {
    const { orgId, lesson, lessons: t } = await requireLessonOwnerOrAdmin(ctx, id);

    const patch: {
      transcript: string;
      durationSeconds: number;
      status: "transcribed";
      transcriptVersion?: number;
    } = { transcript, durationSeconds, status: "transcribed" };

    if (utterances !== undefined) {
      const nonEmpty = utterances.filter((u) => u.text.trim().length > 0);
      const ids = new Set(nonEmpty.map((u) => u.utteranceId));
      if (ids.size !== nonEmpty.length) {
        throw new Error("Transcript utterance IDs must be unique");
      }
      const transcriptVersion = (lesson.transcriptVersion ?? 0) + 1;
      const existing = await ctx.db
        .query("lessonTranscriptUtterances")
        .withIndex("by_lessonId", (q) => q.eq("lessonId", id))
        .collect();
      for (const row of existing) await ctx.db.delete(row._id);
      for (const utterance of nonEmpty) {
        await ctx.db.insert("lessonTranscriptUtterances", {
          organizationId: orgId,
          lessonId: id,
          utteranceId: utterance.utteranceId,
          transcriptVersion,
          text: utterance.text,
          speaker: utterance.speaker,
          startMs: utterance.startMs,
          endMs: utterance.endMs,
          createdAt: new Date().toISOString(),
        });
      }
      patch.transcriptVersion = transcriptVersion;
    }

    await t.patch(id, patch);
  },
});

/** Manual edits to the lesson summary / title from the review page. */
export const updateContent = mutation({
  args: {
    id: v.id("lessons"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    contentStatusPatch: v.optional(
      v.object({
        summary: v.optional(contentSectionStatus),
        vocabulary: v.optional(contentSectionStatus),
        flashcards: v.optional(contentSectionStatus),
        quiz: v.optional(contentSectionStatus),
      })
    ),
  },
  handler: async (ctx, { id, title, summary, contentStatusPatch }) => {
    const { lesson, lessons: t } = await requireLessonOwnerOrAdmin(ctx, id);
    const patch: {
      title?: string;
      summary?: string;
      contentStatus?: Doc<"lessons">["contentStatus"];
    } = {};
    if (title !== undefined) patch.title = title;
    if (summary !== undefined) patch.summary = summary;
    if (contentStatusPatch) {
      patch.contentStatus = {
        ...lesson.contentStatus,
        ...contentStatusPatch,
      };
    }
    await t.patch(id, patch);
  },
});

/** Publish lesson to student. Converges approved vocab into "My Words". */
export const publish = mutation({
  args: { id: v.id("lessons"), status: v.optional(lessonStatus) },
  handler: async (ctx, { id, status }) => {
    const { orgId, lesson, lessons: t } = await requireLessonOwnerOrAdmin(ctx, id);
    const now = new Date().toISOString();
    await t.patch(id, {
      status: status ?? "published",
      publishedAt: now,
    });

    // Publishing means the lesson happened — mark its calendar event Done so
    // the schedule stops showing it as an open "scheduled" slot. Only flip a
    // still-live event; never override a cancelled/no-show terminal state.
    if (lesson.scheduleEventId) {
      const evt = await ctx.db.get(lesson.scheduleEventId);
      if (
        evt &&
        evt.organizationId === orgId &&
        (evt.status === "scheduled" || evt.status === "makeup")
      ) {
        await ctx.db.patch(lesson.scheduleEventId, {
          status: "completed",
          completedAt: now,
        });
        // A completed lesson can be the one that crosses an achievement.
        await evaluateAchievements(ctx, orgId, lesson.studentId);
      }
    }

    // Approved homework travels with the lesson — one Publish sends the
    // summary, the vocabulary and the worksheet together.
    await assignApprovedForLesson(ctx, orgId, id as Id<"lessons">, lesson.studentId);

    // Converge approved lesson vocabulary into the student's one "My Words"
    // deck. Each entry becomes (or extends) a sense-aware learner item with the
    // lesson recorded as a `live_lesson` occurrence. Re-publishing reconciles by
    // identity — it never deletes and recreates cards, so a teacher's later edit
    // preserves the student's review history, intervals, and due dates.
    const vocabItems = await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", id))
      .collect();
    for (const v of vocabItems) {
      // Teachers may keep a candidate visible for reference but exclude it from
      // the student’s My Words. Legacy rows have no flag and remain included.
      if (v.included === false) continue;
      await upsertSavedVocabulary(ctx, orgId, lesson.studentId, {
        lexeme: {
          surface: v.word,
          lemma: v.lemma ?? v.word,
          language: "en",
          partOfSpeech: v.partOfSpeech,
        },
        sense: {
          // A wording correction to the definition should update the same
          // learner-owned sense, not create a second review card.
          senseId: v.senseId ?? normalizeLexeme(v.definition || v.word),
          definition: v.definition ?? "",
        },
        translation: v.translation,
        translationLocale: v.translationLocale,
        occurrence: {
          sourceType: "live_lesson",
          sourceId: lesson.externalId,
          unitId: v.utteranceId,
          sentence: v.exampleSentence ?? v.word,
          range: { start: v.sourceStartMs, end: v.sourceEndMs },
          speaker: v.sourceSpeaker,
          transcriptVersion: v.sourceTranscriptVersion,
        },
        addedBy: "system",
        sourceLessonId: id as Id<"lessons">,
      });
    }
  },
});

/** Reopen a published lesson back to review state. */
export const reopen = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    await t.patch(id, { status: "review" });
    // Editing a reopened lesson has to include its homework — otherwise the
    // worksheet is frozen while everything around it is editable again.
    await reopenForLesson(ctx, orgId, id);
  },
});

/** Soft delete (teacher/admin). Hard delete reserved for CLI. */
export const softDelete = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    await t.softDelete(id, user.externalId);
  },
});

/**
 * Discard a lesson the teacher started by mistake — an "un-start", not a
 * cancellation.
 *
 * The credit is spent when the STUDENT BOOKS (or when the start-now flow
 * mints its own event), never when a booked lesson is started, and the usual
 * mistake is starting too early. So discarding must leave a real booking
 * completely intact: the calendar keeps the lesson, the credit stays where it
 * is, and the teacher can start again at the right time. Only the recording
 * attempt goes away (`teacherStartedAt` cleared so the no-show cron re-arms).
 *
 * The one exception is a session started from scratch ("Start session" with no
 * scheduled lesson): `startOneTime` minted the event with durable provenance
 * (`adHocSource: "one_time_start"`), so a quick discard removes exactly that
 * phantom event, reverses the exact spend transaction once, and withdraws the
 * "one-time lesson started" notifications so neither the bell nor Telegram
 * announces a lesson that never happened. Removing a real, booked lesson stays
 * a calendar Cancel, which applies the cancellation policy.
 */
export const discard = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "lessons.edit");
    const lesson = await ctx.db.get(id);
    if (!lesson || lesson.organizationId !== orgId) {
      throw new ConvexError("Lesson not found");
    }
    if (lesson.status === "published") {
      throw new ConvexError(
        "This lesson is already published — reopen it before discarding."
      );
    }

    const t = tenantTable(ctx, orgId, "lessons");
    await t.softDelete(id, user.externalId);

    let removedEvent = false;
    let refunded = 0;

    if (lesson.scheduleEventId) {
      const evt = await ctx.db.get(lesson.scheduleEventId);
      if (evt && evt.organizationId === orgId) {
        // Durable provenance: only events minted BY the atomic start-now flow
        // are un-created on discard. Everything else — booked events, one-time
        // bookings placed on the calendar via createOneTimeLesson — is a real
        // occurrence and survives. Legacy ad-hoc rows (created before
        // adHocSource existed) keep the old near-creation-time heuristic so
        // genuinely misplaced starts from that era can still be undone.
        const startCreated = isStartCreatedEvent(evt, lesson.createdAt);

        if (startCreated) {
          removedEvent = true;

          // Refund exactly once, like the calendar cancellation path: only if
          // a spend transaction exists for this event and no refund has been
          // issued yet. Repeating the discard therefore cannot double-refund.
          if (evt.studentId) {
            const txs = await ctx.db
              .query("pointTransactions")
              .withIndex("by_organization_and_studentId", (q) =>
                q.eq("organizationId", orgId).eq("studentId", evt.studentId!)
              )
              .collect();
            const spend = txs.find(
              (tx) =>
                tx.scheduleEventId === evt._id && tx.type === "spend"
            );
            const alreadyRefunded = txs.some(
              (tx) =>
                tx.scheduleEventId === evt._id &&
                // Historical refunds created through grantPointsInternal are
                // stored as positive `grant` transactions; newer payment
                // refunds use the explicit `refund` type. Recognize both so
                // discard remains exactly-once across old and new rows.
                (tx.type === "refund" ||
                  (tx.type === "grant" &&
                    (tx.reason ?? "").startsWith("Refund — one-time lesson on ")))
            );
            if (spend && !alreadyRefunded) {
              await grantPointsInternal(ctx, {
                orgId,
                studentId: evt.studentId,
                points: Math.abs(spend.amount),
                source: "refund",
                performedBy: user.externalId,
                notes: `Refund — one-time lesson on ${evt.date} ${evt.startTime} was started by mistake and discarded`,
                scheduleEventId: evt._id,
              });
              refunded = Math.abs(spend.amount);
            }
          }

          await ctx.db.patch(lesson.scheduleEventId, {
            isDeleted: true,
            deletedAt: NOW(),
          });

          // Withdraw the notifications this start produced so a discarded
          // misclick is never announced in the bell or delivered by Telegram.
          const produced = await ctx.db
            .query("notifications")
            .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
            .filter((q) => q.eq(q.field("kind"), "one_time_lesson_started"))
            .collect();
          const withdrawnAt = NOW();
          for (const n of produced) {
            const p = (n.payload ?? {}) as {
              eventId?: string;
              lessonId?: string;
            };
            if (
              (p.eventId === evt._id || p.lessonId === lesson._id) &&
              !n.withdrawnAt
            ) {
              await ctx.db.patch(n._id, { withdrawnAt });
            }
          }
        } else {
          // Real booking: keep it exactly as it was, just un-start it so the
          // teacher can start again (and the no-show cron re-arms).
          await ctx.db.patch(lesson.scheduleEventId, {
            teacherStartedAt: undefined,
          });
        }
      }
    }

    return { removedEvent, refunded };
  },
});

/** Restore from trash (admin only). */
export const restore = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.restore");
    const t = tenantTable(ctx, orgId, "lessons");
    await t.restore(id);
  },
});

/** Mark a no-show. If teacher no-show + tenantSettings says no-shows
 * consume credits, decrement the student package. */
export const markNoShow = mutation({
  args: {
    id: v.id("lessons"),
    by: v.union(v.literal("student"), v.literal("teacher")),
  },
  handler: async (ctx, { id, by }) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "lessons.mark_no_show"
    );
    const t = tenantTable(ctx, orgId, "lessons");
    const lesson = await t.get(id);
    if (!lesson) throw new Error("Lesson not found");

    const now = new Date().toISOString();
    const eventStatus = by === "student" ? "no_show_student" : "no_show_teacher";

    await t.patch(id, { status: eventStatus });

    // Propagate to the calendar event so the schedule reflects it, and apply
    // the POLICY §5 economy:
    //   • student no-show → credit stays charged (spent at booking), teacher
    //     is paid; status update only.
    //   • teacher no-show → refund the student's credit (once), reliability
    //     hit derives from the audit fields.
    if (lesson.scheduleEventId) {
      const evt = await ctx.db.get(lesson.scheduleEventId);
      if (evt && evt.organizationId === orgId) {
        if (TERMINAL_EVENT_STATUSES.includes(evt.status)) {
          throw new Error(
            `This lesson already concluded (${evt.status}) — can't mark no-show.`
          );
        }
        await ctx.db.patch(lesson.scheduleEventId, {
          status: eventStatus,
          cancelledBy: by, // reliability metric reads this + the timestamp
          cancelledAt: now,
        });

        if (by === "teacher" && evt.studentId && (evt.pointCostSnapshot ?? 0) > 0) {
          // Guard double-refund: the no-show cron may also refund this event.
          const existingRefund = await ctx.db
            .query("pointTransactions")
            .withIndex("by_organization_and_studentId", (q) =>
              q.eq("organizationId", orgId).eq("studentId", evt.studentId!)
            )
            .collect();
          const alreadyRefunded = existingRefund.some(
            (tx) =>
              tx.scheduleEventId === lesson.scheduleEventId &&
              tx.type === "grant" &&
              tx.amount > 0 &&
              (tx.reason ?? "").toLowerCase().includes("no-show")
          );
          if (!alreadyRefunded) {
            await grantPointsInternal(ctx, {
              orgId,
              studentId: evt.studentId,
              points: evt.pointCostSnapshot!,
              source: "refund",
              performedBy: user.externalId,
              notes: `Teacher no-show — refund for event ${lesson.scheduleEventId}`,
              scheduleEventId: lesson.scheduleEventId,
            });
            await ctx.runMutation(internal.notifications._notify, {
              organizationId: orgId,
              recipientId: evt.studentId,
              kind: "teacher_no_show",
              payload: {
                eventId: lesson.scheduleEventId,
                title: evt.title,
                refunded: evt.pointCostSnapshot ?? 0,
              },
            });
          }
        }
      }
    }
  },
});

/** Save teacher notes for the live lesson. */
export const saveTeacherNotes = mutation({
  args: {
    id: v.id("lessons"),
    teacherNotes: v.string(),
  },
  handler: async (ctx, { id, teacherNotes }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const t = tenantTable(ctx, orgId, "lessons");
    await t.patch(id, { teacherNotes });
  },
});

/**
 * The student's own lesson history — what actually happened, not what got
 * published. Attendance lives on `scheduleEvents`; published notes are an
 * optional extra that only some lessons have, so the history is built from
 * events and notes are attached where they exist.
 */
export const myLessonHistory = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);

    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .collect();

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .collect();

    // Only published notes are the student's to read.
    const notesByEvent = new Map<string, { _id: string; title: string }>();
    for (const l of lessons) {
      if (l.isDeleted || l.status !== "published" || !l.scheduleEventId) continue;
      notesByEvent.set(l.scheduleEventId, { _id: l._id, title: l.title });
    }

    const teacherIds = [...new Set(events.map((e) => e.teacherId).filter(Boolean))];
    const teacherNames = new Map<string, string>();
    for (const tid of teacherIds) {
      const t = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", tid!)
        )
        .unique();
      if (t) teacherNames.set(tid!, t.name);
    }

    return events
      .filter((e) => !e.isDeleted && e.type !== "placeholder")
      .sort((a, b) =>
        `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`)
      )
      .map((e) => ({
        _id: e._id,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        status: e.status,
        title: e.title,
        teacherName: e.teacherId ? (teacherNames.get(e.teacherId) ?? null) : null,
        notes: notesByEvent.get(e._id) ?? null,
      }));
  },
});
