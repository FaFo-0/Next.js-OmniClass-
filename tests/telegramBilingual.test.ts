import test from "node:test";
import assert from "node:assert/strict";
import { telegramMessage } from "../convex/lib/notificationRegistry.ts";

test("Arabic Telegram notifications put Arabic before English and retain the meeting link", () => {
  const message = telegramMessage(
    "session_reminder",
    {
      title: "English conversation",
      date: "2026-09-08",
      startTime: "18:30",
      googleMeetLink: "https://meet.google.com/example",
      when: "1h",
    },
    "/student/calendar?event=event_123",
    "student",
    "ar"
  );

  assert.match(message.text, /درس/);
  assert.match(message.text, /Lesson starting soon/);
  assert.ok(message.text.indexOf("درس") < message.text.indexOf("Lesson starting soon"));
  assert.equal((message.text.match(/https:\/\/meet\.google\.com\/example/g) ?? []).length, 1);
  assert.equal(message.buttonUrl, "/student/calendar?event=event_123");
});

test("Russian homework notifications put Russian before English", () => {
  const message = telegramMessage(
    "homework_assigned",
    { title: "Read chapter 2", homeworkId: "hw_123" },
    undefined,
    "student",
    "ru"
  );

  assert.match(message.text, /Новое домашнее задание/);
  assert.match(message.text, /New homework/);
  assert.ok(message.text.indexOf("Новое домашнее задание") < message.text.indexOf("New homework"));
  assert.equal(message.buttonUrl, "/student/homework/hw_123");
});

test("English and missing locale remain English-only", () => {
  for (const locale of ["en", undefined] as const) {
    const message = telegramMessage("homework_assigned", { title: "Practice" }, undefined, "student", locale);
    assert.doesNotMatch(message.text, /Новое домашнее задание|Новое домашнее задание/);
    assert.match(message.text, /New homework/);
  }
});
