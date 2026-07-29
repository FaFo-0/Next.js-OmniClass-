# OmniClass — Platform Reference

> **What:** OmniClass — multi-tenant language-academy SaaS. First tenant: **Omnica English** (Russian/Arabic-L1 students learning English). Owner: Mustafa (FaFo).
> **Live:** https://next-js-omni-class.vercel.app · Convex prod `valuable-loris-929` · Org `org_3DIbJAWeR5CjVaBRlB4AZXL1UpD`
> **Stage:** pre-launch. Zero real students; target ~50. Don't build for scale that doesn't exist.
> **Business rules:** [POLICY.md](POLICY.md) is the single source of truth for payments, cancellation, no-show, pauses, trials. This file never restates policy — it links to it.
> **AI behavior rules:** [CLAUDE.md](CLAUDE.md).

---

## 1. How work happens here (FaFo's workflow — respect it)

1. **No phases, no steps, no roadmaps, no audits.** FaFo opens a page, finds things he wants changed, dumps them in chat. We change them. That's the whole process.
2. **Always ship at the end of a task**, without asking: `npx convex deploy` (backend first — it does NOT auto-deploy), then commit + `git push origin master` (Vercel auto-builds the frontend). Flag destructive schema changes in the summary but ship them.
3. **Build now, test at the very end.** Phone/mobile pass is dead last. **i18n language switch is broken and stays last** — translate only when UI/copy is final.
4. Don't refactor unrelated code. No over-engineering, no premature abstractions.
5. Update §5 Known Issues and the Change Log (§7) when work lands. Tag entries `[Claude]` / `[AI-Name]`.

**Standing technical rules (each one earned by a real bug):**

| Rule | Why |
|---|---|
| **`useQuery` comes from `convex-helpers/react/cache/hooks`, not `convex/react`.** Plain `useQuery` unsubscribes on unmount, so every tab switch refetched from scratch and the UI sat empty for a beat. | Fixed 2026-07-29. |
| **Never push server content back into a live TipTap editor.** The parent saves on a debounce and the server echoes a new object; applying it overwrites whatever was typed since. Ignore the echo, ignore updates while focused. | "Text deletes itself while writing" — fixed 2026-07-29. |
| **Never `new Date(date + "T" + time)` without a timezone.** Stored schedule times are **academy wall-clock** (anchor `Asia/Almaty`, no DST), not UTC. Convert via `wallTimeToMs` / `zonedToInstant` (`convex/lib/time.ts`, `src/lib/tz.ts`). | Same bug fixed 7+ times (crons, ICS, booking notice, slot filters, student dashboard). |
| **Reading model is locked:** a word is on the student's list (green) or it is prose. Never reintroduce per-word statuses (known/ignored/new). One `ReadingView` component for all portals — never fork it. | LingQ-style statuses built then removed 2026-07-29 as UX noise. |
| **The word list IS the flashcards.** `srsCards` is the single source; My Words, study queue, reading tint all read it. A card's answer is the translation into the student's L1 (`users.getLearnerLocale` resolves it: onboarding L1 → UI locale → null). | Two parallel systems drifted; unified 2026-07-29. |
| **"Points" are dead as a user-facing word.** Students see **lessons** ("8 lessons left"). Internals still use point tables at 1 lesson = 1 unit. | FaFo decision 2026-07-14. |
| Tailwind `inset-inline-*`/`inset-x-*` utilities generate no CSS in this setup — use inline `insetInlineStart/End` for absolute overlays. | Calendar bands collapsed to 2px. |
| Use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`) for future RTL. English first, then Russian, then Arabic. | Arabic market. |
| Never hardcode tenant branding — colors/name live in `tenantSettings`. | Multi-tenant. |
| All Convex access via `convex/lib/tenant.ts` (`requireTenant` / `requireTenantPermission` / `tenantTable`) — no raw cross-org `ctx.db` in feature code. | Tenancy isolation. |
| If style edits don't show in dev: delete `.next` (Turbopack stale cache). | Hit 2026-07-18. |

---

## 2. Architecture

Thin Next.js 16 shell (App Router, Turbopack) over **Convex**. Three portals — Student / Teacher / Admin — gated by **Clerk Organizations** (`org:admin|teacher|student`; JWT template `convex` carries `org_id`). Every row is org-scoped by `organizationId`. Styling: Tailwind v4 + shadcn/ui; brand = yellow `#FFCA00` canvas, purple `#6716A4` primary, dark-purple sidebar; font Inter. STT: Soniox v4 (`@soniox/speech-to-text-web`). LLM: OpenRouter (`OPENROUTER_API_KEY`), prompts per-org in `promptConfigs` with code fallbacks. i18n: next-intl scaffolding (`messages/en|ru|ar.json`) — switch currently broken, deliberately last.

