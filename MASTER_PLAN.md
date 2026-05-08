# OmniClass Platform — Master Plan

> **Software:** OmniClass — vertical-agnostic class management SaaS.
> **First tenant:** **Omnica English** — English language academy (Russian + Arabic L1 students learning English).
> **Owner:** Mustafa.
> **Stack (locked):** Next.js 16 (App Router, Turbopack) · Tailwind CSS v4 · shadcn/ui · Convex · Clerk (with **Organizations**) · Soniox v4 STT · OpenRouter LLMs · next-intl (en/ru/ar).
> **Status:** Phase G (UI port) — **IN PROGRESS, NOT COMPLETE.** Student portal pages structurally ported from Omnica-new-UI (JSX, data wiring) but visual design does NOT yet match prototype. Purple colors missing from tabs/panels, sidebar gradient incorrect, content spacing off, shadows/borders wrong. See CLAUDE.md §10 for details.
> **Source of design truth:** `Omnica-new-UI/` (Next.js reference project with complete UI prototypes). Old `omnic-portal/` deleted.
> **AI attribution:** All work from 2026-05-06 onward tagged per CLAUDE.md §9. DeepSeek V4 Pro = `[DeepSeek V4 Pro]`, Claude = `[Claude]`.

---

## 0. Mental Model

OmniClass = thin SPA shell (Next.js) over Convex DB. Three portals (Student / Teacher / Admin) gated by Clerk org role. Every Convex row is **organization-scoped** via `organizationId: string` (Clerk `org_*` ID). Branding (yellow background, deep purple primary) lives in a per-tenant `tenantSettings` document, not in a static file.

Fundamental flows:

1. **Live lesson** — Teacher opens dashboard → starts Soniox transcription → mid-lesson taps "Generate quiz from current buffer" (async, non-blocking) and/or opens **Reading Hub** modal to read with student → Stop & Save → Session detail page → AI generates summary/vocab/flashcards/quiz → Publish to student.
2. **Async study** — Student browses **Library** + lessons, taps a word → free Dictionary API popup → "Add to My Flashcards" → SRS deck. Studies via SM-2.
3. **Live read-along** — Teacher opens the same Library material, click on a word now reads "Send to Student's Flashcards" and pushes directly into the active student's deck.
4. **Scheduling** — Admin sets `maxReschedulesPerMonth`. Student reschedules through quota; teacher reschedules through per-instructor permission flag (`full` vs `request_only`). No-shows flagged → admin issues make-up credit.

---

## 1. Brand System (Omnica English)

### 1.1 Visual identity
| Token | Value | Usage |
|---|---|---|
| `--brand-yellow` | `#FFCA00` | Page canvas / app background |
| `--brand-yellow-soft` | `#FFF4CC` | Card hover, secondary fills |
| `--brand-purple` | `#6716A4` | Primary actions, headings, sidebar active accent, brand text |
| `--brand-purple-hover` | `#581289` | Button hover |
| `--brand-purple-deep` | `#4A1075` | Pressed state |
| `--brand-purple-tint` | `#F3EBFA` | Selected backgrounds |
| `--brand-purple-soft` | `rgba(103,22,164,.08)` | Avatars, icon chips |
| `--app-bg` | `#FAFAFA` | Surface inside sidebar layout (NOT the canvas yellow — see note) |
| `--card-bg` | `#FFFFFF` | All cards |

> **Canvas decision (must match prototype):** The shell behind the sidebar+content uses **yellow `#FFCA00`** as the page edge band; the inner content surface stays `#FAFAFA`/white so dense data tables stay readable. Cards remain white. Purple is the only "color" used for actions/text accents.

Status pills, neutrals (zinc scale), spacing, radii, shadows: copy verbatim from `omnic-portal/project/tokens.css`. That file is the binding spec — port it to `src/app/globals.css` as Tailwind v4 `@theme` tokens in **Phase B**.

Typography: **Inter** (replace Plus Jakarta Sans). Logo wordmark stays **Georgia / Plantagenet Cherokee serif** as in `OmnicLogo2`.

### 1.2 Logo
`omnic-portal/project/logo-mark.svg` is canonical. Inline SVG component in `src/components/brand/Logo.tsx`. Two-color (yellow ring + purple solid). Wordmark renders **"Omnica"** + small **".english"** subscript in purple. Sized 28/34/48.

### 1.3 Multi-tenant rule
Even though we ship for Omnica English first, **never hardcode** `"Omnica English"` or these hex values in components. They live in `tenantSettings` (Convex). The brand resolver in **Phase A** is what makes the yellow-and-purple theme appear.

---

## 2. Multi-Tenancy Foundation (Phase A — finishes Phase 7b)

### 2.1 Clerk Organizations
- Enable **Organizations** in Clerk dashboard. One org = one tenant. Omnica English = first org, slug `omnica-english`.
- Org roles: `org:admin`, `org:teacher`, `org:student`. (Clerk maps these to its built-in role model.)
- `<OrganizationSwitcher />` placed in topbar for users that belong to multiple orgs (rare; future).
- Middleware (`src/middleware.ts`): `clerkMiddleware` + `auth.protect()`; redirect to `/sign-in` if no session, to `/onboarding/select-org` if signed in but no active org.

### 2.2 JWT template
Add Clerk JWT template `convex` with claim:
```json
{
  "aud": "convex",
  "org_id": "{{org.id}}",
  "org_role": "{{org.role}}",
  "org_slug": "{{org.slug}}"
}
```
`convex/auth.config.ts` already wires the issuer; verify `org_id` arrives in `ctx.auth.getUserIdentity()`.

### 2.3 Convex tenancy contract — non-negotiable
Every domain table gains:
```ts
organizationId: v.string(),                     // Clerk org_id, e.g. "org_abc123"
isDeleted: v.optional(v.boolean()),             // soft delete (lessons, srsCards, srsDecks, scheduleEvents, libraryMaterials, billingRecords)
```
Every table gets the index:
```ts
.index("by_organization", ["organizationId"])
.index("by_organization_and_<field>", ["organizationId", "<field>"])  // for any other lookup
```
**No raw `ctx.db.query("xxx").withIndex("by_xxx")` is permitted in feature code.** All table access goes through the wrapper in `convex/lib/tenant.ts` (Phase A.4).

### 2.4 `convex/lib/tenant.ts` — centralized leak prevention
```ts
// Every callable gets the active org_id resolved from the JWT.
export async function requireTenant(ctx: QueryCtx | MutationCtx) {
  const id = await ctx.auth.getUserIdentity();
  if (!id) throw new Error("Not authenticated");
  const orgId = (id as any).org_id as string | undefined;
  if (!orgId) throw new Error("No active organization");
  const user = await ctx.db.query("users")
    .withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", id.tokenIdentifier))
    .unique();
  if (!user || user.organizationId !== orgId) throw new Error("Cross-tenant access denied");
  return { orgId, user };
}

// Scoped query/get/insert/patch helpers:
export function tenantTable<T extends TableName>(ctx, orgId, table: T) {
  return {
    list: () => ctx.db.query(table).withIndex("by_organization", q => q.eq("organizationId", orgId)),
    get: async (id) => {
      const row = await ctx.db.get(id);
      if (!row || (row as any).organizationId !== orgId) return null;
      return row;
    },
    insert: (doc) => ctx.db.insert(table, { ...doc, organizationId: orgId }),
    patch: async (id, patch) => {
      const row = await ctx.db.get(id);
      if (!row || (row as any).organizationId !== orgId) throw new Error("Cross-tenant write denied");
      if ("organizationId" in patch) throw new Error("Cannot reassign organizationId");
      return ctx.db.patch(id, patch);
    },
    softDelete: (id) => /* patch isDeleted: true, deletedAt: now */,
  };
}
```
**Lint rule (manual code review for now):** any new Convex file touching `ctx.db` directly without going through `tenantTable()` is rejected.

