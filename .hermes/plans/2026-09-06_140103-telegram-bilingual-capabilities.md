# OmniClass Telegram Bot: Bilingual Notifications and Capability Plan

> **For Hermes:** Implement this plan against the current `master`, preserving the in-app notification row as the source of truth and shipping backend before frontend.

**Goal:** Make every student Telegram notification appear first in the student’s native language (Arabic or Russian), followed by English, and provide a secure read-only assistant that retrieves authorized account information and directs users to the exact OmniClass website page for every action.

**Architecture:** Keep `@OmnicaEnglish_Bot` as an optional projection of the authenticated OmniClass account. Convex remains the source of truth, webhook processor, command router, and outbox. Use deterministic translation templates in the canonical notification registry—not runtime LLM translation—so billing, schedule, and policy messages are accurate, testable, inexpensive, and available during provider outages. Every read or action must resolve the linked user, organization, role, and permissions server-side.

**Tech Stack:** Next.js 16 App Router, Convex, Clerk Organizations, TypeScript, next-intl, Telegram Bot API.

---

## Current context confirmed from the repository

- `users.locale` is the authoritative member locale and supports `en`, `ru`, and `ar` (`convex/schema.ts:176`).
- Telegram delivery currently loads the recipient’s role but does not load or pass their locale (`convex/telegram.ts:129-167`).
- All 30 notification kinds and English presentation are centralized in `convex/lib/notificationRegistry.ts`.
- Telegram currently composes one English title/body plus an optional Google Meet URL and OmniClass button (`convex/lib/notificationRegistry.ts:554-577`).
- The bot currently supports only secure `/start CODE`, `/stop`, and a generic privacy response (`convex/telegram.ts:238-281`).
- Account binding already uses an authenticated, expiring, single-use code. One Telegram chat maps to one OmniClass identity.
- The in-app bell is the durable source of truth; Telegram is an optional outbox delivery channel.
- `@MustafasHermesBot` is a separate local Hermes control bot and must never share its token or update consumer with `@OmnicaEnglish_Bot`.

## Product rules

1. Student Telegram notifications use this order:
   - Arabic student: Arabic title/body/action label, divider, English title/body.
   - Russian student: Russian title/body/action label, divider, English title/body.
   - English or missing locale: English only.
2. Names, dates, times, lesson titles, amounts, currencies, and user-entered notes stay as payload data and are interpolated safely; fixed product copy is translated deterministically.
3. User-entered free text is not automatically “translated” by templates. Label it clearly in both language sections or translate only later through an explicit, bounded translation service with a visible fallback.
4. Never put private lesson summaries, transcripts, homework answers, billing details, or student data into group chats. Bot linking and commands remain private-chat only.
5. Every command is account-bound and tenant-scoped. Never trust Telegram usernames, phone numbers, callback payload roles, or entity IDs without server authorization.
6. Telegram does not become a second database or business workflow. Commands call the same Convex domain functions as the web application.
7. The bot is strictly read-only. Every action that changes platform state happens on the authenticated website; Telegram supplies a precise deep link.
8. Links use the configured HTTPS `APP_URL`, precise entity destinations where available, and role-authorized routes.
9. Connection itself is the Telegram opt-in. Any future preference changes are made on the authenticated website, not inside Telegram.

---

## Capability catalogue

### Deliver directly in Telegram

These are low-risk, high-value capabilities that fit the current stack cleanly.

#### Account and navigation

- `/start CODE` — securely connect the signed-in OmniClass account.
- `/stop` — disconnect Telegram.
- `/status` — show connected name, role, academy, notification language, and whether delivery is enabled.
- `/help` — role-aware command menu.
- `/language` — show the account’s current notification language and link to Profile to change it; avoid maintaining a second locale preference unless product requirements demand one.
- `/open` — role-aware buttons for the user’s OmniClass home, calendar, lessons/students, homework, billing, and profile.
- Persistent Telegram command menu registered with Bot API, filtered by role where feasible.

#### Lessons and calendar

- `/next` — next scheduled lesson: student/teacher, academy-local date and time, status, Meet link when authorized, and precise OmniClass link.
- `/today` — today’s lessons for the linked user.
- `/week` — compact upcoming schedule with web link for the full calendar.
- One-tap **Join meeting** button on imminent lesson reminders when a valid Meet link exists.
- **Add to calendar** link using the existing ICS infrastructure rather than generating duplicate calendar data.
- Reminder actions: **Open lesson**, **Open calendar**, and **Join meeting**.
- Notify when a lesson is booked, rescheduled, cancelled, starting soon, or marked no-show.