**Key directories**

```
src/app/(student|teacher|admin|onboarding)   pages per portal
src/components/  shared/ (sidebar, nav, pills) · library/ (ReadingView, WordLookupPopover)
                 calendar/ (WeeklyCalendar, MonthCalendar, calendarShared) · homework/ (HomeworkEditor)
                 recording/ (RecordingPanel) · ui/ (shadcn)
src/lib/         auth · tz · timeFormat · transcript · soniox/ · ai/ · brand/ · format/
convex/          one file per domain (see §4) · lib/(tenant|policy|time|sm2|permissions|defaultPrompts)
scripts/dev-login.mjs   messages/   POLICY.md
```

---

## 3. Platform inventory — what exists today

### Student portal
| Page | What it does |
|---|---|
| `/student` | Dashboard: next-lesson card (real instants, viewer tz, Meet button only when link exists; date shown when >2h away), study-due card, stat cards (completed lessons, words, cards reviewed, lessons left), streak in header, recent published lessons. |
| `/student/lessons` (+`[id]`) | Lesson **history** from schedule events — Done / Upcoming / You missed it / Cancelled, in the student's timezone, filters + search; rows with published notes open them (AI summary, vocabulary, flashcards, self-graded quiz). |
| `/student/library` (+`[id]`) | Material cards w/ CEFR filter → shared ReadingView. Tap word → popover (dictionary + IPA + audio + L1 translation + ✨ contextual AI gloss) → "Add to my words". Green tint = on list. |
| `/student/study` | Hub: open homework, flashcards due (Start), reading recommendations. Session: SM-2 flip cards, translation-first backs, Again re-drills in-session (first rating = the recorded one), Space/1-4 keyboard, 60/session + 15 new/day caps; done screen shows unique cards + real streak. |
| `/student/vocabulary` "My Words" | The one word list: search, not-studied/learning/learned filters (learned = SM-2 interval ≥ 21d), inline translation edit, remove, due badge, "Study N due". |
| `/student/homework` (+`[id]`) | Full homework history (to-do / waiting review / completed w/ score) with due-date pills + standalone editor page: fill-blanks, multi-choice, open answers → submit → teacher feedback. |
| `/student/calendar` | Own lessons + assigned teacher's open ranges (viewer tz). Book (≥12h notice, ≤28d, 15-min grid, repeat-weekly option), policy-aware cancel/move with consequence labels, balance chip + horizon. |
| `/student/achievements` | Gallery with real progress bars, closest-to-done first; unlocks on open + after any qualifying event, with a notification. |
| `/student/profile` | Reached from the avatar menu (Clerk popup carries a Profile link next to Manage account / Sign out). Shared `AccountCard` (name / timezone / 12-24h / native language), balance, mailto-support to buy lessons, ICS subscribe URL. |
| `/student/book` | Legacy → redirects to calendar. |
| `/onboarding/student` | Post-signup form: age, WhatsApp, CEFR self-assessment, **native language (drives all flashcard translations)**, goal, preferred times → trial grant per `tenantSettings.trialPolicy`. |