### 2.5 `tenantSettings` table
```ts
tenantSettings: defineTable({
  organizationId: v.string(),                 // unique per org
  // Identity
  name: v.string(),                           // "Omnica English"
  tagline: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  faviconUrl: v.optional(v.string()),
  supportEmail: v.optional(v.string()),

  // Theme
  primaryColor: v.string(),                   // "#6716A4"
  primaryColorHover: v.optional(v.string()),
  backgroundColor: v.string(),                // "#FFCA00"
  // (more tokens persisted as a record so admin can tune live)
  themeOverrides: v.optional(v.record(v.string(), v.string())),

  // Localization
  defaultLocale: v.union(v.literal("en"), v.literal("ru"), v.literal("ar")),
  enabledLocales: v.array(v.string()),
  timezone: v.string(),                       // "Asia/Bishkek"
  baseCurrency: v.string(),

  // Operational policies
  maxReschedulesPerMonth: v.number(),         // student quota
  rescheduleWindowHours: v.number(),
  cancelWindowHours: v.number(),
  defaultLessonDurationMinutes: v.number(),
  noShowConsumesLesson: v.boolean(),          // true = student no-show burns a credit

  // Feature flags
  features: v.object({
    gamification: v.boolean(),
    achievements: v.boolean(),
    library: v.boolean(),
    liveQuizGen: v.boolean(),
    payments: v.boolean(),
  }),

  // AI cost calc (Admin AI Manager uses this)
  ai: v.object({
    sonioxCostPerMinute: v.number(),          // USD, e.g. 0.0067
    avgLessonMinutes: v.number(),             // for cost estimate
  }),

  createdAt: v.string(),
  updatedAt: v.string(),
}).index("by_organization", ["organizationId"]),
```
Seed mutation `convex/tenantSettings.ts:seedOmnicaEnglish` writes the initial row when an admin first lands.

### 2.6 Brand resolver (replaces deleted stub)
- `src/lib/brand/provider.tsx` rewritten to call `useQuery(api.tenantSettings.getActive)`.
- Suspense fallback = neutral white shell (not a flash of gray).
- `BrandProvider` injects `--brand-yellow / --brand-purple / ...` as CSS vars on `<html>` from the live document.
- `src/lib/brand/config.ts`: keep `withDefaults()` + `TenantBrand` type; defaults reflect Omnica English. This file is now only a fallback when no Convex value is loaded yet.
- `src/lib/brand/helpers.ts`: keep — pure functions. `useBrand()` surface unchanged so consumers don't break.

