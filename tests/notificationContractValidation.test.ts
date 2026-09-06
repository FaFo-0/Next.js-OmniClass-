import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationContractIssues,
  type NotifRole,
} from "../convex/lib/notificationRegistry.ts";

const oneTimePayload = {
  teacherId: "teacher-1",
  teacherName: "Aigerim",
  studentId: "student-1",
  studentName: "Zhandos",
  date: "2026-09-06",
  startTime: "11:30",
  lessonId: "lesson-1",
  eventId: "event-1",
  unpaid: true,
};

test("one-time start notification requires its audit payload and intended recipient role", () => {
  assert.deepEqual(
    notificationContractIssues("one_time_lesson_started", oneTimePayload, "admin"),
    []
  );
  assert.deepEqual(
    notificationContractIssues("one_time_lesson_started", oneTimePayload, "teacher"),
    ["recipient role teacher is not allowed"]
  );
  assert.deepEqual(
    notificationContractIssues(
      "one_time_lesson_started",
      { ...oneTimePayload, unpaid: "yes" },
      "admin"
    ),
    ["payload.unpaid must be a boolean"]
  );
  assert.deepEqual(
    notificationContractIssues(
      "one_time_lesson_started",
      { ...oneTimePayload, lessonId: "" },
      "admin"
    ),
    ["payload.lessonId must be a non-empty string"]
  );
});

test("all canonical contracts reject unintended portal recipients", () => {
  const roles: NotifRole[] = ["admin", "teacher", "student"];
  for (const kind of ["teacher_time_off", "salary_paid", "homework_assigned"] as const) {
    for (const role of roles) {
      const issues = notificationContractIssues(kind, {}, role);
      if (issues.some((issue) => issue.startsWith("recipient role"))) {
        assert.match(issueFor(issues), /is not allowed$/);
      }
    }
  }
});

function issueFor(issues: string[]): string {
  return issues.find((issue) => issue.startsWith("recipient role")) ?? "";
}
