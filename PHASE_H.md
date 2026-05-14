# Phase H · I · J — Monetization, Booking, Live Lesson, Homework

> **Why this file exists:** Phases H/I/J are big, deeply scoped, and need checkable items. `MASTER_PLAN.md` keeps the high-level architectural truth; this file is the working punch-list. When a phase completes, fold the bullets back into `MASTER_PLAN.md` change log and delete the corresponding section here.

**Status:** Phase H — IN PROGRESS (started 2026-05-11)
**Owner:** Claude
**Confirmed by:** Mustafa, 2026-05-11

---

## Locked decisions (from planning sessions 2026-05-08 → 2026-05-11)

| # | Decision |
|---|---|
| Pairing | Manual admin pick (no auto-match) |
| Slots | 30-minute granularity |
| Min vacancy | 10 hr/week, soft warning only |
| Student changes teacher | Yes; admin re-pairs; notify both teachers (gain + loss) |
| IELTS-certified | Boolean flag on user |
| Onboarding fields (student) | name, age, phone+WhatsApp, English level self-assess, English goal (open text), preferred days/times (open text) |
| Trial | Granted **after** onboarding form. Configurable: free or paid, point amount, duration. May start paid later. |
| Teacher invite | Single shared link per tenant; sign-up via link → role=teacher, skip student onboarding |
| Student signup | Per-tenant signup link auto-attaches to org. No org-picker. |
| Booking model | **Option B + WhatsApp escape valve.** In-app picker over assigned teacher's vacancies. "Contact teacher on WhatsApp" button for edge cases. |
| Bulk book | Weekly pattern picker, repeats N weeks. Warns on vacancy conflicts in later weeks. |
| Speaking-club groups (online + offline) | Open enrollment; click → spend → calendar |
| Offline events | Created by admin by default. Permission `events.create` grantable to teachers. |
| Google Meet | Manual paste + 1hr reminder. Auto-create via OAuth deferred to I.2 if low-friction. |
| Audio backup | Opus-compressed, Convex storage, parallel to Soniox stream |
| Multi-window share | Yes; new browser windows for screen-share (quiz + reading) |
| Teacher no-show | Full points refunded, apology notification, admin notif ladder |
| Student no-show | Burn full points |
| Notifications | In-app only (bell + on-page toasts) |
| Watchdog | **Killed.** Skip entirely. |
| Payment integration | Manual admin grants only. Lemon Squeezy + Stripe deferred. |
| Homework | TipTap, **Medium tier**, 1 doc per lesson, AI-generate from transcript |
| Currency | Base USD. Tenant-configurable extra currencies w/ manual rate + name + symbol. Optional daily auto-pull (free FX API) if cheap. |
| Tier price freeze | Base prices change affect **new purchases only**. Active subscribers locked at their signup price. Cancel + resubscribe = new price. Non-subscriber on-demand purchase = current price. Admin has manual "force re-migrate" override w/ undo. |
| Reschedule | No point deduction |
| Group enrollment | Per-student point spend (same as 1on1) |

---

## Phase H — Economy + Onboarding + Booking foundation

### H.1 — Point ledger schema *(kill `studentPackages`)* ✅ DONE 2026-05-11 (commit `8f8c401`)
- [x] Drop `studentPackages` table from `convex/schema.ts`
- [x] Add `pointPackages` table (catalog: Starter/Standard/Pro)
- [x] Add `pointGrants` table (each purchase/grant = one row with expiry, FIFO index)
- [x] Add `pointTransactions` table (immutable ledger)
- [x] Spend rule: FIFO over non-expired grants
- [x] `convex/points.ts`: getBalance / getBalancesForOrg / getGrants / getTransactions / listPackages / grantPoints / spendPoints / refundPoints / upsertPackage
- [x] Cron `points.expireDailyCron` daily at 00:05 UTC (`convex/crons.ts`)
- [x] Strip `studentPackages` decrement from schedule.ts + lessons.ts no-show flows
- [x] Profile UI: "Points · expires `<date>`" card
- [x] Admin /billing rewritten: balances table + manual grant dialog + pointPackages catalog tab
- [x] tsc clean

### H.2 — Activity types config
- [ ] Add `tenantSettings.activityTypes` field
  - Default seed: `1on1_general (10pt)`, `1on1_ielts (15pt)`, `offline_group (5pt)`, `online_group (2pt)`
  - Fields each: `id, name, pointCost, recordRequired, allowedRoles, isActive, sortOrder`
