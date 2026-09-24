import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync("src/app/student/profile/page.tsx", "utf8");
const account = readFileSync("src/components/shared/AccountCard.tsx", "utf8");
const http = readFileSync("convex/http.ts", "utf8");
const icsInternal = readFileSync("convex/icsInternal.ts", "utf8");
const users = readFileSync("convex/users.ts", "utf8");
const calendar = readFileSync("src/app/student/calendar/page.tsx", "utf8");
const weeklyCalendar = readFileSync("src/components/calendar/WeeklyCalendar.tsx", "utf8");

test("calendar export distinguishes a live feed from an .ics snapshot", () => {
  for (const key of [
    "calendarSubReadOnly",
    "calendarSubGoogle",
    "calendarSubApple",
    "calendarSubSnapshot",
  ]) {
    assert.match(profile, new RegExp(`t\\(\\"${key}\\"`));
  }
  assert.match(profile, /const url = `\$\{origin\}\/ics\?token=\$\{token\}`/);
  assert.match(profile, /calendar\.google\.com\/calendar\/u\/0\/r\/settings\/addbyurl/);
  assert.match(profile, /href=\{`\$\{icsUrl\}&download=1`\}/);
  assert.match(profile, /data-testid="calendar-live-feed-actions"/);
  assert.match(profile, /download="omniclass-lessons\.ics"/);
  assert.match(http, /Cache-Control": "private, no-store/);
  assert.match(http, /Content-Disposition/);
  assert.match(icsInternal, /withIndex\("by_icsToken"/);
  assert.match(icsInternal, /by_organization_and_studentId/);
  assert.match(users, /crypto\.getRandomValues/);
});

test("profile photo stays Clerk-managed with a shared avatar fallback", () => {
  assert.match(profile, /ProfileAvatar/);
  assert.match(profile, /clerkUser\?\.imageUrl/);
  assert.match(profile, /data-testid="profile-photo-section"/);
  assert.match(account, /ProfileAvatar/);
  assert.match(account, /clerkUser\?\.imageUrl/);
  assert.match(account, /openUserProfile/);
});

test("calendar booking keeps staged selections separate from persisted lessons", () => {
  assert.match(calendar, /api\.calendar\.previewBookingBatch/);
  assert.match(calendar, /api\.calendar\.confirmBookingBatch/);
  assert.match(calendar, /data-testid="student-calendar-booking-actions-bottom"/);
  assert.match(weeklyCalendar, /data-testid="calendar-staged-lesson"/);
});
