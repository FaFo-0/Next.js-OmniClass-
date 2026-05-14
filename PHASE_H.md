# Phase H · I · J — Monetization, Booking, Live Lesson, Homework

> ⚠️ **2026-05-14: This file's content has been merged into `MASTER_PLAN.md`.** Phase H/I/J descriptions, locked decisions, checklists, and Phase K audit now live there. This file remains for the detailed checkbox lists (H.1–H.12, I.1–I.6, J.1–J.3) and the per-tab Phase K punch-list. Always cross-reference with `MASTER_PLAN.md`.

**Status:** Phase H — CODE COMPLETE (2026-05-11, polish + recurring booking 2026-05-14). Phase I — CODE COMPLETE (2026-05-14). Awaiting Mustafa's end-of-phase manual smoke.
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

### H.6 — Teacher invite link ⚠ PARTIAL DONE 2026-05-11 / 2026-05-14 (commits `fa2f0e8`, `3c75d46`)
- Admin /settings now has a "Teacher invite link" card with copy + rotate (commit `3c75d46`).
- `/sign-up?invite=…` wrapper and `/onboarding/teacher` form still deferred (need Clerk Backend SDK to attach the new user to the tenant org — out of scope without dashboard access).
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
- [x] Admin view of any teacher's vacancies — "Vacancies" button on instructor rows in /admin/people opens VacancyEditor dialog (commit `3c75d46`).

### H.8 — Admin student↔teacher pairing ✅ DONE 2026-05-11 (commit `b8f9863`)
- [x] `users.assignTeacher` mutation w/ notifications to old + new teacher
- [x] Inline `<Select>` per student row in /admin/people Students tab
- [x] Notification kinds `student_assigned` / `student_unassigned` added to schema
- [x] Teacher dropdown shows "· IELTS" suffix on `ieltsCertified` flag
- [x] "Unpaired students" filter toggle (commit `3c75d46`)

### H.9 — Student booking page ✅ DONE 2026-05-11 (commit pending)
- [x] /student/book route with activity tile grid
- [x] 1on1/IELTS: assigned-teacher card + 4-week 30-min slot picker (api.vacancies.getBookableSlots) + WhatsApp escape link
- [x] Confirm modal w/ cost + balance-after, blocks confirm if insufficient
- [x] `schedule.bookSlot` mutation: atomic insert + spend, validates pairing + activity type + slot conflict
- [x] Group activities: open enrollment list (next 28 days, status=scheduled)
- [x] Insufficient-balance CTA inline ("Need X more points")
- [x] Sidebar nav "Book" item inserted between Home and My Lessons
- [x] "Book recurring pattern" weekly multi-pick — confirm dialog has Repeat-weekly toggle + N-weeks input, previews conflicts in red, books bookable slots and surfaces a "skipped" toast (commit `26819da`).

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
- [x] All H.1–H.12 boxes checked (H.6 sign-up wrapper deferred — Clerk Backend SDK blocker)
- [x] `npx tsc --noEmit` clean
- [ ] Manual smoke: create teacher via invite link, set vacancy, admin pairs student, student onboards + gets trial, student books 1on1 slot, points debit correctly, student joins group, group enrollment debits separately
- [ ] Mustafa confirms end-to-end booking demo

---

## Phase I — Live lesson maturity

### I.1 — Audio backup ✅ DONE 2026-05-14 (commit `d78f45f`)
- [x] `convex/lessonAudio.ts` exposes `generateUploadUrl` + `setAudioFile`.
- [x] `SonioxRecorder.getCaptureStream()` returns the active MediaStream.
- [x] `RecordingPanel` mounts a parallel `MediaRecorder` (audio/webm;codecs=opus, 64 kbps) and flushes a chunk every 120 s + a final flush on stop. Final flush patches `lessons.audioFileId`.
- [x] Failure paths logged + ignored so transcript flow is never blocked.