### Teacher portal
| Page | What it does |
|---|---|
| `/teacher` | Dashboard: setup checklist (self-completing), today's classes, recent recordings, this-month earnings (30% share, POLICY §4), stat cards. |
| `/teacher/sessions` | Upcoming (start window: 2h before → 30min after end; Resume if already live) + Past. Start session creates real dated event if unscheduled (`createOneTimeLesson`). Inline rename. |
| `/teacher/sessions/[id]` | Review: transcript+notes, AI summary, editable vocabulary table (→ auto-flashcards on publish), homework editor w/ AI generation. Publish requires summary+vocab approved. |
| `/teacher/sessions/[id]/live` | Full-screen live room: Soniox STT (mic / mic+Meet tab / upload), stable Teacher/Student speaker labels, pause, timer; tabs: Reading / Quiz-from-transcript / AI conversation questions / auto-saved notes; share windows (`/teacher/share/quiz|reading`) for Meet screen-share; no-show flow; discard (= un-start, POLICY-correct); End → review. |
| `/teacher/students` (+`[id]`) | Roster w/ level, lessons left, next lesson, last seen, homework flags. Detail: balance/expiry, lesson stats, profile (incl. one-click **native language** setter — sweeps untranslated cards), homework counts, recent lessons, live local clock + flag. |
| `/teacher/library` (+`[id]?studentId=`) | Same grid as student. "Reading with:" student picker → words go to that student's list, translated into their L1; warning pill links to profile when L1 unset. |
| `/teacher/calendar` | Availability painting (brush + drag + undo, weekly or per-date), time-off blocks (>3d needs admin visibility, POLICY §5), lessons w/ hover cards, drag-reschedule, ghost cancelled, needs-attention inbox, meeting-room autofill, copy-week. |
| `/teacher/guide` | Onboarding handbook (setup, running a lesson, homework, library). |
| `/teacher/profile` | Shared `AccountCard` + permanent meeting room + this month's payable lessons. Reached from the avatar menu. |

### Admin portal
| Page | What it does |
|---|---|
| `/admin` | Metrics + real P&L from ledger (`reports.monthlyStats`), needs-attention list (dormant students, expiring credits, zero-balance skips, unpaid one-times — POLICY §7). |
| `/admin/people` | Students/Instructors tabs: pause/resume, teacher assignment, VacancyEditor (legacy), invites. ⚠️ Permissions tab is hardcoded mock. |
| `/admin/sessions` (+`/deleted`) | Org-wide sessions + soft-delete restore. |
| `/admin/library` (+`[id]`) | Upload markdown materials, publish toggle, ✨ Prepare (batch vocabulary pre-resolve, opt-in), reading preview. ⚠️ no PDF/audio file upload UI. |
| `/admin/calendar` | All-teachers overview + assign student into open slot (atomic 1-lesson deduction, buffer override with confirm). |
| `/admin/billing` | Packs tab (region-grouped catalog CA/Gulf, editor, seed) + pack-aware grant flow + remove-lessons. ⚠️ Records tab placeholder. |
| `/admin/settings` | Branding, AI prompt manager, achievements, scheduling knobs. ⚠️ several dead buttons (§5). |
| `/admin/scheduling/requests` | Pending reschedule queue. |
| `/admin/profile` | Shared `AccountCard` + link to academy-wide settings. Reached from the avatar menu. |

