# OmniClass Platform — Master Plan

> **Software:** OmniClass — vertical-agnostic class management SaaS.
> **First tenant:** **Omnica English** — English language academy (Russian + Arabic L1 students learning English).
> **Owner:** Mustafa.
> **Stack (locked):** Next.js 16 (App Router, Turbopack) · Tailwind CSS v4 · shadcn/ui · Convex · Clerk (with Organizations) · Soniox v4 STT · OpenRouter LLMs · next-intl (en/ru/ar).
> **Status:** Phases A–J **COMPLETE**. Now in **Phase Z** — Bug Fixes & Polish. Tab-by-tab: Teacher → Student → Admin.
> **Live:** https://next-js-omni-class.vercel.app (Vercel prod). **Always push/deploy here** — this is the working site. Convex prod: `valuable-loris-929`. See §12 Deployment.
> **Org ID:** `org_3DIbJAWeR5CjVaBRlB4AZXL1UpD` (Omnica English)
> **AI attribution:** All work from 2026-05-06 onward tagged per CLAUDE.md §9. DeepSeek V4 Pro = `[DeepSeek V4 Pro]`, Claude = `[Claude]`.

---

## 0. Mental Model

OmniClass = thin SPA shell (Next.js) over Convex DB. Three portals (Student / Teacher / Admin) gated by Clerk org role. Every Convex row is **organization-scoped** via `organizationId: string` (Clerk `org_*` ID). Branding (yellow background, deep purple primary) lives in a per-tenant `tenantSettings` document.

Fundamental flows:

1. **Live lesson** — Teacher opens dashboard → starts Soniox transcription → mid-lesson taps "Generate quiz from current buffer" (async, non-blocking) and/or opens **Reading Hub** to read with student → Stop & Save → Session detail page → AI generates summary/vocab/flashcards/quiz → Publish to student.
2. **Async study** — Student browses **Library** + lessons, taps a word → free Dictionary API popup → "Add to My Flashcards" → SRS deck. Studies via SM-2.
3. **Live read-along** — Teacher opens Library material with `?studentId=...` → tap a word → "Send to Student's Flashcards" pushes directly into the active student's deck.
4. **Scheduling** — Student books a slot from assigned teacher's vacancies. Teacher starts session from the scheduled event. No-show flagged; teacher no-show triggers automated refund via cron.

---

## 1. Brand System (Omnica English)

### 1.1 Visual identity
| Token | Value | Usage |
|---|---|---|
| `--brand-yellow` | `#FFCA00` | Page canvas / app background |
| `--brand-yellow-soft` | `#FFF4CC` | Card hover, secondary fills |
| `--brand-purple` | `#6716A4` | Primary actions, headings, sidebar active accent |
| `--brand-purple-hover` | `#581289` | Button hover |
| `--brand-purple-deep` | `#4A1075` | Pressed state |
| `--brand-purple-tint` | `#F3EBFA` | Selected backgrounds |
| `--brand-purple-soft` | `rgba(103,22,164,.08)` | Avatars, icon chips |
| `--app-bg` | `#FAFAFA` | Surface inside sidebar layout |
| `--card-bg` | `#FFFFFF` | All cards |

> **Canvas decision:** The outer shell uses yellow `#FFCA00` as the page edge band; the inner content surface stays `#FAFAFA`/white. Cards remain white. Purple is the only accent color for actions/text. Sidebar: dark purple gradient (`#4E1280` → `#350B61` → `#2A0850`).

Typography: **Inter**. Logo wordmark: Georgia / Plantagenet Cherokee serif.

### 1.2 Logo
Two-color mark (yellow ring + purple solid). Wordmark "Omnica" + ".english" subscript in purple. Sizes 28/34/48.

### 1.3 Multi-tenant rule
Never hardcode "Omnica English" or hex values in components. Brand values live in `tenantSettings`. Phase A brand resolver injects CSS vars.

---

## 2. Multi-Tenancy Foundation (Phase A — COMPLETE)

### 2.1 Clerk Organizations
- One org = one tenant. Omnica English = first org, slug `omnica-english`.
- Org roles: `org:admin`, `org:teacher`, `org:student`.
- Single `<UserButton />` in sidebar bottom; no `<OrganizationSwitcher />` in topbar.
- Middleware: `clerkMiddleware` + `auth.protect()`; redirect to `/sign-in` or `/onboarding/select-org`.

### 2.2 JWT template
Clerk JWT template `convex` with claims:
```json
{ "aud": "convex", "org_id": "{{org.id}}", "org_role": "{{org.role}}", "org_slug": "{{org.slug}}" }
```

### 2.3 Convex tenancy contract
Every domain table has `organizationId: v.string()`. All queries go through `convex/lib/tenant.ts` (`requireTenant`, `tenantTable`, `requireTenantPermission`). No raw `ctx.db` access in feature code.

### 2.4 `tenantSettings` table
Holds: name, colors, locale, timezone, operational policies (max reschedules, cancel windows, etc.), feature flags, AI cost params, activity types, trial policy, currencies, teacher invite token.

### 2.5 Permissions
Role-based (`admin`/`teacher`/`student`) with per-user `permissions: string[]` overrides. `requirePermission(ctx, "...")` is the auth-check pattern.

---

## 3. Schema Blueprint (current target shape)

> Common: `organizationId: v.string()`, `createdAt: v.string()`, `isDeleted: v.optional(v.boolean())` where applicable.

### users
`externalId, tokenIdentifier?, name, email, role, permissions?, avatarUrl?, teacherId?, onboardingComplete?, studentStatus?, locale?, lockedPriceTier?, subscriptionStatus?, ieltsCertified?, payoutRateOverride?, phoneWhatsapp?, icsToken?`

### lessons
`externalId, teacherId, studentId, title, status (scheduled|recording|transcribed|review|published|no_show_student|no_show_teacher), transcript, summary, contentStatus ({summary,vocabulary,flashcards,quiz}: pending|generating|review|approved), durationSeconds, order, scheduledFor?, recordingMode?, audioFileId?, isDeleted?, scheduleEventId?`

### lessonVocabulary
`lessonId, word, translation, translationLocale (en|ru|ar), partOfSpeech, exampleSentence?, ipa?, audioUrl?`

### lessonFlashcards
`lessonId, front, back, exampleSentence?`

### lessonQuizQuestions
`lessonId, question, options[], correctIndex, explanation`

### inLessonQuizDrafts
`lessonId, questions[], sourceTranscript, generatedAt, generatedBy`

### libraryMaterials
`title, description?, kind (article|story|dialog|transcript|pdf), levelCEFR?, topicTags[], contentMarkdown, contentHtml?, audioFileId?, sourceUrl?, estimatedReadMinutes?, uploadedBy, isPublished, isDeleted?`

### libraryWordLookups
`word, locale, definition, ipa?, audioUrl?, partsOfSpeech[], fetchedAt, source`

### srsDecks
`name, ownerId, source (lesson|manual|library|teacher_push), sourceLessonId?, isDefault?, isDeleted?`

### srsCards
`cardId, deckId, ownerId, front, back, exampleSentence?, sourceLessonId?, sourceLibraryMaterialId?, addedBy?, interval, easeFactor, repetitions, nextReviewDate, lastReviewDate, isDeleted?`

### scheduleEvents
`type (1on1|group|offline|global), teacherId?, studentId?, studentIds?[], title, date, startTime, endTime, status (scheduled|completed|cancelled|rescheduled|no_show_student|no_show_teacher|makeup), googleMeetLink?, activityTypeId?, pointCostSnapshot?, capacity?, teacherStartedAt?, endedAt?, noShowNotifications?[], isDeleted?`

### homework (Phase J)
`lessonId?, teacherId, studentId, title, contentJson (TipTap JSON), status (draft|assigned|in_progress|submitted|reviewed), teacherComment?, assignedAt?, submittedAt?, reviewedAt?, dueAt?`

### Point economy
`pointPackages, pointGrants, pointTransactions` — replaces old `studentPackages` (deleted).

### Other tables
`rescheduleRequests, studentRescheduleQuota, makeupCredits, scheduleEnrollments, teacherVacancies, studentOnboarding, teacherInvites, notifications, permissionRequests, promptConfigs, achievements, studentAchievements, streaks, studySessions, quizAttempts, reviewLogs, certificateTemplates, issuedCertificates, billingRecords, expenses, exchangeRates, priceMigrationAudit`

---

## 4. Feature Specifications

### 4.1 Reading & Library Hub
- Admin: `/admin/library` — markdown text body required; optional PDF/audio via Convex storage.
- Student: `/student/library` (list), `/student/library/[id]` (reading view, self-study mode).
- Teacher: `/teacher/library` (list with student picker), `/teacher/library/[id]?studentId=...` (live-teach mode).
- `<ReadingView>` shared component — renders `contentMarkdown`, intercepts word taps → Dictionary API popup → Add to Flashcards (self-study) or Send to Student (live-teach).

### 4.2 Live Lesson (`/teacher/sessions/[id]/live`)
- RecordingPanel: Soniox STT with mic + Google Meet tab capture. Audio backup via parallel MediaRecorder → Convex storage.
- 2-panel layout: transcription (left), interaction hub (right) with Quiz + Reading tabs.
- On-the-spot Quiz Generator: fire-and-forget via `inLessonQuiz.generateQuizFromBuffer` — never blocks Soniox WebSocket.
- Pause transcription: timer keeps running; tokens are dropped.
- No-show button (10-minute timer gate).
- Share windows: `/teacher/share/quiz` + `/teacher/share/reading` for Google Meet screen-share.

### 4.3 Scheduling
- Student books from assigned teacher's vacancy slots via `/student/book`.
- Point deduction happens at booking time (not session start).
- Reschedule quota per calendar month, enforced via `studentRescheduleQuota`.
- Teacher reschedule: full-edit vs request-only permission branching.
- Google Meet links: manual paste only (I.2 OAuth auto-create deprecated and removed).

