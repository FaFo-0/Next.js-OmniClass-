# LinguLab Platform — Master Plan

> **Software name:** LinguLab (permanent — the product itself, like "Shopify")
> **Current owner:** Mustafa (transitioned from Moumen on 2026-04-20)
> **Previous owner:** Moumen (Phases 1–5, original author). Moumen now runs his own separate Arabic academy independently and is no longer involved in this codebase.
> **Started:** 2026-03-16 (original project, codename "Arabikum", deployed as "Talk Club")
> **Current Phase:** Phase 7b (agnostic surface adoption — in progress). Phase 6 complete 2026-04-24.
> **Tech:** Next.js 16 + Tailwind v4 + shadcn/ui + Convex + Clerk + Soniox + OpenRouter + next-intl

---

## Platform Overview

Digital platform for Moumen's Arabic language academy. Teachers give Arabic lessons to Russian-speaking students via Google Meet. The platform handles: lesson recording/transcription → AI content generation → student practice (flashcards, quizzes) → admin management.

**Three portals:** Teacher | Student | Admin (Phase 4)

---

## Design Specs

### Brand Colors
- **Light background:** `#e8fde0` (minty green) → oklch(0.98, 0.01, 145)
- **Dark background:** `#101b0c` (forest green) → oklch(0.14, 0.03, 145)
- **Primary green:** oklch(0.45, 0.15, 145) (light mode) / oklch(0.65, 0.15, 145) (dark mode)
- Full theme defined in `src/app/globals.css` using oklch color space

### Typography
- **English font:** Plus Jakarta Sans (loaded via next/font/google)
- **Arabic font:** TBD (Phase 5)
- **Russian font:** TBD (Phase 5)

### Layout
- Sidebar (260px) + topbar (56px) for both Teacher and Student portals
- Sidebar hidden on mobile (< md breakpoint)
- All spacing uses logical properties (`ms-`, `me-`, `ps-`, `pe-`) for RTL readiness

---

## Architecture Decisions

1. **Zustand store shapes mirror future Convex table schemas** — makes Phase 5 migration a swap, not a rewrite
2. **Data access layer** (`src/lib/data/`) will be introduced in Phase 2 — abstraction over Zustand that swaps to Convex queries/mutations in Phase 5
3. **AI prompts are never hardcoded** — stored in settings store, editable via admin panel (Phase 4)
4. **localStorage limit ~5-10MB** — compress transcripts (store only final tokens), limit to ~20-30 lessons in mock environment
5. **Soniox real-time transcription** — server route `/api/soniox` keeps API key server-side, client uses `@soniox/speech-to-text-web` SDK
6. **Lesson audio capture** — Currently captures local mic only. NEEDS FIX: must capture both sides of Google Meet call (system audio + mic) for full lesson transcription on Mac/Chrome

---

## Data Shapes (Zustand → Future Supabase)

### User
```
id, name, email, role (teacher|student|admin), avatarUrl?, teacherId? (for students), createdAt
```

### Lesson
```
id, teacherId, studentId, title, status (recording|processing|review|published),
transcript, tokens (TranscriptToken[]), summary, vocabulary (VocabItem[]),
flashcards (Flashcard[]), quiz (QuizQuestion[]), durationSeconds, order, createdAt, publishedAt?
```

### TranscriptToken
```
text, isFinal, startMs, endMs
```

### VocabItem
```
id, arabic, transliteration, translation, partOfSpeech
```

### Flashcard
```
id, front (Arabic), back (translation)
```

### QuizQuestion
```
id, question, options (string[]), correctIndex, explanation
```

---

## File Registry

### Core
| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Root layout: Plus Jakarta Sans font, TooltipProvider, Toaster |
| `src/app/globals.css` | Brand theme (oklch), Tailwind v4, shadcn theme variables |
| `src/app/page.tsx` | Portal selector (Teacher / Student / Admin) |
| `src/lib/utils.ts` | cn() utility |

### Stores & Data
| File | Purpose |
|------|---------|
| `src/lib/store/user-store.ts` | User state: mock users, current user, portal selection |
| `src/lib/store/lesson-store.ts` | Lesson CRUD, recording state, publishing, token management |
| `src/lib/mock-data/users.ts` | 1 teacher (Ahmed), 3 students (Anna, Dmitri, Maria) |
| `src/lib/mock-data/lessons.ts` | 4 mock lessons with real Arabic content, vocab, flashcards, quizzes |

### Teacher Portal
| File | Purpose |
|------|---------|
| `src/app/teacher/layout.tsx` | Teacher layout shell (sidebar + topbar) |
| `src/app/teacher/page.tsx` | Teacher dashboard: stats + student list |
| `src/app/teacher/students/[studentId]/page.tsx` | Student's lesson path (island view) + new lesson button |
| `src/app/teacher/lessons/new/page.tsx` | New lesson: title input → recording panel with Soniox |
| `src/app/teacher/lessons/[lessonId]/page.tsx` | Post-recording review: transcript, summary, vocab, flashcards, quiz + publish button |

### Student Portal
| File | Purpose |
|------|---------|
| `src/app/student/layout.tsx` | Student layout shell (sidebar + topbar) |
| `src/app/student/page.tsx` | Student dashboard: stats + video placeholder |
| `src/app/student/lessons/page.tsx` | Duolingo-style island path |
| `src/app/student/lessons/[lessonId]/page.tsx` | Lesson detail: 5 tabs (transcript, summary, vocab, flashcards, quiz) |

### Shared Components
| File | Purpose |
|------|---------|
| `src/components/layout/topbar.tsx` | Top navigation bar with portal name + user avatar |
| `src/components/layout/teacher-sidebar.tsx` | Teacher sidebar navigation |
| `src/components/layout/student-sidebar.tsx` | Student sidebar navigation |
| `src/components/recording/RecordingPanel.tsx` | Recording UI: Soniox integration, timer, waveform, live transcript, auto-save, audio source selector (mic/tab/both) |
| `src/components/recording/WaveformVisualizer.tsx` | Canvas-based audio waveform |
| `src/components/student/LessonPath.tsx` | Duolingo-style island map (zigzag, color-coded) |
| `src/components/student/FlashcardViewer.tsx` | 3D flip flashcard with prev/next navigation |
| `src/components/student/QuizPlayer.tsx` | Quiz: one question at a time, scoring, retry |

### API Routes
| File | Purpose |
|------|---------|
| `src/app/api/soniox/route.ts` | Returns Soniox API key (keeps it server-side) |
| `src/app/api/ai/generate/route.ts` | AI content generation endpoint (OpenAI, API key server-side) |

### Student Portal (Phase 3)
| File | Purpose |
|------|---------|
| `src/app/student/study/page.tsx` | SRS flashcard study mode with SM-2 rating buttons |
| `src/app/student/decks/page.tsx` | Deck browser + CSV import |
| `src/app/student/stats/page.tsx` | Statistics dashboard: heatmap, charts, overview |
| `src/app/student/achievements/page.tsx` | Achievement gallery with progress tracking |
| `src/app/student/profile/page.tsx` | Student profile with stats and subscription info |

