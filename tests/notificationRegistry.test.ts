import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_CONTRACTS,
  notificationView,
  notificationDestination,
  telegramMessage,
  type NotifRole,
} from "../convex/lib/notificationRegistry.ts";

// The schema union and `_notify` are derived from NOTIFICATION_KINDS, so this
// list doubles as the drift guard: any kind a producer could ever emit must
// have a contract here.
test("registry covers every notification kind the platform can emit", () => {
  const expected = [
    "session_published",
    "reschedule_request",
    "reschedule_resolved",
    "permission_request",
    "achievement_unlocked",
    "invoice",
    "impersonation",
    "teacher_no_show",
    "makeup_credit_issued",
    "student_assigned",
    "student_unassigned",
    "student_signup",
    "points_granted",
    "points_refunded",
    "booking_reminder",
    "homework_assigned",
    "homework_submitted",
    "homework_reviewed",
    "unscheduled_session",
    "session_reminder",
    "lesson_cancelled",
    "lesson_rescheduled",
    "lesson_assigned",
    "teacher_time_off",
    "lessons_requested",
    "finance_entry_due",
    "salary_paid",
    "payment_received",
    "payment_refunded",
    "payment_failed",
    "one_time_lesson_started",
  ];
  assert.deepEqual([...NOTIFICATION_KINDS].sort(), [...expected].sort());
  assert.equal(Object.keys(NOTIFICATION_CONTRACTS).length, NOTIFICATION_KINDS.length);
});

// Representative payload for every kind — every contract must render a real
// sentence and an icon/tone, never an empty bell row.
const FIXTURES: Record<string, Record<string, unknown>> = {
  lesson_assigned: { by: "teacher", date: "2026-09-10", startTime: "15:00" },
  one_time_lesson_started: {
    teacherName: "Aigerim",
    studentName: "Zhandos",
    date: "2026-09-06",
    startTime: "11:30",
    lessonId: "lesson1",
    eventId: "evt1",
    unpaid: false,
  },
  teacher_time_off: { teacherName: "Aigerim", fromDate: "2026-09-20", toDate: "2026-09-22", days: 3, needsApproval: true },
  lesson_cancelled: { by: "student", date: "2026-09-10", startTime: "15:00", charged: false },
  lesson_rescheduled: { by: "admin", fromDate: "2026-09-10", fromTime: "15:00", toDate: "2026-09-12", toTime: "16:00" },
  session_reminder: { when: "1h", title: "Business English", date: "2026-09-06", startTime: "15:00" },
  teacher_no_show: { title: "Grammar", refunded: true },
  unscheduled_session: { teacherName: "Aigerim", title: "Phrasal verbs" },
  homework_assigned: { title: "Essay: my city", homeworkId: "hw1" },
  homework_submitted: { title: "Essay: my city", lessonId: "lesson1" },
  homework_reviewed: { title: "Essay: my city", homeworkId: "hw1" },
  booking_reminder: { reason: "no_balance", date: "2026-09-12" },
  makeup_credit_issued: {},
  student_assigned: { studentName: "Zhandos" },
  student_unassigned: { studentName: "Zhandos" },
  reschedule_request: { by: "student", date: "2026-09-10" },
  reschedule_resolved: { approved: true },
  permission_request: { reason: "A teacher asked to edit the calendar." },
  session_published: { title: "My first lesson", lessonId: "lesson1" },
  lessons_requested: { studentName: "Zhandos", packName: "10 lessons", lessons: 10, note: "urgent" },
  payment_received: { studentName: "Zhandos", packName: "10 lessons", lessons: 10, balanceAfter: 12 },
  payment_refunded: { orderId: "ord1", amount: 100, currency: "USD", lessons: 8 },
  payment_failed: { message: "Amount mismatch" },
  finance_entry_due: { label: "Internet", period: "September", expectedAmount: 15000, currency: "KZT" },
  salary_paid: { amount: 45000, currency: "KZT", lessons: 10, month: "September" },
  achievement_unlocked: { name: "First lesson" },
  invoice: { reason: "September invoice" },
  impersonation: { reason: "An admin signed in on your behalf." },
  points_granted: { points: 10, reason: "makeup" },
  points_refunded: { reason: "cancelled lesson" },
};