### Backend systems (`convex/`)
| System | Files | Behavior |
|---|---|---|
| Tenancy & auth | `lib/tenant.ts`, `lib/permissions.ts`, `users.ts` | Org-scoped everything; role + per-user permission overrides; `getLearnerLocale`, `setStudentL1`. |
| Calendar & scheduling | `calendar.ts`, `schedule.ts`, `scheduleCron.ts`, `lib/policy.ts`, `lib/time.ts` | Availability = weekly `teacherVacancies` ± `slotExceptions`; lessons = `scheduleEvents` (minute-positioned, statuses + audit fields); `recurringBookings` materialized ~7d ahead by cron (skips on zero balance → notify); open ranges computed, never stored; all policy checks server-side; crons: no-show ladder, reminders (24h/1h/5min), auto-resume pauses. Every rule reads POLICY via `lib/policy.ts`. |
| Lesson balance | `points.ts`, `billing.ts` | Lesson packs → `pointGrants` (60-day expiry from first use, POLICY §2), FIFO spend at booking, refunds per policy, full ledger. |
| Live lesson & AI content | `lessons.ts`, `lessonContent.ts`, `inLessonQuiz.ts`, `lessonAudio.ts`, `ai.ts`, `soniox.ts`, `promptConfigs` | Transcript → summary/vocab/flashcards/quiz via OpenRouter; publish pushes vocab as SRS cards; audio backup to storage. |
| Reading & word bank | `library.ts` | Free Dictionary → base-form fallback (`services`→`service`) → MyMemory translation (thesaurus dumps trimmed) → manual; org-wide cache `libraryWordLookups` w/ per-language `translations`, `isValid` gibberish flag; ✨ `aiWordGloss` = meaning in THIS sentence, banked; `_backfillCardTranslation` fills cards saved without a translation; `enrichMaterialVocabulary` batch pre-pass (opt-in). |
| SRS / word list | `srs.ts`, `lib/sm2.ts` | One default deck per student; add is idempotent per word; SM-2 with reviewer-local dates; 60/session + `NEW_CARDS_PER_DAY=15` caps; `listMyWords` (state derived: new/learning/learned), `getWordSet` (paints reading), edit/remove. |
| Homework | `homework.ts`, `homeworkAi.ts`, `nodes.ts` | Draft → assign → submit → review; auto-grading (fill-blank, choice) + teacher overrides; answer keys stripped server-side pre-review; student writes merge answers only. **`dueAt` defaults to the student's next lesson** (POLICY §10 defines the deadline that way) — stored as a real instant, teacher can override or clear via `setDueDate`. |
| Notifications | `notifications.ts`, `src/lib/notificationText.ts` | Kind+payload rows → human sentences; bell in all portals. |
| Gamification | `achievements.ts`, `streaks.ts`, `study.ts` | Study sessions + quiz attempts recorded; both bump the streak (`bumpStreak`, student-local dates) and run `evaluateAchievements` — recomputes all five counters (completed lessons, reviews, perfect quizzes, longest streak, learned words) and unlocks + notifies anything newly crossed. Idempotent; `syncMine` catches up on page open. |
| Onboarding & lifecycle | `onboarding.ts`, `retention.ts`, `maintenance.ts` | Student form + trial grant; admin attention signals; batched data-wipe helper (used for 2026-07-23 pre-launch reset). |
| ICS | `http.ts` (`/ics?token=`) | Per-user token feed, correct UTC conversion, Meet link as LOCATION. |
| Dev/CI helpers | `seed.ts`, `maintenance.ts` (`_wipeOldData` / `_wipeLibrary` / `_deleteSeedUsers` / `_resetStudent`), `schedule:seedTestEvent`, `homework:_seedCli` | Internal-only; seed a tenant, reset dev data, author test rows. Watch for seed drift vs schema. |

### Data model (one line per table — full shapes in `convex/schema.ts`)
`tenantSettings` (brand/policies/flags/trial/currencies) · `users` (role, teacherId, tz, timeFormat, pause fields, meetLink, icsToken) · `lessons` + `lessonVocabulary/Flashcards/QuizQuestions` + `inLessonQuizDrafts` · `libraryMaterials` · `libraryWordLookups` (shared word bank: translations per language, baseForm, isValid) · `srsDecks` / `srsCards` (translation, translationLocale, firstReviewedAt, SM-2 fields) / `reviewLogs` · `scheduleEvents` (audit: cancelledBy/At/Charged, rescheduledBy, recurringWeekKey) · `teacherVacancies` / `slotExceptions` / `recurringBookings` · `pointPackages` / `pointGrants` / `pointTransactions` · `homework` · `notifications` · `studentOnboarding` (incl. l1) / `studentProfiles` / `studentPauses` · `achievements` / `studentAchievements` / `streaks` / `studySessions` / `quizAttempts` · `billingRecords` / `expenses` / `exchangeRates` · `certificateTemplates` / `issuedCertificates` (schema only, no UI) · `teacherInvites` / `permissionRequests` / `promptConfigs` / `rescheduleRequests` / `studentRescheduleQuota` / `makeupCredits` / `scheduleEnrollments` (groups — schema only).