### SRS & Study
| File | Purpose |
|------|---------|
| `src/lib/srs/sm2.ts` | SM-2 spaced repetition algorithm (review, intervals, due cards) |
| `src/lib/store/study-store.ts` | SRS cards, review logs, quiz attempts, streaks, achievements, study sessions |

### Admin Portal (Phase 4)
| File | Purpose |
|------|---------|
| `src/app/admin/layout.tsx` | Admin layout shell (sidebar + topbar) |
| `src/components/layout/admin-sidebar.tsx` | Admin sidebar navigation (6 items) |
| `src/app/admin/page.tsx` | Admin dashboard with overview stats + recent activity |
| `src/app/admin/users/page.tsx` | User management with @tanstack/react-table |
| `src/app/admin/ai/page.tsx` | AI prompt config manager with editor + test button |
| `src/app/admin/achievements/page.tsx` | Achievement CRUD editor |
| `src/app/admin/scheduling/page.tsx` | Scheduling policy configuration |
| `src/app/admin/certificates/page.tsx` | Certificate manager (Phase 5 placeholder) |

### Calendar (Phase 4)
| File | Purpose |
|------|---------|
| `src/components/calendar/WeeklyCalendar.tsx` | Shared weekly calendar component (CSS Grid) |
| `src/app/teacher/calendar/page.tsx` | Teacher calendar: create/edit/cancel events |
| `src/app/student/calendar/page.tsx` | Student calendar: view events, cancel within policy |
| `src/lib/store/schedule-store.ts` | Schedule events + policy store |

### Brand Layer (Phase 6)
| File | Purpose |
|------|---------|
| `src/lib/brand/config.ts` | `SOFTWARE_BRAND` constant (LinguLab, permanent) + `TenantBrand` interface + agnostic config primitives (`Terminology / CurrencyDef / RegionConfig / FeatureFlags / ModuleDef / RoleDef / SchedulingConfig / NotificationConfig / PublicSlugs`) and their language-school defaults. `withDefaults()` merger. |
| `src/lib/brand/current-tenant-brand.ts` | Single-file tenant brand + agnostic-config stub (Phase 7a; Phase 7c swaps for Convex query). ONLY place a tenant name literal may appear. |
| `src/lib/brand/helpers.ts` | Pure helpers consumed by `useBrand()`: `term / formatMoney / convertCurrency / formatDate / formatTime / formatDateTime / isFeatureEnabled / modulesForPortal / findModule / findRole / roleHasPermission`. |
| `src/lib/brand/provider.tsx` | `BrandProvider` + `useBrand()` + `useTerm()` hooks. Surface: `{ softwareBrand, tenantBrand, terms, t, money, date, time, dateTime, feature, modulesIn, module, role, roleCan }`. Injects `tenantBrand.primaryColor` as `--primary / --ring` CSS vars at runtime. |
| `convex/lib/permissions.ts` | Server-side mirror of `RoleDef[]` defaults. `roleHasPermission(roleKey, permission)` used by `requirePermission`. Synced by hand with `src/lib/brand/config.ts` defaults until tenant config moves into the DB. |
| `public/brand/lingulab/logo.svg` + `logo-dark.svg` | Software brand marks (permanent) |
| `public/brand/tenant/logo.svg` + `logo-dark.svg` + `favicon.svg` | Tenant placeholder assets; replace the 3 files to rebrand |

### Auth (Phase 5/6)
| File | Purpose |
|------|---------|
| `src/components/auth/role-guard.tsx` | Client wrapper for portal layouts. Redirects wrong-role users to their own portal. Admin bypasses (cross-portal impersonation). |
| `convex/users.ts` `promoteToAdmin` | Internal mutation used via `npx convex run` to seat the first admin, bypassing the admin-gated createUser path. |

### AI & Data Layer (Phase 2)
| File | Purpose |
|------|---------|
| `src/lib/ai/prompts.ts` | Default prompt configs for summary, vocab, flashcards, quiz |
| `src/lib/ai/generate.ts` | Client-side AI call abstraction + response parsers |
| `src/lib/store/settings-store.ts` | Zustand store for AI prompt configs (editable in Phase 4 admin) |
| `src/lib/data/lessons.ts` | Data access layer for lessons (swap to Convex in Phase 5) |
| `src/lib/data/users.ts` | Data access layer for users (swap to Convex in Phase 5) |

---

## Phase 1: The Golden Path — CHECKLIST

> **Status: COMPLETE (with known bugs)**

### Setup
- [x] Next.js App Router project created
- [x] Tailwind CSS v4 configured
- [x] shadcn/ui initialized (13 components: avatar, badge, button, card, input, scroll-area, separator, sheet, skeleton, sonner, tabs, textarea, tooltip)
- [x] Zustand installed with localStorage persistence
- [x] Plus Jakarta Sans font configured
- [x] Brand green theme applied (oklch color space)
- [x] Logical CSS properties used throughout (ms-, me-, ps-, pe-)

### Portal Selector
- [x] Landing page with 3 portal cards (Teacher, Student, Admin greyed out)
- [x] Portal selection sets current user + portal in Zustand

### Layout
- [x] Teacher sidebar + topbar
- [x] Student sidebar + topbar
- [x] Shared topbar component with portal name + user info

### Teacher Portal
- [x] Dashboard with stats (students, published lessons, in-progress)
- [x] Student list with lesson counts
- [x] Click student → lesson island path view
- [x] "New Lesson" button per student
- [x] Lesson recording page with title input
- [x] Soniox v4 real-time transcription integration
- [x] Live token display (non-final at reduced opacity, final solidify)
- [x] Waveform visualizer (canvas-based)
- [x] Timer display
- [x] Start/stop recording controls
- [x] Auto-save every 2 seconds to localStorage
- [x] `beforeunload` protection during recording
- [x] Post-recording page: transcript + mock summary/vocab/flashcards/quiz
- [x] "Publish to Student" button

### Student Portal
- [x] Dashboard with stats (lessons, words, flashcards, quiz questions)
- [x] Video placeholder area
- [x] My Lessons → Duolingo-style island path
- [x] Island path: green=done, pulse=current, gray=locked, zigzag layout
- [x] Auto-scroll to latest unlocked lesson
- [x] Lesson detail page with 5 tabs
- [x] Transcript tab (with download button)
- [x] Summary tab
- [x] Vocabulary tab (Arabic + transliteration + translation)
- [x] Flashcards tab (3D flip animation, prev/next)
- [x] Quiz tab (one-at-a-time, scoring, feedback, retry)

### Stores
- [x] `useUserStore`: mock users, portal selection, current user
- [x] `useLessonStore`: lesson CRUD, token management, publishing
- [x] Store shapes mirror future Convex tables