### 4.4 Lesson Balance (Phase H, REDEFINED 2026-07-14)
> **FaFo decision 2026-07-14: points are dead as a user-facing concept.** Students buy and see **lessons** ("8 lessons left"), never points. Informed by EnglishDom: they ran packages/credits for years, then moved to lesson-denominated subscriptions.
- Machinery unchanged: `pointPackages` → lesson packs (8/16/24), `pointGrants` → lesson credits, `pointTransactions` → ledger. **1 lesson = 1 unit.** UI copy says "lessons" everywhere.
- v1 scope: **one activity only — 1-on-1 online lesson.** Offline / speaking-only / IELTS / groups deferred — the mix-and-match multi-product vision (cheap speaking lessons, premium IELTS teachers, offline meetups sharing one balance) lives in `tenantSettings.activityTypes` and returns post-v1 as additional activity types with their own lesson-cost. Do NOT build UI for it now.
- Manual admin grants only in v1; Lemon Squeezy/Stripe deferred. Subscriptions (auto-renew monthly packs) = v1.1 candidate.

### 4.5 Homework (Phase J)
- TipTap editor with custom `studentBlank` inline node.
- Teacher creates/edits → AI-generates from transcript → assigns.
- Student submits → teacher reviews with optional comment.

---

## 5. Route Manifest (all current routes)

| Portal | Route | Purpose |
|--------|-------|---------|
| Auth | `/sign-in`, `/sign-up` | Clerk auth |
| Onboarding | `/onboarding/select-org` | Org join flow |
| Student | `/student` | Dashboard |
| Student | `/student/lessons/[id]` | Lesson detail (transcript, quiz, homework) |
| Student | `/student/study` | SRS study session |
| Student | `/student/vocabulary` | Word management, deck browser |
| Student | `/student/library` | Library list |
| Student | `/student/library/[id]` | Reading view (self-study) |
| Student | `/student/calendar` | Weekly calendar + reschedule |
| Student | `/student/achievements` | Achievements gallery |
| Student | `/student/profile` | User profile |
| Student | `/student/book` | Booking (slot picker + WhatsApp) |
| Teacher | `/teacher` | Dashboard |
| Teacher | `/teacher/sessions` | Sessions (Upcoming + Past tabs) |
| Teacher | `/teacher/sessions/[id]` | Session review (Transcript/Summary/Vocab/Flashcards/Quiz/Homework) |
| Teacher | `/teacher/sessions/[id]/live` | Live session (transcription + quiz/reading) |
| Teacher | `/teacher/students` | Student roster |
| Teacher | `/teacher/library` | Library list (with student picker) |
| Teacher | `/teacher/library/[id]` | Reading view (live-teach mode) |
| Teacher | `/teacher/calendar` | Calendar + reschedule |
| Teacher | `/teacher/reports` | Engagement + pipeline |
| Admin | `/admin` | Dashboard (metrics, P&L, subscriptions) |
| Admin | `/admin/people` | People (Students/Instructors/Permissions tabs) |
| Admin | `/admin/sessions` | Sessions (admin view) |
| Admin | `/admin/sessions/deleted` | Soft-delete restore |
| Admin | `/admin/library` | Library management (upload + list) |
| Admin | `/admin/calendar` | Org calendar + create event |
| Admin | `/admin/billing` | Billing records |
| Admin | `/admin/settings` | Settings (Branding/AI Manager/Achievements/Scheduling) |
| Admin | `/admin/scheduling/requests` | Pending reschedule queue |

---

## 6. Decisions Made (formerly §7 Open Questions)

| # | Question | Decision |
|---|----------|----------|
| 1 | Make-up credit redemption flow | Auto-apply to next scheduled session; banner "Make-up credit applied." |
| 2 | Quota reset timing | Calendar month, keyed by `YYYY-MM` in `studentRescheduleQuota`. |
| 3 | Group events | Schema-ready, UI deferred. |
| 4 | Off-hour transcription cost | Flat estimate `avgLessonMinutes × cost/min` from `tenantSettings.ai`. |
| 5 | Word lookup language | v1: English definitions only. v1.1: opt-in translate via cheap OpenRouter model. |
| 6 | Google Meet auto-create | **Deprecated.** Manual paste only. OAuth code removed. |
| 7 | Payment processing | Deferred. Manual admin point grants only for v1. |
| 8 | Certificates | Schema exists. UI deferred; Mustafa will request explicitly. |

---

## 7. File Registry

```
src/
  app/
    (auth)/sign-in /sign-up
    onboarding/select-org
    student/
      page · lessons/[id] · study · vocabulary · library/(page|[id]) · calendar · achievements · profile · book
    teacher/
      page · sessions/(page|[id]|live) · students · library/(page|[id]) · calendar · reports
    admin/
      page · people · sessions/(page|deleted) · library · calendar · billing · settings · scheduling/requests
    layout · providers · globals.css
  components/
    brand/Logo
    shared/(OmnicSidebar|BottomNav|PageHeader|MetricCard|StatusPill|NotificationsBell|LanguageSwitcher)
    library/(ReadingView|WordLookupPopover)
    recording/(RecordingPanel|WaveformVisualizer)
    calendar/(WeeklyCalendar)
    homework/(HomeworkEditor)
    ui/* (shadcn)
  lib/
    auth · brand/(config|helpers|provider) · soniox/client · srs/sm2 · ai/(generate|prompts)
    transcript · countries · utils
  i18n/(config|provider)
convex/
  schema · auth.config · tenantSettings · users · lessons · lessonContent · library
  inLessonQuiz · srs · schedule · scheduleRequests · scheduleCron · lessonAudio
  notifications · permissions · points · billing · expenses · exchangeRates
  achievements · streaks · study · settings · ai · soniox · seed · homework · homeworkAi
  lib/(tenant|auth|permissions|defaultPrompts|sm2)
public/
  brand/omniclass/(logo|logo-dark).svg · logo-mark.svg
messages/(en|ru|ar).json
```

---

# ─── PHASE Z — Bug Fixes & Polish ───

> **Working order:** Teacher tabs → Student tabs → Admin tabs.
> **Per tab:** Discuss with FaFo → implement → test → `tsc --noEmit` clean → commit.
> **Architecture blueprint:** Each tab gets documented with route, data sources, component tree, and its bugs.
> **Conventions:** Commit after each tab. Tag work `[DeepSeek V4 Pro]`. Do NOT refactor unrelated code.

---

## Z.TEACHER — Teacher Portal