#### Homework and lesson materials

- `/homework` — list pending homework with due state and deep links.
- Notify students when homework is assigned or reviewed.
- Notify teachers when homework is submitted and link to the authorized review surface.
- Notify students when lesson materials, summary, vocabulary, and flashcards are published.
- `/study` — link to due flashcards/review; optionally show only aggregate counts, not card contents, in Telegram.

#### Billing and lesson balance

- `/balance` — current lesson balance and package/billing link.
- Notify students when lessons are added/returned, payment succeeds, or a refund changes their balance.
- Notify admins about payment reconciliation failures and recurring finance entries due.
- Notify teachers when salary is recorded as paid.
- Keep checkout, refunds, payment-method changes, and bank/payment details on the authenticated website.

#### Notification controls

- `/notifications` — show recent notifications and link to website settings.
- `/recent` — show a small list of recent in-app notifications with deep links, limited to the linked recipient and excluding withdrawn rows.

#### Student learning nudges

- Due-review reminder with count and **Study now** link.
- Homework due-soon reminder when a real due date exists.
- Newly published lesson-material reminder.
- Achievement notification.
- Optional weekly study summary: completed lessons, reviewed cards, homework status, and next lesson.
- Optional inactivity nudge only when it corresponds to a meaningful learner action; avoid spam or generic motivational messages.

#### Teacher operations

- `/today` and `/next` for assigned lessons, including authorized Meet links.
- Student assignment/unassignment notifications.
- Homework-submitted notifications.
- Upcoming lesson reminder and no-show workflow links.
- Session/material publishing reminders where a teacher action is genuinely required.
- Quick links to assigned students and session workspace.

#### Admin operations

- `/attention` — count and deep links for existing attention items.
- Reschedule-request alerts and links to the request queue.
- One-time/unscheduled lesson alerts.
- Payment reconciliation failure alerts.
- Teacher time-off requests that require admin approval.
- Finance-entry-due alerts.
- Operational daily digest with counts and links, not private student content.

### Hard capability boundary

The bot must never mutate OmniClass data. It may only:

1. Retrieve information the linked member is already authorized to view.
2. Send notifications derived from durable in-app notification rows.
3. Provide precise links to the correct authenticated website screen.

All business actions remain website-only: booking, rescheduling, cancellation, attendance/no-show decisions, approvals, grading, payments/refunds, package requests, profile changes, availability, assignments, content publication, notification-preference changes, and marking records read. Telegram buttons for these workflows are navigation links only.

Also exclude free-form AI tutoring, uploads, voice submissions, natural-language mutations, group-chat workflows, a Telegram Mini App, and marketing broadcasts. They do not serve the bot’s read-only retrieval/notification purpose.

---

## Implementation tasks

### Task 1: Define the bilingual notification contract

**Objective:** Extend the canonical registry so one notification kind can render English, Russian, and Arabic without duplicating business logic.

**Files:**
- Modify: `convex/lib/notificationRegistry.ts`
- Create or modify: `tests/notificationRegistry.test.ts`

**Design:**

- Add a shared locale type: `"en" | "ru" | "ar"`.
- Extend each contract with localized title/body renderers, or define a locale-keyed message template adjacent to each contract.
- Preserve `notificationView()` as English by default so the current bell behavior does not change accidentally.
- Add `notificationViewForLocale(kind, payload, locale)`.
- Change `telegramMessage()` to accept locale and compose native-first plus English for `ru`/`ar`.
- Localize fixed labels: Join meeting, Open lesson, Open OmniClass.
- Keep dates/times based on stored academy wall-clock data; localized wording must not parse wall time into the server timezone.

**Acceptance examples:**

- Arabic `session_reminder` contains an Arabic title/body first, then the exact English title/body, and retains the Meet URL and lesson button.
- Russian `homework_assigned` contains Russian first, then English, with the same homework title interpolated in both sections.
- English and missing locale produce exactly one English section.
- Unknown historical kinds degrade to English without throwing.

**Tests:**

- Add table-driven tests covering all notification kinds for `en`, `ru`, and `ar`.
- Assert no supported locale produces an empty title/body.
- Assert Arabic appears before English and Russian appears before English.
- Assert Meet URL appears once, not once per language.
- Assert button destination and role-aware routing are unchanged.
- Assert user-entered strings are not fabricated or silently machine-translated.