---

## 4. Deployment & dev

| Piece | Value |
|---|---|
| Vercel | project `next-js-omni-class`, team `fafo-s-projects`; `git push origin master` auto-builds prod. |
| Convex prod | `valuable-loris-929` — **manual `npx convex deploy` required for every `convex/` change** (no `CONVEX_DEPLOY_KEY` in Vercel). |
| Convex dev | `quixotic-quail-572` (`npx convex dev`). |
| Clerk | dev keys (`secure-husky-22.clerk.accounts.dev`) — swap to `pk_live` at launch. |
| Env — Vercel | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. |
| Env — Convex prod | `CLERK_JWT_ISSUER_DOMAIN`, `OPENROUTER_API_KEY`, `SONIOX_API_KEY`. |
| AI browser login | `node scripts/dev-login.mjs [teacher|admin|student]` → prints one-shot sign-in URL (5-min ticket). Dev users: teacher mhd.mustafa.allahham@, admin warp.smp@, student mustafa.allham777@. |

---

## 5. Known issues (current queue — add here as FaFo dumps them)

### Open
- Dev data was reset 2026-07-29 (see change log): teacher availability was wiped with everything else, so **repaint availability on the teacher calendar** before testing booking flows again.
- POLICY §10 teacher-side obligations still unbuilt: publish notes within 24h of lesson end, and unreviewed submissions surfacing in the teacher's needs-attention view.
- Lesson vocabulary rows created before 2026-07-29 have no `definition` (the field is new) — regenerate vocab on those lessons to fill it in.

### Admin portal (untouched, deliberately last)
- Dashboard: "AI Prompts Used" metric fabricated. People: Permissions tab hardcoded mock. Sessions: "View" routes into teacher paths. Library: no PDF/audio upload. Billing: Records tab placeholder. Settings: prompt Edit/Test dead, achievements Edit dead, logo upload dead, no invite-link copy/rotate UI, `/sign-up?invite=` wrapper unbuilt.

### Cross-cutting
- `users.listAllUsers` used as client-side name lookup in several teacher pages — ships all org emails to any client. Resolve names server-side (calendar already does).
- POLICY [PROPOSED] unbuilt: consent checkbox (§8), expiry warnings 14/3d (§2), homework 24h obligation (§10).
- i18n switch broken — **deliberately last**.
- Groups, certificates, payment gateways (Lemon Squeezy → Stripe), teacher payroll: schema-ready or planned, no UI — post-launch.
- Tech debt: transcript passed via global `window` bridge on live/review pages; `any`-typed map callbacks in older pages.

---

## 6. Product decisions already made (don't relitigate)

Reading = collecting into one word list (no per-word statuses) · flashcards drawn only from the list, translation-first, 15 new/day · lessons not points · v1 = 1-on-1 online lessons only (activity types return post-v1) · Google Meet links manual (OAuth removed) · one unified calendar, availability painted not scheduled · recurring weekly slot is the core booking object · reschedule ≠ cancel; consequences always shown before confirm · English definitions v1, learner-L1 translations automatic · no auto student-lifecycle statuses (admin attention list instead, POLICY §7) · certificates/groups deferred until FaFo asks · Reports tab removed (folded into Students).

---

## 7. Change Log

> Older history (2026-05 → 2026-07-29, the phased build era) lives in git: `git log --follow MASTER_PLAN.md`, plan version `804bdfc` and earlier.