test("every kind renders a non-empty title and body for a representative payload", () => {
  for (const kind of NOTIFICATION_KINDS) {
    const view = notificationView(kind, FIXTURES[kind] ?? {});
    assert.ok(view.title.length > 0, `${kind}: title is empty`);
    assert.ok(view.body.length > 0, `${kind}: body is empty`);
    assert.ok(view.icon.length > 0, `${kind}: icon is empty`);
    assert.ok(["info", "success", "warning", "danger"].includes(view.tone), `${kind}: bad tone`);
  }
});

test("every audience of every kind has a role-aware destination", () => {
  for (const [kind, contract] of Object.entries(NOTIFICATION_CONTRACTS) as [
    string,
    { audiences: NotifRole[]; destination: (p: Record<string, unknown>, r: NotifRole) => string | undefined },
  ][]) {
    for (const role of contract.audiences) {
      const dest = notificationDestination(kind, FIXTURES[kind] ?? {}, undefined, role);
      assert.ok(dest && dest.startsWith("/"), `${kind} (${role}): no destination`);
    }
  }
});

test("a stored link always wins over the registry fallback", () => {
  assert.equal(
    notificationDestination("lesson_assigned", { date: "2026-09-10" }, "/admin/calendar?event=x", "student"),
    "/admin/calendar?event=x"
  );
});

test("one-time lesson start is described as started, not booked", () => {
  const view = notificationView("one_time_lesson_started", FIXTURES.one_time_lesson_started);
  assert.equal(view.title, "One-time lesson started");
  assert.match(view.body, /started a one-time lesson with Zhandos/);
  assert.doesNotMatch(view.body, /booked/i);
});

test("one-time lesson start flags unpaid state for the admin", () => {
  const view = notificationView("one_time_lesson_started", {
    ...FIXTURES.one_time_lesson_started,
    unpaid: true,
  });
  assert.match(view.body, /no lesson credit/i);
});

test("one-time lesson start destination reaches the real lesson for admins", () => {
  assert.equal(
    notificationDestination("one_time_lesson_started", FIXTURES.one_time_lesson_started, undefined, "admin"),
    "/admin/sessions?lesson=lesson1"
  );
});

test("role-blind routing is eliminated: admin vs student destinations differ per kind", () => {
  assert.equal(notificationDestination("payment_received", FIXTURES.payment_received, undefined, "admin"), "/admin/billing");
  assert.equal(notificationDestination("payment_received", FIXTURES.payment_received, undefined, "student"), "/student/billing");
  assert.equal(notificationDestination("teacher_no_show", FIXTURES.teacher_no_show, undefined, "admin"), "/admin/calendar");
  assert.equal(notificationDestination("teacher_no_show", FIXTURES.teacher_no_show, undefined, "student"), "/student/calendar");
  assert.equal(notificationDestination("homework_submitted", FIXTURES.homework_submitted, undefined, "admin"), "/admin/attention");
  assert.equal(
    notificationDestination("homework_submitted", FIXTURES.homework_submitted, undefined, "teacher"),
    "/teacher/sessions/lesson1"
  );
});

test("telegram messages compose a title, body and a button", () => {
  const msg = telegramMessage("one_time_lesson_started", FIXTURES.one_time_lesson_started, undefined, "admin");
  assert.match(msg.text, /🔔 One-time lesson started/);
  assert.match(msg.text, /Aigerim started a one-time lesson with Zhandos/);
  assert.equal(msg.buttonUrl, "/admin/sessions?lesson=lesson1");
});

test("telegram message includes the meeting link when one exists", () => {
  const msg = telegramMessage(
    "session_reminder",
    { title: "Business English", date: "2026-09-06", startTime: "15:00", googleMeetLink: "https://meet.google.com/abc" },
    undefined,
    "student"
  );
  assert.match(msg.text, /Join meeting: https:\/\/meet\.google\.com\/abc/);
  assert.equal(msg.buttonLabel, "Open lesson");
});

test("unknown kinds fall back safely instead of crashing the bell", () => {
  const view = notificationView("made_up_kind", { reason: "legacy row" });
  assert.equal(view.title, "Made up kind");
  assert.equal(view.body, "legacy row");
});