### 2.7 Permissions migration (already half-done)
- Existing role enum on `users.role`: keep `"student" | "teacher" | "admin"`.
- Add per-user `permissions: v.optional(v.array(v.string()))` (overrides role defaults).
- `convex/lib/permissions.ts`: extend with new keys:
  - `library.upload`, `library.send_word_to_student`
  - `calendar.edit.full`, `calendar.edit.request_only`, `calendar.cancel.full`, `calendar.cancel.request_only`
  - `lessons.restore` (admin), `lessons.mark_no_show`, `lessons.flag_teacher_miss`
  - `users.assign_self_students` (default OFF for teachers per Handoff #2)
  - `users.create_students` (default OFF for teachers)
  - `branding.edit`, `scheduling.edit`, `ai.configure`, `billing.view`
- `requirePermission(ctx, "...")` is the only auth-check pattern in feature code. `requireRole` retained for legacy.
- New helper `userHasPermission(user, perm)` checks user's overrides first, then role defaults.

### 2.8 Org-aware seed
`convex/seed.ts` rewritten: takes `organizationId` arg. Creates Omnica English tenantSettings + 1 admin (Mustafa) + 2 teachers + 5 students + 4 sample English lessons + 4 prompt configs + the 11 achievements + scheduling policy. Run via `npx convex run seed:seedOrg --orgId org_xxx`.

---

## 3. Schema Blueprint (target shape after Phase A + B)

> Common columns (omitted from per-table listings): `organizationId: v.string()`, `isDeleted: v.optional(v.boolean())` where applicable, `createdAt: v.string()`, `updatedAt: v.optional(v.string())`. Common index on every table: `by_organization`.

### users
```
externalId, tokenIdentifier?, name, email, role (admin|teacher|student),
permissions?: string[], avatarUrl?, teacherId?, onboardingComplete?,
studentStatus?: "trial"|"active"|"paused"|"cancelled",
locale?: "en"|"ru"|"ar"
```
Indexes: `by_organization`, `by_organization_and_role`, `by_organization_and_email`, `by_tokenIdentifier`, `by_organization_and_teacherId`.

### lessons (rewritten for English-only; Arabic-specific fields gone)
```
externalId, teacherId, studentId, title, status: "scheduled"|"recording"|"transcribed"|"review"|"published",
transcript: string, transcriptTokens: array of {text, isFinal, startMs, endMs, speaker?},
summary: string,
contentStatus: { summary, vocabulary, flashcards, quiz: "pending"|"generating"|"review"|"approved" },
durationSeconds, scheduledFor?, recordingMode: "live"|"upload",
audioFileId?: Id<"_storage">,
isDeleted, deletedAt?, deletedBy?,
publishedAt?
```
Indexes: `by_organization_and_studentId_and_status`, `by_organization_and_teacherId`, `by_organization_and_status_and_isDeleted`.

### lessonVocabulary (English-only)
```
lessonId, externalId, word, translation, translationLocale: "ru"|"ar"|"en",
partOfSpeech, exampleSentence?, ipa?, audioUrl?
```
(Drops `arabic`/`transliteration`. Translations are per-student-locale via `translationLocale`.)

### lessonFlashcards
`lessonId, front, back, exampleSentence?` — unchanged shape.

### lessonQuizQuestions
`lessonId, question, options[], correctIndex, explanation` — unchanged.

### libraryMaterials  *(NEW — Reading & Library Hub)*
```
title: string, description?: string,
kind: "article"|"story"|"dialog"|"transcript"|"pdf",
levelCEFR?: "A1"|"A2"|"B1"|"B2"|"C1"|"C2",
topicTags: string[],
contentMarkdown: string,                   // primary text body (word-tap layer parses this)
contentHtml?: string,                       // optional pre-rendered for richer formatting
audioFileId?: Id<"_storage">,               // optional companion audio
sourceUrl?: string,
estimatedReadMinutes?: number,
uploadedBy: string,                         // users.externalId (admin)
isPublished: boolean,
isDeleted, deletedAt?
```
Indexes: `by_organization_and_isPublished`, `by_organization_and_levelCEFR`, `by_organization_and_topicTags` (open registry).

### libraryWordLookups  *(audit / cache for Dictionary API hits — optional, lazy-cached)*
```
word: string (lowercased), locale: string, definition, ipa?, audioUrl?, partsOfSpeech: string[],
fetchedAt, source: "free-dictionary"|"merriam"|"manual"
```
Index: `by_organization_and_word_and_locale`. Cache hit avoids hitting upstream API for the same word twice.

### srsDecks  *(NEW — explicit decks, replaces the "deckId is just a string" pattern)*
```
externalId, name, ownerId (student externalId), source: "lesson"|"manual"|"library"|"teacher_push",
sourceLessonId?, isDefault?: boolean              // default = "My Words" custom deck per student
isDeleted
```
Indexes: `by_organization_and_ownerId`, `by_organization_and_sourceLessonId`.

Auto-rules:
- Lesson finalize ⇒ create deck `name=lesson.title, source="lesson"`.
- Each student has exactly **one** `isDefault: true` "My Words" deck (created lazily on first manual add).

### srsCards
```
deckId: Id<"srsDecks">, ownerId, front, back, exampleSentence?, sourceLessonId?,
sourceLibraryMaterialId?, addedBy?: "self"|"teacher"|"system",
interval, easeFactor, repetitions, nextReviewDate, lastReviewDate, isDeleted
```

### scheduleEvents
```
externalId, type: "1on1"|"group"|"offline"|"global",
teacherId?, studentId?, studentIds?: string[],   // group enrollment lives in scheduleEnrollments
title, date: "YYYY-MM-DD", startTime: "HH:mm", endTime: "HH:mm",
status: "scheduled"|"completed"|"cancelled"|"no_show_student"|"no_show_teacher"|"makeup",
googleMeetLink?,
rescheduledFromEventId?,                    // breadcrumb when an event was moved
rescheduleRequestId?,                       // pending request, if instructor lacks full perm
isDeleted
```

### rescheduleRequests *(NEW)*
```
eventId, requestedBy: "teacher"|"student",
fromDate, fromStartTime, toDate, toStartTime,
reason?, status: "pending"|"approved"|"rejected", resolvedBy?, resolvedAt?
```
Index: `by_organization_and_status`.

### studentRescheduleQuota *(NEW — counter; enforces `maxReschedulesPerMonth`)*
```
studentId, yearMonth: "YYYY-MM", count: number
```
Index: `by_organization_and_studentId_and_yearMonth`.
Mutation `consumeReschedule` increments atomically; returns new count + the limit.

### makeupCredits *(NEW)*
```
studentId, reason: "teacher_no_show"|"admin_grant"|"other",
sourceEventId?, redeemedEventId?, status: "issued"|"redeemed"|"expired",
issuedBy: string, expiresAt?
```
Index: `by_organization_and_studentId_and_status`.

### studentPackages  *(NEW — sessions remaining)*
```
studentId, totalSessions, usedSessions, status: "active"|"paused"|"completed",
startDate, endDate?
```
Decrement rule: on `scheduleEvents.status` transition to `completed` or `no_show_student`, `usedSessions += 1`.

### notifications  *(NEW — bell icon feed)*
```
recipientId, kind: "session_published"|"reschedule_request"|"reschedule_resolved"|
                   "permission_request"|"achievement_unlocked"|"invoice"|"impersonation"|"teacher_no_show",
payload: any (validated per-kind), readAt?, link?: string
```
Index: `by_organization_and_recipientId_and_readAt`.

### permissionRequests *(NEW — when teacher takes restricted action)*
```
teacherId, action: string, payload: any, status: "pending"|"approved"|"rejected",
resolvedBy?, resolvedAt?
```

### Existing tables — patched
`promptConfigs`, `achievements`, `studentAchievements`, `streaks`, `studySessions`, `quizAttempts`, `reviewLogs`, `schedulePolicy`, `certificateTemplates`, `issuedCertificates`, `studentProfiles`, `billingRecords`, `expenses`, `exchangeRates`: all gain `organizationId` + `by_organization` index. `lessons`, `srsCards`, `scheduleEvents`, `libraryMaterials`, `billingRecords` also gain `isDeleted`.

`schedulePolicy` is **deprecated** in favor of `tenantSettings` (move fields, drop table).

---

## 4. Feature Specifications

### 4.1 Reading & Library Hub
**Routes**
- Admin: `/admin/library` — list + upload form. Upload writes to `libraryMaterials` (markdown text body required; optional PDF/audio file via Convex storage `ctx.storage`).
- Student: `/student/library`, `/student/library/[id]`.
- Teacher: `/teacher/library`, `/teacher/library/[id]?studentId=...` (the `studentId` query param flips word-tap behavior).

**Reading view component** `src/components/library/ReadingView.tsx` is **shared** by student + teacher routes. It renders `contentMarkdown` and intercepts word taps:

```tsx
<ReadingView
  material={material}
  mode={isTeacher && activeStudentId ? "live-teach" : "self-study"}
  activeStudentId={activeStudentId}
/>
```

**Word tap UX**
1. User clicks a word → popover opens anchored on the word.
2. Popover fetches `getWordLookup({ word, locale })` from Convex action — which:
   - First checks `libraryWordLookups` cache.
   - Cache miss → calls **Free Dictionary API** (`https://api.dictionaryapi.dev/api/v2/entries/<locale>/<word>`) server-side from the Convex action.
   - Stores result in `libraryWordLookups` keyed by org+word+locale.
3. Popover shows: word, IPA, audio (`<audio>` from `phonetics[].audio`), part-of-speech blocks, first 2 definitions, first example.
4. CTA button:
   - `mode === "self-study"` (Student or Teacher reading alone): **"Add to My Flashcards"** → `addCardToOwnDeck` mutation (target deck = caller's "My Words" default deck).
   - `mode === "live-teach"` (Teacher with `activeStudentId`): **"Send to Student's Flashcards"** → `pushCardToStudentDeck({ studentId, materialId, word, ... })` mutation (target deck = student's default "My Words" deck).
5. Toast confirmation. Lookup popover closes.

**Constraint:** Dictionary API is **free and standard** — never route this lookup through OpenRouter / any LLM. Cost stays zero.

**Teacher live trigger:** Teacher's Live Lesson Dashboard exposes a primary button **"Open Reading"** → opens `ReadingView` in a `<Sheet side="right">` modal (50% viewport width on desktop, full-screen on mobile). The lesson page's `studentId` is passed in so word taps go to the right student.

### 4.2 Live Lesson Dashboard (`/teacher/sessions/[id]/live`)
- Soniox `SonioxRecorder` (already in `src/lib/soniox/client.ts`) captures **mic + Google Meet tab audio** (existing `getDisplayMedia + Web Audio API` mix logic preserved; **do not regress**).
- Live transcript pane (center): finalized = solid, partial = italic gray, speaker labels from diarization tokens.
- Tokens accumulate in **client memory** (React ref) AND every 2s autosave to Convex via `lessons.appendTranscriptTokens` mutation (idempotent on token startMs).

**On-the-Spot Quiz Generator**
- Button **"Generate Quiz from Last 3 Min"** in the action bar.
- On click:
  1. Snapshot the in-memory transcript buffer (last N seconds, default 180).
  2. Fire `useAction(api.ai.generateQuizFromBuffer)({ lessonId, transcriptBuffer })`.
  3. The action runs in the Convex Node runtime, calls OpenRouter, parses response, writes results to a NEW `inLessonQuizDrafts` table (`lessonId, questions[], generatedAt`).
  4. **No await on the UI thread.** The recording socket is untouched. The button enters a "Generating…" state with a tiny spinner; on success a toast pops "Quiz ready (5 questions)" with a **"Show"** action that opens a `<Sheet>`.

> **Hard rule:** Soniox `SonioxRecorder.start()` and the WebSocket it owns must remain running through quiz generation. The quiz pipeline is fire-and-forget on a separate React state slice. Verification: enable Soniox debug logging during dev — token stream must not pause when the quiz button is pressed.

**Reading integration:** Action bar second primary button **"Open Reading Hub"** → `<Sheet side="right">` with the shared `<ReadingView mode="live-teach" activeStudentId={lesson.studentId} />`.

**Stop & Save** → flushes final tokens, sets `lessons.status = "transcribed"`, navigates to `/teacher/sessions/[id]` (review page). AI-content generation buttons (summary/vocab/flashcards/quiz) live on the review page, NOT auto-fired.

### 4.3 Scheduling Engine

**Student reschedule UI** (`/student/calendar` event detail):
- Read `tenantSettings.maxReschedulesPerMonth` (e.g. 4).
- Read `studentRescheduleQuota` for `(studentId, currentYearMonth)`.
- Display: **"3 of 4 reschedules used this month."**
- Disable button when `quota.count >= max`. Tooltip: "Limit reached — contact your school."
- Also disable if event start − now < `tenantSettings.rescheduleWindowHours`.

**Teacher reschedule UI** (`/teacher/calendar`):
- Branch on `userHasPermission(teacher, "calendar.edit.full")`:
  - **Full:** native drag-and-drop on the calendar grid; `scheduleEvents.patch` direct.
  - **Request only:** drag is disabled. Click event → modal **"Submit Reschedule Request"** → writes `rescheduleRequests` row, fires `notifications` to all admins.
- Cancel symmetric: `calendar.cancel.full` vs `calendar.cancel.request_only`.

**Admin reschedule queue** `/admin/scheduling/requests`:
- Table of `rescheduleRequests` where `status === "pending"`. Approve → mutates the underlying event + status; Reject → status only. Notification fires to teacher.

**Missed classes**
- Teacher session detail bottom action bar adds:
  - Button **"Mark Student No-Show"** → `lessons.patch({status: "no_show_student"})` AND `studentPackages.usedSessions += 1` (reads `tenantSettings.noShowConsumesLesson`; if false, skips decrement).
  - Implicit teacher no-show: any `scheduleEvents` row whose start is > 15 min in the past with `status === "scheduled"` is surfaced on Admin Dashboard widget **"Unaccounted-for sessions"**. Admin clicks → choose **"Mark teacher no-show + issue make-up credit"** (default) or **"Mark student no-show"**. Issuing make-up writes `makeupCredits` row + fires student notification.

### 4.4 Soft Delete
- `lessons.deleteLesson` is gated to `requirePermission("lessons.delete")` (admin only by default). For teacher/student visible delete buttons, the mutation is `lessons.softDelete` → sets `isDeleted: true, deletedAt: now, deletedBy: caller.externalId`.
- All list queries default-filter `isDeleted !== true`.
- Admin route `/admin/sessions/deleted` lists soft-deleted lessons; **"Restore"** button calls `lessons.restore` → unsets `isDeleted`. Hard delete remains a Convex CLI-only operation (no UI).
- Same pattern for `srsCards`, `srsDecks`, `scheduleEvents`, `libraryMaterials`, `billingRecords`.

### 4.5 AI Manager — True cost calc
On `/admin/ai`, each prompt-config card already shows token-based cost. Add at the bottom of the page:

```
Total estimated cost per lesson:
  + AI prompts (sum of 4):                $0.000113
  + Soniox transcription                  ($0.0067/min × 60 min avg) = $0.4020
  ────────────────────────────────────────────────────────
  Total per lesson:                       $0.4021
```

`avgLessonMinutes` and `sonioxCostPerMinute` come from `tenantSettings.ai`. Admin can edit both inline. Recompute live in the React component (no server round-trip needed — pure arithmetic on the loaded settings doc).

### 4.6 Language switcher
- Add `<LanguageSwitcher />` (already exists in `src/components/layout/language-switcher.tsx`) to the topbar **right side**, between notifications bell and avatar.
- Bound to `useLocale()` from `src/i18n/provider.tsx`. Persists to `users.locale` via Convex mutation `users.updateLocale` so the choice follows the user across devices.
- Three options: English / Русский / العربية. Selecting Arabic flips `<html dir="rtl">` (existing logic).

### 4.7 Notifications bell
Topbar bell icon. Reactive `useQuery(api.notifications.listUnread)`. Click → `<Popover>` with last 20. Mark-read on click. Existing real-time via Convex's reactive queries — no extra plumbing.

---

## 5. UI Transplant Roadmap (`omnic-portal/` → `src/app/`)

Source designs in `omnic-portal/project/` are **HTML/CSS/JSX prototypes**, not React components. We **recreate**, not copy.

### 5.1 Mapping table
| Prototype file | Production destination | Notes |
|---|---|---|
| `tokens.css` | `src/app/globals.css` (Tailwind v4 `@theme`) | Port every CSS var verbatim |
| `layout.css` | merged into `globals.css` + Tailwind utilities | Strip; prefer Tailwind classes |
| `app.jsx` (router shell) | `src/app/(authed)/layout.tsx` per portal | Already exists per-portal; update to match shell chrome |
| `components.jsx` (Sidebar, MetricCard, StatusPill, Avatar, Card, etc.) | `src/components/shared/` | New: `MetricCard.tsx`, `StatusPill.tsx`, `OmnicSidebar.tsx`, `BottomNav.tsx`, `PageHeader.tsx`. Existing shadcn `<Card>` stays underneath. |
| `icons.jsx` | use **lucide-react** equivalents | Don't recreate the SVG dictionary |
| `student.jsx` Dashboard | `src/app/student/page.tsx` (rewrite) | Sections: Welcome bar, "Next Up" card, stat cards, recent lessons |
| `student.jsx` Lessons + Detail | `src/app/student/lessons/page.tsx` + `[lessonId]/page.tsx` (rewrite) | Replace `LessonPath` (Duolingo island) with simple list per spec §4.3 |
| `student.jsx` Study | `src/app/student/study/page.tsx` (rewrite) | Keep SM-2 logic (`src/lib/srs/sm2.ts`); replace UI |
| `student.jsx` Vocabulary | `src/app/student/vocabulary/page.tsx` (NEW; replaces `/student/decks`) | Search + filter + decks toggle |
| `student.jsx` Calendar | `src/app/student/calendar/page.tsx` (rewrite) | Reschedule quota UI per §4.3 |
| `student.jsx` Achievements | `src/app/student/achievements/page.tsx` (rewrite) | Hide entire route when `tenantSettings.features.gamification = false` |
| `student.jsx` Profile | `src/app/student/profile/page.tsx` (rewrite) | Sessions remaining + locale picker |
| `library.jsx` | `src/components/library/ReadingView.tsx` + `/student/library/*`, `/teacher/library/*`, `/admin/library/*` | Spec §4.1 |
| `teacher.jsx` Dashboard | `src/app/teacher/page.tsx` (rewrite) | "Today at a glance" + quick actions |
| `teacher.jsx` Sessions | `src/app/teacher/sessions/page.tsx` (NEW; replaces nothing — supersedes `/teacher/lessons/new`) | Includes Start Session modal |
| `teacher.jsx` Session Detail | `src/app/teacher/sessions/[id]/page.tsx` | Replaces `/teacher/lessons/[lessonId]` |
| `teacher.jsx` Live Transcribe | `src/app/teacher/sessions/[id]/live/page.tsx` | Spec §4.2 |
| `teacher.jsx` Students | `src/app/teacher/students/page.tsx` | Roster table |
| `teacher.jsx` Calendar | `src/app/teacher/calendar/page.tsx` (rewrite) | Permission branching per §4.3 |
| `teacher.jsx` Reports | `src/app/teacher/reports/page.tsx` (NEW) | |
| `admin.jsx` Dashboard | `src/app/admin/page.tsx` (rewrite) | P&L card, subscription summary, recent activity |
| `admin.jsx` People | `src/app/admin/people/page.tsx` (NEW; merges old `/admin/users` + `/admin/students`) | tanstack-table |
| `admin.jsx` People Analytics | `src/app/admin/people/analytics/page.tsx` | Move from current `/admin/analytics` |
| `admin.jsx` Sessions | `src/app/admin/sessions/page.tsx` (NEW; admin-level read-only) | Past + Upcoming subtabs |
| `admin.jsx` Sessions/Deleted | `src/app/admin/sessions/deleted/page.tsx` (NEW) | Soft-delete restore |
| `admin.jsx` Billing | `src/app/admin/billing/page.tsx` (NEW) | 3 tabs |
| `admin.jsx` AI Manager | `src/app/admin/ai/page.tsx` (rewrite) | True cost calc per §4.5 |
| `admin.jsx` Achievements | `src/app/admin/achievements/page.tsx` (rewrite) | |
| `admin.jsx` Scheduling | `src/app/admin/scheduling/page.tsx` (rewrite) | + new `/admin/scheduling/requests` |
| `admin.jsx` Branding | `src/app/admin/branding/page.tsx` (NEW) | Edits `tenantSettings`; live preview pane |
| `admin.jsx` Permissions | `src/app/admin/permissions/page.tsx` (NEW) | Per-role + per-user permission matrix |

### 5.2 Components to **DELETE** (after their consumers are rewritten)
Track these in TodoWrite during execution; do not remove pre-emptively (build will break further):
- `src/components/student/LessonPath.tsx` — replaced by simple list
- `src/components/student/ProgressRing.tsx` — not in new design
- `src/components/student/FlashcardViewer.tsx` — replaced by `<StudyCard>` (new)
- `src/components/student/QuizPlayer.tsx` — replaced by `<InlineQuiz>` (new)
- `src/app/student/decks/page.tsx` — folded into `/student/vocabulary`
- `src/app/student/stats/page.tsx` — folded into `/student/profile` + `/admin/people/analytics`
- `src/app/onboarding/page.tsx` — replaced by `/onboarding/select-org` (Clerk org join flow)
- `src/app/admin/users/page.tsx` + `src/app/admin/students/page.tsx` — folded into `/admin/people`
- `src/app/admin/certificates/page.tsx` — out of scope this round; remove route, keep tables for later
- `src/app/teacher/lessons/new/page.tsx` + `src/app/teacher/lessons/[lessonId]/page.tsx` — superseded by `/teacher/sessions/*`

### 5.3 Components / files to **KEEP** untouched
- `src/lib/soniox/client.ts` — already does mic+tab mixing correctly. Don't refactor without reason.
- `src/lib/srs/sm2.ts` + `convex/lib/sm2.ts` — algorithm is sound.
- `src/lib/ai/generate.ts` + `src/lib/ai/prompts.ts` — keep parsers; pipe through Convex action layer instead of direct `fetch`.
- `src/components/recording/RecordingPanel.tsx` + `WaveformVisualizer.tsx` — repurpose inside the new live page.
- `src/components/calendar/WeeklyCalendar.tsx` — keep grid; restyle.
- `src/components/ui/*` (shadcn) — keep all.
- `src/i18n/*` + `messages/*.json` — keep; add new keys per page.

---

## 6. Execution Roadmap (phased, top to bottom)

> Don't start coding features until this plan is committed to the repo. After commit, walk Phase A → F in order. Each phase ends with a manual verification step.

### Phase A — Multi-tenancy bedrock  *(unblocks build)*
1. Enable Clerk Organizations + JWT template (`convex` audience, includes `org_id`/`org_role`/`org_slug`).
2. `convex/schema.ts`: add `organizationId` to every table; add `isDeleted` where listed; create `tenantSettings` table; add `by_organization` indexes everywhere.
3. Write `convex/lib/tenant.ts` (`requireTenant` + `tenantTable`).
4. Migrate every existing Convex file from raw `ctx.db` to `tenantTable(ctx, orgId, "...")`. Replace every `requireRole` with `requirePermission` where it isn't already.
5. Write `convex/tenantSettings.ts`: `getActive`, `update`, `seedOmnicaEnglish`.
6. Rewrite `src/lib/brand/provider.tsx` against `useQuery(api.tenantSettings.getActive)`. Rewrite `src/app/layout.tsx` to read brand metadata via the provider (or a server-side Convex client for SSR `<title>`).
7. Add `<OrganizationSwitcher />` and onboarding `/onboarding/select-org` route. Middleware redirects.
8. Run `npx convex run tenantSettings:seedOmnicaEnglish --orgId <real org id>`.
9. **Verify:** `tsc --noEmit` clean; sign in as Mustafa → land in `/admin`; brand colors are yellow+purple.

### Phase B — Design system + shell
1. Port `tokens.css` to `globals.css` as Tailwind v4 `@theme` block.
2. Replace Plus Jakarta Sans with Inter.
3. New `<Logo />` from `logo-mark.svg`.
4. New shared shell components (`OmnicSidebar`, `BottomNav`, `PageHeader`, `MetricCard`, `StatusPill`).
5. Update three portal layouts (`/student`, `/teacher`, `/admin`) to use the new shell + new sidebar items per spec §6.1.
6. Add `<LanguageSwitcher />` + `<NotificationsBell />` to topbar.
7. **Verify:** all three portals render with new chrome; existing pages still mount (even if content unstyled).

### Phase C — Library Hub  *(core differentiator)*
1. Schema additions: `libraryMaterials`, `libraryWordLookups`, `srsDecks` (refactor `srsCards.deckId` to `Id<"srsDecks">`).
2. Convex: `library.ts` (CRUD), `library.getWordLookup` action (Free Dictionary API + cache), `srs.addCardToOwnDeck`, `srs.pushCardToStudentDeck`.
3. `<ReadingView>` shared component with `mode` prop.
4. Routes: `/admin/library` (upload form + list), `/student/library` + `/[id]`, `/teacher/library` + `/[id]?studentId=...`.
5. **Verify:** admin uploads markdown → student sees it → tap word → popover with definition → "Add to Flashcards" creates card; teacher with `?studentId=` sees "Send to Student" instead and pushes to that student's deck.

### Phase D — Live Lesson + Sessions
1. `/teacher/sessions/page.tsx` with **Start Session** modal (Live | Upload).
2. `/teacher/sessions/[id]/live/page.tsx`: rewire existing `RecordingPanel` into the new shell. Verify mic+tab capture still works.
3. `convex/inLessonQuiz.ts`: `generateQuizFromBuffer` action (calls OpenRouter, never blocks). New `inLessonQuizDrafts` table.
4. **"Open Reading Hub"** button → `<Sheet>` with `<ReadingView mode="live-teach">`.
5. `/teacher/sessions/[id]/page.tsx` review page (rewrite of old lesson detail) — Generate All / per-section regen / Approve / Publish / Soft-delete / Mark No-Show.
6. **Verify:** record a 2-min lesson; trigger quiz mid-recording; transcript stream remains uninterrupted; quiz appears in 5–15s; open Reading Hub during recording, send a word to student → student sees it appear in their flashcards in real time.

### Phase E — Scheduling + Permissions
1. Schema: `rescheduleRequests`, `studentRescheduleQuota`, `makeupCredits`, `studentPackages`, `permissionRequests`. Drop `schedulePolicy` (move to `tenantSettings`).
2. Convex: `schedule.requestReschedule`, `schedule.consumeRescheduleQuota`, `schedule.markNoShow`, `schedule.issueMakeupCredit`, `permissions.request`, `permissions.resolve`.
3. Student calendar: quota display + disable.
4. Teacher calendar: permission branching (full vs request-only).
5. Admin: `/admin/scheduling/requests` queue, `/admin/scheduling` policy editor, dashboard widget for unaccounted sessions.
6. `/admin/permissions` matrix page.
7. **Verify:** student hits monthly limit → button disabled with tooltip; teacher with `request_only` perm submits a request → admin notification → admin approves → event moves; admin marks teacher no-show → student gets make-up credit.

### Phase F — Admin polish + soft-delete + AI cost
1. `/admin/people` (merged users+students), `/admin/people/analytics` (P&L), `/admin/billing` (3 tabs).
2. `/admin/sessions` + `/admin/sessions/deleted` (Restore).
3. `/admin/ai` rewrite with full true-cost block (§4.5).
4. `/admin/branding` editor with live preview pane (writes `tenantSettings`).
5. `/admin/achievements`, `/admin/scheduling` rewrites.
6. **Verify:** edit primary color in `/admin/branding` → entire portal recolors live (CSS var injection); soft-delete a lesson then restore from `/admin/sessions/deleted`; AI Manager total cost reflects edits to `sonioxCostPerMinute`.

### Phase G — UI Integration from Omnica-new-UI *(IN PROGRESS — do NOT mark complete)*

⚠️ Student pages structurally ported but visual design does NOT match `Omnica-new-UI/` yet. See `CLAUDE.md` §10 for gap list. Do not mark this phase complete until Mustafa confirms visual parity.

### Phase Z — Final Cleanup & Refinement *(ALWAYS LAST — user gates this)*

**DO NOT START Phase Z without explicit user request.** This phase
consolidates all remaining cleanup, polish, and deferred refinements.
It is never reached by default — the user must explicitly say "do
Phase Z" or "let's finish up."

#### Z.1 Cleanup (formerly Phase G)
1. Delete superseded files listed in §5.2 (already mostly gone — verify).
2. Drop legacy schema fields (`lessonVocabulary.arabic / transliteration`) via Convex migration; add new `word / translation / translationLocale`.
3. Remove unused i18n keys; add new ones for Reading Hub + Sessions + Library + Permissions copy.
4. `tsc --noEmit` clean; lint clean; manual smoke per portal in en/ru/ar.

#### Z.2 Student Portal (formerly Phase G gap)
Build missing student-side pages that were deleted in Phase A but not yet rebuilt:
- `/student/lessons` — lesson list (replaces old `LessonPath`)
- `/student/vocabulary` — word management (replaces old `/student/decks`)
- `/student/profile` — user profile + session counter (replaces old `/student/stats`)
- `/student/study` — SRS study session with `<StudyCard>` component
- `/student/achievements` — achievements gallery
- Components: `<StudyCard>` (replaces `FlashcardViewer`), `<InlineQuiz>` (replaces `QuizPlayer`)

#### Z.3 Visual Parity (formerly Phase H)
- Walk every portal surface against `omnic-portal/project/*` prototypes for pixel match.
- Build animations/transitions per `tokens.css` (`.fade-in`, `.slide-up`, `.slide-in-right`, `.scale-in`).
- Student dashboard "Welcome bar" + "Next Up" hero card.
- Teacher session detail layout density.
- Admin dashboard P&L card + subscription summary.
- Library list card grid.

#### Z.4 Library Refinements (formerly Phase H)
- Already-added words underlined in ReadingView.
- Hard duplicate prevention on addCardToOwnDeck / pushCardToStudentDeck.
- OpenRouter fallback for unknown words (cache hits with `source: "openrouter"`).
- Russian translation default + per-student locale toggle.
- Schema: `libraryWordLookups` add `translation`, `translationLocale`; `srsCards` add dedupe index.

#### Z.5 Remaining Niceties
- Recording pause/resume in live lesson toolbar.
- WeeklyCalendar drag-and-drop reschedule.
- `window.__omnic_setTranscriptSnapshot` → proper React context.
- Onboarding page remake.
- Certificates page (deferred feature — §10).

#### Z.6 Verification
- Full build clean, all routes render.
- Smoke test all three portals in en/ru/ar.
- Soniox + OpenRouter keys verified working.
- Cross-tenant isolation confirmed.

These are deliberately surfaced — answer them before writing the code, not during.

1. **Make-up credit redemption flow.** When a student has a credit, do they pick which future session to redeem it on, or does it auto-apply to the next scheduled session? Default proposal: auto-apply to the first new event the student schedules; surface a banner "Make-up credit applied".
2. **Quota reset timing.** "Per month" = calendar month or rolling 30 days? Default proposal: calendar month, keyed by `YYYY-MM` in `studentRescheduleQuota`.
3. **Group events (Handoff §6).** Are these in scope for v1, or deferred? Default proposal: schema-ready (the `type` enum and `studentIds` array exist), UI deferred to v1.1.
4. **Off-hour transcription cost recovery.** Soniox cost is paid per active minute regardless of meeting length — should we measure actual STT-active seconds and bill the tenant on that, or just `avgLessonMinutes × cost/min` as a flat estimate? v1: flat estimate is enough.
5. **Word lookup language mismatch.** Free Dictionary API only supports `en`. For Russian/Arabic students who tap an English word, the *definition* is English. Do we LLM-translate the definition into the student's L1? Default proposal: v1 ships English-only definitions; v1.1 adds an opt-in translate-on-demand using a cheap OpenRouter model.

---

## 8. Verification Checklists (per phase)

**Phase A:** Sign-in as admin in Org A and admin in Org B. Org B's admin cannot see any of Org A's lessons/students/library — verified via direct Convex query attempts in the dashboard. `requireTenant` throws on cross-org `get(id)`.

**Phase B:** Background is yellow, primary actions are deep purple, sidebar matches `omnic-portal` prototype within 5px. Inter font loaded. Logo renders both inline yellow+purple paths.

**Phase C:** End-to-end the Reading Hub round-trip in both modes. Verify the cache: tapping the same word twice does not call upstream API a second time (check `libraryWordLookups` doc count).

**Phase D:** Soniox WebSocket frame counter does not drop while quiz generation runs (eyeball Network tab; `wss://api.soniox.com/...` keeps streaming). Stop & Save flushes final tokens; transcript on review page contains the last sentence spoken.

**Phase E:** Quota counter increments atomically (try simultaneous reschedules from two browser tabs — one must reject). Permission flag flip from admin instantly affects teacher UI on next render (Convex reactive).

**Phase F:** Soft-deleted lesson is invisible in `/teacher/sessions` and `/student/lessons` but visible in `/admin/sessions/deleted`; Restore makes it reappear. AI Manager total cost: change `avgLessonMinutes` from 60 → 30 and watch the total halve.

---

## 9. File Registry — target state after Phase G

(Maintained inline as files land. Ground truth is the filesystem; this section is a navigation aid.)

```
src/
  app/
    (auth)/sign-in /sign-up
    onboarding/select-org
    student/
      page · lessons/[id] · study · vocabulary · library/[id] · calendar · achievements · profile
    teacher/
      page · sessions/[id]/(page|live) · students · library/[id] · calendar · reports
    admin/
      page · people/(page|analytics) · sessions/(page|deleted) · billing
      library · permissions · branding · scheduling/(page|requests) · ai · achievements
    layout · providers · globals.css
  components/
    brand/Logo
    shared/(OmnicSidebar|BottomNav|PageHeader|MetricCard|StatusPill|NotificationsBell|LanguageSwitcher)
    library/ReadingView · WordLookupPopover
    recording/(RecordingPanel|WaveformVisualizer)
    calendar/WeeklyCalendar
    ui/* (shadcn)
  lib/
    auth · brand/(config|helpers|provider) · soniox/client · srs/sm2 · ai/(generate|prompts)
    transcript · countries · utils
  i18n/(config|provider)
convex/
  schema · auth.config · tenantSettings · users · lessons · lessonContent · library
  inLessonQuiz · srs · schedule · scheduleRequests · permissions · notifications
  billing · expenses · exchangeRates · achievements · streaks · study · settings · ai · soniox · seed
  lib/(tenant|auth|permissions|defaultPrompts|sm2)
public/
  brand/omniclass/(logo|logo-dark).svg
  brand/tenant/(logo|logo-dark|favicon).svg   # overwritten per tenant deploy
messages/(en|ru|ar).json
```

---

## 7. Open Questions (decide before Phase E)

The new UI prototype covers ~all surfaces from the old UI. Only one
feature is deferred without a present-day equivalent:

- **Certificates page (`/admin/certificates`)** — the old UI had a
  placeholder for "Course Completion" / "Level Achievement" templates +
  PDF upload. Schema rows (`certificateTemplates`, `issuedCertificates`)
  remain in the new schema. UI is intentionally **NOT** rebuilt during
  Phase A–G. User will request it explicitly during the post-everything
  polish/animations pass.

All other old-UI features (Duolingo island lesson path, 3D flip
flashcard, inline quiz, decks, stats heatmap, onboarding questionnaire)
have a parity surface in the new UI per the prototype + spec, so they
are recreated phase-by-phase during the transplant rather than ported
verbatim.

**Convention going forward:** before deleting any other feature that
exists in the old UI but seems absent from the new, ask the user
first. Don't cut on assumption.

---

## 11. Change Log

| Date | Change |
|---|---|
| 2026-05-04 | Reset. Deleted: `MASTER_PLAN.md` (legacy), `LinguLab-Refactor-Phases.md`, `LinguLab-Technical-Specification.md`, `src/lib/brand/current-tenant-brand.ts`. Renamed product to **OmniClass**. First tenant **Omnica English**. Yellow + Purple brand. Dropped Frappe experiment; reaffirmed Next.js + Convex + Clerk stack. New plan written. Build is intentionally broken pending Phase A. |
| 2026-05-04 | Phase A landed: schema gained `organizationId` everywhere + soft-delete fields, new `tenantSettings / libraryMaterials / libraryWordLookups / srsDecks / inLessonQuizDrafts / rescheduleRequests / studentRescheduleQuota / makeupCredits / studentPackages / notifications / permissionRequests` tables. `convex/lib/tenant.ts` (`requireTenant / tenantTable / requireTenantPermission`) enforces org isolation. Legacy feature convex files (`achievements/billing/certificates/exchangeRates/expenses/lessonContent/lessons/schedule/settings/streaks/studentProfiles/study`) deleted — rebuilt phase-by-phase against tenant wrapper. `users.ts` rewritten org-aware. `seed.ts` rewritten as `seedOmnicaEnglish`. Brand provider rewired to `useQuery(api.tenantSettings.getActive)`. Middleware redirects no-org users to `/onboarding/select-org` (new). Convex `tsc` clean. |
| 2026-05-04 | Phase B landed: `globals.css` ported full Omnica token set (yellow/purple). Inter font replaces Plus Jakarta Sans. Shared shell (`OmnicSidebar / BottomNav / Topbar / PortalShell / MetricCard / StatusPill / PageHeader / NotificationsBell`) + per-portal `sidebar-config.ts`. Topbar embeds `<OrganizationSwitcher /> <UserButton /> <LanguageSwitcher /> <NotificationsBell />`. shadcn `popover` + `dropdown-menu` added. Old per-portal sidebars + topbar deleted. Broken feature pages (admin/teacher/student sub-routes referencing deleted convex modules) deleted. Both `tsc` runs clean. |
| 2026-05-04 | Logo mark replaced with authoritative inline SVG (`OmnicaMark`) using user-provided `whait background.svg` / `yallow background.svg` path data. Background rect dropped so mark sits transparent on any surface. Ring color recolors via `tenantSettings.primaryColor`. |
| 2026-05-04 | Deferred-features convention added (§10). Certificates page is the only old-UI feature parked for end-of-project polish; all others have new-UI parity. Going forward: ask before deleting any old-UI feature missing from the new design. |
| 2026-05-04 | Phase C landed: `convex/library.ts` (CRUD + `getWordLookup` action against Free Dictionary API with org-scoped cache in `libraryWordLookups`) and `convex/srs.ts` (`addCardToOwnDeck / pushCardToStudentDeck` + lazy default deck). `<ReadingView>` + `<WordLookupPopover>` + routes `/admin/library`, `/student/library/(page|[id])`, `/teacher/library/(page|[id]?studentId=...)`. Word lookup never routed through OpenRouter (constraint preserved). Both tsc clean. |
| 2026-05-04 | CLI bootstrap helpers added (`users:setRole`, `users:seedUser`) so a teacher account can be created until /admin/people lands in Phase F. Pre-seeding by email auto-links Clerk identity on first sign-in. |
| 2026-05-04 | Phase H §9.5 captured: visual parity to prototype + library refinements (underline added words, dedupe, OpenRouter fallback for unknown words with cache, Russian translation default + per-student locale toggle). |
| 2026-05-04 | Portal layouts marked `"use client"` to fix server→client `LucideIcon` function-prop boundary. |
| 2026-05-06 | Phase D started — convex side: `convex/lessons.ts` (org-scoped CRUD, `appendTranscript / finalizeTranscript / publish / reopen / softDelete / restore / markNoShow`, auto-create lesson deck on publish), `convex/lessonContent.ts` (vocab/flashcards/quiz replace+list), `convex/inLessonQuiz.ts` (action `generateQuizFromBuffer` runs out-of-band against OpenRouter, never blocks Soniox). Convex `tsc` clean. UI side (sessions list, live page, review page, RecordingPanel rewire) deferred to next turn. |
| 2026-05-06 | Phase D finished. UI: `/teacher/sessions` list + Start Session modal (live or upload mode, student picker), `/teacher/sessions/[id]/live` (RecordingPanel + sticky toolbar, "Open Reading" Sheet with material picker → `<ReadingView mode="live-teach" activeStudentId={lesson.studentId}/>`, "Generate Quiz" fire-and-forget with toast → drafts surface inline), `/teacher/sessions/[id]` review page (Tabs: Transcript / Summary / Vocabulary / Flashcards / Quiz, per-section status dots, Regenerate / Approve / Generate All / Publish / Reopen / Mark No-Show / Soft-delete). RecordingPanel rewired to `api.lessons.finalizeTranscript`, RTL/Arabic dir attributes stripped. Transcript snapshot bridged to live page via `window.__omnic_setTranscriptSnapshot` so quiz button reads the latest buffer without coupling to internal token state. New `convex/promptConfigs.ts` (`listForOrg / getByConfigId`) for org-scoped prompt fetch. shadcn `dialog` added. Both tsc runs clean. |
| 2026-05-06 | Live lesson page redesigned as 2-panel layout: left = transcription (RecordingPanel), right = interaction panel with Quiz tab (generate + drafts inline) and Reading tab (ReadingView inline, no slide-out Sheet). Session page gained "Go Live" button. Reading/quiz no longer in a Sheet — integrated directly in the side panel. |
| 2026-05-06 | Phase E landed (Scheduling + Permissions). Convex: `schedule.ts` (CRUD, requestReschedule with student quota enforcement + window check, resolveReschedule, markNoShow with studentPackages decrement + auto-issue makeupCredit, consumption tracking, student packages), `notifications.ts` (listUnread/listRecent/markRead/markAllRead + internal `_notify`), `permissions.ts` (requestPermission/resolvePermission/listPending). Frontend: `/student/calendar` (weekly view + reschedule dialog with quota), `/teacher/calendar` (permission branching: full-edit vs request-only), `/admin/scheduling` (policy editor + unaccounted sessions widget), `/admin/scheduling/requests` (pending reschedule queue with approve/reject), `/admin/permissions` (role defaults matrix + per-user overrides + pending permission requests). NotificationsBell wired to Convex with unread badge. WeeklyCalendar made optional-field-safe. |
| 2026-05-06 | Phase F landed (Admin Polish). Convex: `achievements.ts` (list/create/remove). Frontend: `/admin/people` (user table with search + filter + inline edit of role/name/status), `/admin/people/analytics` (stats cards + student status breakdown), `/admin/sessions` (past/upcoming admin view), `/admin/sessions/deleted` (restore soft-deleted), `/admin/ai` (prompt config table + per-lesson cost calculator), `/admin/branding` (color pickers with live CSS var preview), `/admin/billing` (packages table with total/used/remaining), `/admin/achievements` (CRUD with emoji icon picker). shadcn `select` component added. |
| 2026-05-07 | **[DeepSeek V4 Pro]** Phase G — Omnica-new-UI port began. CSS design system upgraded: prototype component classes (`.card`, `.btn`, `.pill`, `.tbl`, `.tabs`, `.flashcard`, `.quiz-option`, `.achv-card`, `.rating-btn`, `.progress`, etc.) appended to `globals.css`. Design tokens updated: app background → `#FFF9E6` warm cream, shadows → purple-tinted, `--brand-yellow-cream` added. `icons.tsx` ported from prototype (55+ inline SVG icons, zero dependency). `tsconfig.json` excludes `Omnica-new-UI/` from TS checks. `.env.local` fixed (stray `ç` character before `CONVEX_DEPLOYMENT`). |
| 2026-05-07 | **[DeepSeek V4 Pro]** Phase G — Shell rewritten to match prototype. `OmnicSidebar.tsx` full rewrite: dark purple gradient (`#4E1280` → `#350B61` → `#2A0850`), collapsible to 56px (chevron toggle), gold gradient active items (`#FFCA00` → `#FFD633`) with gold shadow, Georgia serif "Omnica.english" logo in gold, user avatar footer. `PortalShell.tsx` updated: no yellow canvas band, content padding `28px 28px` matching prototype, collapsible sidebar state. `Topbar.tsx` updated: `.topbar` CSS class (60px, `#FFFDF7`, gold gradient stripe), breadcrumb display, tenant pill. `BottomNav.tsx` updated: string icons via `Icon` component, `.bottom-nav` CSS styling. All three `sidebar-config.ts` files updated from `LucideIcon` to string icon names. |
| 2026-05-07 | **[DeepSeek V4 Pro]** Phase G — data gaps wired. New convex: `streaks.ts` (getForStudent, internal _updateStreak with streak logic), `achievements.ts` added `listForStudent` (joins achievements + studentAchievements showing unlock status), `lessonContent.ts` added `listAllFlashcards` (batch fetch across lesson IDs). Frontend: student dashboard now shows real upcoming class from scheduleEvents with minutes-until countdown, real wordsLearned from vocab count, real streak from streaks table. Achievements page shows real unlocks from studentAchievements. Profile shows real vocab + streak numbers. Study page loads actual flashcards from lessons. Calendar page shows upcoming schedule events with list view. Remaining gaps (cardsReviewed, SRS due count, quizAttempts saving, studySessions) noted for Phase Z. |
| 2026-05-07 | **[DeepSeek V4 Pro]** Phase G — Teacher portal ported from Omnica-new-UI. Teacher dashboard: today's classes from scheduleEvents, recent recordings list, stat cards (total students, published, hours, pending), quick action buttons. `/teacher/students`: roster table with avatar initials, status pills, locale. `/teacher/reports`: engagement tab (student list with status) + pipeline tab (total/published/review/recording stat cards + lesson table). All wired to real Convex data. |
| 2026-05-06 | Phase G + Phase H merged into **Phase Z** (Final Cleanup & Refinement). Phase Z is gated — only reached when user explicitly requests it. Consolidates: cleanup (file deletion, schema migration, i18n), student portal buildout (lessons/vocabulary/profile/study/achievements), visual parity with prototypes, library refinements (word underline, dedupe, OpenRouter fallback, Russian translations), recording pause/resume, drag-and-drop calendar, certificates, onboarding remake. |
| 2026-05-07 | **[Claude]** Phase G — visual parity pass against `Omnica-new-UI/`. Critical bug fixed: `globals.css` referenced `--omnic-tenant-primary*`, `--omnic-white`, `--omnic-red*`, `--omnic-gray-*` everywhere but never defined them; ported full token block from prototype so component classes (`.btn`, `.tab`, `.pill`, `.input`, `.lesson-row`, etc.) finally render with correct colors. Added missing component CSS — `.sidebar` (dark purple gradient `#4E1280→#350B61→#2A0850`, sticky 100vh), `.topbar` (60px, `#FFFDF7`, gold gradient ::before stripe), `.sb-item / .sb-badge / .sb-section-header` (sidebar nav), `.tbl / .tbl-wrap` (data tables), `--sidebar-bg` corrected to `#3D0D6B`. Scrollbar recolored from gray to translucent purple to match prototype. Added missing `zap` icon. Teacher `students` + `reports` pages rewritten off Tailwind-inline mix onto `.tbl-wrap / .tbl / .tabs` classes. Student/teacher pages otherwise structurally matched the prototype already and now render correctly with the unblocked tokens. |
| 2026-05-08 | **[Claude]** Phase G — shell polish + bug fixes. Sidebar active-state bug fixed: hardcoded `/student` exclusion was making `/teacher` (and `/admin`) match every sub-route too, so Home + Sessions both highlighted on `/teacher/sessions`. Now portal homes (`/student`, `/teacher`, `/admin`) match exactly; sub-routes match by `pathname.startsWith(href + "/")`. Logo top-left: `public/logo-mark.svg` was missing — copied the canonical Omnica mark from `Omnica-new-UI/public/logo-mark.svg`; click target now resolves to the active portal home (`/teacher` for teachers, `/admin` for admins) instead of hardcoded `/student`. Favicon: `public/brand/tenant/favicon.svg` was the green LinguLab "F" mark — replaced with the Omnica logo; also dropped legacy `src/app/icon.png` and added `src/app/icon.svg` so Next.js auto-favicon route serves the Omnica mark in browser tabs. Account UI consolidated: removed Clerk `<OrganizationSwitcher>` and the duplicate `<UserButton>` from the topbar; the bottom-left sidebar avatar now mounts the single Clerk `<UserButton>` (added `userSlot` prop on `OmnicSidebar`, passed from `PortalShell`). Topbar keeps only breadcrumb · tenant pill · language · notifications. Teacher Library rewritten to mirror the student Library card grid + CEFR chips, with a top-of-page student picker — selecting a student appends `?studentId=...` to material links so the existing `/teacher/library/[id]` page enters live-teach mode (word taps push cards to that student's deck). tsc clean. |
| 2026-05-08 | **[Claude]** Phase G — admin portal flushed out against `Omnica-new-UI/app/portal/page.tsx` (AdminDashboard), `people/page.tsx`, `settings/page.tsx`. Sidebar consolidated to flat list (Dashboard, People, Sessions, Library, Calendar, Billing, Settings) — `Analytics`, standalone AI Manager / Achievements / Branding / Permissions / Scheduling pages folded into Settings tabs. New `/admin/page.tsx` matches prototype: 4 metric cards (teachers/students/sessions this month/AI prompts) wired to `users.listAllUsers` + `lessons.listAllForAdmin` + `promptConfigs.listForOrg`, Monthly P&L card, Subscriptions breakdown card. New `/admin/people/page.tsx` with `Students`/`Instructors`/`Permissions` tabs against the prototype `.tbl` design (avatar, status pills, lesson counts joined from `lessons.listAllForAdmin`, teacher name resolved by externalId). New unified `/admin/settings/page.tsx` with four sections wired to Convex: Branding (name + primaryColor + 5 feature toggles → `tenantSettings.update`), AI Manager (lists `promptConfigs` + Soniox cost calc from `tenantSettings.ai`), Achievements (lists `achievements.list`, delete via `achievements.remove`), Scheduling Policies (reschedule window / cancel window / default duration / max-reschedules-per-month / no-show-consumes-lesson toggle → `tenantSettings.update`). New `/admin/calendar/page.tsx` shows org events from `schedule.listForOrg` + pending reschedules + unaccounted sessions, with prominent **"Edit scheduling rules"** button linking to `/admin/settings#scheduling`. Obsolete routes deleted (`/admin/ai`, `/admin/achievements`, `/admin/branding`, `/admin/permissions`, `/admin/people/analytics`, standalone `/admin/scheduling/page.tsx`). `/admin/scheduling/requests` kept as the reschedule queue; back-link retargeted to `/admin/calendar`. tsc clean. |
| 2026-05-07 | **[Claude]** Phase G — backend gaps wired. New `convex/srs.ts` queries `listDueCards / countDueCards` (cards where `nextReviewDate <= today`, indexed via `by_organization_and_ownerId_and_nextReviewDate`) and mutation `recordReview` (applies SM-2 via `lib/sm2.reviewCard`, patches the card, writes a `reviewLogs` row). New `convex/study.ts` (`recordSession`, `recordQuizAttempt`, `listSessions`, `totalStudyMinutes`, `listQuizAttempts`). Student dashboard now shows real `dueCount` and `cardsReviewed` (from `srs.countDueCards` + `srs.countReviewsForStudent`). Study page swapped from synthetic flashcards-by-lesson to real due-card queue, persists each rating + records a `studySessions` row on completion. Lesson-detail quiz writes a `quizAttempts` row on submit. Achievements page surfaces real `Study time` from `study.totalStudyMinutes`. Both `tsc` runs clean. |