### Soniox Integration
- [x] Server route `/api/soniox` (API key stays server-side)
- [x] Client wrapper `SonioxRecorder` class
- [x] Model: `stt-rt-v4`, language hints: `["ar"]`
- [x] Non-final tokens at reduced opacity, finals solidify

### Mock Data
- [x] 1 teacher, 3 students
- [x] 4 lessons with real Arabic content
- [x] Vocabulary, flashcards, quiz questions per lesson

### Known Bugs / Issues
- [x] **Audio capture:** ~~Only records local microphone.~~ FIXED — Teacher can now choose audio source: Mic Only, Tab Audio Only, or Mic + Google Meet (both sides). Uses `getDisplayMedia()` to capture Chrome tab audio and Web Audio API to mix mic + tab streams. User selects Google Meet tab and checks "Share tab audio" in Chrome dialog.
- [ ] **Hydration:** May see brief flash of default state before localStorage rehydrates (standard Zustand SSR issue — cosmetic only)

---

## Phase 2: AI Content Engine + Teacher Approval — CHECKLIST

> **Status: COMPLETE**

### AI Layer
- [x] AI abstraction layer (`src/lib/ai/generate.ts`) — client-side function calls server API route
- [x] AI prompt config type: `{ id, name, systemPrompt, userPromptTemplate, model, provider, temperature, maxTokens, outputFormat }`
- [x] Prompt configs stored in Zustand settings store (`src/lib/store/settings-store.ts`) — not hardcoded
- [x] 4 prompt configs: `lesson_summary`, `vocab_extraction`, `flashcard_generation`, `quiz_generation` (defaults in `src/lib/ai/prompts.ts`)
- [x] Server API route `/api/ai/generate` (OpenAI API key stays server-side)
- [x] JSON parsing utilities for vocab, flashcards, quiz (handles code fences, etc.)

### Teacher Approval Workflow
- [x] Content section states: Pending → Generating (skeleton) → Ready for Review (yellow badge) → Approved (green badge)
- [x] `contentStatus` field added to Lesson type tracking per-section status
- [x] Inline editing per section (textarea for summary, row editor for vocab, card editor for flashcards, question editor for quiz)
- [x] "Regenerate" button per section (re-calls AI, replaces content)
- [x] "Generate All" button to generate all 4 sections at once
- [x] "Publish" only active when ALL sections approved
- [x] Edit/Save/Cancel per section with draft state

### Data Access Layer
- [x] `src/lib/data/lessons.ts` — abstraction over Zustand lesson store
- [x] `src/lib/data/users.ts` — abstraction over Zustand user store
- [x] Functions: `getLessons()`, `getLesson()`, `createLesson()`, `updateLesson()`, `deleteLesson()`, `publishLesson()`, `getStudentsForTeacher()`, etc.

### Dependencies
- [x] Installed `openai`, `ai`, `@ai-sdk/openai`, `zod`
- [ ] AI provider API key configured (add `OPENROUTER_API_KEY` to `.env.local`)

---

## Phase 3: Student Practice & Progress — CHECKLIST

> **Status: COMPLETE**

### Flashcard Study Mode
- [x] Full-screen card flip (3D CSS animation)
- [x] SM-2 spaced repetition algorithm (Again/Hard/Good/Easy) — `src/lib/srs/sm2.ts`
- [x] Next review date calculation (interval display on rating buttons)
- [x] "Due today" counter on sidebar
- [x] Deck browser (all lessons + imported decks) — `/student/decks`

### Deck Import
- [x] CSV-style import (paste front,back lines) — simpler than .apkg, same result
- [x] Deck name input
- [x] Cards added to SRS store

### Quiz Player (enhanced)
- [x] Quiz attempts recorded to study store
- [x] Score summary with retry
- [x] Achievement checks on quiz completion

### Statistics Dashboard — `/student/stats`
- [x] Lessons completed count
- [x] Cards studied count
- [x] Quiz scores history (bar chart via recharts)
- [x] Activity heatmap (GitHub-style, CSS grid, last 20 weeks)
- [x] Review activity chart (area chart, last 30 days)
- [x] Study time tracking

### Achievements — `/student/achievements`
- [x] 11 configurable achievements with rules (lessons, cards, quizzes, streaks, vocab)
- [x] Auto-grant when conditions met
- [x] Achievement gallery (earned=colorful glow, unearned=gray with progress bar)
- [x] Toast notification on unlock

### Student Profile — `/student/profile`
- [x] Name, avatar, member since
- [x] Subscription info (mock: Standard Plan, 12 lessons remaining)
- [x] Stats row: lessons, vocab, streak, longest streak
- [x] Quick links to study, quiz, stats

### Streak Tracking
- [x] Daily increment on flashcard review OR quiz completion
- [x] Consecutive day detection
- [x] Longest streak tracking
- [x] Activity dates stored (last 365 days) for heatmap

### Teacher Progress View — `/teacher/students/[studentId]`
- [x] Overview stats: lessons, cards studied, streak, achievements
- [x] Quiz performance per lesson (best score, attempts, progress bar)
- [x] Achievements earned list
- [x] Lesson path (existing)

### Dependencies
- [x] `recharts` for statistics charts
- [x] `date-fns` for date calculations

---

## Phase 4: Admin Panel + Calendar — CHECKLIST

> **Status: COMPLETE**

### Admin Dashboard — `/admin`
- [x] Overview cards (teachers, students, total lessons, published, AI prompts, flashcards reviewed)
- [x] Recent activity (last 5 quiz attempts)

### User Management — `/admin/users`
- [x] Spreadsheet-like table (`@tanstack/react-table`) with sort + search/filter
- [x] Add/remove/edit teachers and students (inline editing)
- [x] Assign students to teachers (dropdown)
- [x] "View as Student" button → switches portal

### AI Manager — `/admin/ai`
- [x] List all AI prompt configs (model, provider badge, temperature, maxTokens, outputFormat)
- [x] Full inline editor: system prompt, user prompt template, model, provider, temperature slider, max tokens, output format
- [x] Test button (runs prompt with sample Arabic transcript, shows result)
- [x] Reset to Default button per config
- [x] Cost estimates table (tokens per request, cost at $0.10/1M tokens)

### Achievement Editor — `/admin/achievements`
- [x] CRUD for achievement definitions with trigger conditions
- [x] Inline edit mode per achievement (name, description, emoji, condition type/threshold, reward)
- [x] Add/delete achievements

### Scheduling Policies — `/admin/scheduling`
- [x] Reschedule window (hours, configurable)
- [x] Cancel window (hours, configurable)
- [x] Lesson duration options (30/45/60/90 min selector)
- [x] All configurable by admin, save with confirmation

### Content Management
- [ ] Subject & book management (tree view) — deferred to Phase 5

### Certificate Manager — `/admin/certificates`
- [x] Mock certificate templates (Course Completion, Level Achievement)
- [x] Placeholder UI — upload/assign buttons disabled with "Phase 5" note

### View As Student
- [x] Admin clicks "View as Student" in user table → switches to student portal