Run: `npm run test -- tests/notificationRegistry.test.ts` or the repository’s targeted `node --experimental-strip-types --test` equivalent.

### Task 2: Pass the authoritative recipient locale through the outbox

**Objective:** Render each Telegram message using the linked member’s persisted `users.locale`.

**Files:**
- Modify: `convex/telegram.ts:129-219`
- Test: `tests/notificationRegistry.test.ts` and a focused Telegram outbox test if existing test seams permit it.

**Steps:**

1. Add `locale` to the delivery projection from the already-loaded member row.
2. Normalize missing/invalid historical values to `en`.
3. Pass locale into `telegramMessage()`.
4. Ensure role and locale both belong to the recipient row, not notification payload input.
5. Preserve `connectedAt`, withdrawal, retry, failure, and dedupe behavior.

**Validation:**

- Typecheck Convex functions.
- Create deterministic fixture deliveries for Arabic, Russian, English, and missing locale.
- Verify the same notification produces different text but the same authorized destination.

### Task 3: Translate connection and command-system messages

**Objective:** Make `/start`, `/stop`, invalid/expired link, privacy, status, and help responses bilingual for Russian/Arabic members once identity is known.

**Files:**
- Modify: `convex/telegram.ts:238-294`
- Create: `convex/lib/telegramCopy.ts` if copy would clutter the handler.
- Test: `tests/telegramCommands.test.ts`

**Rules:**

- Before a valid account link is consumed, use concise multilingual onboarding containing English, Russian, and Arabic because the bot does not yet know the member.
- After linking, use the linked user’s locale and English.
- `/stop` must resolve locale before disconnecting, then send the localized confirmation.
- Do not reveal whether arbitrary codes or chat IDs correspond to an account.

### Task 4: Add a secure command router and read-only commands

**Objective:** Add `/help`, `/status`, `/next`, `/today`, `/homework`, `/balance`, `/study`, `/notifications`, and `/open` without growing one large conditional handler.

**Files:**
- Modify: `convex/telegram.ts`
- Create: `convex/lib/telegramCommands.ts`
- Create: `convex/telegramQueries.ts` or add narrowly scoped internal queries in `convex/telegram.ts`
- Test: `tests/telegramCommands.test.ts`

**Architecture:**

- Parse only known commands and Telegram callback data with bounded lengths.
- Resolve `telegramChatId` to a user first.
- Pass `{ organizationId, externalId, role, locale }` from the resolved user into internal queries.
- Queries enforce tenant and role boundaries themselves.
- Return structured response objects (`text`, buttons), then localize/render at the edge.
- Register a role-neutral Bot API command menu; `/help` remains the authoritative role-aware list.

**Tests:**

- Unlinked chat receives only connection help.
- Student cannot query teacher/admin data.
- Teacher sees only assigned/authorized students and lessons.
- Admin results remain tenant-scoped.
- Unknown command returns localized help without exposing internals.
- Meet links appear only for users already authorized to see the lesson.

### Task 5: Enforce the read-only command boundary

**Objective:** Ensure Telegram can query and link but can never change OmniClass business data.

**Files:**
- Modify: `convex/telegram.ts`
- Test: `tests/telegramCommands.test.ts`

**Rules and validation:**

- Command handlers may call internal queries only, except the existing account-link and disconnect mechanics required to operate the channel.
- Do not add callback mutations for booking, rescheduling, cancellation, attendance, homework, billing, preferences, or notification state.
- Inline keyboards contain HTTPS navigation URLs only.
- Every result provides the most precise authorized web destination available.
- Test that unlinked users get no account data, cross-role and cross-tenant reads fail, and no command routes to a business mutation.

### Task 6: Audit missing notification opportunities before adding them

**Objective:** Compare important domain state transitions against the canonical notification registry and add only notifications that correspond to real user action or operational risk.

**Files to inspect:**
- `convex/calendar.ts`
- `convex/schedule.ts`
- `convex/scheduleCron.ts`
- `convex/lessons.ts`
- Homework, billing/payment, SRS, achievement, permission, and assignment modules discovered during implementation.
- `convex/lib/notificationRegistry.ts`

**Audit categories:**

- Lesson lifecycle: assigned/booked, changed, cancelled, reminders, no-show, material publication.
- Homework lifecycle: assigned, due soon, submitted, reviewed.
- Billing lifecycle: request, payment success/failure/refund, low/zero lesson balance only where actionable.
- Teacher/admin lifecycle: assignment, reschedule review, time-off approval, unscheduled starts, finance entries.
- Learning lifecycle: due reviews and achievements as optional engagement messages.

