# Lesson Discard, Admin Calendar, Notification & Telegram Adoption Implementation Plan

> **For Hermes:** Use end-to-end implementation delivery with focused implementation/review subagents. Complete the whole plan, verify it in real browsers for all three roles, deploy Convex first, then commit and push `master`. Do not stop after an intermediate slice.

**Goal:** Fix one-time lesson lifecycle bugs, repair the admin calendar, make every notification semantically correct and actionable in both the in-app bell and Telegram, and persistently invite unconnected students and teachers to connect Telegram from their main dashboards.

**Architecture:** Treat “start a one-time lesson” as one atomic domain operation rather than two loosely coupled mutations. Introduce one canonical notification contract/registry shared by producers, rendering, and destination resolution so kinds, payloads, audiences, copy, and links cannot drift. Repair the admin calendar only after reproducing its actual failure with the admin role, then protect that path with focused tests and browser QA.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Convex, Clerk Organizations, `node:test`, existing shared calendar components, existing Telegram outbox/webhook.

---

## Confirmed findings from repository inspection

1. **The one-time start flow is split and therefore fragile.** `src/app/teacher/sessions/page.tsx:601-638` first calls `api.calendar.createOneTimeLesson`, then separately calls `api.lessons.create`.
2. **The wrong “Lesson booked” notification is created before the lesson starts.** `convex/calendar.ts:2290-2317` emits `lesson_assigned`; `src/lib/notificationText.ts:55-64` renders that kind as **Lesson booked**. The admin receives this specifically when the one-time lesson is unpaid, even though the action was “teacher started a one-time lesson.” The student also receives a booking notification from this start-now flow.
3. **Discard relies on a time heuristic instead of durable provenance.** `convex/lessons.ts:562-595` removes an ad-hoc event only when its `createdAt` is within two minutes of the lesson row’s `createdAt`. Any delay, retry, partial failure, or alternate path can misclassify the generated event as a real booking and leave it stuck as `scheduled` on Upcoming.
4. **Notifications already drift across three sources of truth.** The schema union at `convex/schema.ts:1197-1230`, `_notify` validator at `convex/notifications.ts:67-88`, presentation switch at `src/lib/notificationText.ts`, and fallback destination switch at `src/lib/telegramLink.ts:18-58` do not contain the same kinds. `_notify` accepts only a subset of schema kinds. Destination fallback is not audience-aware; for example, billing outcomes may have different student/admin destinations.
5. **Several producers omit explicit links.** This forces a role-blind fallback. `teacher_time_off` currently has no destination in `notificationDestination`; `unscheduled_session` has rendering but no fallback; lesson notifications commonly fall back to `/student/calendar` even when the recipient is a teacher or admin.
6. **Telegram connection exists only on profile pages.** `TelegramNotificationsCard` uses `api.telegram.getMyStatus`, but neither `src/app/student/page.tsx` nor `src/app/teacher/page.tsx` prompts an unconnected member on the main dashboard.
7. **Admin calendar failure is not safely diagnosable from the report alone.** The page is large (`src/app/admin/calendar/page.tsx`) and combines teacher selection, all-teachers mode, cached Convex queries, timezone conversion, day/week/month views, assignment, move/cancel, and attention data. The implementer must reproduce the exact visible failure before changing it.

## Product decisions encoded in this plan

- A teacher clicking **Start session → Not scheduled: start one now** creates a **one-time lesson started** event, not a normal future booking.
- Admin notification copy: **One-time lesson started**. Body includes teacher, student, date/time, and unpaid state when relevant.
- Admin notification click destination: the concrete lesson/session page when an addressable lesson exists; otherwise the admin calendar focused on the event. Prefer `/admin/sessions/<lessonId>` if that route exists; if admin session detail is list-only, use `/admin/sessions?lesson=<lessonId>` or `/admin/calendar?event=<eventId>` and implement the matching selection behavior.
- Student communication should describe what actually happened. Do not send “Lesson booked” for a start-now operation. If the current product wants the student informed, use the same event-specific notification with a student-appropriate body and destination; otherwise omit it and document that decision in the registry.
- Discarding a start-now misclick must atomically soft-delete the recording attempt, remove the generated schedule event from Upcoming/calendar, reverse exactly the credit transaction caused by that event (if any), and neutralize any not-yet-delivered misleading notification.
- Discarding a recording attempt for a pre-existing booking must preserve that booking and its credit, clear `teacherStartedAt`, and allow a later correct start.
- Telegram dashboard prompts are persistent while disconnected, visible to **students and teachers**, disappear immediately after connection, and never block platform use. “Bug them” means prominent and recurring, not a modal on every navigation.
- Do not create issues or reminders for teacher-only manual setup such as repainting availability or adding a Meet link.