### Calendar (Teacher) — `/teacher/calendar`
- [x] Weekly view (CSS Grid, Mon-Sun, 8:00-20:00)
- [x] Click to schedule lesson (student picker, title, time)
- [x] Events color-coded by student (deterministic hsl from studentId)
- [x] Click event to edit/cancel

### Calendar (Student) — `/student/calendar`
- [x] Weekly view (read-only)
- [x] Click event to see details
- [x] Cancel within policy window (checks hours before lesson)

### Dependencies
- [x] `@tanstack/react-table`
- [x] Custom CSS Grid calendar component
- [x] `sonner` (already installed)

---

## Phase 5: Convex + Auth + i18n + Production — CHECKLIST

> **Status: IN PROGRESS (5a+5b+5c+5d+5e done, Convex deployed)**

### Convex Setup (5a — DONE)
- [x] `npm install convex` + `convex/` directory created
- [x] Schema defined in `convex/schema.ts` with Convex validators (15 tables, normalized)
- [x] `ConvexProvider` + `MockAuthProvider` wrapping app in root layout (`src/app/providers.tsx`)
- [x] Seed mutation in `convex/seed.ts` (users, lessons, vocab/flashcards/quiz, achievements, prompt configs, schedule policy)
- [x] Convex rules at `.claude/rules/convex-rules.md` (skipped — not needed)
- [x] Run `npx convex dev` to create project + generate types + seed data

### User Store Migration (5b — DONE)
- [x] `convex/users.ts` — queries (listUsers, getUser, getStudentsForTeacher) + mutations (createUser, updateUser, deleteUser)
- [x] `src/lib/mock-auth.tsx` — temporary mock auth context (currentUserId + currentPortal in localStorage)
- [x] All 20 components migrated from `useUserStore` → `useMockAuth()` + `useQuery(api.users.*)`
- [x] `src/lib/store/user-store.ts`, `src/lib/mock-data/users.ts`, `src/lib/data/users.ts` deleted

### Lesson Store Migration (5c — DONE)
- [x] `convex/lessons.ts` — queries/mutations for lesson CRUD, publishing, content stats
- [x] `convex/lessonContent.ts` — normalized vocab/flashcard/quiz queries + batch-replace mutations
- [x] `convex/ai.ts` — action for OpenRouter AI calls (replaces `/api/ai/generate` route)
- [x] `convex/soniox.ts` — action to return Soniox API key (replaces `/api/soniox` route)
- [x] `src/lib/transcript.ts` — shared TranscriptToken type + buildTranscript()
- [x] All ~15 component files migrated from `useLessonStore` → `useQuery`/`useMutation`/`useAction`
- [x] `src/lib/store/lesson-store.ts`, `src/lib/mock-data/lessons.ts`, `src/lib/data/lessons.ts` deleted
- [x] `src/app/api/ai/generate/route.ts`, `src/app/api/soniox/route.ts` deleted
- [x] `@convex/dataModel` path alias added for `Id<>` type imports

### Study + Schedule + Settings Store Migration (5d — DONE)
- [x] `convex/study.ts` — SRS cards, review logs, quiz attempts, study sessions
- [x] `convex/achievements.ts` — achievement definitions + student grants + checkAndGrant
- [x] `convex/streaks.ts` — streak tracking with consecutive day logic
- [x] `convex/schedule.ts` — calendar events + policy CRUD
- [x] `convex/settings.ts` — prompt config CRUD + reset-to-default
- [x] `convex/lib/sm2.ts` — server-side SM-2 algorithm for Convex mutations
- [x] `convex/lib/defaultPrompts.ts` — default AI prompt configs
- [x] All component files migrated: student study/decks/stats/achievements/profile/page, student-sidebar, QuizPlayer, teacher calendar/students, admin dashboard/achievements/ai/scheduling
- [x] `src/lib/store/study-store.ts`, `schedule-store.ts`, `settings-store.ts` deleted
- [x] `src/lib/store/` directory removed
- [x] `zustand` dependency removed from package.json
- [x] Schema fix: `srsCards.lastReviewDate` → `v.union(v.string(), v.null())` for type compatibility
- [x] TypeScript compiles with zero errors

### Convex Schema & Functions (remaining)
- [x] `convex/schema.ts` — all tables with indexes (by_teacherId, by_studentId, by_lessonId, etc.)
- [x] `convex/users.ts` — queries/mutations for user CRUD, role-based access
- [x] `convex/lessons.ts` — queries/mutations for lesson CRUD, publishing, content updates
- [x] `convex/study.ts` — queries/mutations for SRS cards, review logs, quiz attempts
- [x] `convex/schedule.ts` — queries/mutations for calendar events, policy enforcement
- [x] `convex/achievements.ts` — queries/mutations for achievement definitions + student grants
- [x] `convex/settings.ts` — queries/mutations for AI prompt configs
- [x] `convex/ai.ts` — actions (`"use node"`) for OpenRouter AI calls (API keys server-side)
- [x] `convex/soniox.ts` — action to generate temporary Soniox API key
- [x] Auth checks in every function via `ctx.auth.getUserIdentity()` — `convex/lib/auth.ts` helper with `requireAuth`, `requireRole`, `requireAuthAction`