- [ ] Add `scheduleEvents.activityTypeId` + `pointCostSnapshot`
- [ ] Migration: backfill existing events w/ `activityTypeId = "1on1_general"`, `pointCostSnapshot = 10`
- [ ] Admin UI: `/admin/settings` block to edit activity types (rows, add, remove, reorder)

### H.3 — Multi-currency
- [ ] Add `tenantSettings.currencies: array<{ code, name, symbol, rateToUSD, isPrimaryDisplay, updatedAt }>`
  - Default seed: USD (rate 1, primary). User can add KZT, RUB, AED, etc.
- [ ] Helper `formatPrice(usdAmount, currencyCode?)` lives in `src/lib/format/currency.ts`
- [ ] Admin UI: settings page block to add/edit/remove currencies + set primary
- [ ] All money displays (`/admin/billing`, `/student/profile`, packages list, etc.) use `formatPrice` w/ tenant's primary currency
- [ ] Optional: free FX API daily cron pulling rates (`exchangerate.host`). Behind `tenantSettings.currencyAutoUpdate: boolean`. Defer if >2hrs work.

### H.4 — Tier price freeze
- [ ] Add `users.lockedPriceTier: { packageId, lockedPriceUSD, lockedAt }[]` — snapshot of price at user's first purchase per package
- [ ] `points.purchase` checks `user.lockedPriceTier[packageId]` first; falls back to current `pointPackages.priceUSD`
- [ ] Active subscriber flag: `users.subscriptionStatus: "active" | "cancelled" | "none"` (relates to recurring future feature; for now manually set by admin)
- [ ] Cancel → resubscribe → new price applied (clears lockedPriceTier for that package)
- [ ] Admin "Force re-migrate all" button:
  - Writes `priceMigrationAudit` row with snapshot of all affected users' `lockedPriceTier` rows
  - Clears all lockedPriceTier for chosen package
  - Undo button restores from audit
- [ ] New table `priceMigrationAudit: { packageId, oldPriceUSD, newPriceUSD, oldPoints, newPoints, performedBy, performedAt, affectedUsers: array<{ userId, before, after }>, undone, undoneAt? }`

### H.5 — Student onboarding form + trial
- [ ] `/onboarding/student` page (gated to first-time users where `users.onboardingComplete = false`)
- [ ] Fields: name, age, phone+WhatsApp, English level (CEFR self-select), goal (textarea), preferred days+times (textarea)
- [ ] Submit → mutation `users.completeStudentOnboarding` writes `studentOnboarding` row + flips `onboardingComplete = true`
- [ ] After submit → trial grant per `tenantSettings.trialPolicy`
  - Fields: `{ enabled, points, requiresPayment, durationDays, expiresAfterDays }`
  - If `requiresPayment` true → redirect to (future) payment page; for now manual admin grant
- [ ] New table `studentOnboarding: { studentId, l1?, cefr, goal, prefDaysTimes, age, phoneWhatsapp, completedAt }`
- [ ] Middleware: if user missing onboarding → redirect to `/onboarding/student` (or `/onboarding/teacher` if invite-link signup)

### H.6 — Teacher invite link
- [ ] Add `tenantSettings.teacherInviteToken` (one shared token per tenant, regenerable by admin)
- [ ] New route `/sign-up?invite=<token>` validates against tenant's token
  - On sign-up, post-Clerk-webhook attaches Clerk user to tenant org with role `org:teacher` AND inserts users row w/ `role = "teacher"`, `onboardingComplete = true` (skip student form)
  - Invalid token → fall through to `/onboarding/select-org` (existing behavior)
- [ ] Admin UI: `/admin/settings` block to view, copy, and regenerate teacher invite link
- [ ] New route `/onboarding/teacher` lightweight: ask for IELTS-cert checkbox + WhatsApp number, then proceed to `/teacher/calendar` for vacancy setup
- [ ] Fix bug #2: if user lands no-org → look for `?invite=` query param → resolve tenant → attach. If missing → keep current redirect to `/onboarding/select-org`.

### H.7 — Teacher vacancies
- [ ] New table `teacherVacancies: { teacherId, dayOfWeek (0-6), startTime "HH:mm", endTime "HH:mm", validFrom, validUntil?, isActive }`
- [ ] `/teacher/calendar` gains a "My availability" tab/section
  - Grid: Mon–Sun × 6am–11pm in 30-min cells
  - Click cell toggles vacancy
  - Click + drag = bulk toggle
  - Save = upsert vacancies
  - Top: rolling-week hours total + soft warning if <10