---

### Task 1: Build a deterministic notification inventory and contract test

**Objective:** Turn the requested notification audit into an executable gate instead of a one-time document.

**Files:**
- Create: `src/lib/notificationRegistry.ts`
- Create: `tests/notificationRegistry.test.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/notifications.ts`
- Modify: `src/lib/notificationText.ts`
- Modify: `src/lib/telegramLink.ts` (or replace its destination switch with the registry)

**Steps:**
1. Enumerate every `notifications` insert and every `internal.notifications._notify` call in `convex/**/*.ts`.
2. Produce a table in the test fixture with: kind, producer file/function, recipient role(s), triggering event, required payload fields, in-app title/body intent, Telegram intent, canonical destination builder, urgency, and whether duplicate suppression is required.
3. Define a typed canonical registry for every schema kind. Keep pure presentation/destination functions importable by `node:test`; do not import Convex server runtime into the test.
4. Remove duplicated unions where practical by deriving TypeScript kinds from one constant; where Convex requires explicit validators, add a test that compares the validator/schema kind lists with the registry.
5. Add tests that fail if:
   - a schema kind lacks copy;
   - a producer kind is absent from schema/registry;
   - a supported recipient role has no valid destination;
   - required payload IDs for destination building are missing;
   - a notification renders an empty body;
   - a destination points to a route outside that role’s portal.
6. Run `npm test -- tests/notificationRegistry.test.ts` (or the repository’s supported focused `node --test` command) and prove the new audit test goes red against current drift before implementation.

**Audit all currently visible kinds, including:** `session_published`, `reschedule_request`, `reschedule_resolved`, `permission_request`, `achievement_unlocked`, `invoice`, `impersonation`, `teacher_no_show`, `makeup_credit_issued`, `student_assigned`, `student_unassigned`, `points_granted`, `points_refunded`, `booking_reminder`, `homework_assigned`, `homework_submitted`, `homework_reviewed`, `unscheduled_session`, `session_reminder`, `lesson_cancelled`, `lesson_rescheduled`, `lesson_assigned`, `teacher_time_off`, `lessons_requested`, `finance_entry_due`, `salary_paid`, `payment_received`, `payment_refunded`, and `payment_failed`, plus the new `one_time_lesson_started` kind.

**Commit:** `test(notifications): enforce complete notification contracts`

---

### Task 2: Make one-time lesson start atomic and provenance-based

**Objective:** Eliminate the partial two-mutation flow and the two-minute discard heuristic.

**Files:**
- Modify: `convex/lessons.ts`
- Modify: `convex/calendar.ts`
- Modify: `convex/schema.ts`
- Modify: `src/app/teacher/sessions/page.tsx`
- Create: `tests/oneTimeLessonLifecycle.test.ts` or an equivalent Convex test harness

**Steps:**
1. Add an explicit lifecycle/provenance field. Preferred design: a dedicated Convex mutation such as `lessons.startOneTime` creates the schedule event, charges the student, creates the lesson row, and emits notifications in one transaction. Store an explicit relationship such as `lesson.createdScheduleEventOnStart: true` (or a source enum), never infer ownership by timestamp proximity.
2. Reuse existing calendar validation helpers for teacher/student overlap, buffer policy, activity type cost, academy timezone, and Meet link. Extract helpers from `calendar.ts` if needed; do not duplicate business rules.
3. Change `QuickRecordDialog.handleStart` to call the single new mutation. Keep the pre-existing booked-event start path using `lessons.create({scheduleEventId})`.
4. Return `{ lessonId, eventId, unpaid }` from the atomic mutation so UI navigation and toast state are definitive.
5. Ensure retries are idempotent enough to prevent duplicate one-time events/lessons when the client repeats after a network uncertainty. Use a client-generated operation ID or a backend uniqueness/idempotency record if Convex has no natural key.
6. Remove or deprecate the duplicate “create ad-hoc event inside `lessons.create` with no scheduleEventId” path so there is one domain path.
7. Add RED/GREEN tests for:
   - successful paid one-time start creates exactly one event, one lesson, one spend;
   - unpaid start creates the correct admin attention state without pretending a booking occurred;
   - client retry does not duplicate event, lesson, spend, or notifications;
   - scheduled lesson start never gains one-time provenance;
   - timezone/date and end-time remain academy wall-clock correct.