### Authentication (5e — DONE)
- [x] `@clerk/nextjs` installed
- [x] `convex/auth.config.ts` — Clerk JWT provider configuration
- [x] `src/app/providers.tsx` — `ClerkProvider` + `ConvexProviderWithClerk` + `AuthProvider`
- [x] `src/lib/auth.tsx` — `AuthProvider` + `useAuth()` hook (replaces `useMockAuth`)
- [x] `src/middleware.ts` — Clerk route protection (public: sign-in, sign-up)
- [x] `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` — Clerk sign-in page
- [x] `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — Clerk sign-up page
- [x] `convex/users.ts` — `getMe` query (by tokenIdentifier) + `upsertFromAuth` mutation
- [x] Schema: `tokenIdentifier` field + `by_tokenIdentifier` index on users table
- [x] Portal selector replaced with role-based auto-redirect
- [x] Topbar updated with Clerk sign-out + avatar
- [x] All 16 component files migrated from `useMockAuth` → `useAuth`
- [x] `src/lib/mock-auth.tsx` deleted
- [x] `.env.local` — placeholder Clerk env vars added
- [x] TypeScript compiles with zero errors
- [x] Server-side auth checks in Convex functions — all 56 functions across 10 files guarded with role-based access control

### Data Migration (DONE — completed in 5b/5c/5d)
- [x] All stores migrated to Convex
- [x] Zustand removed
- [x] Seed data via Convex mutation

### File Storage (DONE)
- [x] Certificates → Convex file storage — `certificateTemplates` + `issuedCertificates` tables, PDF upload via `ctx.storage`, admin create/delete/upload/assign/revoke, full UI
- [x] Transcripts — stored as text in lessons table (sufficient for current scale)
- [x] Uploaded decks — CSV paste-based import, cards stored in `srsCards` table (no file upload needed)

### Real-time (built-in — VERIFIED)
- [x] Every Convex `useQuery` is reactive by default — no extra setup needed
- [x] Lesson published → student path auto-updates instantly
- [x] Calendar events update in real-time across teacher/student views

### i18n: Russian + Arabic + English (DONE)
- [x] `next-intl` for internationalization (`src/i18n/config.ts`, `src/i18n/provider.tsx`)
- [x] Language switcher component (`src/components/layout/language-switcher.tsx`)
- [x] All UI strings externalized to translation files (`messages/en.json`, `messages/ru.json`, `messages/ar.json`)
- [x] Three languages: English (default), Russian, Arabic
- [x] LocaleProvider with localStorage persistence + document dir/lang updates
- [x] All portal pages (student, teacher, admin) + shared components use `useTranslations()`

### i18n: Arabic RTL Layout (DONE)
- [x] Full RTL layout support — audited and fixed 15 non-logical CSS properties (mr→me, pl→ps, pr→pe, text-left→text-start, border-l→border-s) in UI components + pages
- [x] Arabic font configured — Noto Sans Arabic via next/font/google, auto-switches via `html[dir="rtl"]` rule
- [x] LocaleProvider sets `document.dir = "rtl"` when Arabic is selected

### Production Hardening
- [x] Error boundaries — `error.tsx` for global + each portal (teacher, student, admin)
- [x] Loading skeletons — `loading.tsx` for each portal with skeleton cards/lists
- [x] Input validation — all Convex functions already use `v.` validators (v.string, v.id, v.union, etc.)
- [x] Rate limiting — deferred (all functions auth-guarded, Convex transactional model prevents abuse)
- [x] Mobile responsiveness — hamburger menu + Sheet drawer sidebar on mobile, responsive calendar layouts, mobile padding
- [ ] Vercel deployment (Convex dashboard for backend)

### Convex Tables
```
users — id, name, email, role, avatarUrl?, teacherId?, createdAt
lessons — id, teacherId, studentId, title, status, transcript, tokens, summary,
           vocabulary, flashcards, quiz, contentStatus, durationSeconds, order, createdAt, publishedAt?