- [ ] Mutations: `vacancies.set`, `vacancies.clear`, `vacancies.list`
- [ ] Admin can view any teacher's vacancies in `/admin/people/<teacherId>`

### H.8 — Admin student↔teacher pairing
- [ ] `/admin/people` row for students gains a "Teacher" column with select dropdown
- [ ] Change writes `users.patch({ teacherId })` + fires notifications:
  - To old teacher (if any): "Student `<name>` was reassigned"
  - To new teacher: "New student `<name>` was assigned to you"
- [ ] Filter on people page: "Unpaired students" toggle
- [ ] IELTS-cert filter on teacher dropdown when student's goal mentions IELTS (best-effort)

### H.9 — Student booking page
- [ ] New route `/student/book`
- [ ] Activity selector grid: 4 cards (1on1, IELTS, offline group, online group)
- [ ] For 1on1/IELTS:
  - Top: assigned teacher card w/ name + WhatsApp link
  - 4-week vacancy grid (30-min slots, green=free, gray=booked)
  - Click slot → confirm modal (cost X pts, you have Y, after Y-X)
  - Confirm → `schedule.bookSlot` mutation (atomic: insert scheduleEvent + pointTransaction)
  - "Book recurring pattern" toggle: pick weekly cells + weeks count → preview list w/ conflicts flagged → confirm
- [ ] For offline/online groups:
  - List existing events from `scheduleEvents` where `type = "offline_group" | "online_group"` and `date >= today`
  - Each row: title, date+time, teacher, seats left, cost
  - Click "Join" → enrollment mutation
- [ ] Insufficient balance UI: clear CTA "Need X more pts" (no purchase flow yet; just message admin)
- [ ] Add to student sidebar nav: "Book" item between "My Lessons" and "Calendar"

### H.10 — Group session enrollment
- [ ] New table `scheduleEnrollments: { eventId, studentId, pointCostSnapshot, status: "enrolled"|"cancelled"|"attended"|"no_show", enrolledAt, attendanceMarkedBy?, attendanceMarkedAt? }`
- [ ] Index `by_organization_and_eventId`, `by_organization_and_studentId`
- [ ] Mutations: `enroll`, `unenroll`, `markAttendance`
- [ ] Group event has `capacity?: number` — enrollment blocked when full
- [ ] Teacher view of group session: roster + attendance checkboxes

### H.11 — Admin manual point grant UI
- [ ] `/admin/billing` gains "Grant points" action button per student
- [ ] Modal: student picker, amount, reason (required), expiresAt (default purchasedAt + 45d)
- [ ] Calls `points.grantPoints({ source: "manual", ... })`
- [ ] Audit row written

### H.12 — `.ics` calendar export
- [ ] Convex HTTP route `/ics/student/<token>` (token in `users.icsToken`)
- [ ] Returns RFC-5545 VCALENDAR with all of student's upcoming scheduleEvents
- [ ] Refresh interval header set so Google/Apple Calendar polls every ~hour
- [ ] Student profile page: "Subscribe via Google/Apple Calendar" button with copy-URL UI

### H — Done when
- [ ] All H.1–H.12 boxes checked
- [ ] `npx tsc --noEmit` clean
- [ ] Manual smoke: create teacher via invite link, set vacancy, admin pairs student, student onboards + gets trial, student books 1on1 slot, points debit correctly, student joins group, group enrollment debits separately
- [ ] Mustafa confirms end-to-end booking demo

---

## Phase I — Live lesson maturity

### I.1 — Audio backup
- [ ] `RecordingPanel`: parallel to Soniox stream, capture mic+tab audio as Opus blob
- [ ] On lesson end (or every 2 min), upload chunk to Convex storage
- [ ] `lessons.audioFileId?` stays current; final upload writes complete file
- [ ] If Soniox WS drops mid-lesson: keep audio recording, surface yellow banner "Transcription paused; audio still recording"

### I.2 — Google Meet auto-link (best-effort)
- [ ] Teacher profile: "Connect Google Calendar" button → Google OAuth
- [ ] Stored in `users.googleOAuthRefreshToken` (encrypted at rest via Convex env secret)
- [ ] When teacher creates scheduleEvent, action `meet.createEvent` calls Google Calendar API w/ `conferenceData.createRequest`
- [ ] Result writes back to `scheduleEvents.googleMeetEventId` + `googleMeetLink`
- [ ] If OAuth not connected: paste-link field falls back to manual