**Commit:** `refactor(lessons): make one-time starts atomic`

---

### Task 3: Fix discard as a true compensating transaction

**Objective:** Guarantee a mistaken one-time start disappears completely while a real booking remains intact.

**Files:**
- Modify: `convex/lessons.ts:527-600`
- Modify: `convex/notifications.ts`
- Modify: `convex/schema.ts` only if notification cancellation metadata is added
- Extend: `tests/oneTimeLessonLifecycle.test.ts`

**Steps:**
1. Write failing tests reproducing both branches: start-now then discard; booked lesson then discard recording attempt.
2. Replace `createdTogether < 2 minutes` with explicit provenance from Task 2.
3. For start-now discard, in one mutation:
   - soft-delete the lesson;
   - mark the generated schedule event deleted (and/or cancelled with an internal “discarded misclick” reason so normal queries exclude it);
   - reverse the exact spend transaction once, not merely grant a generic duplicate refund;
   - clear/no-op no-show scheduling markers;
   - cancel pending Telegram delivery for notifications generated by this operation or mark those notifications withdrawn;
   - preserve an audit trail without showing the event in Upcoming/calendar.
4. For a pre-existing booking, only soft-delete the recording attempt and clear `teacherStartedAt`; do not refund or remove the event.
5. Make repeated discard calls idempotent.
6. Verify `schedule.listForTeacher`, student schedule, and admin calendar all exclude the removed event.

**Commit:** `fix(lessons): fully undo discarded one-time starts`

---

### Task 4: Introduce the correct one-time-start notification