**Do not add:** warnings for teacher-managed availability or Meet-link setup, one-off anomaly detectors, speculative “FYI” events, or duplicates of an existing notification kind.

**Output:** Update the canonical registry and producer call sites only for confirmed gaps. Every new kind needs audience, validated payload, deterministic source key for replay-prone events, destination, withdrawal behavior, bilingual copy, and tests.

### Task 7: Profile UI and discovery

**Objective:** Make bot capabilities discoverable without turning Profile into a control panel.

**Files:**
- Modify: `src/components/shared/TelegramNotificationsCard.tsx`
- Reuse from student, teacher, and admin Profile surfaces.

**UI content:**

- Connected bot and status.
- Native-language + English explanation.
- “Open bot” button.
- Command summary appropriate to role.
- Disconnect action.

Use logical CSS properties and verify Arabic RTL layout.

### Task 8: End-to-end verification and release

**Objective:** Prove localization, authorization, routing, delivery, and Telegram interaction in production.

**Verification commands:**

- Targeted tests while implementing.
- `npm run test`
- `npm run lint`
- `npm run build`
- `npx convex dev --once`
- `git diff --check`

**Live matrix:**

- Arabic student: connect, receive lesson reminder, see Arabic then English, Meet link, and correct student route.
- Russian student: receive homework and lesson-material notifications, see Russian then English and correct links.
- English/missing-locale member: English only.
- Teacher: `/today`, homework submission notification, no access to other teachers’ students.
- Admin: `/attention`, tenant-scoped results.
- Wrong/expired start code, reused callback token, blocked bot, disconnect/reconnect, quiet hours, withdrawn notification, temporary Telegram API failure.
- Ensure a failed confirmation returns webhook 200 after the update was consumed and that failed outbound notifications retain retry state.

**Release:**

1. Update `MASTER_PLAN.md` in the relevant notification section and §7 change log with `[Hermes]` attribution.
2. Update `docs/TELEGRAM_NOTIFICATIONS.md` with commands, bilingual behavior, preferences, callback security, and operator verification.
3. Deploy backend first using `npx convex deploy`.
4. Commit and push `master` so Vercel builds the frontend.
5. Verify Telegram `getWebhookInfo`, production bot commands, one real Arabic delivery, one real Russian delivery, and all deep links.

---

## Risks and tradeoffs

| Risk | Mitigation |
|---|---|
| Incorrect translation changes policy meaning | Deterministic reviewed templates; never runtime LLM translation for contractual/billing text; link to authoritative web detail. |
| Locale drift between web and Telegram | Read `users.locale` at delivery time; do not store a second language initially. |
| Arabic RTL mixed with dates/URLs | Separate language sections, avoid complex Markdown, test Telegram rendering on iOS/Android/desktop. |
| Free text cannot be deterministically translated | Preserve it verbatim with labels; do not pretend it was translated. |
| Command leaks cross-tenant data | Resolve identity from chat binding and tenant-scope every internal query/mutation. |
| Callback replay or stale state | Short-lived opaque server tokens, atomic consumption, expected-state checks, idempotency. |
| Bot becomes a duplicate web application | Keep summaries/navigation and safe confirmations in Telegram; rich/high-risk work stays on web. |
| Notification spam | Category preferences, quiet hours, digesting, dedupe/source keys, conservative defaults. |
| Telegram outage/blocked bot | In-app bell remains source of truth; bounded retries and permanent-failure state. |
| Token/webhook compromise | Rotate the token already pasted into chat before long-term production use; keep secrets only in Convex env; retain webhook-secret verification. |
| Two bots conflict | Keep academy notification bot and local Hermes control bot entirely separate; one token has one update consumer. |

## Product decisions to use as defaults

- Students get native language first, then English. Teachers/admins follow the same rule if their saved locale is Russian or Arabic; otherwise English only.
- Locale comes from `users.locale`; Profile remains the single place to change it.
- Do not machine-translate user-entered notes in the first version.
- Implement read-only commands before mutation callbacks.
- Start mutating callbacks only with notification preferences, mute, and mark-read; evaluate rescheduling separately against `POLICY.md` and the existing authoritative mutation.
- Keep full content, payments, scheduling edits, permissions, and destructive actions on the authenticated website.