| Date | Change |
|---|---|
| 2026-07-29 | **[Claude]** **Dev data reset** (dev `quixotic-quail-572` only — production untouched). Ran `_wipeOldData` (42 rows: lessons, cards, decks, homework, schedule events, streaks, achievements-earned, notifications, word-bank cache, study/review logs) and added two switches it deliberately lacks: `_wipeLibrary` (library material is academy *content*, so it needs its own explicit switch) and `_deleteSeedUsers` (dropped the "Test Student" placeholder — a seeded `seed-…` externalId has no Clerk identity behind it and can never sign in). New `_resetStudent` clears the flags that outlive a history wipe — `onboardingComplete`, status, pause fields, ICS token — so student 1 now walks the real onboarding flow, native-language question and trial grant included; the teacher pairing stays, being academy setup rather than student history. Kept: the three real people, tenant settings, 11 achievement definitions, 4 prompt configs, 6 lesson packs. **Teacher availability was wiped too** (it lives in the transactional set) — repaint it before testing booking. Fixed a rule violation spotted on the way through: the onboarding screen promised "5 free trial points" — the copy says **lessons** everywhere now. |
| 2026-07-29 | **[Claude]** **FaFo dump — speed, profiles, homework, vocabulary.** (1) **Every tab switch refetched from scratch** because plain `useQuery` drops its subscription on unmount. Added `ConvexQueryCacheProvider` and moved all 40 call-sites to the cached hook; returning to a page now renders with data already in hand (measured: the stat that used to flash empty reads its real value on the first frame). (2) **Countdowns replace clock times** — "2 hours 31 minutes until your lesson" on the student dashboard and a matching line on the teacher's, ticking every 30s (`src/lib/countdown.ts`); the exact local time stays underneath. (3) **One menu behind the avatar for every role**: Clerk's popup now carries a Profile link next to Manage account and Sign out, `/teacher/profile` and `/admin/profile` exist for the first time, and all three share an `AccountCard` (name / timezone / clock / native language) so a teacher's settings can't drift from a student's; the duplicate sidebar Profile entry is gone. (4) **Homework text no longer deletes itself while typing** — the debounced save echoed back a new object, the editor treated it as an external change and overwrote everything typed since; now the echo is ignored, incoming content never lands while the editor has focus, and the editor only re-creates on a genuinely different document. Verified: 134 characters typed across two bursts survive the save round-trip intact. (5) **Homework AI generated only blanks + a separate quiz** — one prompt now builds a mixed worksheet (gap-fill from the transcript, multiple choice, open writing), which is what the editor has supported all along. (6) **Homework ships with Publish**, like summary and vocabulary: the separate "Assign to student" button is replaced by **Approve**, `lessons.publish` sends every approved draft (with the due date), and reopening a lesson pulls its homework back to editable — unless the student already started it, whose work is theirs. (7) **Vocabulary tab drops Locale / POS / IPA** (never shown to anyone) **for an English definition**, so a word from a lesson arrives with the same shape as one collected from the library — translation to study from, definition for context. The AI vocab prompt asks for it, and published cards carry it onto the back. |
| 2026-07-29 | **[Claude]** **Homework due dates, end to end.** `dueAt` had been in the schema since Phase J with nothing ever writing it. Rather than make a teacher invent a date every time, **assigning defaults the deadline to the student's next scheduled lesson** — POLICY §10 defines the obligation as "check the student's submitted homework before the next lesson", so that lesson *is* the deadline. Computed server-side from the soonest scheduled/makeup event via `wallTimeToMs` and stored as a real instant (never a bare date string — rule §1); no upcoming lesson means no deadline, which is honest. Teacher can override with a picker at assign time or change/clear it afterwards (`homework.setDueDate`); the notification payload carries the date. New `src/lib/homeworkDue.ts` renders one consistent phrasing everywhere — "Due today at 10:00 PM" / "Due tomorrow" / "Due Friday" / "Was due Jul 27" — shown on the Study hub, the homework list and the homework page itself, and only while it's still the student's move. **Overdue is amber, never red, and never scolds:** POLICY §10 says homework completion is a retention signal for the teacher, never something the student is punished for. Verified end-to-end: seeding an assignment with no date picked up the next lesson's instant automatically; overdue and due-today pills render correctly on all three surfaces. Dev helper `homework:_seedCli` added to author+assign without the teacher UI. |
| 2026-07-29 | **[Claude]** **Achievements unlock for real; lessons page becomes a history.** (1) **Unlock engine** (`evaluateAchievements` in `convex/achievements.ts`): recomputes all five counters from their true sources — completed *schedule events* (attendance, not published notes), `reviewLogs`, perfect `quizAttempts`, **longest** streak (a week earned in March stays earned), cards with SM-2 interval ≥ 21d — and inserts any newly-crossed unlocks plus an `achievement_unlocked` notification. Deliberately recompute-everything rather than incremental counters: at ~50 students it's a few reads and it can't drift. Called from `recordSession`, `recordQuizAttempt` and lesson publish, plus `syncMine` on page open for counters that moved elsewhere. `listForStudent` now returns live progress, so the bars mean something (they were hardcoded `0%`), sorted closest-to-done first. Verified: reviewing a card unlocked First Review; seeding two completed lessons then opening the page unlocked First Steps and showed "2 / 5 lessons". (2) **My Lessons rebuilt as lesson history** (`lessons.myLessonHistory`): the page listed only published notes, so a student who'd had ten lessons with no write-ups saw nothing. Now every schedule event — Done / Upcoming / Make-up / Cancelled / "You missed it" / "Teacher missed it" — in the student's own timezone, with teacher name, filters (All/Upcoming/Completed/Missed) and search; rows that have published notes link to them, the rest are inert. (3) Dashboard "Lessons completed" already switched to completed events in the previous wave — the only honest source, since notes are optional paperwork. (4) Dev helper `schedule:seedTestEvent` gained `studentEmail` / `dayOffset` / `status` / `title` so a history can be seeded for a specific student. |
| 2026-07-29 | **[Claude]** **Student portal wave 1 — dead things now work.** (1) **Streaks were dead code**: `_updateStreak` had no caller anywhere, so every streak was permanently 0 across six displays. Rewrote `streaks.ts` around an exported `bumpStreak` called from `study.recordSession` + `recordQuizAttempt` (studying IS the bump — no client mutation to game), counting days in the STUDENT'S timezone; yesterday-math on local date strings. Session header + done screen now show the real value (verified: finished a session → "1 days"). (2) **Dashboard**: wall-time bug fixed (next-lesson found by real instants via `zonedToInstant`, shown in the student's tz + clock format); "Join in N min" only within 2h, otherwise the actual date; Meet button renders only when the event has a link; "Lessons completed" counts completed schedule events, not published notes; streak stat card (duplicate of header) replaced with **Lessons left** (red at 0). (3) **Profile**: Edit dialog (name / timezone / 12-24h / **native language** — self-service at last, saves via new `users.updateMyProfile`, L1 change sweeps old untranslated cards), real Clerk sign-out, "contact provider" is now a mailto to `tenantSettings.supportEmail`. Verified: set Russian → subtitle updates → set back to Arabic. (4) **Study honesty**: done-screen counts unique cards (an "Again" re-drill no longer inflates reviewed count or sinks accuracy — first rating is the honest one), dead "All Due" select removed, fake interval labels ("4 · 4d") dropped, and the keycaps finally work: Space/Enter flips, 1–4 rate (fixed a hooks-order crash from putting the effect after an early return). (5) Lessons page: dead All/Past tabs and raw "published" pills removed; sidebar Library icon `layers`→`book`, My Lessons `book`→`file`. |
| 2026-07-29 | **[Claude]** MASTER_PLAN rewritten as a minimal platform reference (inventory + rules + known issues) matching FaFo's workflow — no phases/steps/audit checklists. CLAUDE.md updated to current stack (Convex/Clerk, not Zustand/Supabase). Deleted `Omnica-new-UI/` prototype (1.1MB, long since ported; recoverable from git). Logged student-portal audit into §5. |
