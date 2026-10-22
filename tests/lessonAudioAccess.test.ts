import assert from "node:assert/strict";
import test from "node:test";
import { canPlayLessonAudio } from "../convex/lib/lessonAudioAccess.ts";

const ownLesson = { teacherId: "teacher-1" };

test("the lesson teacher and admins may play the recording", () => {
  assert.equal(canPlayLessonAudio({ role: "teacher", externalId: "teacher-1" }, ownLesson), true);
  assert.equal(canPlayLessonAudio({ role: "admin", externalId: "admin-1" }, ownLesson), true);
});

test("another teacher cannot play it", () => {
  assert.equal(canPlayLessonAudio({ role: "teacher", externalId: "teacher-2" }, ownLesson), false);
});

test("a student never receives lesson audio, not even their own lesson", () => {
  assert.equal(canPlayLessonAudio({ role: "student", externalId: "student-1" }, ownLesson), false);
  assert.equal(
    canPlayLessonAudio({ role: "student", externalId: "teacher-1" }, ownLesson),
    false
  );
});

test("unknown or revoked roles are refused", () => {
  assert.equal(canPlayLessonAudio({ role: "removed", externalId: "teacher-1" }, ownLesson), false);
  assert.equal(canPlayLessonAudio({ role: "", externalId: "teacher-1" }, ownLesson), false);
});