**Objective:** Replace “Lesson booked” with accurate, role-specific, deep-linked messaging.

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/notifications.ts`
- Modify: `src/lib/notificationRegistry.ts`
- Modify: `src/lib/notificationText.ts`
- Modify: `src/lib/telegramLink.ts` or its replacement
- Modify: `convex/telegram.ts` if Telegram formatting needs recipient/audience context
- Extend: notification and lifecycle tests

**Steps:**
1. Add `one_time_lesson_started` with required payload: `lessonId`, `eventId`, `teacherId`, `teacherName`, `studentId`, `studentName`, `date`, `startTime`, and `unpaid`.
2. Emit it only after the atomic operation has both concrete IDs.
3. Admin copy:
   - title: **One-time lesson started**;
   - body: `<Teacher> started a one-time lesson with <Student> <date/time>.`;
   - unpaid suffix: `No lesson credit was available — review billing.`
4. Destination: direct lesson/session detail where supported; otherwise focused admin calendar. Add handling for `?event=`/`?lesson=` so the deep link actually selects or exposes the target, not merely lands on a broad page.
5. Decide and encode student recipient behavior explicitly. If sent, say the lesson **started**, not **booked**, and route to student calendar or the eventual lesson page according to availability.
6. Ensure discard prevents pending Telegram delivery of the now-invalid notice. If already sent, do not attempt Telegram deletion unless the platform already stores message IDs; in-app should mark it withdrawn or issue a compensating “discarded” event only if useful.
7. Test title, body, audience, exact destination, unpaid copy, Telegram button URL, and absence of `lesson_assigned` from this flow.

**Commit:** `fix(notifications): describe one-time lesson starts accurately`

---

### Task 5: Reproduce and repair the admin calendar

**Objective:** Fix the actual admin-calendar failure without guessing.

**Files likely involved:**
- `src/app/admin/calendar/page.tsx`
- `convex/calendar.ts`
- `src/components/calendar/WeeklyCalendar.tsx`
- `src/components/calendar/MonthCalendar.tsx`
- `src/components/calendar/calendarShared.ts`
- Focused tests under `tests/`

**Steps:**
1. Start the dev app and use `node scripts/dev-login.mjs admin` to open `/admin/calendar` as a real admin.
2. Capture console errors, failed Convex requests, and visible state in all-teachers/day/week/month modes before editing.
3. Reproduce these minimum paths:
   - initial teacher auto-selection;
   - `?teacher=<externalId>` deep link;
   - all-teachers overview;
   - switch day/week/month;
   - navigate previous/next/today;
   - click an open range and assign;
   - click an event and move/cancel;
   - open `?event=<eventId>` from a notification.
4. Add the smallest deterministic test/harness that fails on the observed bug. If it is query/data-related, test `getAdminCalendar`/`getAllTeachersCalendar`; if it is rendering/navigation-related, add a component or Playwright-style browser assertion.
5. Trace and repair the root cause only. Specifically inspect current risky seams:
   - cached query skip/selection behavior around `teacherId` and `__all__`;
   - malformed or missing availability/event fields;
   - academy-vs-browser timezone conversion;
   - all-teachers event identity/name mapping;
   - `useSearchParams` deep-link handling and target event selection;
   - 24:00/end-of-day conversion;
   - permission/query errors hidden by loading states.
6. Re-run all minimum paths and confirm no console/network errors.

**Commit:** `fix(calendar): restore admin calendar workflows`

---

### Task 6: Complete the notification and deep-link audit

**Objective:** Make every existing notification useful in both the bell and Telegram.

**Files:**
- Modify all producer files identified by Task 1 (likely `convex/calendar.ts`, `schedule.ts`, `scheduleCron.ts`, `lessons.ts`, `homework.ts`, `users.ts`, `payments.ts`, `payroll.ts`, `finance.ts`, `achievements.ts`, `permissions.ts`)
- Modify registry/presentation/destination files
- Extend `tests/notificationRegistry.test.ts`

**Steps:**
1. For every producer, verify the event deserves a notification, the recipient is correct, the wording is truthful, and duplicates are not generated by retries/crons.
2. Ensure each producer stores explicit destination data/IDs and preferably an explicit `link`; use the registry as fallback, not as an excuse for incomplete payloads.
3. Make destinations audience-aware. Examples:
   - admin billing notifications → admin billing/attention, never student billing;
   - teacher reminders → teacher calendar/session, never student calendar;
   - student assignment changes → relevant teacher/student surfaces;
   - time-off admin review → admin calendar/attention;
   - permission request → exact approval surface;
   - homework submitted → exact teacher lesson/homework review;
   - session published → exact student lesson;
   - reminders → calendar or direct Meet/session destination, including Meet URL where safe.
4. Remove obsolete kinds if no producer and no historical compatibility requirement exists; otherwise retain a tested legacy fallback.
5. Add duplicate keys/dedupe guards for recurring cron notifications so Telegram does not amplify duplicates.
6. Validate every notification with representative payload fixtures for student, teacher, and admin.

**Commit:** `fix(notifications): make every alert actionable`

---

### Task 7: Add persistent Telegram connection prompts to student and teacher dashboards

**Objective:** Prominently remind disconnected students and teachers to connect Telegram from their main dashboard.

**Files:**
- Create: `src/components/shared/TelegramConnectPrompt.tsx`
- Modify: `src/app/student/page.tsx`
- Modify: `src/app/teacher/page.tsx`
- Modify locale message files for `en`, `ru`, and `ar`
- Optionally refactor: `src/components/shared/TelegramNotificationsCard.tsx` to share connection logic
- Add tests for prompt visibility/state

**Steps:**
1. Use `api.telegram.getMyStatus`; render nothing while loading or once connected.
2. Show a prominent dashboard banner/card near the top for disconnected users with concrete value: lesson reminders, direct lesson/homework/calendar links, and Meet links when available.
3. Let the CTA start the existing secure connect flow directly from the dashboard, not merely send users hunting through Profile. Reuse one shared component/hook so profile and dashboard cannot diverge.
4. Keep it persistent across visits while disconnected. Do not add a permanent dismiss button; an optional session-only collapse is acceptable only if the prompt reappears later.
5. Add localized en/ru/ar copy and verify Arabic RTL with logical CSS properties.
6. Confirm the prompt disappears reactively after Telegram connection and reappears after disconnect.
7. Do not show the prompt to admins unless separately requested; the explicit request is students and teachers.

**Commit:** `feat(telegram): prompt students and teachers to connect`

---

### Task 8: Full verification, independent review, documentation, and shipment

**Objective:** Deliver the complete fix as one verified production release.

**Files:**
- Modify: `MASTER_PLAN.md` §5 and §7 with concise `[Hermes]` attribution
- Update: `docs/TELEGRAM_NOTIFICATIONS.md` if notification contracts or behavior changed

**Verification commands:**
1. `npm run test` — all tests pass, including lifecycle and notification-contract suites.
2. `npx tsc --noEmit` — zero type errors.
3. `npm run lint` — no new lint errors; distinguish pre-existing findings.
4. `npm run build` — production build exits 0.
5. Run independent spec-compliance review, then independent code-quality/security review. Fix findings and rerun gates.

**Required browser QA:**
- **Teacher:** start a one-time lesson, verify correct UI state, discard immediately, verify it disappears from Upcoming and calendar, repeat discard safely.
- **Student:** verify no false “Lesson booked” notice, verify any intended one-time-start notice text/link, verify balance restoration.
- **Admin:** verify **One-time lesson started** copy, direct destination, unpaid variant, and the repaired calendar in day/week/month/all-teachers modes.
- **Scheduled control case:** start then discard a real booked lesson; verify the booking remains and can be started again.
- **Telegram:** with a connected test account, verify representative student/teacher/admin messages and buttons; verify no pending message is delivered for a discarded misclick.
- **Dashboard adoption:** disconnected student and teacher see the connection prompt; connected accounts do not; disconnect makes it return.
- Capture screenshots/log evidence and check browser console plus Convex function errors.

**Ship order (mandatory):**
1. Update `MASTER_PLAN.md` and Telegram docs.
2. `npx convex deploy --yes` to production.
3. Commit all intended files only; leave unrelated `IDEA.md` untouched.
4. `git push origin master` so Vercel deploys frontend.
5. Verify the production deployment and repeat the critical teacher discard/admin notification/admin calendar smoke tests against production.

**Final commit:** `fix(platform): repair one-time lessons calendar and notifications`

---

## Acceptance criteria

- A mistaken one-time start followed by discard leaves no event in teacher Upcoming, teacher calendar, student calendar, or admin calendar.
- Its credit/spend is reversed exactly once, and retries cannot duplicate the refund.
- A booked lesson’s recording attempt can be discarded without cancelling/refunding the booking.
- Admin sees **One-time lesson started**, never **Lesson booked**, for the teacher start-now action.
- Clicking that alert in the bell or Telegram opens the exact relevant lesson/session or focused calendar event.
- Every notification kind has tested copy, required payload, intended audiences, and valid role-specific destinations.
- No notification renders blank, routes a teacher/admin into a student portal, or becomes misleading when mirrored to Telegram.
- Admin calendar works for initial load, teacher-specific, all-teachers, day/week/month, navigation, assignment, move/cancel, and deep links.
- Disconnected students and teachers are persistently prompted on their main dashboards to connect Telegram; connected users are not.
- All tests, typecheck, lint gate, build, independent reviews, browser QA, Convex production deploy, git push, and production smoke checks complete before declaring done.

## Risks and guardrails

- **Financial correctness:** never issue a generic grant without tying it to the exact spend; enforce idempotency.
- **Notification privacy:** payloads and Telegram text must contain only data appropriate for the recipient.
- **Race conditions:** one-time start, spend, lesson creation, and notification creation belong in one Convex transaction.
- **Historical notifications:** keep safe legacy rendering/destinations while migrating; do not break old rows.
- **Deep-link authorization:** server authorization still controls access; a URL is not permission.
- **Calendar scope:** repair the reproduced fault, not an unrelated redesign.
- **Teacher manual actions:** availability painting and Meet-link setup remain teacher responsibilities, not platform bugs or release blockers.
