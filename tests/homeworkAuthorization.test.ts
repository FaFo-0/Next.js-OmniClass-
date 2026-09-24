import test from "node:test";
import assert from "node:assert/strict";
import {
  canCreateHomeworkForLesson,
  canGenerateHomework,
  shouldAssignApprovedHomework,
  studentsMatch,
} from "../convex/lib/homeworkAuthorization.ts";

const lesson = {
  organizationId: "org-a",
  teacherId: "teacher-a",
  studentId: "student-a",
};

const homework = {
  organizationId: "org-a",
  teacherId: "teacher-a",
  studentId: "student-a",
};

test("lesson homework boundary rejects a wrong student and a cross-tenant lesson", () => {
  const owner = { organizationId: "org-a", externalId: "teacher-a", role: "teacher" as const };
  const admin = { organizationId: "org-a", externalId: "admin-a", role: "admin" as const };

  assert.equal(canCreateHomeworkForLesson(owner, lesson, lesson.studentId), true);
  assert.equal(canCreateHomeworkForLesson(admin, lesson, lesson.studentId), true);
  assert.equal(studentsMatch("student-b", lesson.studentId), false);
  assert.equal(canCreateHomeworkForLesson(owner, lesson, "student-b"), false);
  assert.equal(shouldAssignApprovedHomework("student-b", lesson.studentId), false);
  assert.equal(
    canCreateHomeworkForLesson({ ...owner, organizationId: "org-b" }, lesson, lesson.studentId),
    false,
  );
});

test("generation preserves owning-teacher and admin authorization without crossing tenants", () => {
  const owner = { organizationId: "org-a", externalId: "teacher-a", role: "teacher" as const };
  const admin = { organizationId: "org-a", externalId: "admin-a", role: "admin" as const };
  const otherTeacher = { organizationId: "org-a", externalId: "teacher-b", role: "teacher" as const };

  assert.equal(canGenerateHomework(owner, homework, lesson), true);
  assert.equal(canGenerateHomework(admin, homework, lesson), true);
  assert.equal(canGenerateHomework(otherTeacher, homework, lesson), false);
  assert.equal(canGenerateHomework({ ...admin, organizationId: "org-b" }, homework, lesson), false);
  assert.equal(canGenerateHomework(owner, { ...homework, studentId: "student-b" }, lesson), true);
});