### I.2 — Google Meet auto-link (best-effort) ⚠ WIRED 2026-05-14 (commits `ff5b087`-adjacent + this)
- [x] `convex/meet.ts` action `createCalendarEvent` (Node runtime, refreshes token, POSTs Calendar API w/ `conferenceData.createRequest`).
- [x] `convex/meetInternal.ts` internal helpers (`_getRefreshToken`).
- [x] `users.hasGoogleConnected` / `setGoogleOAuthToken` / `disconnectGoogle` queries + mutations.
- [x] Next route handlers `/api/auth/google/start` → consent flow; `/callback` → exchanges code + stashes refresh token in HttpOnly cookie; `/consume` → client reads + clears cookie, persists via Convex session.
- [x] Middleware exempts `/api/auth/google/*`.
- [x] /teacher/calendar has the Google Meet Connect/Disconnect card + the on-mount completion effect.
- [x] /admin/calendar Create Event dialog fires meet.createCalendarEvent post-create when teacher present and no manual link pasted; falls back silently when env vars absent.
- [ ] Requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` in env + Google Cloud OAuth consent screen set up — admin task before live testing.

### I.3 — Multi-window share screens ✅ DONE 2026-05-14 (commit `ff5b087`-adjacent)
- [x] New `/teacher/share/quiz` page (large-type single-question viewer, arrow / space keyboard nav, reveal button).
- [x] New `/teacher/share/reading` page (material picker → ReadingView fullscreen). Picks up lesson's studentId so word taps stay live-teach.
- [x] Live lesson toolbar gained `Quiz window` + `Reading window` buttons that `window.open()` with sized features.

### I.4 — Pause transcription (timer continues) ✅ DONE 2026-05-14 (commit `ff5b087`-adjacent)
- [x] RecordingPanel `pausedRef` short-circuits the Soniox token callback while keeping the WebSocket + timer alive.
- [x] Pause/Resume button + yellow paused banner under the timer.

### I.5 — Student no-show ✅ DONE 2026-05-14 (commit `ff5b087`-adjacent)
- [x] Live lesson toolbar red-outline "No-show" button → confirm → `api.lessons.markNoShow({ by: "student" })` → routes to review page.

### I.6 — Teacher no-show automation ✅ DONE 2026-05-14 (commit `ff5b087`)
- [x] `convex/scheduleCron.ts:checkTeacherNoShowsCron` runs every 5 min via `crons.interval`.
- [x] Ladder: -5 min admin notif → at-start notif → +10 min notif → +20 min auto-refund + status=`no_show_teacher` + student apology + admin final notif.
- [x] `scheduleEvents.noShowNotifications: {level,sentAt}[]` gates idempotency.
- [x] `schedule.markTeacherStarted` + `markTeacherStartedNearby` mutations; live lesson page fires Nearby on mount.

### I — Done when
- [x] All I.1–I.6 boxes checked
- [x] tsc clean
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

### K.0 — Pre-K blockers (fix before Phase I starts)
These gate Phase I — live lesson maturity can't land until these work.

| # | Issue | Location |
|---|---|---|
| K.0-1 | **Calendar grid not functional.** `WeeklyCalendar.tsx` (294 lines) is fully built but NEVER used. All 3 portals show placeholder text. Wire `WeeklyCalendar` to student/teacher/admin calendar pages. | `src/app/student/calendar/page.tsx:75`, `src/app/teacher/calendar/page.tsx:174`, `src/app/admin/calendar/page.tsx:16` |
| K.0-2 | **Calendar nav buttons dead.** "Today", prev/next arrows have no onClick handlers across all 3 portals. | `src/app/student/calendar/page.tsx:31-33`, `src/app/teacher/calendar/page.tsx:113-114`, `src/app/admin/calendar/page.tsx:144-145` |
| K.0-3 | **Notification bell not wired.** `convex/notifications.ts` has full CRUD — `listUnread`, `markRead`, `markAllRead`, internal `_notify` — but ZERO frontend consumers. Phase I needs in-app notifications for no-show flows, make-up credits, reschedule approvals. `NotificationsBell.tsx` exists but is still a stub. | `convex/notifications.ts`, `src/components/shared/NotificationsBell.tsx` |
| K.0-4 | **scheduleEvents ↔ lessons not linked.** Teacher sees events on their calendar but clicking one opens a reschedule dialog, not "Start lesson." The "Start Session" flow in `/teacher/sessions` creates an unrelated lesson row. Need to add `scheduleEventId` to lessons, and add a "Start this lesson" button on calendar event rows that creates a lesson pre-linked to the event. | `src/app/teacher/sessions/page.tsx:148-189`, `convex/lessons.ts:create`, `convex/schema.ts` (lessons table needs `scheduleEventId` field) |

### K.1 — Student Portal Bugs
| # | Issue | Location |
|---|---|---|
| K.1-1 | **Vocabulary "Create deck" button dead.** No onClick handler. | `src/app/student/vocabulary/page.tsx:33` |
| K.1-2 | **Vocabulary filter chips dead.** "All", "Recent", "By Lesson" chips have no filtering logic — only search input works. | `src/app/student/vocabulary/page.tsx:42-52` |
| K.1-3 | **Profile "Edit profile" dead.** No onClick, no form. | `src/app/student/profile/page.tsx:53` |
| K.1-4 | **Profile "Sign out" dead.** No handler. | `src/app/student/profile/page.tsx:119` |
| K.1-5 | **Profile "Contact your provider" dead.** No purchase flow. | `src/app/student/profile/page.tsx:87-89` |
| K.1-6 | **Achievements progress hardcoded to 0%.** `listForStudent` returns data but progress always shows `width: "0%"` and `"0 / {threshold}"`. | `src/app/student/achievements/page.tsx:42-45` |
| K.1-7 | **Dashboard "Join on Google Meet" dead link.** Falls back to `href="#"` when no meet link exists, no visual feedback. | `src/app/student/page.tsx:66` |
| K.1-8 | **Calendar events don't link to lesson detail.** Events are inert `<div>` elements — no `<Link>` or onClick navigation. | `src/app/student/calendar/page.tsx:49-61` |
| K.1-9 | **Lessons "Past" tab filter has no effect.** Tab state is ignored — only search filters. | `src/app/student/lessons/page.tsx:41-52` |
| K.1-10 | **Study streak always shows 0.** Completion screen + during-study progress bar both hardcoded to 0. Needs `streaks.getForStudent` wired into study flow. | `src/app/student/study/page.tsx:134,157` |
| K.1-11 | **Book page loads all org events.** `listForOrg` for group section — data leak + perf issue. Should use scoped query. | `src/app/student/book/page.tsx:311` |
| K.1-12 | **Library word popup shows fake definition.** In-page `ReadingView` popover on the library list always shows `"Look up definition..."` — never calls Convex word lookup action. | `src/app/student/library/page.tsx` |

### K.2 — Teacher Portal Bugs
| # | Issue | Location |
|---|---|---|
| K.2-1 | **Student rows not clickable.** Chevron-right icon suggests drill-down but rows are inert `<div>` — no link to student detail. | `src/app/teacher/students/page.tsx:37-52` |
| K.2-2 | **Engagement tab shows minimal data.** Just name/status/locale — no lesson counts, attendance %, study metrics. | `src/app/teacher/reports/page.tsx:44-70` |
| K.2-3 | **Sessions query uses Clerk ID not teacher externalId.** Potential mismatch in multi-tenant. Comment notes `currentUserId` is not the teacher's `externalId`. | `src/app/teacher/sessions/page.tsx:29-32` |
| K.2-4 | **Transcript bridge uses global window variable.** `window.__omnic_setTranscriptSnapshot` — fragile, known tech debt. | `src/app/teacher/sessions/[id]/live/page.tsx:71-75` |

### K.3 — Admin Portal Bugs
| # | Issue | Location |
|---|---|---|
| K.3-1 | **Dashboard finances are fake.** Revenue/ad spend/expenses/teacher pay/net profit are computed from `students * 0.83`. Not real data. | `src/app/admin/page.tsx:22-33` |
| K.3-2 | **"AI Prompts Used" is fake.** `promptConfigs.length * 487` — completely fabricated. | `src/app/admin/page.tsx:20` |
| K.3-3 | **Billing "Records" tab is placeholder.** Shows deferred message, no payment history. | `src/app/admin/billing/page.tsx:167-172` |
| K.3-4 | **Settings AI prompt "Edit"/"Test" buttons dead.** No handlers on each prompt config card. | `src/app/admin/settings/page.tsx:157-158` |
| K.3-5 | **Settings achievements "Edit" dead.** No form. | `src/app/admin/settings/page.tsx:191` |
| K.3-6 | **Settings logo upload non-functional.** Dashed-border box, no file input. | `src/app/admin/settings/page.tsx:85-89` |
| K.3-7 | **Permissions tab is hardcoded mock.** Shows Admin=Full, Manager=Granted, Sales=—, Support=— with no Convex connection. | `src/app/admin/people/page.tsx:253-291` |
| K.3-8 | **Sessions "View" routes to teacher path.** Admin clicks view → goes to `/teacher/sessions/[id]`. Should stay in admin context. | `src/app/admin/sessions/page.tsx:83` |
| K.3-9 | **Package creation UI not built.** "Catalog UI ships in H.11" message. Cannot create/edit point packages from admin UI. | `src/app/admin/billing/page.tsx:158` |
| K.3-10 | **Library admin page no file upload.** `kind: "pdf"` exists but only markdown textarea — no actual file upload mechanism. | `src/app/admin/library/page.tsx:3-4` |

### K.4 — Cross-cutting Polish
| # | Issue | Location |
|---|---|---|
| K.4-1 | **Markdown rendering is plain text.** ReadingView strips all formatting. Swap in markdown renderer. | `src/components/library/ReadingView.tsx:57-59` |
| K.4-2 | **Calendar events don't highlight "today".** No visual indicator for today's events vs. future. | All 3 calendar pages |
| K.4-3 | **WeeklyCalendar unused.** 294-line fully built component with event overlays, color-coding, click handlers — imported nowhere. | `src/components/calendar/WeeklyCalendar.tsx` |

### K.5 — Connectivity gaps from Phase H audit (2026-05-14 [DeepSeek V4 Pro])
| # | Severity | Issue |
|---|---|---|
| K.5-1 | HIGH | **Admin createEvent doesn't deduct points.** `/admin/calendar` "Create event" inserts `scheduleEvents` with `pointCostSnapshot` but never calls `spendPointsInternal`. UI shows point costs, creating false expectation. |
| K.5-2 | HIGH | **Students cannot cancel or reschedule events.** No cancel mutation exposed to students. `requestReschedule` exists server-side but no student UI calls it. Teacher + admin can reschedule; student has neither cancel nor reschedule. |
| K.5-3 | MEDIUM | **Student dashboard shows no point balance.** `/student` (landing page) never calls `api.points.getBalance`. Balance visible on `/student/book` and `/student/profile` only. |
| K.5-4 | MEDIUM | **ICS URL construction may be broken.** Fallback to `${window.location.origin}` fails if env vars unset. |
| K.5-5 | MEDIUM | **Teacher invite link incomplete (H.6 partial).** Schema + mutations exist but: no admin UI to copy/regenerate link, no `/sign-up?invite=...` wrapper, no `/onboarding/teacher` form. |
| K.5-6 | LOW | **Booking page loads all org events** (K.1-11) — data leak + perf issue in group booking section. |
| K.5-7 | LOW | **No student persona classification.** No `isChild`/`ageGroup`/`persona` field. Age collected but unused downstream. |

---

## Change log (this file)

| Date | Change |
|---|---|
| 2026-05-11 | [Claude] Created. Phases H/I/J/K scoped after Gemini-Mustafa business blueprint + clarification rounds. Watchdog killed. Payment integration deferred to manual grants. |
