import assert from "node:assert/strict";
import test from "node:test";
import {
  teacherGenuineNoShowSourceKey,
  teacherLateStartSourceKey,
  teacherNoShowDueLevel,
  teacherNoShowMakeupSourceKey,
  teacherNoShowSourceKey,
  teacherNoShowStage,
} from "../convex/lib/teacherNoShowNotifications.ts";
import { POLICY } from "../convex/lib/policy.ts";
import { sessionStartWindow } from "../src/lib/sessionStart.ts";
import {
  notificationContractIssues,
  notificationView,
  notificationViewForLocale,
  telegramMessage,
} from "../convex/lib/notificationRegistry.ts";

const payload = {
  eventId: "event-1",
  title: "Grammar",
  teacherId: "teacher-1",
  teacherName: "Aigerim",
  studentId: "student-1",
  date: "2026-09-10",
  startTime: "15:00",
  level: 4,
  refunded: 1,
};

const latePayload = {
  ...payload,
  level: 3,
  refunded: 0,
};

test("before the T-10 window the start control is disabled and no late notification is due", () => {
  const startMs = 1_000_000;
  assert.deepEqual(
    sessionStartWindow({ nowMs: startMs - 10 * 60_000 - 1, startMs, lessonMinutes: 60 }),
    { kind: "before", minutesUntil: (10 * 60_000 + 1) / 60_000 }
  );
  assert.equal(
    teacherNoShowStage({ nowMs: startMs - 10 * 60_000 - 1, startMs }),
    "none"
  );
});

test("at the T-10 boundary the start control is enabled for a booked lesson", () => {
  const startMs = 1_000_000;
  assert.equal(
    sessionStartWindow({ nowMs: startMs - 10 * 60_000, startMs, lessonMinutes: 60 }).kind,
    "ready"
  );
  assert.equal(
    teacherNoShowStage({ nowMs: startMs - 10 * 60_000, startMs }),
    "none"
  );
});

test("late-start notification is due once after the current ten-minute ping threshold", () => {
  const startMs = 1_000_000;
  assert.equal(
    teacherNoShowStage({ nowMs: startMs + POLICY.noShowPingMinutes * 60_000, startMs }),
    "late_start"
  );
  assert.equal(teacherLateStartSourceKey("event-1", "admin-1"), teacherNoShowSourceKey("event-1", "admin-1", 3));
});

test("repeated cron scans advance each escalation at most once", () => {
  const startMs = 1_000_000;
  assert.equal(
    teacherNoShowDueLevel({ nowMs: startMs + 10 * 60_000, startMs, notifiedLevels: [] }),
    3
  );
  assert.equal(
    teacherNoShowDueLevel({ nowMs: startMs + 10 * 60_000, startMs, notifiedLevels: [3] }),
    null
  );
  assert.equal(
    teacherNoShowDueLevel({ nowMs: startMs + 20 * 60_000, startMs, notifiedLevels: [3] }),
    4
  );
  assert.equal(
    teacherNoShowDueLevel({ nowMs: startMs + 20 * 60_000, startMs, notifiedLevels: [3, 4] }),
    null
  );
});

test("genuine no-show notification is due once at the policy grace threshold", () => {
  const startMs = 1_000_000;
  assert.equal(POLICY.noShowWaitMinutes, 20);
  assert.equal(
    teacherNoShowStage({ nowMs: startMs + POLICY.noShowWaitMinutes * 60_000, startMs }),
    "genuine_no_show"
  );
  assert.equal(teacherGenuineNoShowSourceKey("event-1", "student-1"), teacherNoShowSourceKey("event-1", "student-1", 4));
});

test("repeated cron scans deduplicate late-start and genuine-no-show events separately", () => {
  const keys = new Set<string>();
  keys.add(teacherLateStartSourceKey("event-1", "admin-1"));
  keys.add(teacherLateStartSourceKey("event-1", "admin-1"));
  keys.add(teacherGenuineNoShowSourceKey("event-1", "admin-1"));
  keys.add(teacherGenuineNoShowSourceKey("event-1", "admin-1"));
  assert.equal(keys.size, 2);
  assert.notEqual(teacherLateStartSourceKey("event-1", "admin-1"), teacherGenuineNoShowSourceKey("event-1", "admin-1"));
});

test("late-start and genuine no-show contracts require the canonical teacher name", () => {
  for (const kind of ["teacher_late_start", "teacher_no_show"] as const) {
    assert.deepEqual(
      notificationContractIssues(kind, { ...latePayload, teacherName: "" }, "admin"),
      ["payload.teacherName must be a non-empty string"]
    );
  }
});

test("canonical teacher name renders in English and every localized delivery path for both escalations", () => {
  for (const [kind, kindPayload, role] of [
    ["teacher_late_start", latePayload, "admin"],
    ["teacher_no_show", payload, "student"],
  ] as const) {
    for (const locale of ["en", "ru", "ar", "kk"] as const) {
      const view = locale === "en"
        ? notificationView(kind, kindPayload)
        : notificationViewForLocale(kind, kindPayload, locale);
      assert.match(view.body, /Aigerim/);

      const telegram = telegramMessage(
        kind,
        kindPayload,
        kind === "teacher_late_start" ? "/admin/calendar" : "/student/calendar",
        role,
        locale
      );
      assert.match(telegram.text, /Aigerim/);
    }
  }
});
test("a repeated scan/retry reuses one durable event-recipient notification key", () => {
  const firstAttempt = teacherNoShowSourceKey("event-1", "student-1", 4);
  const repeatedScan = teacherNoShowSourceKey("event-1", "student-1", 4);
  const durableRows = new Map<string, true>();

  durableRows.set(firstAttempt, true);
  durableRows.set(repeatedScan, true);

  assert.equal(durableRows.size, 1);
});

test("distinct no-show events and ladder levels retain distinct notification keys", () => {
  assert.notEqual(
    teacherNoShowSourceKey("event-1", "admin-1", 4),
    teacherNoShowSourceKey("event-2", "admin-1", 4)
  );
  assert.notEqual(
    teacherNoShowSourceKey("event-1", "admin-1", 4),
    teacherNoShowSourceKey("event-1", "admin-1", 3)
  );
  assert.equal(
    teacherNoShowMakeupSourceKey("event-1", "student-1"),
    teacherNoShowMakeupSourceKey("event-1", "student-1")
  );
  assert.notEqual(
    teacherNoShowSourceKey("event-1", "student-1", 4),
    teacherNoShowMakeupSourceKey("event-1", "student-1")
  );
});

test("teacher no-show payload requires the canonical teacher display name", () => {
  assert.deepEqual(
    notificationContractIssues(
      "teacher_no_show",
      { ...payload, teacherName: "" },
      "student"
    ),
    ["payload.teacherName must be a non-empty string"]
  );
});

test("canonical teacher name renders in English and every localized delivery path", () => {
  for (const locale of ["en", "ru", "ar", "kk"] as const) {
    const view = locale === "en"
      ? notificationView("teacher_no_show", payload)
      : notificationViewForLocale("teacher_no_show", payload, locale);
    assert.match(view.body, /Aigerim/);

    const telegram = telegramMessage(
      "teacher_no_show",
      payload,
      "/student/calendar",
      "student",
      locale
    );
    assert.match(telegram.text, /Aigerim/);
  }
});