### I.3 — Multi-window share screens
- [ ] Live lesson page: action buttons "Open quiz window", "Open reading window"
- [ ] Clicking opens `window.open('/teacher/share/quiz?lessonId=...', '_blank', 'width=1024,height=768')`
- [ ] Share pages render fullscreen-friendly versions of quiz/reading for screen-share into Google Meet
- [ ] Teacher's main window keeps transcript + tools

### I.4 — Pause transcription (timer continues)
- [ ] RecordingPanel: pause/resume button
- [ ] State: `isPaused: boolean` — pauses Soniox token append + audio chunking
- [ ] Lesson timer (`durationSeconds`) continues based on `startedAt → endedAt`, ignoring pause

### I.5 — Student no-show
- [ ] Teacher live page: action button "Mark student no-show"
- [ ] Closes lesson immediately: status = `no_show_student`, burns student's `pointCostSnapshot`
- [ ] Tag rendered red on session list + review page

### I.6 — Teacher no-show automation
- [ ] Cron `schedule.checkNoShowsCron` every 5 min
- [ ] For each `scheduleEvents` row where `startTime < now AND teacherStartedAt == null`:
  - Compute delay
  - 5 min before: notify admin (level 1) [actually pre-start — separate cron]
  - At 0 min: notify admin (level 2)
  - +10 min: notify admin (level 3)
  - +20 min: auto-refund full points, status = `no_show_teacher`, notify student (apology), notify admin (final)
- [ ] State stored on event: `noShowNotifications: array<{ level: 1|2|3|4, sentAt }>` (idempotent — don't double-send)
- [ ] Pre-start notif (level 1) needs a separate "approaching start" cron checking events where `startTime - 5min < now < startTime` and `teacherStartedAt == null`

### I — Done when
- [ ] All I.1–I.6 boxes checked
- [ ] tsc clean
- [ ] Manual smoke: simulate teacher-no-show by not clicking start, observe admin notif ladder fires, points refund after 20 min

---

## Phase J — Homework

### J.1 — Homework schema + editor
- [ ] New table `homework: { lessonId, studentId, teacherId, title, contentJson (TipTap JSON), status: "draft"|"assigned"|"in_progress"|"submitted"|"reviewed", assignedAt?, submittedAt?, reviewedAt?, dueAt? }`
- [ ] Install TipTap + extensions (`@tiptap/react`, `@tiptap/starter-kit`, etc.)
- [ ] Custom nodes:
  - `studentBlank` (inline, student types)
  - `studentCheckbox` (task list, student-toggleable)
  - `studentMultiChoice` (radio group)
  - `studentVocabList` (student adds words; button → add to flashcards)
- [ ] `<HomeworkEditor>` component
  - Teacher view: full edit; can drop in `student*` nodes
  - Student view: only `student*` nodes editable; teacher nodes locked
- [ ] Save on debounce (Convex mutation)

### J.2 — AI generate
- [ ] Convex action `homework.generateFromLesson`
- [ ] Takes `lessonId` → reads transcript + summary → OpenRouter prompt → returns TipTap JSON w/ mix of teacher prose + student fillables
- [ ] Teacher reviews + edits → saves

### J.3 — Student submission flow
- [ ] Student lesson page tab "Homework"
- [ ] Render `<HomeworkEditor mode="student">`
- [ ] "Submit" button → status flips to `submitted`, notify teacher
- [ ] Teacher review page: comment box + "Mark reviewed" button (no per-field comments in v1)

### J — Done when
- [ ] All J.1–J.3 boxes checked
- [ ] tsc clean
- [ ] Manual smoke: teacher writes homework, AI-generates one, student fills, submits, teacher reviews

---

## Phase K — Per-tab polish (was original "Phase I")

> Starts after H/I/J. Bug list from earlier (slow tab load, library icon, vocab missing English, admin-assign teachers) folded into per-tab passes:
> - Slow tab load → fixed globally during K kickoff via `loading.tsx` files
> - Library icon → swap `layers` → better glyph
> - Vocab missing English → investigated during Teacher Sessions Review polish
> - Admin teacher assign → handled by H.8

Order: Teacher portal first (tab-by-tab), then Student, then Admin. Specific tab list deferred until Phase K planning session.

---

## Change log (this file)

| Date | Change |
|---|---|
| 2026-05-11 | [Claude] Created. Phases H/I/J/K scoped after Gemini-Mustafa business blueprint + clarification rounds. Watchdog killed. Payment integration deferred to manual grants. |