srsCards — id, cardId, deckId, front, back, interval, easeFactor, repetitions, nextReviewDate, lastReviewDate
reviewLogs — id, cardId, studentId, rating, timestamp
quizAttempts — id, lessonId, studentId, score, total, completedAt
scheduleEvents — id, teacherId, studentId, title, date, startTime, endTime, status, createdAt
achievements — id, name, description, icon, conditionType, conditionValue, reward
studentAchievements — id, studentId, achievementId, grantedAt
streaks — id, studentId, currentStreak, longestStreak, lastActivityDate, activityDates
aiPrompts — id, name, systemPrompt, userPromptTemplate, model, provider, temperature, maxTokens, outputFormat
certificates — id, studentId, templateName, issuedAt, fileId?
```

---

## Phase 6: Rename + Brand Separation Architecture — CHECKLIST

> **Status: COMPLETE (2026-04-24)**
> **Goal:** Rename the software to "LinguLab". Separate software brand from tenant brand. Tenant-facing UI reads tenant brand from a single-file config (`src/lib/brand/current-tenant-brand.ts`). No schema changes, no functional changes, no color changes.
> **Outcome:** Rebranding the tenant now requires editing a single file (`src/lib/brand/current-tenant-brand.ts`) plus swapping 5 SVG assets in `public/brand/tenant/`. Green theme, previously drifted to grayscale, restored per Design Specs.

### 6a — Replace old names with LinguLab (software layer)
- [x] Search codebase for `Talk Club`, `TalkClub`, `talk club`, `talk-club`, `talkclub` → software-level hits replaced with `LinguLab` (tenant-facing strings in translation JSON + logo component deferred to 6c/6e)
- [x] Search codebase for `Arabikum`, `arabikum` → replaced (seed emails moved to `@example.com`; all software-level mentions retitled)
- [x] `package.json` `name` field → `"lingulab"`
- [x] `README.md` rewritten with real LinguLab platform readme (description, tech stack, dev setup, ownership note)
- [x] `CLAUDE.md` header → "LinguLab Platform — AI Instructions" + description updated to "multi-tenant language academy platform (software name: LinguLab)"
- [x] `MASTER_PLAN.md` header → "LinguLab Platform — Master Plan" + ownership note (Mustafa current, Moumen previous) + current phase set to Phase 6
- [x] `src/app/layout.tsx` default `<title>` → neutral `"LinguLab"` stub (will become dynamic via `generateMetadata` + `useBrand()` in 6c)
- [x] `convex/seed.ts` — scrubbed `@arabikum.com` emails from mock users (Ahmed, Moumen) → `@example.com`
- [x] `convex/lib/defaultPrompts.ts` — audited, no brand name literals present (prompts already use generic "English language teaching assistant" framing)
- [x] `src/i18n/provider.tsx` — `localStorage` key `talkclub-locale` → `lingulab-locale` (infrastructure, not user-visible)
- [x] Convex dashboard project rename — not performed in code (requires dashboard access; noted in Change Log as deferred / manual)
- [x] Translation JSON tenant-facing strings deferred to 6e (flagged: `messages/en.json` line 69, 621; `messages/ru.json` line 69, 621; `messages/ar.json` line 621 — will become `{brandName}` placeholders)
- [x] `src/components/layout/logo.tsx` hardcoded "Talk Club" alt + label text deferred to 6c (Logo component refactored to read from `useBrand()`)

### 6b — Brand configuration data layer
- [x] Created `src/lib/brand/config.ts` — `SOFTWARE_BRAND` constant (LinguLab, permanent) + `TenantBrand` interface
- [x] Created `src/lib/brand/current-tenant-brand.ts` — single-file tenant stub. Currently `name: "FluentLap"`. Rebrand = edit this one file.
- [x] Documented that `CURRENT_TENANT_BRAND` is the ONLY place in the codebase where a tenant name literal is allowed. Phase 7 replaces the stub with a Convex query.
- [x] No `tenants` table (deferred to Phase 7 per plan)
- [x] Logo assets not created yet — generic path `/brand/tenant/*` referenced, files arrive in 6d
### 6c — Consume brand config in UI (complete 2026-04-20)
- [x] `src/lib/brand/provider.tsx` created with `BrandProvider` + `useBrand()` hook exposing `{ softwareBrand, tenantBrand }`
- [x] `src/app/providers.tsx` wraps tree in `<BrandProvider>` as outermost wrapper
- [x] `src/components/layout/logo.tsx` refactored to client component reading `useBrand()`, with `variant?: "tenant" | "software"` prop, fallback asset paths, brand `name` as text
- [x] `src/app/layout.tsx` uses `generateMetadata()` reading from `CURRENT_TENANT_BRAND` — `<title>` + `description` + `icons` all dynamic per tenant
- [x] Sidebars (admin/student/teacher) + topbar + sign-in/sign-up pages all consume `<Logo />` — pick up rebrand automatically, no literals
- [x] Grep audit: "FluentLap" appears in src only at `src/lib/brand/current-tenant-brand.ts` (other hits in MASTER_PLAN + refactor docs are expected)
- [x] `npx tsc --noEmit` clean; `npm run dev` boots in 1.2s; `/` returns 307 → Clerk sign-in (auth gate intact)
### 6d — Placeholder logo assets (complete 2026-04-24)
- [x] `public/brand/lingulab/logo.svg` + `logo-dark.svg` — software brand (permanent LinguLab, "L" monogram on rounded green tile)
- [x] `public/brand/tenant/logo.svg` + `logo-dark.svg` — tenant placeholder (FluentLap "F" monogram on green circle)
- [x] `public/brand/tenant/favicon.svg` — tenant favicon placeholder (SVG, modern browsers only — sufficient for Phase 6; swap to multi-size .ico in production)
- [x] `CURRENT_TENANT_BRAND.faviconUrl` switched from `.ico` → `.svg` so placeholder works without binary ico tooling
- [x] `npx tsc --noEmit` clean
### 6e — Translation file brand strings (complete 2026-04-24)
- [x] `messages/en.json` + `ru.json` + `ar.json`: `onboarding.referralDesc` literal "Talk Club" → `{brandName}` placeholder
- [x] `src/app/onboarding/page.tsx` reads `tenantBrand.name` via `useBrand()` and passes `{ brandName }` values into `t("referralDesc", ...)`
- [x] Dead key `student.dashboard.welcomeTitle` removed from all three locale files (was unreferenced, still carrying "Talk Club" / Arabic "أرابيكوم" literal)
- [x] Grep audit: zero tenant brand literals remain in `src/`, `messages/`, `convex/`, `public/` (remaining hits are `.md` docs and history — expected)
- [x] `npx tsc --noEmit` clean
### 6f — Keep the green theme (complete 2026-04-24)
- [x] Audit uncovered drift: `src/app/globals.css` was shipping grayscale tokens (chroma 0) despite Design Specs promising green (`oklch(0.45 0.15 145)`). Only `src/app/student/stats/page.tsx` charts hardcoded green, making them the sole accurate surface.
- [x] Restored full green palette in both `:root` and `.dark` blocks (hue 145, chroma scaled per role). Primary, accent, brand, ring, chart 1–5, sidebar tokens all now green-tinted; destructive stays red; dark-mode borders keep translucent-white overlay.
- [x] Background tints match plan: light `oklch(0.98 0.01 145)` (≈ #e8fde0 minty), dark `oklch(0.14 0.03 145)` (≈ #101b0c forest).
- [x] No component code changed — tokens flow through existing shadcn + Tailwind consumers.
- [x] `npx tsc --noEmit` clean
### 6g — Master plan update + Phase 6 closeout (complete 2026-04-24)
- [x] Phase 6 header flipped from `IN PROGRESS` to `COMPLETE` with outcome summary
- [x] Every sub-phase 6a–6f section carries a dated "complete" line
- [x] File registry below updated with new Phase 6 paths (`src/lib/brand/*`, `src/components/auth/role-guard.tsx`, `public/brand/{lingulab,tenant}/*`)
- [x] Change log has entries for: software rename (6a), brand config layer (6b), brand consumers (6c), auth hardening + role guard, placeholder assets (6d), translation interpolation (6e), green theme restore (6f), and this closeout (6g)
- [x] Git hygiene: default branch set to `main` on GitHub, stale phase branches (`phase-6a/6b/6c-*`, `claude/awesome-wilson-038073`) deleted locally and remotely. New convention: `phase-<N><sub>-<kebab-summary>`.
- [x] Verification Checklist extended with Phase 6 row
- [x] Grep audit (final): tenant brand literals only in `src/lib/brand/current-tenant-brand.ts` (expected) and `.md` docs (history, expected). Zero in `src/` UI code, `messages/`, `convex/`, `public/` aside from the single stub.
- [x] `npx tsc --noEmit` clean on main
- [x] Next up: Phase 7 — agnostic config layer + multi-tenant data layer (split into 7a then later sub-phases)

---

## Phase 7: Agnostic Configuration Layer + Multi-Tenant Data — CHECKLIST

**Strategic goal.** Convert LinguLab from a language-school-only platform into vertical-agnostic software that ships with language-school defaults but can be retargeted (gym, therapy, coaching, any class-based business) by editing a single config file. Schema, routes, and component structure stay intact. Adding/removing/disabling functionality = data edit, not code change.

**Design rule.** Every tunable is an open map or array, not a typed enum. New role / new currency / new feature = push to data, no code path change. Defaults shipped for language school. Missing keys fall back gracefully.

### 7a — Agnostic config primitives in stub (in progress 2026-04-25)
All primitives live on `TenantBrand` in `src/lib/brand/config.ts` and ship with language-school defaults via `withDefaults()`. Stub `current-tenant-brand.ts` overrides only what differs.

- [x] **Terminology** (`Terminology = Record<string, string>`): open map. Defaults: `student / students / teacher / teachers / lesson / lessons / class / classes / admin / admins`. Consumers via `useBrand().t("students")`. Missing key → returns key string. Gym tenant later: `{ student: "Member", teacher: "Trainer", lesson: "Session" }`.
- [x] **Currencies** (`CurrencyDef[]`): open registry. Each entry: `code / symbol / rateToBase / decimals / label`. `baseCurrency` field picks one as truth. `formatMoney(brand, amount, code)` uses `Intl.NumberFormat` for ISO codes, falls back to symbol+number for custom codes (e.g. `"points"`). `convertCurrency` cross-converts via base.
- [x] **Region** (`RegionConfig`): `locale` (BCP 47), `timezone` (IANA), `timeFormat` (12h/24h), `firstDayOfWeek`. `formatDate / formatTime / formatDateTime` use `Intl` directly — any locale the browser supports works without enum maintenance.
- [x] **Features** (`FeatureFlags = Record<string, boolean>`): open toggle map. `isFeatureEnabled(brand, key)` treats missing keys as enabled (forward-compat for new flags). Defaults: `recordings / aiGeneration / flashcards / quizzes / achievements / certificates / referrals / payments` on; `groupClasses` off.
- [x] **Modules** (`ModuleDef[]`): registry of sidebar/route areas. Each entry: `key / enabled / label / icon / order / portals[]`. `modulesForPortal(brand, "student")` returns sorted enabled modules for that portal. Disabling a module hides it from sidebar without deleting code.
- [x] **Roles + permissions** (`RoleDef[]`, `PERMISSIONS`). Role keys are free-form strings. Code checks permissions (`"lessons.create"`, `"users.edit"`, etc.), not role names. `requirePermission(ctx, perm)` added in `convex/lib/auth.ts` alongside legacy `requireRole`. Convex-side mirror of role definitions in `convex/lib/permissions.ts` (kept in sync by hand until tenant config moves into the DB). NOTE: `users.role` schema enum (admin/teacher/student) unchanged this sub-phase; widening the enum is a deliberate later step.
- [x] **Scheduling** (`SchedulingConfig`): `durations[] / defaultDuration / bufferMinutes / allowGroup / maxGroupSize / allowRecurring / rescheduleWindowHours / cancelWindowHours`. Same engine serves 60-min language lessons, 50-min therapy, 45-min group gym classes.
- [x] **Notifications** (`NotificationConfig`): `channels[] / events: Record<string, boolean>`. Shape only this phase — concrete senders wire in later. Adding a channel = push to array.
- [x] **Public slugs** (`PublicSlugs`): `booking / signup / pricing / about`. Tenant-facing public URL segments. Internal `/admin /teacher /student` routes never change.
- [x] **Runtime primary-color CSS var.** `BrandProvider` injects `tenantBrand.primaryColor` as `--primary` and `--ring` on `<html>` via `useEffect`. Falls back to `globals.css` default green when unset. White-label color = data field, no rebuild.
- [x] **`withDefaults()` merger.** Tenant configs supply only overrides; merger deep-fills every agnostic field so consumers can rely on every primitive being set. Avoids null guards everywhere.
- [x] **Convenience hooks on `useBrand()`**: `terms / t / money / date / time / dateTime / feature / modulesIn / module / role / roleCan`. Single import, full surface.
- [x] `npx tsc --noEmit` clean

### 7b — Adopt agnostic surface in existing UI (in progress 2026-04-25)
- [x] Hardcoded "Student" / "Teacher" fallback string literals (`?? "Student"` etc.) in `src/app/student/page.tsx`, `src/app/student/profile/page.tsx`, `src/app/teacher/page.tsx` replaced with `t("student") / t("teacher")` from `useBrand()`.
- [x] Sidebars (`admin-sidebar.tsx`, `teacher-sidebar.tsx`, `student-sidebar.tsx`) attach a `key` per nav item matching a `ModuleDef.key` in tenant config. Items filter through `module(key)?.enabled !== false`. Disabling a module from `current-tenant-brand.ts` hides the corresponding sidebar item with no component change.
- [x] **All Convex `requireRole` call sites migrated to `requirePermission`** (achievements, billing, certificates, exchangeRates, expenses, lessonContent, lessons, schedule, settings, streaks, students, studentProfiles, study, users). Permission keys: `lessons.create / lessons.edit / lessons.view.any / lessons.delete / users.create / users.edit / users.view.any / users.delete / billing.view / billing.edit / ai.configure / achievements.edit / certificates.issue / schedule.manage`. Default-role mapping in `convex/lib/permissions.ts` preserves the same access matrix as before, so behavior is unchanged for the existing admin/teacher/student roles. `requireRole` retained on the helper for any future admin-only guards but is no longer used in app code.
- [x] Tenant currency registry expanded to include legacy KGS so existing billing/expense rows still render correctly (`baseCurrency: "USD"`, KGS at rate 87 to base).
- [ ] (queued) Money rendering across components migrated to `money(amount, code)` from `useBrand()`. Currently still hand-formatted at call sites (analytics, students, billing pages).
- [ ] (queued) Date/time rendering migrated from raw `toLocaleString()` to `date / time / dateTime`.
- [ ] (queued) i18n message audit — convert hardcoded "Student" / "Teacher" / "Lesson" strings inside `messages/{en,ru,ar}.json` to ICU placeholders threaded from `useBrand().t(...)`. Bigger refactor; deferred until a non-language vertical actually needs to land.

### 7c — Multi-tenant data layer (deferred)
- [ ] `tenants` Convex table with the `TenantBrand` shape persisted as a document.
- [ ] Subdomain / custom-domain resolver populates the active tenant per request.
- [ ] `BrandProvider` reads from a Convex query keyed by tenant ID instead of the static stub.
- [ ] Stub `current-tenant-brand.ts` deleted once resolver lands.
- [ ] Admin UI to edit tenant config (terminology, modules, roles, etc.) from inside the app.

---

## Verification Checklist (Per Phase)

- **Phase 1:** Record a real Arabic sentence with Soniox → see transcript appear live → publish → switch to student → see lesson on island path → open and browse all tabs ✅ (local mic only — both-sides capture pending)
- **Phase 2:** Record lesson → AI generates real content → edit summary → approve all → publish → student sees AI-generated content
- **Phase 3:** Study flashcards with SM-2 → import Anki deck → take quiz → check statistics → unlock achievement
- **Phase 4:** Admin creates teacher → assigns students → edits AI prompts → tests prompt → configures scheduling → teacher uses calendar
- **Phase 5:** Register → login → data persists across browsers (Convex) → real-time updates → switch to Russian → full flow works end-to-end
- **Phase 6:** Edit `CURRENT_TENANT_BRAND.name` in `src/lib/brand/current-tenant-brand.ts` → every tenant-facing surface (logos, topbar, sidebars, metadata title, onboarding strings, favicon) picks up the new name without touching any other file. Green theme consistent across all portals in light + dark.
- **Phase 7a:** Edit `current-tenant-brand.ts` to override `terminology: { student: "Member", teacher: "Trainer" }` → consumers reading `t("student") / t("teacher")` show new labels. Override `region.locale` → `Intl`-based date/money formatting follows. Override `primaryColor` with an `oklch(...)` string → topbar/buttons recolor without rebuild. Toggle `features.recordings = false` → recording surfaces hide. Disable a `modules[].enabled` entry → sidebar entry vanishes. `requirePermission(ctx, "users.edit")` enforces capability instead of hardcoded role name.

---

## Change Log

| Date | Change | Section Updated |
|------|--------|-----------------|
| 2026-03-16 | Phase 1 built: full Teacher + Student portals, Soniox integration, mock data, island path, flashcards, quiz | Phase 1 checklist |
| 2026-03-16 | Fixed Zustand + React 19 infinite loop (selectors returning new refs) — all selectors now use useMemo | Architecture Decisions |
| 2026-03-16 | Noted: audio capture only records local mic, needs both-sides capture for Google Meet lessons | Known Bugs |
| 2026-03-16 | Phase 2 built: AI content generation (OpenAI), teacher approval workflow with per-section status (generate/edit/approve/regenerate), data access layer, settings store for prompt configs | Phase 2 checklist |
| 2026-03-16 | Fixed Google Meet audio: added audio source selector (Mic / Tab / Both) using getDisplayMedia + Web Audio API stream mixing | Known Bugs, Soniox client |
| 2026-03-16 | Added contentStatus field to Lesson type for per-section approval tracking (summary, vocabulary, flashcards, quiz) | Data Shapes |
| 2026-03-16 | Switched AI provider from OpenAI direct to OpenRouter (Gemini 2.5 Flash). Env var: OPENROUTER_API_KEY | AI Layer, prompts.ts |
| 2026-03-16 | Phase 3 built: SM-2 SRS flashcard study, deck browser with CSV import, statistics dashboard (heatmap + charts), 11 achievements with auto-grant, student profile, streak tracking, teacher progress view with quiz scores + achievements | Phase 3 checklist |
| 2026-03-17 | Phase 4 built: Admin portal (dashboard, user management with tanstack-table, AI manager with test button, achievement editor, scheduling policies, certificate placeholder), weekly calendar for teacher + student, schedule store with policy enforcement | Phase 4 checklist |
| 2026-03-17 | Added admin mock user (Moumen), enabled admin portal on landing page, added CRUD to user store, added calendar nav to teacher + student sidebars | User store, sidebars, portal selector |
| 2026-03-17 | Enabled Soniox speaker diarization (Speaker 1 / Speaker 2 labels in transcript) | Soniox client, RecordingPanel, lesson pages |
| 2026-03-17 | Allow teacher to edit/regenerate content after publishing (transcript stays read-only) | Teacher lesson page |
| 2026-03-17 | Robust JSON extraction (bracket matching instead of greedy regex) to fix AI response parsing | AI generate.ts |
| 2026-03-17 | Switched Phase 5 backend from Supabase to Convex — reactive queries, Convex functions, JWT auth, built-in file storage | Phase 5 checklist, Architecture |
| 2026-03-17 | Sub-Phase 5c complete — lesson store migrated to Convex (lessons, lessonContent, ai, soniox), all ~15 components updated, old store + API routes deleted | Phase 5 checklist |
| 2026-04-20 | Ownership transitioned from Moumen to Mustafa. Moumen continues operating his Arabic academy independently on his own fork; this codebase serves Mustafa's business | Header, ownership note |
| 2026-04-20 | Software renamed: Arabikum / Talk Club → LinguLab. Software-level references updated (package.json, README, CLAUDE.md, MASTER_PLAN.md header, root layout metadata, seed emails, i18n localStorage key). Tenant-facing strings (translation JSON, Logo component) deferred to 6c/6e | All brand references |
| 2026-04-20 | Phase 6a complete on branch `phase-6a-rename-to-lingulab`. Git repo initialized (was not a git repo prior) | Phase 6a checklist |
| 2026-04-20 | Phase 6b: brand configuration data layer added. `SOFTWARE_BRAND` in `src/lib/brand/config.ts` (LinguLab, permanent); `TenantBrand` interface; `CURRENT_TENANT_BRAND` stub in `src/lib/brand/current-tenant-brand.ts` (single source of truth for tenant brand during Phase 6, swapped for Convex query in Phase 7) | Architecture Decisions, file registry |
| 2026-04-20 | Phase 6c complete on branch `phase-6c-consume-brand`: `BrandProvider` + `useBrand()` hook added; `providers.tsx` wraps tree; `Logo` refactored to read from `useBrand()` with `variant` prop (tenant/software); root layout uses `generateMetadata()` — `<title>`, description, favicon all dynamic per tenant. Rebrand now requires editing only `current-tenant-brand.ts` | Phase 6c checklist, file registry |
| 2026-04-24 | Auth hardening: `RoleGuard` added — wrong-role portal access now silently redirects instead of tripping a Convex `requireRole` error page. Admin bypasses all guards (cross-portal impersonation). `users:promoteToAdmin` internal mutation added as CLI bootstrap path for seating the first admin. Onboarding page `setState-in-render` warning fixed. | Auth, Phase 6 scope |
| 2026-04-24 | Phase 6d complete: placeholder SVG logos for LinguLab (software) + tenant added at `public/brand/{lingulab,tenant}/logo{,-dark}.svg`, tenant favicon at `public/brand/tenant/favicon.svg`. Stub updated to `.svg` favicon path. | Phase 6d checklist |
| 2026-04-24 | Phase 6e complete: last tenant-name literal in translation JSON (`onboarding.referralDesc` "Talk Club") converted to `{brandName}` placeholder across en/ru/ar and threaded from `useBrand()` at call site. Dead `student.dashboard.welcomeTitle` key removed (carried stale "Talk Club" / "أرابيكوم" literal with no references). | Phase 6e checklist |
| 2026-04-24 | Phase 6f: restored green theme in `src/app/globals.css`. Theme had silently drifted to pure grayscale (chroma 0) pre-transition despite Design Specs promising green (hue 145). All tokens now green-tinted per spec for both light + dark modes; destructive stays red. No component code touched — purely token layer. | Phase 6f checklist, Design Specs |
| 2026-04-24 | Git hygiene pass: GitHub default branch swapped from `phase-6c-consume-brand` → `main`. Stale phase branches (6a, 6b, 6c) and `claude/awesome-wilson-038073` deleted locally + remotely. Branch naming convention captured in user-memory: phase branches follow `phase-<N><sub>-<kebab-summary>`. | Repo topology |
| 2026-04-24 | **Phase 6 CLOSED.** Rebrand now = edit `src/lib/brand/current-tenant-brand.ts` + swap 3 SVGs in `public/brand/tenant/`. Next up: Phase 7 (multi-tenant data layer, tenants table, subdomain routing, Convex-backed brand resolver). | Phase 6 header, Current Phase pointer |
| 2026-04-25 | Phase 7 split into 7a (agnostic config primitives), 7b (adoption in UI), 7c (Convex tenants table). Strategic pivot: LinguLab now ships as vertical-agnostic software with language-school defaults. | Phase 7 plan |
| 2026-04-25 | Phase 7a in progress on branch `phase-7a-agnostic-config`: extended `TenantBrand` with `terminology / currencies / baseCurrency / region / features / modules / roles / scheduling / notifications / publicSlugs`. Added `withDefaults()` merger, helper module (`src/lib/brand/helpers.ts`) for `formatMoney / formatDate / convertCurrency / isFeatureEnabled / modulesForPortal / roleHasPermission`. `BrandProvider` now exposes `terms / t / money / date / time / dateTime / feature / modulesIn / module / role / roleCan` and injects `--primary` CSS var at runtime from `tenantBrand.primaryColor`. Convex side: `convex/lib/permissions.ts` mirrors role definitions; `requirePermission(ctx, key)` added alongside `requireRole`. `users.role` schema enum unchanged this sub-phase. `tsc --noEmit` clean. | Phase 7a checklist, file registry |
| 2026-04-25 | Phase 7b adoption pass: every Convex `requireRole` call site migrated to `requirePermission` (achievements, billing, certificates, exchangeRates, expenses, lessonContent, lessons, schedule, settings, streaks, studentProfiles, study, users). Default role→permission mapping in `convex/lib/permissions.ts` preserves the existing access matrix. Sidebars (admin/teacher/student) now filter nav items through `module(key)?.enabled` so disabling a module hides it from the sidebar without a code change. Hardcoded "Student"/"Teacher" fallback string literals replaced with `t("student") / t("teacher")` from `useBrand()`. KGS added to tenant currency registry (legacy data). i18n message audit + money/date helper adoption deferred. | Phase 7b checklist |