### Tab: Dashboard
**Route:** `/teacher`  
**Data sources:** `schedule.listForTeacher` (today's classes), `lessons.listForTeacher` (recent recordings), `users.listAllUsers` (student names, total count)  
**Components:** MetricCard, StatusPill, lesson-row links  
**Status:** Polish deferred — revisit at end of Teacher portal section.  
**Bugs:** None reported.

**Z-review recommendations (2026-07-14, [Claude]):**
- **"Published this month" metric is wrong** — counts ALL published lessons ever (`page.tsx:36`), no month filter. Fix or rename to "Published".
- **UTC "today" bug** — `toISOString().slice(0,10)` gives UTC date; evening lessons show under wrong day for UTC+3 users. Use local date helper (same bug in Sessions page). 
- **"Hours taught" counts recording/review lessons** — include only finalized, or rename.
- **"Start session" quick action** → routes to sessions list; better: opens Quick Record dialog directly.
- Add: next upcoming class countdown ("Next class in 25 min — Start"), unread notifications, pending homework submissions count. Make today's class rows clickable → session dialog (reuse Sessions row dialog).

---

### Tab: Sessions
**Route:** `/teacher/sessions`  
**Data sources:** `lessons.listForTeacher`, `schedule.listForTeacher`, `users.listAllUsers`  
**Components:** PageHeader, Tabs (Upcoming/Past), StartableEventRow, QuickRecordDialog, Dialog, lesson-row links  

**Architecture:**
- **Upcoming tab:** Scheduled events (today + future, excludes placeholders). Each row: student name, date label (Today/Tomorrow/date), time range, type pill (Individual/Group/etc), green pulsing "Ready" badge 5 min before start.
- **Row click:** Opens dialog with details + **Cancel or Reschedule** (→ `/teacher/calendar?event={id}`) + **Start session** (→ creates lesson, navigates to live). Confirmation via Dialog, not browser `confirm()`.
- **Resume detection:** If an active (non-terminal) lesson already exists for this event, the Start button becomes a green **Resume** button that links to the existing live session. Prevents duplicate lesson creation.
- **Past tab:** Lessons with duration display ("· X min"). Status pills (Live/Published/Review). Click → live or review page.
- **Quick Record:** Schedule event picker (default "No scheduled session" → auto-ties to placeholder + notifies admin). No upload option — moved to live page.
- **Start timing:** Enabled when same calendar day OR within 5 min before start time. Visual "Ready" badge during 5-min window.

**Bugs / Tasks:**

| # | Severity | Issue | Fix | Status |
|---|----------|-------|-----|--------|
| Z.T.SESS-1 | HIGH | **Quick Record creates unlinked lessons.** | Auto-create placeholder `scheduleEvent`, auto-tie, admin notification. | ✅ |
| Z.T.SESS-2 | MEDIUM | **Duplicate sessions from starting same event twice.** | `activeLessonByEvent` map → green "Resume" button instead of Start. | ✅ |
| Z.T.SESS-3 | LOW | **Session-time notification.** | Cron sends `session_reminder` 5 min before start to teacher. | ✅ |
| Z.T.SESS-4 | MEDIUM | **Cancel/Reschedule was two separate buttons.** | Single "Cancel or Reschedule" → routes to calendar. | ✅ |
| Z.T.SESS-5 | LOW | **"1on1" type label in UI.** | `typeLabels` map → "Individual", "Group", etc. | ✅ |
| Z.T.SESS-6 | LOW | **No duration on past tab.** | Shows "· X min" when `durationSeconds > 0`. | ✅ |

**Z-review recommendations (2026-07-14, [Claude]):**
- Same UTC "today" bug as Dashboard (`page.tsx:60,303`).
- Past tab: no pagination/search — fine now, will grow unbounded. Add month grouping or search when list gets long.
- `listAllUsers` fetched only for name lookup — replace with server-side name resolution (see Z.X-5).

---

### Tab: Live Session
**Route:** `/teacher/sessions/[id]/live`  
**Data sources:** `lessons.get`, `inLessonQuiz.listDraftsForLesson`, `library.listPublished`, `users.listAllUsers` (student name)  
**Components:** RecordingPanel (Pause/Resume only, no Stop), Tabs (Reading/Quiz/Questions/Notes), Textarea (notes), ReadingPicker, Dialog (confirmations)  

**Architecture (2-panel, no sidebar):**
- **Layout:** Full-screen — no sidebar. Teacher layout detects `/live` route and renders without `PortalShell`. `beforeunload` blocks accidental close. Back button shows confirmation dialog.
- **Session timer:** Pill at top center. Starts on mount, never pauses. For uploads: set to file duration then auto-end.
- **Left panel:** RecordingPanel — audio source grid (4-up: Mic / Mic+Meet / Tab / Upload). Pause button (amber when active, purple when paused). No Stop button. Speaker labels: `Teacher:` / `Student:` shown only on speaker change.
- **Upload flow:** Select "Upload" in audio sources → file input → extracts duration → uploads to Convex storage → auto-ends session with file duration.
- **Right panel (480px):** 4 tabs — Reading (pick → "Open in window"), Quiz (full transcript, char count, "Nothing to generate yet" empty, "Open in window"), Questions (AI conversation starters), Notes (auto-save textarea).
- **Toolbar:** Back (confirmation dialog). Session timer pill. **End Session** (red, confirms via dialog → finalizes → review). **No-show** (grayed, confirms via dialog → navigates to `/teacher`).

**Bugs / Tasks:**

| # | Severity | Issue | Fix | Status |
|---|----------|-------|-----|--------|
| Z.T.LIVE-1 | HIGH | **No-show button visible immediately.** Should be grayed out until 10 minutes after scheduled start time. | Grayed out with title hint. Full 10-min timer gate deferred. | ✅ |
| Z.T.LIVE-2 | MEDIUM | **Quiz only uses last 3000 chars.** | Uses full transcript. Shows "Generate Quiz (Xk chars)". | ✅ |
| Z.T.LIVE-3 | MEDIUM | **Student name not shown in toolbar.** | Shows "with {studentName}" next to lesson title. | ✅ |
| Z.T.LIVE-4 | MEDIUM | **"Generate Quiz" button text static.** | Disabled + "Nothing to generate yet" empty. Char count when populated. | ✅ |
| Z.T.LIVE-5 | LOW | **K.2-4: Transcript bridge uses global `window` variable.** | Known tech debt — not urgent. | — |
| Z.T.LIVE-6 | LOW | **K.G-1: No loading skeleton.** | Full 2-panel skeleton added. | ✅ |
| Z.T.LIVE-7 | NEW | **Stop recording ended session.** | Stop removed entirely — only Pause/Resume. End Session on toolbar. | ✅ |
| Z.T.LIVE-8 | NEW | **Reading/Quiz share buttons cluttered toolbar.** | Moved into respective tabs as "Open in window". | ✅ |
| Z.T.LIVE-9 | NEW | **No conversation questions.** | Questions tab — AI generates 5-7 personal conversation starters from transcript. | ✅ |
| Z.T.LIVE-10 | NEW | **No teacher notes.** | Notes tab — auto-save textarea via `saveTeacherNotes` mutation. | ✅ |
| Z.T.LIVE-11 | NEW | **Speaker labels raw Soniox IDs.** | Map: first speaker → `Teacher:`, rest → `Student:`. Only on change. | ✅ |
| Z.T.LIVE-12 | NEW | **Sidebar visible — accidental leave risk.** | Teacher layout hides `PortalShell` on `/live` routes. | ✅ |
| Z.T.LIVE-13 | NEW | **Browser confirm() ugly dialogs.** | All confirmations now use shadcn Dialog (End Session, No-show, Back). | ✅ |
| Z.T.LIVE-14 | NEW | **Upload button missing.** | 4th audio source card "Upload Audio/Video" → file picker → auto-end. | ✅ |
| Z.T.LIVE-15 | NEW | **No-show navigated to review.** | Now navigates to `/teacher` (home). | ✅ |
| Z.T.LIVE-16 | HIGH | **Speaker labels flip randomly mid-lesson.** First-speaker-ID→Teacher heuristic in `RecordingPanel.tsx` breaks — Soniox diarization IDs are unstable (re-assigned mid-stream, changed on token finalize). | `buildSpeakerLabels()` in `src/lib/transcript.ts`: role map derived from FINAL tokens only (finals never change → no flips), first final speaker = Teacher, rest = Student / Student 2… Saved transcripts now labeled `[Teacher]:`/`[Student]:` too (better AI context). No swap button per FaFo. | ✅ |
| Z.T.LIVE-17 | HIGH | **Prod: "Prompt config lesson_summary not found".** Prod Convex DB was never seeded — configs existed only in dev. | Seeded prod via `seed:seedOmnicaEnglish` 2026-07-14 + `promptConfigs.listForOrg`/`getByConfigId` now fall back to code `defaultPromptConfigs` when DB rows missing. | ✅ |
| Z.T.LIVE-18 | HIGH | **Homework generation dumps raw JSON text into editor.** `homeworkAi.callAI` uses `max_tokens: 1200` → output truncated mid-JSON → `parseDoc` fallback wraps the raw string in a paragraph node. | `max_tokens` 1200→4000; raw-text fallback removed (throws "try again" error instead); transcript input window 4k→12k chars. | ✅ |

---

### Tab: Session Review
**Route:** `/teacher/sessions/[id]`  
**Data sources:** `lessons.get`, `lessonContent.listVocab`, `promptConfigs.listForOrg`, `users.listAllUsers`, `homework.listForLesson`  
**Components:** Input (editable title), Tabs (Transcript & Notes/Summary/Vocabulary/Homework), StatusPill, StatusBadge, SectionCard, HomeworkEditor  

**Architecture:**
- **Tabs:** Transcript & Notes (transcript + editable teacher notes — notes appended to transcript for AI), Summary (editable textarea + Regenerate AI + Approve), Vocabulary (editable table: word/translation/locale/POS/IPA, add/remove rows, manual save + Regenerate AI + Approve), Homework (TipTap editor with quiz + exercises generation, debounced save).
- **Flashcards removed** — auto-generated from vocab entries on Publish. Each vocab word becomes an SRS flashcard (front=word, back=translation) in the student's lesson deck.
- **Publish** requires Summary + Vocabulary approved. No Generate All button — each section regenerated individually.
- **Teacher notes** included in AI prompts as context (transcript + notes block).
- **K.G-4 fix:** Vocab prompt updated — uses `"word"` field (was `"arabic"` field causing empty English words).
- **Homework:** No "Assign" step — just create, edit, save. Quiz generation from transcript as an option.
- **Soft delete** uses Dialog confirmation (not `confirm()`).

**Bugs / Tasks:**

| # | Severity | Issue | Fix | Status |
|---|----------|-------|-----|--------|
| Z.T.REVIEW-1 | MEDIUM | **K.G-4: Vocabulary section missing English word** — only Russian translation visible. | AI prompt returned `"arabic"` field for English word; code read `"word"`. Fixed prompt to use `"word"`. | ✅ |
| Z.T.REVIEW-2 | LOW | **K.2-4: Same global window transcript bridge** as live page. | Inherits from live page tech debt. | — |
| Z.T.REVIEW-3 | LOW | **Phase J homework node extensions.** Checkbox, multi-choice, vocab list NodeViews not built — only `studentBlank` exists. | Deferred to polish. | — |
| Z.T.REVIEW-4 | NEW | **Flashcards tab redundant with Vocabulary.** | Removed tab. Vocab entries auto-generate SRS flashcards on publish. | ✅ |
| Z.T.REVIEW-5 | NEW | **Generate All button unnecessary.** | Removed — each section regenerated individually. | ✅ |
| Z.T.REVIEW-6 | NEW | **Quiz tab separate from Homework.** | Merged. Quiz generation available inside Homework as an option. | ✅ |
| Z.T.REVIEW-7 | NEW | **TipTap editor deleted characters while typing.** | Debounced saves (800ms) instead of saving on every keystroke. | ✅ |
| Z.T.REVIEW-8 | NEW | **Homework "Assign" step unnecessary.** | Removed — homework just saved and available to student. | ✅ |
| Z.T.REVIEW-9 | HIGH | **Homework AI generation broken** — see Z.T.LIVE-18 (truncated JSON → raw text in editor). Root cause in `convex/homeworkAi.ts`. | max_tokens bump + strict JSON parse + error UI. | ✅ |

**Z-review recommendations (2026-07-14, [Claude]):**
- Add prompt-config missing fallback (Z.T.LIVE-17 hardening) — Regenerate buttons should degrade gracefully.
- Homework editor still only has `studentBlank` NodeView (Z.T.REVIEW-3) — checkbox/multi-choice needed before homework is really usable by students.
- Consider "generation in progress" skeleton per section — currently button spinner only.

---

### Tab: Students
**Route:** `/teacher/students`  
**Data sources:** `users.getStudentsForTeacher`, `lessons.listForTeacher`  
**Components:** tbl-wrap, tbl, status pills  

**Architecture:** Roster table with avatar initials, name, email, status pill (trial/active/paused/cancelled), locale. Data from `users.getStudentsForTeacher`.

**Bugs / Tasks:**

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| Z.T.STU-1 | MEDIUM | **K.2-1: Student rows not clickable.** Chevron-right icon suggests drill-down but rows are inert. | Add click handler → navigate to student detail or lesson list filtered by student. |
| Z.T.STU-2 | MEDIUM | **K.2-2: Engagement tab shows minimal data.** Just name/status/locale — no lesson counts, study time, or metrics. | Join with `lessons` + `studySessions` + `streaks` data. Show last session date, total lessons, study minutes, streak. |
| Z.T.STU-3 | LOW | **`s.name.split(" ")` crashes on missing name** (`page.tsx:41`) — seeded/invited users may lack names. | Guard with `(s.name ?? "?")`. |

**Z-review recommendations (2026-07-14, [Claude]):**
- Build a **student detail page** (`/teacher/students/[id]`): lesson history, homework status, vocab/SRS stats, notes. This is the natural fix for Z.T.STU-1 and makes Reports/Engagement redundant.
- Table shows raw locale codes ("ru") — show language names; add point balance + next scheduled session columns.

---

### Tab: Library
**Route:** `/teacher/library` (list), `/teacher/library/[id]?studentId=...` (reading view)  
**Data sources:** `library.listPublished`, `users.getStudentsForTeacher`  
**Components:** ReadingView, student picker dropdown  

**Architecture:** Card grid identical to student library. Top-of-page student picker dropdown — selecting a student appends `?studentId=...` to material links → reading page enters live-teach mode.

**Bugs / Tasks:**

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| Z.T.LIB-1 | MEDIUM | **K.G-3: Library icon is `layers` glyph** — doesn't read as "library/book." | Swapped to `book` in sidebar config (2026-07-14). ✅ |
| Z.T.LIB-2 | MEDIUM | **K.4-1: Markdown rendering is plain text.** ReadingView strips all formatting. | Add a markdown renderer (e.g. `react-markdown`) with word-tap interception preserved. |
| Z.T.LIB-3 | LOW | **Word underline for already-added words.** ReadingView should visually mark words the student already has in their deck. | Query student's SRS cards, underline matching words in the text. |
| Z.T.LIB-4 | LOW | **OpenRouter fallback for word lookups.** When Free Dictionary API returns nothing, fall back to LLM definition. | Add OpenRouter fallback in `library.getWordLookup` action with caching. |

**Z-review recommendations (2026-07-14, [Claude]):**
- Card grid is a near-duplicate of student library — extract shared `<LibraryGrid>` component before touching either.
- Empty state uses `layers` icon too (`page.tsx:133`) — same fix as Z.T.LIB-1.
- CEFR chips hardcode A2–C1 — missing A1/C2; derive levels from actual materials.
- Student picker resets on navigation — persist selection (query param or localStorage) so teacher doesn't re-pick every material.

---

### Tab: Calendar
**Route:** `/teacher/calendar`  
**Data sources:** `schedule.listForTeacher`, `users.listAllUsers`  
**Components:** WeeklyCalendar, lesson-row, reschedule dialog  

**Architecture:** h1 + subtitle, Today/prev/next + Day/Week/Month chip toggle. Upcoming sessions list as `.lesson-row` rows. Click row → reschedule dialog (full-edit or request-only based on permission). Student name next to each row's date/time.

**Bugs / Tasks:**

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| Z.T.CAL-1 | HIGH | **K.0-1: Calendar grid not functional.** `WeeklyCalendar.tsx` (294 lines) built but unused across all portals. | Wired (2026-07-14): Week + Day views via `WeeklyCalendar` (new `mode` prop), Month via new `MonthCalendar.tsx` (day-chip grid, "+N" overflow, click day → Day view). Event click → reschedule dialog. ✅ |
| Z.T.CAL-2 | HIGH | **K.0-2: Calendar nav buttons dead.** Today/prev/next arrows have no onClick handlers. | Today/prev/next wired — step = ±1 day/week/month by view. ✅ |
| Z.T.CAL-3 | MEDIUM | **K.4-2: Calendar events don't highlight "today".** No visual indicator for current day. | Grid + month views highlight today (ring + tinted column). ✅ |
| Z.T.CAL-4 | MEDIUM | **Grid area is a "coming soon" placeholder card** — view toggle changed state that rendered nothing. | Placeholder removed, real grids render. ✅ |
| Z.T.CAL-5 | LOW | **Month label hardcoded to current month.** | Label now derives from view range. ✅ |
| Z.T.CAL-6 | LOW | **Sessions page routes here with `?event={id}`** but page never reads the param — reschedule intent lost. | Page reads `?event=`, auto-opens reschedule dialog + jumps calendar to that date. ✅ |

**UNIFIED CALENDAR v1 SHIPPED (2026-07-14, [Claude]) — §13.10 implementation:**
- **One grid, three states:** Open (green, bookable), Busy (default), Lesson (colored block). VacancyEditor removed from this page (still used in admin people).
- **Slot painting:** click empty cell → dialog → "Open/Block this date only" (writes `slotExceptions`) or "Open/Block every {weekday}" (edits/splits `teacherVacancies` rows via `calendar.setWeeklySlot`).
- **Lesson popover:** policy-aware Move/Cancel with consequence labels from `calendar.actionPreview` (e.g. "Less than 12h notice — allowed, but counts against your reliability"). Two-step cancel confirm.
- **Move mode:** open slots pulse, click target → `calendar.rescheduleEvent` (validates open slot + 7-day horizon + conflict, records initiator, notifies student).
- **Backend:** `convex/calendar.ts` (getTeacherCalendar — names resolved server-side per Z.X-5, setSlotState, setWeeklySlot, cancelEvent w/ conditional lesson-credit refund via spend-tx check, rescheduleEvent) + `convex/lib/policy.ts` (POLICY constants + cancelVerdict/rescheduleVerdict). Schema: `slotExceptions` table, event audit fields (cancelledBy/At/Charged, rescheduledBy), `users.timezone`, notification kinds lesson_cancelled/lesson_rescheduled.
- Grid hours widened 07:00–22:00. Verified in browser: slot open flow, lesson dialog, cancel flow end-to-end on dev.
- **Tri-role complete (2026-07-14):** ① Teacher — paint Open/Busy (per-date + weekly), Time-off range block/unblock (`blockTimeOff`/`unblockTimeOff`, full-day range exceptions; warns about lessons inside), move/cancel with policy labels. ② Admin — `getAdminCalendar` + `assignLesson` (atomic deduction). ③ Student — `getStudentCalendar` (own lessons + teacher's open slots only, zero data leak) + `bookLesson` (≥12h notice, ≤28d horizon, balance check) + cancel (2-free/30d quota labels live) + move. Balance pill, book dialog, refund-on-free-cancel — all browser-verified end-to-end (book 5→4, cancel → refund → 5).
- **Integration surface for the rest of the system:** `convex/lib/policy.ts` (rules), `convex/calendar.ts` (getTeacherCalendar / getAdminCalendar / getStudentCalendar / actionPreview / setSlotState / setWeeklySlot / blockTimeOff / unblockTimeOff / assignLesson / bookLesson / cancelEvent / rescheduleEvent). All mutations notify + write audit fields — downstream features (sessions, reports, statuses) read `cancelledBy/cancelledAt/cancellationCharged/rescheduledBy`.
- **v2 additions (2026-07-15, FaFo UX feedback + EnglishDom screenshots):**
  - **Weekly recurring schedule** (`recurringBookings` table): student books a slot with "Repeat every {weekday}" → `calendar.materializeRecurring` cron (2:00+14:00 UTC) books ~7 days ahead, deducting 1 lesson per occurrence; insufficient balance → occurrence skipped + `booking_reminder` notification. Cancelled occurrences are never re-booked. "Stop weekly schedule" on the lesson dialog (`endRecurring`). Verified: booked Thu weekly → cron created next Thu + deducted.
  - **Anti-hoarding caps**: student self-booking limited to 1 lesson/day, 5/week (`POLICY.maxStudentBookingsPerDay/Week`). Admin assignments uncapped.
  - **Timezones**: full per-user display conversion — times stored in academy tz (`tenantSettings.timezone`), each user views/clicks in own tz (`users.timezone` + selector on all three calendars, saved via `users.setTimezone`). `src/lib/tz.ts` (DST-aware Intl conversion), `calendarShared.tsx` (`useZonedCalendar` converts slots/events, maps viewer clicks back to org time). Verified: org 16:00 (+6) renders 13:00 (+3).
  - **24h scrollable grid** (00–24, auto-scrolls to 07:00, sticky day header) — night slots for far-tz students.
  - **Drag-to-paint** (teacher): drag a rectangle of cells → dialog "Open/Block × these dates / every week" → `setSlotsBulk` (skips cells holding lessons). Verified via real pointer drag.
- **Not yet:** drag lesson to move (click-move instead), On Break/On Hold statuses (§13.7), old `/student/book` + student-dashboard booking section still on legacy points path — fold into calendar later; teacher onboarding wizard like EnglishDom's 6-step intro.

---

### Tab: Reports — REMOVED (2026-07-14)

FaFo decision: tab not needed. Page + sidebar entry deleted. Engagement metrics fold into the Students tab work (Z.T.STU-2); pipeline stats already live on the Dashboard.

---

## Z.STUDENT — Student Portal

> **Dashboard review:** Revisit Dashboard at end of Student section.

| Bug # | Tab | Issue | Fix |
|-------|-----|-------|-----|
| Z.S.DASH-1 | Dashboard | **K.5-3: No point balance on dashboard.** Balance only visible on `/book` and `/profile`. | Add point balance to dashboard hero/welcome card. |
| Z.S.DASH-2 | Dashboard | **K.1-7: "Join on Google Meet" dead link.** Falls back to `href="#"`. | Show link from `scheduleEvent.googleMeetLink`. Hide button if no link exists. |
| Z.S.DASH-3 | Dashboard | **K.1-11 / K.5-6: Booking section loads all org events.** Data leak + perf issue. | Filter to assigned teacher's events only or current student's events. |
| Z.S.LESS-1 | Lessons | **K.1-9: "Past" tab filter has no effect.** Tab state is ignored — only search filters. | Wire tab state to filter logic. |
| Z.S.STUDY-1 | Study | **K.1-10: Study streak always shows 0.** Completion screen + progress bar hardcoded. | Wire to `streaks.getForStudent` Convex data. |
| Z.S.VOCAB-1 | Vocabulary | **K.1-1: "Create deck" button dead.** No onClick handler. | Wire to `srs.createDeck` mutation. |
| Z.S.VOCAB-2 | Vocabulary | **K.1-2: Filter chips dead.** "All", "Recent", "By Lesson" chips have no filtering logic. | Implement filter state; only search input works currently. |
| Z.S.VOCAB-3 | Vocabulary | **Flashcard pipeline.** Student vocabulary (from lessons + library word taps) should feed the daily SRS flashcard study queue. When a student adds a word from reading or a lesson is published, the word becomes an SRS card. This pipeline must be audited during Vocabulary tab work. | Wire all vocab sources to SRS card creation. |


---

## Z.ADMIN — Admin Portal

> **Dashboard review:** Revisit Dashboard at end of Admin section.

| Bug # | Tab | Issue | Fix |
|-------|-----|-------|-----|
| Z.A.DASH-1 | Dashboard | **K.3-1: Finances are fake.** Revenue/ad spend computed from `students * 0.83`. | Wire to real `pointTransactions` + `billingRecords` + `expenses` data. |
| Z.A.DASH-2 | Dashboard | **K.3-2: "AI Prompts Used" is fake.** `promptConfigs.length * 487` — fabricated. | Wire to real usage count from `ai.generate` calls or remove metric. |
| Z.A.PPL-1 | People | **K.3-7: Permissions tab is hardcoded mock.** No Convex connection. | Wire to `permissions.list` + real role/permission matrix. |
| Z.A.SESS-1 | Sessions | **K.3-8: "View" routes to teacher path.** Admin should stay in admin context. | Add admin session detail view or change link target. |
| Z.A.LIB-1 | Library | **K.3-10: No file upload.** Only markdown textarea despite `kind: "pdf"`. | Add file input for PDF/audio upload to Convex storage. |
| Z.A.CAL-1 | Calendar | **K.5-1: createEvent doesn't deduct points.** | ✅ 2026-07-14 — admin calendar rebuilt (§13.10): assign-into-open-slot via `calendar.assignLesson` deducts 1 lesson atomically (insufficient balance → whole mutation rolls back). Old blind create-event dialog removed from the page (legacy `schedule.createEvent` still exists for other paths). Teacher picker + same Open/Busy/Lesson grid + policy Move/Cancel (admin bypasses 7-day horizon). Balance shown per student in assign dialog. Verified end-to-end on dev (ledger: 8→7). |
| Z.A.CAL-2 | Calendar | **Group event UI.** Schema ready (`type: "group"`, `scheduleEnrollments`), UI deferred. | Build group event creation + enrollment management (post-v1 per §13.9). |
| Z.A.CERT-1 | Certificates | **Certificates page not built.** Schema ready (`certificateTemplates`, `issuedCertificates`). Mustafa will request. | Build certificate template management + issue workflow. |
| Z.A.BILL-1 | Billing | **K.3-3: "Records" tab is placeholder.** Shows deferred message. | Build billing records table from `billingRecords` data. |
| Z.A.BILL-2 | Billing | **K.3-9: Package creation UI not built.** Cannot create/edit point packages. | Wire create/edit form for `pointPackages` table. |
| Z.A.BILL-3 | Billing | **Payment gateways.** Lemon Squeezy / Stripe deferred to v1.1. v1 uses manual admin grants only. | Deferred feature — implement when payment processing is needed. |
| Z.A.SET-1 | Settings | **K.3-4: Prompt "Edit"/"Test" buttons dead.** No handlers. | Wire edit to form, test to sample AI call. |
| Z.A.SET-2 | Settings | **K.3-5: Achievements "Edit" dead.** No form. | Wire edit modal for `achievements` table. |
| Z.A.SET-3 | Settings | **K.3-6: Logo upload non-functional.** Dashed-border box, no file input. | Wire file upload to Convex storage + `tenantSettings.logoUrl`. |
| Z.A.SET-5 | Settings | **K.5-5: Teacher invite link incomplete (H.6 partial).** No admin UI to copy/regenerate link. | Add copy/rotate buttons for `tenantSettings.teacherInviteToken`. |
| Z.A.SET-6 | Settings | **H.6 sign-up wrapper.** `/sign-up?invite=...` needs Clerk Backend SDK to auto-attach new user to the tenant org. | Build the sign-up wrapper route + Clerk SDK org membership call. |

---

## Z.CROSS — Cross-cutting

| # | Issue | Fix | Affects |
|---|-------|-----|---------|
| Z.X-1 | **K.G-1: Tab nav slow, no loading state.** First load looks frozen. Missing `loading.tsx` per route. | Add `loading.tsx` skeletons per route segment. | All portals |
| Z.X-2 | **K.G-2: New user → "must belong to organization" error.** Should auto-attach to Omnica English while single-tenant. | Middleware + `users.attachToDefaultOrg` mutation. | All portals |
| Z.X-3 | **K.4-3: WeeklyCalendar unused.** 294-line component built but imported nowhere. | ✅ Wired into teacher calendar 2026-07-14 (Day/Week modes + new MonthCalendar). Student/admin calendars still pending. | Teacher + Student |
| Z.X-4 | **K.0-3: Notification bell not wired to frontend.** | ✅ Was already wired (stale entry). 2026-07-14: added labels for new kinds (lesson_assigned/cancelled/rescheduled, session_reminder, unscheduled_session). | All portals |
| Z.X-5 | **`users.listAllUsers` used as client-side name lookup** (teacher dashboard, sessions, live, calendar). Ships every org user (emails, phones) to any logged-in client — privacy leak + unbounded payload. | Resolve names server-side in each query (return `studentName` on events/lessons) or add narrow `users.getNamesByExternalIds`. | All portals |
| Z.X-6 | **UTC-vs-local "today" bug.** `new Date().toISOString().slice(0,10)` in teacher dashboard + sessions pages — wrong day boundary for UTC+3/UTC+4 users. | Shared `localDateStr()` helper in `src/lib/dates.ts`; replace all call-sites. | Teacher + Student |
| Z.X-7 | **`any`-typed map callbacks throughout pages** (`students.map((s: any)`, etc.) despite generated Convex types. | Use `Doc<"users">` etc. — catches bugs like Z.T.STU-3 at compile time. | All portals |
| Z.X-8 | **Mobile layout completely broken.** PortalShell sidebar is fixed ~480px wide with no responsive breakpoint — on a 375px phone viewport the sidebar covers everything, content is a sliver. No hamburger/drawer. Verified in browser 2026-07-14. | Responsive shell: collapse sidebar to drawer + hamburger below ~768px; then audit every tab at 375px. | All portals |

---

## 12. Deployment

**Live site:** https://next-js-omni-class.vercel.app — **always push here.** This is the working production site for day-to-day use.

| Piece | Value |
|---|---|
| Vercel project | `next-js-omni-class` (team `fafo-s-projects`) |
| Convex **prod** | `valuable-loris-929` → `https://valuable-loris-929.convex.cloud` / `.site` |
| Convex **dev** | `quixotic-quail-572` (local `convex dev`) |
| Auth | Clerk **dev** keys (`pk_test`/`sk_test`, `secure-husky-22.clerk.accounts.dev`) — swap to `pk_live` for real launch |

**How to ship changes:**
- **Frontend / Next.js:** `git push` to `master` → Vercel auto-builds + deploys. (Or `npx vercel --prod` from local.)
- **Convex (`convex/` — schema, functions):** run `npx convex deploy` manually — Vercel does NOT deploy Convex (no `CONVEX_DEPLOY_KEY` set). To automate: add `CONVEX_DEPLOY_KEY` in Vercel + build cmd `npx convex deploy --cmd 'npm run build'`.

**Env vars** — Vercel (all 3 envs): `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. Convex prod: `CLERK_JWT_ISSUER_DOMAIN`, `OPENROUTER_API_KEY`, `SONIOX_API_KEY`.

**AI browser login (dev):** `node scripts/dev-login.mjs [teacher|admin|student]` mints a 5-min Clerk sign-in token (Backend API, dev instance) and prints a URL like `http://localhost:3000/sign-in?__clerk_ticket=…` — opening it logs straight in, no password. The `<SignIn>` component consumes the ticket automatically. Use for UI inspection/verification in the browser pane. Requires `CLERK_SECRET_KEY` in `.env.local` and dev servers running (`npm run dev` + `npx convex dev`).

---

## 13. Academy Policy (v2 — 2026-07-14, [Claude], informed by EnglishDom teacher wiki)

> Rewritten after extracting EnglishDom's operational policies (https://englishdom-wiki.notion.site — subscription model, cancellation/reschedule rules, no-show flow, vacation limits, student lifecycle). FaFo decisions locked: **no points** (lesson-denominated balance), **v1 = 1-on-1 online lessons only** (offline/speaking/IELTS/groups deferred to activity types post-v1), one unified calendar.
> Remaining ⚖️ = small knobs FaFo can still adjust; defaults below are build targets.

### 13.1 Payments & Lesson Balance
- Students buy **lesson packs** (e.g. 8 / 16 / 24 lessons); balance always displayed as "N lessons left". v1 payment manual (transfer → admin grants). Gateways/subscriptions v1.1 (EnglishDom moved packages → monthly subscriptions; unused lessons roll over — copy that when gateway lands).
- Internally reuses point machinery at **1 lesson = 1 unit** (`pointPackages`/`pointGrants`/`pointTransactions` unchanged; UI copy says lessons).
- 1 lesson deducted **at booking** (fixes Z.A.CAL-1); refund = credit back to balance. No expiry in v1. Cash refunds manual admin only.

### 13.2 Booking & the Recurring Slot
- **Recurring weekly slot is the core object** (EnglishDom's model): student has fixed day+time pair(s), e.g. Mon+Wed 18:00. Individual events are generated from it; everything else is a one-time exception.
- Slot states on teacher calendar: **Open** (bookable), **Closed/Busy**, **Lesson** (booked). Closing a slot containing a lesson is impossible — lesson must move first (EnglishDom rule, prevents orphan lessons).
- Booking paths: admin places student into open slot; student books from teacher's open slots. Booking blocked when balance = 0.
- Recurring slot auto-renews while balance > 0. Balance hits 0 → student + admin notified, slot held **7 days**, then released. Renewal-nudge shown to teacher when balance ≤ 2 lessons (EnglishDom pop-up pattern).
- One-time lessons auto-disappear after completion; regular slots persist.

### 13.3 Cancellation (EnglishDom-calibrated)
| Who | Rule | Consequence |
|---|---|---|
| Student | **2 free cancellations per 30 days, ≥6h notice** | Lesson credited back, slot reopens |
| Student | <6h notice OR 3rd+ cancel in 30 days | **Lesson burned** (counted as absence) |
| Student | No-show | Lesson burned automatically + admin notified (see 13.5) |
| Teacher | ≥12h notice — allowed | Student's lesson credited back; **reschedule offered first** (cancel = last resort) |
| Teacher | <12h — allowed but **tracked** | Counted against teacher performance metric; repeated → admin review |
| Teacher | **First lesson with a new student: cancellation forbidden** | Hard block in UI |
| Admin/academy | any time | Full credit back always |

### 13.4 Rescheduling
- Reschedule ≠ cancel: lesson keeps its payment, moves to another open slot. Regular schedule unaffected (moved instance becomes a one-time lesson — EnglishDom model).
- **Horizon: only lessons within the next 7 days can be moved/cancelled** — kills far-future churn, simplifies UI.
- Student: self-serve, unlimited count, but only into teacher's open slots, nearest lessons only.
- Teacher: drag lesson → open slot, ≥12h notice expected (<12h tracked as metric); must agree with student first; **initiator recorded** ("by teacher"/"by student") for stats.
- Intensity change (lessons/week) = admin action, not self-serve.
- Both parties notified on any change.

### 13.5 No-show (EnglishDom flow, adopt verbatim)
- Teacher waits **25 min** on the live page. At **10 min**: prompt teacher to ping student (platform notification; later WhatsApp).
- After 25 min → mark "absent by student" → lesson auto-burned + admin auto-notified (follows up with student). Teacher still credited for the lesson (when teacher payroll exists).
- Student absent 2× in a row → teacher still shows up and waits; admin escalation flag.
- Teacher no-show: prohibited; student lesson credited + incident logged against teacher metrics; makeup lesson offered.
- Update existing live-page no-show gate: 10 min → keep as ping point, no-show button unlocks at 25 min ⚖️.

### 13.6 Vacations & Pauses (EnglishDom-calibrated)
- **Teacher busy-block:** freely block/open any future time without lessons — core calendar interaction.
- **Teacher vacation:** ≤14 consecutive days, ⚖️ 14 days/year budget, submit ≥7 days ahead (absolute minimum 72h). Booked lessons inside → per-student resolution: **Reschedule / Ready-to-wait / (Substitute — post-v1)**. Can't cancel vacation <2 days before start.
- **Student pause:** ≤14 days per pause, ≤28 days/year, bookable up to 2 months ahead, starting next day at earliest, **only with positive lesson balance**. Schedule + teacher preserved during pause; limits exceeded → slot released. Teacher auto-notified.
- **Academy holidays:** admin sets org-wide closed days → booking blocked, affected lessons flagged for reschedule.

### 13.7 Student Lifecycle Statuses (retention machinery — EnglishDom pattern)
`studentStatus` extended: **Active** (has lessons) · **Start** (first lesson within 48h) · **Soon** (applied, not paid) · **On Break** (8 days without a lesson — auto) · **On Hold** (2+ days after Break — schedule auto-released, red flag for admin follow-up) · **On Vacation** · plus existing trial/paused/cancelled mapping. Auto-transitions via cron. Post-calendar work, but schema/design should anticipate it.

### 13.8 Trials
- Existing `trialPolicy` knobs. ⚖️ Recommend paid discounted trial (~half price) — free trials attract no-shows.

### 13.9 Deferred (post-v1, do not build now)
- Groups, speaking clubs, IELTS/exam-prep tiers, offline lessons — all return as `activityTypes` entries with own lesson-cost + allowed-teacher lists. Mix-and-match vision (one balance, many activity kinds) preserved.
- Teacher levels/rates/bonuses (EnglishDom: Junior/Middle/Senior rates, retention + workload bonuses) — relevant once FaFo hires teachers; ignore while solo.
- Subscriptions with auto-charge; substitute teachers; certificates on course completion.

### 13.10 Calendar design consequences (build next)
- **ONE unified calendar** — kill VacancyEditor: single grid, teacher paints **Open** / **Busy**, sees **Lessons**; recurring weekly pattern + exceptions on the same grid; academy holidays overlay.
- Interactions: click/drag empty cells → Open/Close; click lesson → popover with policy-aware actions (labels show consequence: "Free cancellation (2 left this month)" vs "Less than 6h — lesson will be charged"); drag lesson → open slot = reschedule with initiator prompt; vacation = multi-day wizard.
- **7-day action window**: move/cancel only nearest week's lessons — calendar UI can hard-scope mutation actions to that range.
- **Timezones:** per-user timezone + "My time / Student's time" toggle for teachers (students RU/AR across zones). Store times UTC or date+time+tz consistently — current `date`/`startTime` strings are tz-naive ⚠️ must resolve during build.
- Policy engine = `convex/lib/policy.ts` reading `tenantSettings` — single source for backend enforcement + UI previews.
- Admin: same grid across teachers, place student into open slot (deducts 1 lesson). Student: sees own teacher's open slots only (fixes Z.S.DASH-3).
- Slot-pairing nudge (post-v1 nicety): suggest opening slots in pairs (Mon+Wed same hour) — EnglishDom demand data: students want 2×/week fixed rhythm.

---

## 14. Calendar & Scheduling System — Full Plan (2026-07-17, [Claude])

> The complete blueprint: domain model, role workflows, every niche case with its resolution, integration contract with the rest of the platform, and the prioritized build roadmap. Policies live in §13; this section is HOW the system behaves and grows.

### 14.1 Domain model

| Entity | Table | Role |
|---|---|---|
| Weekly availability pattern | `teacherVacancies` | Teacher's recurring working hours (windows per weekday) |
| Per-date deviation | `slotExceptions` | Exact-slot toggles (1h) or ranges (time-off, full-day `00:00–24:00`). Exact beats range beats pattern |
| Lesson | `scheduleEvents` | One concrete occurrence; statuses scheduled/completed/cancelled/rescheduled/no_show_*/makeup; audit fields cancelledBy/At/Charged, rescheduledBy, recurringBookingId |
| Weekly schedule | `recurringBookings` | Student's held slot (org-tz weekday+time); cron materializes ~7d ahead |
| Lesson credit | `pointGrants`/`pointTransactions` | 1 lesson = 1 unit; spend at booking, refund per policy |
| Rules | `convex/lib/policy.ts` + `tenantSettings` | Single source; backend enforces, UI previews |

**Derived, never stored:** open slots (computed per date from pattern ± exceptions − lessons − past), consequence labels, teacher reliability (from audit fields: `cancelledBy="teacher"` + `cancelledAt` vs event start = late-cancel metric — no extra schema needed).

**Time semantics:** all stored times = academy anchor tz (**Asia/Almaty**, no DST — never drifts). Every user views + interacts in own tz (`users.timezone` ?? browser); conversion at the page boundary (`useZonedCalendar`), mutations always receive org-tz values. Recurring slots anchor to org-tz weekday+time → fixed instant weekly; viewers in DST zones (Egypt has DST) see their local label shift by 1h at transitions — correct, but surface a notice banner at DST switches (P2).

### 14.2 Role workflows (end-to-end)

**Teacher:** onboard → open working hours (drag-paint weekly) → lessons appear (booked by admin/students/recurring) → conduct (Sessions/live flow via `scheduleEventId`) → move/cancel within policy → time off for vacations → review reliability in reports. Everything on ONE grid; VacancyEditor (admin people page) deprecated once admin can paint on behalf of teacher (P2).

**Student:** get teacher assigned → open calendar (own tz) → book slot (or tick "repeat weekly") → reminders (P1) → join Meet from lesson dialog → after lesson: review/homework surfaces elsewhere → cancel/move within quota, consequences always shown before confirm → balance runs low → nudge to top up; weekly slot held 7 days (§13.2).

**Admin:** grant lesson packs (Billing) → place students into teachers' open slots → monitor: pending reschedules, unaccounted sessions, skipped recurring occurrences, low balances → intervene with uncapped move/cancel (always refunds) → later: utilization + reliability reports.

### 14.3 Niche-case catalog

**Resolved (by design or verified):**
| Case | Resolution |
|---|---|
| Two bookings race for one slot | Conflict check inside mutation; Convex serializability → loser gets "slot was just taken" |
| Insufficient balance at booking | Deduction throws → whole mutation rolls back (verified) |
| Close slot holding a lesson | Hard-blocked; move lesson first (EnglishDom rule) |
| Teacher cancels 1st-ever lesson with student | Hard-blocked (§13.3) |
| Student cancels weekly occurrence | Occurrence never re-booked by cron (fixed 2026-07-15) |
| Balance empty on recurring renewal | Occurrence skipped + `booking_reminder` notification; slot survives |
| Teacher time-off over recurring slot | Occurrence silently skipped; lessons already booked stay + warned count |
| Cancel refund correctness | Refund only if a spend tx exists for that event, never double (ledger-checked) |
| Late-night/far-tz slots invisible | 24h grid |
| Student sees other students' data | `getStudentCalendar` returns own events + open slots only |
| Booking spam / hoarding | 1/day + 5/week caps (self-book); admin uncapped |
| Clock skew / client tampering | All policy checks server-side at mutation time |

**P0 bugs found during this planning pass (fix immediately):**
| # | Bug | Fix |
|---|---|---|
| C-1 | **Grant expiry contradicts §13.1.** `grantPointsInternal` defaults to 45-day expiry → student lessons silently burn. | Default `expiresAt` = none/far-future; keep expiry as opt-in field for future subscriptions. Audit existing grants on prod. |
| C-2 | **Moved weekly occurrence re-materializes.** Cron's exists-check matches `startTime === rb.startTime` — a rescheduled occurrence (different time) isn't seen → cron books a duplicate that week. | Exists-check = any event with `recurringBookingId === rb._id` in that ISO week, regardless of time/status. |
| C-3 | **`24:00` endTime breaks tz conversion.** 23:00–24:00 slots/events → `new Date("…T24:00")` = Invalid Date → NaN display. | Normalize `24:00` → next-day `00:00` in tz helpers (or clamp last slot to 23:00–23:59). |
| C-4 | **Half-hour timezones render nothing.** Viewer in +5:30 (India) / +4:30 (Kabul) → converted keys "HH:30" never match hour-row cells → open slots invisible, events misplaced. | Short-term: snap display to nearest hour row with a "+30m" label on the block; proper: 30-min row granularity behind a flag. |

**P1 gaps (needed for "fully functioning" feel):**
| # | Gap | Plan |
|---|---|---|
| C-5 | Student reminders don't exist (teacher-only 5-min cron). | Cron: student notifications 24h + 1h before (`session_reminder`); later WhatsApp via `phoneWhatsapp`. |
| C-6 | Recurring caps unchecked in materializer — two weekly slots same day possible. | Apply §13.2 day-cap inside cron (skip + notify) or validate at recurring creation. |
| C-7 | Time-off leaves affected lessons as a toast count only. | "Needs attention" inbox card (admin + teacher): lessons inside blocked ranges, skipped occurrences, pending reschedules — one list, links to lesson dialog. |
| C-8 | Meet links manual per lesson. | `users.meetLink` (teacher's permanent room) → auto-filled on every assign/book; editable per lesson. |
| C-9 | Legacy paths diverge: `/student/book` (activity picker), `requestReschedule` quota flow, admin VacancyEditor. | Deprecate: route `/student/book` → calendar; keep `requestReschedule` only for out-of-horizon asks; VacancyEditor → read-only view until admin paint lands. |
| C-10 | Mobile: drag-paint fights touch scroll; grid cramped (Z.X-8). | After responsive shell: calendar defaults to Day view + agenda list on <768px; paint via tap-select mode toggle. |
| C-11 | Teacher reassignment orphans recurring bookings + future lessons. | On unpair: end recurring, flag future lessons for admin resolution (cancel-refund or transfer). Blocked-state banner on student calendar. |
| C-12 | Cancelled lessons invisible (can confuse "where did it go"). | Ghost blocks toggle ("show cancelled") + status in lesson dialog history. |

**P2 (post-integration):**
- Student pause (§13.6): suspends materializer + holds slot ≤14d; auto-release + notify.
- Academy holidays: org-wide closed dates overlay; block booking; flag affected lessons.
- On Break / On Hold statuses (§13.7): inactivity cron → releases recurring slots on Hold → admin follow-up queue. This is the retention engine — build right after student-side polish.
- Admin paints teacher calendars (proxy mode); multi-teacher week overview (columns = teachers).
- Slot-pairing nudge (EnglishDom insight: suggest Mon+Wed same hour pairs).
- Groups: capacity blocks + enrollments on the same grid.
- Subscriptions: auto-grant packs monthly → recurring materializer already compatible.
- DST-shift notice banner; week-start config (Fri/Sat weekend for AR market); keyboard a11y; undo-snackbar for cancels.

### 14.4 Integration contract (rest of the platform)

| System | Contract |
|---|---|
| **Sessions/Live** | Lesson event = source of truth. Start Session resolves via `scheduleEventId`; `teacherStartedAt` disables no-show ladder; teacher no-show cron auto-refunds (live in prod). Calendar lesson dialog gains "Start session" button within start window (P1 — one link, flow exists). |
| **Billing** | Every calendar mutation writes ledger rows tied to `scheduleEventId`. Billing UI must speak "lessons" (copy sweep pending) and stop defaulting 45-day expiry (C-1). Future gateways/subscriptions plug in at `grantPointsInternal` — calendar untouched. |
| **Notifications** | Kinds: lesson_assigned / lesson_cancelled / lesson_rescheduled / booking_reminder / session_reminder / teacher_no_show / makeup_credit_issued. Matrix: student booking→teacher; admin assign→both; cancel/move→other party; recurring skip→student(+admin P1); reminders→P1. All bell-visible; WhatsApp channel later reuses same events. |
| **Homework/Review** | Post-lesson flow keys off lesson status transitions (completed → review → published). Calendar never touches content. |
| **Reports** | All derivable from audit fields: fill rate (open hours vs booked), teacher reliability (late cancels/moves, no-shows), student attendance + cancellations, recurring retention (weeks alive). No new schema. |
| **Retention statuses (§13.7)** | Reads lesson history (last completed date) + writes `studentStatus`; releases recurring slots on Hold. |
| **ICS export** | `users.icsToken` + `icsInternal.ts` already exist — lessons feed into Google/Apple Calendar with absolute instants (tz-proof). Verify + surface subscribe URL on profile (P1, mostly built). |
| **Multi-tenant** | Everything org-scoped already; new tenant = seed + set anchor tz (`setOrgTimezone`) + teacher patterns. No calendar code changes. |

### 14.5 UX principles (locked)
1. **One grid per role** — same component, role changes verbs (paint/assign/book).
2. **Consequences before confirmation** — every destructive button carries its policy outcome inline.
3. **Never lie about time** — always viewer tz, selector visible; lesson dialogs later show both ("14:00 your time · 16:00 academy") (P1 nicety).
4. **Reversible by default** — cancel refunds when policy allows; recurring survives failures by skipping, not dying.
5. **The system nags, not the human** — skipped occurrences, low balance, lessons needing action → notifications/inbox, not memory.

### 14.6 Build order
1. **P0 fixes** C-1…C-4 (half a day) — correctness.
2. **P1 wave 1**: student reminders (C-5), needs-attention inbox (C-7), Meet autofill (C-8), Start-session link, ICS surfacing — the "daily driver" polish.
3. **P1 wave 2**: legacy-path cleanup (C-9), reassignment flow (C-11), recurring caps (C-6), ghost blocks (C-12).
4. **Mobile calendar** (with Z.X-8 shell).
5. **P2 retention machinery** (pause, holidays, On Break/Hold) — then the calendar is a complete operations system, not just a grid.

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-17 | **[Claude]** §14 written — Calendar & Scheduling full plan: domain model, tri-role workflows, niche-case catalog (12 resolved/verified, **4 P0 bugs found**: C-1 grant 45-day expiry vs no-expiry policy, C-2 moved weekly occurrence re-materializes duplicate, C-3 24:00 endTime breaks tz conversion, C-4 half-hour timezones render nothing), 8 P1 gaps, P2 backlog, integration contract (sessions/billing/notifications/reports/retention/ICS/multi-tenant), locked UX principles, 5-step build order. |
| 2026-07-15 | **[Claude]** Academy anchor timezone set to **Asia/Almaty** (dev+prod via new `tenantSettings:setOrgTimezone` internal mutation; code default updated). Rationale: majority student market (Almaty), Kazakhstan has no DST → stable anchor; teachers in Egypt and everyone else see their own time via per-user tz selectors. Verified live: slot display shifted correctly on the open calendar. |
| 2026-07-15 | **[Claude]** CALENDAR v2 (FaFo UX feedback + EnglishDom wiki screenshots): weekly recurring schedule (recurringBookings + twice-daily materializer cron, balance-aware, cancel-respecting), student booking caps 1/day 5/week, full per-user timezone conversion (tz.ts + calendarShared.tsx + users.setTimezone + selector on all 3 calendars), 24h scrollable grid w/ sticky header, teacher drag-to-paint bulk slot toggles (setSlotsBulk). Browser-verified: tz shift +6→+3 correct, drag-paint 2 slots weekly, weekly booking → cron materialized next week + deducted (ledger 4→3), 12h-notice guard. |
| 2026-07-14 | **[Claude]** TRI-ROLE CALENDAR COMPLETE (§13.10). Student side: `getStudentCalendar` (privacy-safe — only own lessons + teacher open slots), `bookLesson` (12h/28d window + balance), page with book dialog, quota-labeled cancel, move-mode, balance pill. Teacher Time-off: `blockTimeOff`/`unblockTimeOff` full-day range exceptions (exact-slot exceptions take precedence over ranges in `isSlotOpen`). Fixes: past slots no longer shown open; book/assign/slot dialogs now mutually exclusive with lesson dialog; bell labels for new notification kinds. Browser-verified as student: book (5→4), free-cancel with "(1 left this month)" label → refund (→5). Calendar ready for system integration — API surface documented in §13.10. |
| 2026-07-14 | **[Claude]** ADMIN CALENDAR (§13.10) + lesson-unit migration. `calendar.getAdminCalendar` (any teacher's grid), `calendar.assignLesson` (open-slot validation + conflict check + atomic 1-lesson deduction + notifications; `_assignCli` internal test helper), `points.grantCli` (CLI grants), `lesson_assigned` notification kind. Policy: admin bypasses 7-day horizon for cancel/move. **Fixed: Convex runtime rejects dynamic `import()` in mutations** — replaced ALL `await import(…)` in convex/ with static imports (latent bug in bookSlot/enrollments/schedule reschedule paths — they would have crashed at runtime). Costs normalized to lesson units (`normalizeLessonCosts` run on dev+prod: 1on1=1, only 1on1_general active; trial=1 lesson). Admin calendar page rebuilt on shared grid; select triggers fixed (showed raw IDs). Verified: assign flow end-to-end (balance 8→7, lesson renders, insufficient-balance rollback tested). |
| 2026-07-14 | **[Claude]** UNIFIED CALENDAR v1 (§13.10). New `convex/lib/policy.ts` (verdict engine) + `convex/calendar.ts` (calendar query w/ server-side names, slot toggles per-date/weekly, policy-aware cancel with conditional refund, reschedule w/ horizon+conflict checks, notifications). Schema: `slotExceptions`, event cancel/reschedule audit fields, `users.timezone`, 2 notification kinds. Teacher calendar page rewritten: Open/Busy/Lesson grid states, paint dialog (date vs weekly), lesson popover w/ consequence labels, move-mode with pulsing targets, legend; VacancyEditor dropped from page. WeeklyCalendar: openSlotKeys+moveMode props, hours 07–22. Browser-verified: open slot, lesson dialog preview, cancel flow. `tsc` + build clean. |
| 2026-07-14 | **[Claude]** EnglishDom research (read 13 pages of their teacher wiki) + FaFo decisions: **points system dropped** — balance denominated in lessons (§4.4 redefined; internals reuse point machinery at 1 lesson = 1 unit); **v1 scope = 1-on-1 online lessons only** (offline/speaking/IELTS/groups → deferred activityTypes, §13.9); §13 rewritten as v2 with EnglishDom-calibrated numbers: student 2 free cancels/30d ≥6h, teacher 12h soft rule + first-lesson cancel ban, no-show 25-min wait + auto-burn + admin alert, 7-day reschedule horizon, vacation 14d teacher / 14+28d student pause, student lifecycle statuses (On Break/On Hold auto-transitions), timezone requirements for calendar build. |
| 2026-07-14 | **[Claude]** §13 Academy Policy DRAFT written (payments/points, booking, cancellation, rescheduling, lateness, vacations, trials, groups) + §13.9 unified-calendar design consequences. Decision points marked ⚖️ awaiting FaFo. Calendar rebuild blocked on policy approval. |
| 2026-07-14 | **[Claude]** AI self-login for UI work: `scripts/dev-login.mjs` — mints Clerk sign-in token (ticket strategy) per role, browser opens `?__clerk_ticket=` URL → logged in without password. Verified: teacher dashboard + new calendar grid render correctly on desktop. Found Z.X-8: mobile layout broken (fixed-width sidebar covers 375px viewport, no drawer) — logged for the phone-UI pass. |
| 2026-07-14 | **[Claude]** Phase Z fix batch (FaFo decisions: no swap button — Soniox first-speaker=Teacher; Reports tab dropped; full calendar grid). ① Speaker labels: `buildSpeakerLabels()` in `transcript.ts` — stable finals-first mapping, saved transcripts now `[Teacher]:`/`[Student]:`. ② Homework AI: max_tokens 1200→4000, raw-text fallback removed, transcript window 12k. ③ Prompt configs: code fallback in `promptConfigs.listForOrg`/`getByConfigId` + prod seeded. ④ Reports tab deleted (page + sidebar). ⑤ Library sidebar icon layers→book. ⑥ Calendar: WeeklyCalendar wired (Week/Day via `mode` prop), new `MonthCalendar.tsx`, working nav/today/view toggle, `?event=` auto-opens reschedule, VacancyEditor collapsed into "My availability". `tsc --noEmit` + `next build` clean. Convex prod redeployed. |
| 2026-07-14 | **[Claude]** Phase Z teacher-portal review pass. Triaged 3 live-session bugs from FaFo testing: Z.T.LIVE-16 (speaker labels flip — unstable Soniox diarization IDs), Z.T.LIVE-17 (prod prompt configs missing — **fixed** by running `seed:seedOmnicaEnglish` on prod), Z.T.LIVE-18/Z.T.REVIEW-9 (homework generation dumps raw JSON — `max_tokens: 1200` truncation + raw-text parse fallback in `homeworkAi.ts`). Added per-tab recommendation blocks for all teacher tabs + new bugs Z.T.STU-3, Z.T.CAL-4/5/6, cross-cutting Z.X-5 (listAllUsers privacy leak), Z.X-6 (UTC today bug), Z.X-7 (any-typed callbacks). Dashboard review deferred to end per FaFo. |
| 2026-07-14 | **[Claude]** First production deploy. Live at https://next-js-omni-class.vercel.app (Vercel prod + Convex prod `valuable-loris-929`). Set all env vars via CLI (Vercel + Convex prod). Original build failure was missing `NEXT_PUBLIC_CONVEX_URL` at build time. Added §12 Deployment — **always push to the Vercel site.** Clerk still on dev keys. |
| 2026-05-04 | Reset. Product renamed to **OmniClass**. First tenant **Omnica English**. Yellow + Purple brand. Stack: Next.js 16 + Convex + Clerk. |
| 2026-05-04 | Phase A landed: multi-tenancy foundation (org-scoped schema, `tenant.ts`, Clerk orgs). |
| 2026-05-04 | Phase B landed: design system (Inter font, shell components, OmnicSidebar, Topbar, globals.css tokens). |
| 2026-05-04 | Phase C landed: Library Hub (ReadingView, WordLookupPopover, Free Dictionary API cache). |
| 2026-05-06 | Phase D landed: Sessions + Live Lesson (RecordingPanel, quiz generator, review page, transcript/summary/vocab/flashcards/quiz tabs). |
| 2026-05-06 | Phase E landed: Scheduling + Permissions (reschedule quota, permission branching, admin queue, notifications). |
| 2026-05-06 | Phase F landed: Admin polish (people, sessions, billing, AI manager, branding, achievements). |
| 2026-05-07 | **[DeepSeek V4 Pro]** Phase G: Omnica-new-UI port (CSS tokens, shell rewrite, data gaps wired). |
| 2026-05-07–08 | **[Claude]** Phase G continued: admin portal, shell polish, student/teacher pages, backend gaps (SRS, study, streaks), sidebar/topbar fixes, favicon/logo, library skeletons. Phase G COMPLETE 2026-05-08. |
| 2026-05-11 | **[Claude]** Phases H, I, J, K scoped. PHASE_H.md created (now deleted — all items merged here). |
| 2026-05-11 | **[Claude]** Phase H CODE COMPLETE: point economy, onboarding, booking, vacancies, pairing, ICS export, group enrollment, manual grants. |
| 2026-05-14 | **[Claude]** Phase H polish + Phase I CODE COMPLETE: audio backup, Google Meet OAuth (later deprecated), multi-window share, pause transcription, student no-show, teacher no-show cron. |
| 2026-05-14 | **[Claude]** Phase J CODE COMPLETE: homework table, editor, AI generation, assign/submit/review flow. |
| 2026-05-15 | **[DeepSeek V4 Pro]** Master plan deep-clean. Phases A–J marked COMPLETE. Phase K collapsed into Phase Z. Removed stale Phase G sub-logs, UI Transplant mapping table, dead §7 Open Questions (answers folded into Decisions Made). I.2 Google Meet OAuth code verified deleted. Route manifest added. Bug list reorganized by portal → tab. Phase Z architecture blueprint skeleton created. PHASE_H.md already deleted — no references remain. |
| 2026-05-15 | **[DeepSeek V4 Pro]** Phase Z — Sessions tab polished. Schema: added `"placeholder"` type to `scheduleEvents`, added `"unscheduled_session"` + `"session_reminder"` notification kinds, added `sessionReminderSent` field. Convex: `lessons.create` auto-creates placeholder event when no `scheduleEventId` provided, fires admin notification for unscheduled sessions, stamps `teacherStartedAt`. `scheduleCron.ts` extended with Phase A (session reminders to teacher 5 min before start). Frontend: Start button enabled when same-day OR within 5-min-before window. Green pulsing "Ready" badge. Upcoming tab shows same-day events. Quick Record dialog gains schedule event picker with "No scheduled session" default + helper text. `tsc --noEmit` clean. |
| 2026-05-16 | **[DeepSeek V4 Pro]** Phase Z — Live Session tab overhaul. Schema: added `teacherNotes` to lessons. Convex: `saveTeacherNotes` mutation, `generateConversationQuestions` action (OpenRouter, personal-tone prompts), `seedTestEvent` internal mutation. Frontend: Session timer pill at top (can't pause, starts on mount). Student name resolved in toolbar. No-show button grayed out. Stop recording saves transcript but stays on page; new "End Session" button finalizes + navigates. Share window buttons moved into their respective tabs (not toolbar). 4 tabs: Reading (pick → "Open in window"), Quiz (full transcript, char count, "Nothing to generate yet" empty state, "Open in window"), Questions (AI-generated conversation starters), Notes (auto-save textarea). RecordingPanel: speaker labels → (Teacher) / (Student-1) / (Student-2). 2-panel loading skeleton. Sessions page: row click opens dialog with Start/Reschedule/Cancel. Start requires confirmation. Upload removed from Quick Record. Reschedule/cancel route to calendar. `tsc --noEmit` clean. |
| 2026-05-16 | **[DeepSeek V4 Pro]** Phase Z — Live Session polish round 2. Transcription speaker labels fixed (only show on speaker change, format `Teacher:` / `Student:`). Removed browser `confirm()` — all confirmations use shadcn Dialog (End Session, No-show, Back). Teacher layout hides sidebar on `/live` and `/share` routes. Stop button removed from RecordingPanel — only Pause/Resume (amber/purple colored). Audio source grid 4-up (`grid-cols-2 sm:grid-cols-4`). Upload 4th card: file input → extract duration → Convex storage → auto-end. End Session button red. Sessions page: duplicate-start bug fixed (Resume button for active lessons), Cancel/Reschedule merged to single button → calendar, "1on1" → "Individual" type labels, duration shown on past tab. No-show navigates to `/teacher` (home). i18n keys added for upload (`en/ru/ar`). MASTER_PLAN.md Sessions + Live Session architecture updated. `tsc --noEmit` clean. |
