# Phase H · I · J — Monetization, Booking, Live Lesson, Homework

> **Why this file exists:** Phases H/I/J are big, deeply scoped, and need checkable items. `MASTER_PLAN.md` keeps the high-level architectural truth; this file is the working punch-list. When a phase completes, fold the bullets back into `MASTER_PLAN.md` change log and delete the corresponding section here.

**Status:** Phase H — CODE COMPLETE (2026-05-11). Awaiting end-of-phase manual smoke test before sign-off.
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

### H.2 — Activity types config ✅ DONE 2026-05-11 (commit `46372fe`)
- [x] `tenantSettings.activityTypes` field + default seed (1on1_general/ielts, online_group, offline_group)
- [x] `scheduleEvents.activityTypeId` + `pointCostSnapshot` + `capacity` fields
- [x] Queries `tenantSettings.getActivityTypes` + mutation `setActivityTypes`
- [ ] Admin /settings UI block to edit activity types (deferred — config UI bundled with future H polish)

### H.3 — Multi-currency ✅ DONE 2026-05-11 (commit `46372fe`)
- [x] `tenantSettings.currencies` array w/ rateToUSD + symbol + primary flag; USD-only by default
- [x] Helpers `formatPrice` / `formatPriceDual` / `pickPrimary` in `src/lib/format/currency.ts`
- [x] `useCurrency()` React hook reads tenant settings
- [x] /admin/billing package prices flow through `format()`
- [ ] Admin /settings UI block to manage currencies (deferred — bundled with H polish)
- [ ] Daily FX auto-pull cron (deferred — `currencyAutoUpdate` field already in schema for future)

### H.4 — Tier price freeze ✅ DONE 2026-05-11 (commit `46372fe`)
- [x] `users.lockedPriceTier` + `users.subscriptionStatus` fields
- [x] New `priceMigrationAudit` table
- [x] `points.resolveEffectivePrice` query honors lock, falls back to current package price
- [x] `points.forceMigratePackagePrice` writes audit snapshot + clears locks
- [x] `points.undoPriceMigration` restores from snapshot
- [ ] Admin /billing UI button to trigger force-migrate + undo (deferred — needs Phase H polish settings page)

### H.5 — Student onboarding form + trial ✅ DONE 2026-05-11 (commit `fa2f0e8`)
- [x] `/onboarding/student` page w/ all required fields
- [x] `convex/onboarding.ts` (getMyOnboarding/getTrialPolicy/completeStudentOnboarding)
- [x] Free trial grant via `points.grantPointsInternal` on first completion when `trialPolicy.enabled && !requiresPayment`
- [x] `studentOnboarding` table
- [x] Auth-side redirect in `src/lib/auth.tsx` when student has `onboardingComplete !== true`

### H.6 — Teacher invite link ⚠ PARTIAL DONE 2026-05-11 (commit `fa2f0e8`)
- [x] `tenantSettings.teacherInviteToken` + `teacherInvites` table
- [x] Mutations: getTeacherInviteToken / rotateTeacherInviteToken / resolveTeacherInvite (public) / acceptTeacherInvite (flips caller to role=teacher when token matches)
- [ ] Admin /settings UI to copy/regenerate link (deferred — needs settings page)
- [ ] `/sign-up?invite=…` wrapper that calls `acceptTeacherInvite` post-Clerk-signup (deferred — requires Clerk Backend SDK call to attach user to tenant org first)
- [ ] `/onboarding/teacher` lightweight form (deferred)
- [ ] Bug #2 (no-org user → Omnica English): waits on the wrapper above

### H.7 — Teacher vacancies ✅ DONE 2026-05-11 (commits `fa2f0e8`, `b8f9863`)
- [x] `teacherVacancies` table
- [x] `convex/vacancies.ts`: listForTeacher / replaceForTeacher / getWeeklyHours / getBookableSlots
- [x] `<VacancyEditor />` grid 06:00–23:00 × Mon–Sun w/ click + drag toggle, save merges adjacent slots
- [x] Mounted in /teacher/calendar above upcoming-events list
- [x] <10h soft warning
- [ ] Admin view of any teacher's vacancies (deferred — same components reusable when needed)

### H.8 — Admin student↔teacher pairing ✅ DONE 2026-05-11 (commit `b8f9863`)
- [x] `users.assignTeacher` mutation w/ notifications to old + new teacher
- [x] Inline `<Select>` per student row in /admin/people Students tab
- [x] Notification kinds `student_assigned` / `student_unassigned` added to schema
- [x] Teacher dropdown shows "· IELTS" suffix on `ieltsCertified` flag
- [ ] "Unpaired students" filter toggle (deferred — minor)

### H.9 — Student booking page ✅ DONE 2026-05-11 (commit pending)
- [x] /student/book route with activity tile grid
- [x] 1on1/IELTS: assigned-teacher card + 4-week 30-min slot picker (api.vacancies.getBookableSlots) + WhatsApp escape link
- [x] Confirm modal w/ cost + balance-after, blocks confirm if insufficient
- [x] `schedule.bookSlot` mutation: atomic insert + spend, validates pairing + activity type + slot conflict
- [x] Group activities: open enrollment list (next 28 days, status=scheduled)
- [x] Insufficient-balance CTA inline ("Need X more points")
- [x] Sidebar nav "Book" item inserted between Home and My Lessons
- [ ] "Book recurring pattern" weekly multi-pick (deferred — single-slot booking ships now; recurring pattern is a polish add)

### H.10 — Group session enrollment ✅ DONE 2026-05-11 (commit pending)
- [x] `scheduleEnrollments` table + indices
- [x] `convex/enrollments.ts`: enroll / unenroll (refund) / markAttendance / listForEvent / listForStudent / countActiveForEvent
- [x] Capacity check (`scheduleEvents.capacity`) blocks full sessions
- [x] /student/book wires Join/Leave buttons
- [ ] Teacher group-session roster + attendance checkboxes (deferred — Phase I session-detail polish)

### H.11 — Admin manual point grant UI ✅ DONE 2026-05-11 (commit `8f8c401`)
- [x] /admin/billing "Grant points" button + dialog (student picker, amount, expiry, reason)
- [x] Calls `points.grantPoints({ source: "manual", … })`
- [x] pointTransactions audit row written by mutation

### H.12 — `.ics` calendar export ✅ DONE 2026-05-11 (commit pending)
- [x] `convex/http.ts` GET `/ics?token=…` returns RFC-5545 VCALENDAR
- [x] `convex/icsInternal.ts` internal query resolves token → org + student → upcoming non-cancelled events
- [x] `users.ensureIcsToken` + `users.rotateIcsToken` mutations
- [x] /student/profile "Copy calendar URL" button uses navigator.clipboard
- [x] Cache-Control: 15-min cache header (Google/Apple poll on their own cadence)

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
