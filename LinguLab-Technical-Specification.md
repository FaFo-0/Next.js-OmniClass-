# LinguLab — Platform Technical Specification

**Document version:** 1.1
**Date:** April 20, 2026
**Audience:** Development team (including AI coding agents like Claude Code)
**Owner:** Mustafa (from 2026-04-20)
**Previous author:** Moumen (Phases 1-5, now running his own separate Arabic academy)
**Status:** Refactor plan — extends the existing `MASTER_PLAN.md` (Phases 1–5 complete) with Phases 6–10

---

## 0. How to use this document

This spec is the **vision document**. For actionable step-by-step work, see the companion:

- `MASTER_PLAN.md` — the existing project plan, Phases 1–5 (source of truth for the current codebase)
- `FluentLap-Refactor-Phases.md` — the executable ticket plan, Phases 6–10 (what to build next)
- `CLAUDE.md` — AI agent behavior rules for this project

When in doubt, follow the workflow in `CLAUDE.md`: read MASTER_PLAN first, check off items as you complete them, update the Change Log. Don't re-read this entire spec every turn.

---

## 1. Executive Summary

**LinguLab** is the software platform. Its first customer is **Mustafa's academy** (placeholder name during Phase 6: "FluentLap" — final name TBD). The platform was originally built by Moumen under the names "Arabikum" / "Talk Club" and transitioned to Mustafa's ownership in April 2026.

Phases 1-5 shipped a fully functional single-tenant academy platform: teacher/student/admin portals, AI pipeline, SRS, auth, i18n, certificates. This document specifies a **targeted refactor** (Phases 6-10) to:

1. Rename the software to LinguLab and cleanly separate software brand from tenant brand (Phase 6)
2. Add multi-tenancy (Phase 7) — one codebase serves many academies
3. Make the UI modular — tabs as data, components as plugins (Phase 8)
4. Add packages, cohorts, proper timezone handling, and events (Phase 9)
5. Extend the CRM, add notifications, and open PaaS onboarding (Phase 10)

### Guiding principle

> **Everything is modular. No hardcoded limits. No hardcoded tabs. No hardcoded features.**
> Every UI surface, every limit, every behavior is configurable per tenant, per role, per package, or per user — via database records, not code changes.

### Key architectural decisions

| Decision | Choice | Rationale |
|---|---|---|
| Refactor strategy | Heavy refactor of existing code | Preserve AI pipeline, auth, i18n; restructure data layer |
| Multi-tenancy | From day 1 | PaaS is the Phase 2 goal; retrofitting is 5–10× more expensive |
| UI composition | Tabs-as-data + modular components | Admins configure tabs without developer involvement |
| Group classes | Hybrid (cohorts + flexible rosters) | Supports both recurring groups and ad-hoc sessions |
| Payment | External (manual) | Admin marks payments received; no gateway integration in v1 |
| Video | Google Meet (external) | Current state retained; transcription via tab-audio capture |
| Timezone | Global (UTC + per-user tz) | Teachers in Egypt, students in Central Asia |
| CRM | Basic in v1, full build later | Ship faster; expand when messaging APIs are approved |

---

## 2. Business Context

### 2.1 What FluentLap is

A remote English academy with:
- 1-on-1 and group online classes (conducted on Google Meet)
- Admin-curated teacher-student matching
- AI-powered post-class processing: transcripts, vocabulary extraction, auto-generated flashcards (SM-2 SRS)
- Gamified learning (achievements, streaks, Duolingo-style progress path)
- Community events (admin-organized, online or offline)
- Students primarily from Central Asia (Kazakhstan); teachers primarily from Egypt

### 2.2 Phase 2 — PaaS

Once FluentLap's model is proven, the same platform is offered as white-label SaaS to other academies (language schools, music schools, tutoring centers). This is why multi-tenancy and modularity are non-negotiable from day 1.

---

## 3. Current Platform Snapshot

The existing codebase (codename "Arabikum", deployed as "Talk Club") is **production-ready as a single-tenant Arabic academy** per Phases 1–5 of `MASTER_PLAN.md`. FluentLap is a rebrand + feature extension, **not a rebuild**.

### 3.1 Built, tested, and working (do NOT rewrite)

- **Authentication:** Clerk fully integrated with JWT → Convex. Role-based auto-redirect. 16 components migrated to `useAuth()`. All 56 Convex functions guarded with `requireAuth` / `requireRole` helpers.
- **Three portals:** Admin, Teacher, Student (all functional)
- **AI pipeline (production):**
  - Soniox `stt-rt-v4` real-time transcription with speaker diarization on
  - Audio capture via `getDisplayMedia()` — mic / tab audio / both (mixed via Web Audio API)
  - OpenRouter → Gemini 2.5 Flash for summary / vocab / flashcards / quiz
  - Per-section approval workflow (generate → edit → approve → publish)
  - AI prompts stored in `aiPrompts` table, editable via admin UI
  - SM-2 spaced-repetition (server-side in `convex/lib/sm2.ts`)
- **Admin portal:** Dashboard, Users (TanStack Table), AI Manager (with test button, cost estimates), Achievements (CRUD), Scheduling Policies, Certificates (PDF templates, issue/revoke), Students CRM (Kanban: New/Trial/Active/Overdue/Paused/Cancelled), Analytics (revenue, ad spend, expenses, teacher payments, KGS/USD with editable FX rate, manual expense entries)
- **Teacher portal:** Dashboard, Students list, Student detail (lesson path + new lesson), Lesson recorder (Soniox integration), Post-recording review, Calendar
- **Student portal:** Dashboard, My Lessons (Duolingo island path), Lesson detail (5 tabs: transcript/summary/vocab/flashcards/quiz), Study (SRS queue), Decks (with CSV import), Calendar, Statistics (heatmap, charts, quiz scores), Achievements, Profile
- **Internationalization:** `next-intl` fully configured. EN / RU / AR with RTL. All UI strings externalized. Noto Sans Arabic via `next/font/google`. LocaleProvider sets `document.dir` automatically. 15 non-logical CSS properties audited and fixed (mr→me, pl→ps, etc.).
- **Gamification:** 11 achievements shipped. Auto-grant on condition met. Toast notifications. Streak tracking with consecutive day logic.
- **Certificates:** Template upload, issue, revoke, PDF via Convex file storage.
- **Production hardening:** Error boundaries per portal, loading skeletons, Zod validators on all Convex functions, mobile responsive (hamburger + Sheet drawer).

### 3.2 Convex schema (current — 15 tables)

```
users, lessons, srsCards, reviewLogs, quizAttempts, scheduleEvents,
achievements, studentAchievements, streaks, aiPrompts, certificates,
certificateTemplates, issuedCertificates, decks, schedulePolicy
```

All tables have appropriate indexes (`by_teacherId`, `by_studentId`, `by_tokenIdentifier`, etc.). All functions role-guarded.

### 3.3 Tech stack (retained — do not change)

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | |
| Styling | Tailwind v4 + shadcn/ui | |
| Backend + DB + Realtime + Storage | Convex | 56 auth-guarded functions across 10 files |
| Authentication | Clerk (JWT → Convex) | `upsertFromAuth` mutation, `tokenIdentifier` index |
| i18n | next-intl | EN/RU/AR with RTL; add Kazakh in Phase 6 |
| Transcription | Soniox (`stt-rt-v4`) | Speaker diarization on; change `languageHints` from `["ar"]` to `["en"]` for FluentLap |
| LLM | OpenRouter → Gemini 2.5 Flash | Via Convex actions (`"use node"`) |
| Fonts | Plus Jakarta Sans + Noto Sans Arabic | Auto-switches via `html[dir="rtl"]` |
| Icons | Lucide React | |
| Tables | @tanstack/react-table | Used in admin users page |
| Charts | recharts | Statistics dashboard |
| Dates | date-fns | (Add `date-fns-tz` in Phase 9) |
| State | Convex `useQuery` is reactive; Zustand removed in 5d | |
| Hosting | Vercel (frontend) + Convex (backend) | Not yet deployed to production |

### 3.4 Not yet built (addressed in Phases 6–10)

- **Rebrand:** "Talk Club" / "Arabikum" → "FluentLap" (Phase 6)
- **Multi-tenancy:** `tenantId` not present in any table (Phase 7)
- **Tab configurability:** tabs are hardcoded; need database-driven tabs + module registry (Phase 8)
- **Package system:** package status is mocked ("Standard Plan, 12 lessons remaining") — needs real templates + instances (Phase 9)
- **Group classes:** schema has single `studentId`; needs `roster: Id<"users">[]` (Phase 9)
- **Timezone handling:** times stored as strings; needs UTC + per-user IANA tz (Phase 9)
- **Recurring auto-generation:** no logic; admin creates each lesson manually today (Phase 9)
- **Make-up credits:** not implemented (Phase 9)
- **Events module:** not built (Phase 9)
- **Email / WhatsApp / Telegram / SMS notifications:** only in-app toasts today (Phase 10)
- **Full omnichannel CRM:** basic Kanban works; messaging integrations deferred until Meta approval (Phase 10+)
- **Super-admin + tenant onboarding:** does not exist (Phase 7e + Phase 10e)
- **Audit log:** not implemented (Phase 10f)

### 3.5 Current database tables (15, all single-tenant)

Will be refactored to include `tenantId` in Phase 7 (see Section 6).

---

## 4. Architecture Overview

### 4.1 The three architectural pillars

#### Pillar 1 — Multi-tenancy

Every piece of data in the platform belongs to a **tenant**. A tenant represents one academy (FluentLap, SpanishPro, PianoHub, etc.). Tenants cannot see each other's data. Same codebase, same database, isolated by `tenantId` on every query.

#### Pillar 2 — Tabs-as-data

The UI is not a fixed set of screens. It is a **shell that renders tabs**. Each tab is a database record with:
- A type (e.g., `schedule`, `content`, `srs_decks`, `events`, `custom_iframe`)
- A title (localized per tenant)
- An icon
- A visibility rule (which roles, which packages, which tenants can see it)
- A component reference (which React module renders inside it)
- A configuration payload (module-specific settings)

Admins add, rename, reorder, and hide tabs without developer involvement.

#### Pillar 3 — Modular components

Every feature is a self-contained module. A module:
- Registers itself with the platform
- Declares its configuration schema
- Renders its own UI inside whatever tab is assigned to it
- Can be enabled/disabled per tenant

New features ship as new modules, not as code carved into existing screens.

### 4.2 High-level system diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Next.js)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Platform Shell (header, sidebar, layout)    │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  Tab Renderer                                   │  │  │
│  │  │  - Fetches tabs for (tenant × role × user)      │  │  │
│  │  │  - Renders the module assigned to each tab      │  │  │
│  │  │  - Passes config payload to the module          │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                       │  │
│  │  Modules (plugins): Schedule, Content, SRS, Events,   │  │
│  │  Stats, Achievements, Journey, CRM, Analytics, ...    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       Convex (Backend)                      │
│  - Schema: every table has tenantId                         │
│  - Query wrappers: automatic tenant scoping                 │
│  - Realtime subscriptions                                   │
│  - File storage                                             │
└─────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
    ┌────────┐       ┌──────────┐      ┌──────────┐
    │ Clerk  │       │  Soniox  │      │OpenRouter│
    │ (Auth) │       │  (STT)   │      │  (LLM)   │
    └────────┘       └──────────┘      └──────────┘
```

---

## 5. Core Concepts

### 5.1 Tenant

A tenant is an academy using the platform. Each tenant has:

- A unique `tenantId`
- A unique subdomain or path (e.g., `fluentlap.app`, `app.fluentlap.com/` vs. `spanishpro.app`)
- Branding configuration (logo, primary color, fonts, favicon, etc.)
- Locale defaults (default language, supported languages, timezone)
- Enabled modules (which features this tenant uses)
- Tab configuration per role (student tabs, teacher tabs, admin tabs)
- Package templates
- Scheduling policies
- Achievement definitions
- AI prompt configurations

### 5.2 Tab

A tab is a navigable section in one of the three portals. Tabs are stored in a `tabs` table and resolved at runtime. A tab record includes:

```ts
{
  _id: Id<"tabs">,
  tenantId: Id<"tenants">,
  role: "student" | "teacher" | "admin",
  key: string,              // unique within tenant+role (e.g., "my_lessons")
  title: { en: string, ru: string, ar: string, kk?: string },
  icon: string,             // Lucide icon name
  moduleKey: string,        // which module renders this tab
  config: Record<string, any>, // module-specific config payload
  order: number,
  visibleTo?: {
    packageIds?: Id<"packageTemplates">[],
    userIds?: Id<"users">[],
    featureFlags?: string[],
  },
  isEnabled: boolean,
}
```

### 5.3 Module

A module is a registered renderer. The codebase contains a module registry:

```ts
// /lib/modules/registry.ts
export const modules = {
  schedule: ScheduleModule,
  lessons_list: LessonsListModule,
  srs_study: SRSStudyModule,
  srs_decks: SRSDecksModule,
  stats: StatsModule,
  achievements: AchievementsModule,
  journey: JourneyModule,
  events: EventsModule,
  profile: ProfileModule,
  content_library: ContentLibraryModule,
  custom_iframe: CustomIframeModule,
  admin_users: AdminUsersModule,
  admin_crm: AdminCRMModule,
  admin_analytics: AdminAnalyticsModule,
  admin_ai_prompts: AdminAIPromptsModule,
  admin_achievements: AdminAchievementsModule,
  admin_scheduling: AdminSchedulingModule,
  admin_certificates: AdminCertificatesModule,
  admin_events: AdminEventsModule,
  admin_packages: AdminPackagesModule,
  admin_tenants: AdminTenantsModule, // super-admin only
  admin_tabs: AdminTabsModule,       // configure tabs
  // ... add more modules as the platform grows
};
```

Each module exports:

```ts
export interface PlatformModule {
  key: string;
  displayName: Record<Locale, string>;
  render: (props: { tab: Tab; user: User; tenant: Tenant }) => ReactNode;
  configSchema: ZodSchema;  // validates the tab's config payload
  defaultConfig: () => Record<string, any>;
}
```

### 5.4 Package (manual)

A package is what a student purchases. Packages are created from **templates** (reusable) or **custom** (one-off per student).

```ts
// Package template (tenant-level, reusable)
{
  _id,
  tenantId,
  name: { en, ru, ar, kk? },
  classType: "1on1" | "group" | "mixed",
  lessonCount: number,        // e.g., 12
  durationMinutes: number,    // e.g., 60
  validityWeeks: number,      // how long the student has to use them
  priceLabel: string,         // free-text: "$200" | "15000 KGS" | "2 lemons"
  defaultTabVisibility: string[], // tabs unlocked by this package
  isActive: boolean,
}

// Package instance (per-student, activated on payment)
{
  _id,
  tenantId,
  studentId,
  templateId?,                // null if fully custom
  lessonsRemaining: number,   // decrements on class completion
  lessonsTotal: number,
  creditsRemaining: number,   // from make-ups, etc.
  startDate: timestamp,
  endDate: timestamp,
  status: "active" | "paused" | "expired" | "cancelled",
  customOverrides?: object,   // any field overridden from template
  paymentNote: string,        // free-text — "Paid via Kaspi on 2026-04-15"
  createdAt,
  createdBy: Id<"users">,
}
```

### 5.5 Cohort (group class)

A cohort is a **named group of students** who take recurring classes together.

```ts
{
  _id,
  tenantId,
  name: string,                   // "B1 Evening Group"
  teacherId: Id<"users">,
  studentIds: Id<"users">[],      // 0..9999, admin-defined; no hardcoded limit
  recurringSchedule: {
    daysOfWeek: number[],         // [1, 3] = Mon, Wed
    startTime: string,            // "18:00"
    durationMinutes: number,
    timezone: string,
  },
  startDate: timestamp,
  endDate?: timestamp,
  status: "active" | "paused" | "completed",
}
```

For **one-off group sessions**, a lesson can just have a roster (see Section 6).

### 5.6 Lesson (unified schema)

A lesson is a single class instance. Refactored schema supports 1-on-1, cohort, and ad-hoc groups uniformly:

```ts
{
  _id,
  tenantId,
  title: string,
  teacherId: Id<"users">,
  cohortId?: Id<"cohorts">,       // null for 1-on-1 or ad-hoc
  roster: Id<"users">[],          // always an array; length 1 for 1-on-1
  scheduledStart: timestamp,       // UTC
  scheduledEnd: timestamp,         // UTC
  meetingUrl?: string,             // external Google Meet URL
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show",
  transcript?: string,             // Soniox output
  transcriptSegments?: Array<{ speaker: string, text: string, startMs, endMs }>,
  aiSummary?: string,
  aiVocabulary?: Array<{ word: string, definition: string, example: string }>,
  aiFlashcardsGenerated?: boolean,
  aiQuizGenerated?: boolean,
  isPublished: boolean,
  publishedAt?: timestamp,
  attendance: Array<{ userId, status: "attended" | "absent" | "late", joinedAt? }>,
  createdAt,
  updatedAt,
}
```

---

## 6. Data Model / Schema Refactor

### 6.1 New and modified tables

**Every table gets a `tenantId` field indexed for fast scoping.**

New tables:

| Table | Purpose |
|---|---|
| `tenants` | The academy accounts |
| `tenantSettings` | Branding, locales, feature flags per tenant |
| `tabs` | Configurable tabs per tenant + role |
| `modules` | Registered modules and per-tenant enable/disable |
| `packageTemplates` | Reusable package definitions |
| `packageInstances` | Per-student packages |
| `cohorts` | Group class definitions |
| `events` | Community events (online + offline) |
| `eventRSVPs` | Student RSVPs to events |
| `credits` | Make-up credits, promotional credits |
| `notifications` | In-app notifications queue |
| `notificationPreferences` | Per-user channel preferences |
| `crmLeads` | Floating leads (unregistered contacts) |
| `crmConversations` | Conversation threads per registered user |
| `crmMessages` | Individual messages across channels |
| `timezones` | User timezone + DST awareness cache |
| `auditLog` | Admin actions (GDPR + forensic) |

Modified tables (add `tenantId` + other fields):

| Table | Modifications |
|---|---|
| `users` | + `tenantId`, + `timezone`, + `preferredLanguage`, + `phoneNumber`, + `country` |
| `lessons` | Replace `studentId` with `roster: Id<"users">[]`, + `cohortId?`, + `tenantId`, convert times to UTC timestamps |
| `scheduleEvents` | + `tenantId`, + `timezoneAtCreation`, + UTC timestamps |
| `schedulePolicy` | + `tenantId` (policy per tenant) |
| `achievements` | + `tenantId` |
| `aiPrompts` | + `tenantId` |
| `certificates` | + `tenantId` |
| `srsCards` | + `tenantId` |
| `decks` | + `tenantId` |
| `quizzes` | + `tenantId` |

### 6.2 Tenant scoping enforcement

All Convex queries must go through a tenant-scoped wrapper:

```ts
// convex/lib/tenantScope.ts
export async function scopedQuery<T>(
  ctx: QueryCtx,
  tableName: string,
  callerUser: User,
): Promise<T[]> {
  return await ctx.db
    .query(tableName)
    .withIndex("by_tenant", q => q.eq("tenantId", callerUser.tenantId))
    .collect();
}
```

No query is allowed to touch a table without tenant filtering, **except** super-admin queries (which must be explicitly flagged and audit-logged).

### 6.3 Super-admin access

A super-admin role (new) can:
- Create/suspend/delete tenants
- Impersonate a tenant's admin for support
- View cross-tenant aggregate analytics (no PII leakage)
- Manage platform-wide modules

Super-admin is **not** a tenant-scoped role. It is a separate flag on the user: `isPlatformSuperAdmin: boolean`.

---

## 7. User Roles & Permissions

### 7.1 Role hierarchy

```
Platform Super-Admin (cross-tenant, Anthropic-style)
  └── Tenant Admin (full access within their tenant)
       ├── Tenant Sales (can use CRM, cannot configure)
       ├── Tenant Content Manager (can manage content, tabs, no financial)
       ├── Teacher (roster, lessons, own earnings view)
       └── Student (own dashboard, locked until package active)
```

All tenant-scoped roles are configurable per tenant. The default role set for FluentLap at launch is: `super_admin`, `admin`, `teacher`, `student`. Sales and Content Manager exist in the code but are disabled until needed.

### 7.2 Multi-role users

A single user can hold multiple roles within one tenant (e.g., admin + teacher). The database uses a `userRoles` table:

```ts
{
  userId: Id<"users">,
  tenantId: Id<"tenants">,
  role: "admin" | "teacher" | "student" | "sales" | "content_manager",
  assignedAt: timestamp,
}
```

When a user logs in, the platform checks all their roles within the active tenant and renders the appropriate portal switcher.

### 7.3 Permission matrix

Fine-grained permissions are stored per role per tenant (configurable by super-admin):

```ts
// rolePermissions table
{
  tenantId,
  role: string,
  permissions: string[],   // e.g., ["lessons.read", "lessons.create", "users.invite"]
}
```

A default permission set ships with the platform; tenant admins can override.

---

## 8. Modules Specification

Each module below is a self-contained React component + Convex functions. **They can be enabled/disabled per tenant and assigned to any tab.**

### 8.1 Student-side modules

#### 8.1.1 `schedule` — Upcoming classes
- Lists scheduled classes filtered by the logged-in student's roster
- Shows class title, teacher, time (in student's timezone), meeting link
- "Join" button becomes active N minutes before start (configurable per tenant)
- Reschedule / cancel buttons subject to `schedulePolicy` windows

#### 8.1.2 `lessons_list` — Past lesson archive
- Chronological list of completed + published lessons
- Each item links to a lesson detail view (transcript, summary, flashcards, quiz)
- Optional filter/search

#### 8.1.3 `srs_study` — Daily flashcard study queue
- Shows count of due cards
- Entry point into the SM-2 review session
- Preserves existing logic from current codebase

#### 8.1.4 `srs_decks` — Deck browser
- Lists all decks generated from the student's lessons
- Allows manual review outside the due queue

#### 8.1.5 `stats` — Personal progress
- Streak, total cards reviewed, quiz scores, vocabulary growth, lessons completed
- Modular chart config (tenant can hide metrics they don't want)

#### 8.1.6 `achievements` — Earned + locked achievements
- Achievement definitions come from per-tenant `achievements` table
- Displays threshold progress

#### 8.1.7 `journey` — Duolingo-style path
- Uses existing island path UI
- Progress gated on lesson completion

#### 8.1.8 `events` — Community events listing
- Shows upcoming events (online + offline)
- RSVP button
- Event detail view with description, capacity remaining, location/link

#### 8.1.9 `profile` — Account settings
- Name, email, language, timezone, notification preferences
- Package status (lessons remaining, expiry date)
- Payment history (free-text entries from admin)

#### 8.1.10 `content_library` — Static resources
- Admin-uploaded files (PDFs, audio, video, links)
- Optional tags / categories

#### 8.1.11 `custom_iframe` — Embed any external tool
- Admin pastes a URL; renders inside the tab
- Enables future integrations (e.g., external vocabulary apps) without dev work

### 8.2 Teacher-side modules

#### 8.2.1 `teacher_dashboard` — Overview
- Summary cards: students, upcoming classes, earnings (read-only)

#### 8.2.2 `teacher_roster` — Student list
- Students assigned to this teacher
- Click-through to student detail (progress, past lessons, notes)

#### 8.2.3 `teacher_calendar` — Teaching schedule
- All scheduled classes
- Create one-off class, edit, cancel
- Policy-bound (cannot cancel within N hours without admin override)

#### 8.2.4 `teacher_lesson_runner` — Live class control panel
- Preserves existing Soniox + Google Meet tab-capture flow
- Start / stop transcription
- View live transcript
- After class: run AI generation (summary, vocab, flashcards, quiz)
- Review + edit AI output
- Publish lesson (makes it visible to students)

#### 8.2.5 `teacher_earnings` — Hours + payout tracking
- Shows hours worked per period
- Manual payout entries from admin (free-text, like package payment)

### 8.3 Admin-side modules

#### 8.3.1 `admin_dashboard` — Overview stats
- Cards: teachers, students, lessons, published, flashcards reviewed, active packages

#### 8.3.2 `admin_users` — User management
- List, search, filter by role, create, edit, deactivate
- Assign teacher to student (the "Matchmaker" role)
- View user detail

#### 8.3.3 `admin_tabs` — Configure tabs
- Per role, drag-to-reorder tabs
- Add/rename/hide tabs
- Assign modules to tabs
- Configure module payloads via generated forms (derived from each module's `configSchema`)

#### 8.3.4 `admin_modules` — Enable/disable modules
- Toggle modules on/off at the tenant level

#### 8.3.5 `admin_packages` — Package templates + instances
- Create/edit reusable templates
- Assign templates to students (activates their account)
- Override fields per student
- Free-text `paymentNote`
- Set expiry, lesson count, etc.

#### 8.3.6 `admin_scheduling` — Scheduling policies
- Reschedule window, cancel window, default duration
- Auto-populate rules for recurring classes
- Credit accrual rules

#### 8.3.7 `admin_cohorts` — Group management
- Create cohort, assign teacher, add/remove students
- Set recurring schedule
- View attendance across sessions

#### 8.3.8 `admin_events` — Event management
- Create events (online/offline, free/paid with free-text price)
- Set capacity (any integer, including unlimited/0)
- RSVP list
- Post to student `events` tab

#### 8.3.9 `admin_crm` (basic v1) — Student pipeline
- Preserve existing Students CRM (Kanban: New, Trial, Active, Overdue, Paused, Cancelled)
- CSV export
- Basic lead capture form
- **Deferred v2:** WhatsApp / Instagram / Telegram / Email integration

#### 8.3.10 `admin_analytics` — Financial + operational
- Preserve existing Analytics module (revenue, ad spend, expenses, teacher payments, KGS/USD conversion)
- Add: churn, retention, attendance rate, AI cost per lesson
- Exportable

#### 8.3.11 `admin_ai_prompts` — Prompt management
- Preserve existing AI Prompt Manager (model, temperature, max tokens, prompt text per task)
- Add: A/B test prompts, per-tenant overrides

#### 8.3.12 `admin_achievements` — Gamification definitions
- Preserve existing achievements CRUD

#### 8.3.13 `admin_certificates` — Certificate templates
- Preserve existing templates + issued certificates

#### 8.3.14 `admin_tenants` (super-admin only) — Tenant management
- List tenants, create new, suspend, delete
- Impersonate (with audit log)
- Cross-tenant aggregate stats

---

## 9. Authentication & Onboarding

### 9.1 Signup flow

1. User visits landing page → clicks "Get Started"
2. Clerk-powered signup (email/password, Google, Apple — tenant-configurable)
3. Account created in `users` table with role `student` and `tenantId` derived from subdomain/path
4. Locked state: user can see only:
   - Welcome screen with program info
   - Sample flashcard deck preview (1 public deck per tenant)
   - Intro video (if tenant-configured)
   - "Activate your account" CTA
5. User contacts sales (external — WhatsApp, Instagram, etc.) and pays
6. Admin activates student via `admin_packages` → assigns package instance
7. Admin assigns teacher via `admin_users`
8. Student account unlocks; tabs populate per their package's `defaultTabVisibility`

### 9.2 Locked state technical implementation

The platform shell checks `user.packageStatus` before rendering tabs:

```ts
if (user.packageStatus !== "active") {
  return <LockedStateRenderer tenant={tenant} />;
}
```

`LockedStateRenderer` is itself a module — tenants can customize what locked users see.

### 9.3 Teacher onboarding

Teachers are invited by admin:
1. Admin clicks "Invite Teacher" → enters email
2. Clerk sends invitation; teacher signs up
3. Teacher completes profile (timezone, bio, languages)
4. Admin can now assign students to this teacher

---

## 10. Payment & Package Management (Manual)

### 10.1 Flow

1. Admin receives payment externally (Kaspi, bank transfer, cash, crypto, lemons — anything)
2. Admin opens `admin_packages` → clicks "Assign Package" on the student
3. Admin picks a template OR creates a custom package
4. Admin enters `paymentNote` (free-text): `"Paid 30,000 KGS via Kaspi on 2026-04-15, ref #12345"`
5. Admin sets start date, lesson count, duration, expiry
6. Saves → student account activates
7. Platform auto-generates N scheduled lessons based on package + student's preferred slot (see Section 11)

### 10.2 Package lifecycle

```
[pending] → [active] → [paused] | [expired] | [cancelled]
                ↓
         lessons decrement
         credits accrue
```

- **Pause:** admin-triggered; no new lessons scheduled; existing lessons cancelled with credit
- **Expire:** automatic when `endDate` passes or `lessonsRemaining = 0`
- **Cancel:** admin-triggered; refund handled externally

### 10.3 Revenue tracking

- Admin manually enters revenue in `admin_analytics` when payment received
- Links to `paymentNote` on the package instance
- No gateway = no webhooks = no automated reconciliation (v1 limitation, acceptable)

---

## 11. Scheduling System

### 11.1 Class types supported

| Type | Definition | Roster |
|---|---|---|
| 1-on-1 | Single student + teacher | `[studentId]` |
| Cohort (recurring group) | Fixed group + teacher, recurring schedule | `cohort.studentIds` |
| Ad-hoc group | Teacher-picked roster for one-off session | Admin/teacher-defined array |

### 11.2 Timezone handling

- All timestamps stored in **UTC** (milliseconds since epoch)
- Each user has a `timezone` (IANA string, e.g., `Asia/Almaty`, `Africa/Cairo`)
- Clients render times in the logged-in user's timezone
- When a teacher in Cairo schedules a class at 18:00, it's stored as UTC; the student in Almaty sees it at their local equivalent
- DST awareness via browser `Intl.DateTimeFormat` + Luxon or date-fns-tz

### 11.3 Recurring class auto-generation

When a package is activated (e.g., 12 lessons, Mon/Wed 18:00 Almaty time), the system generates 12 `lessons` records at the correct UTC times across the package validity window.

```ts
// Pseudo
function generateRecurringLessons(
  packageInstance,
  dayOfWeek,
  localTime,
  studentTimezone,
  teacherId
) {
  const lessons = [];
  let current = startOfWeek(packageInstance.startDate);
  while (lessons.length < packageInstance.lessonsTotal) {
    const localDate = nextOccurrence(current, dayOfWeek, localTime);
    const utcMs = zonedTimeToUtc(localDate, studentTimezone).getTime();
    if (utcMs > packageInstance.endDate) break;
    lessons.push({ scheduledStart: utcMs, ... });
    current = addDays(current, 7);
  }
  return lessons;
}
```

### 11.4 Reschedule / cancel policies

Per-tenant `schedulePolicy`:
- `rescheduleWindowHours` — how many hours before class a student can reschedule
- `cancelWindowHours` — how many hours before class a student can cancel
- `cancelationCreditPolicy` — whether late cancels still grant a credit

Teachers and admins can override policy with justification (logged in `auditLog`).

### 11.5 Make-up credits

When a class is cancelled:
- Within policy → credit added to student's balance
- Outside policy → no credit (student forfeits the lesson)
- Credits can be applied by admin to future lessons (increments `lessonsTotal` on the package instance)

When a teacher cancels:
- Credit added automatically (regardless of timing)
- Student sees notification: "Class rescheduled — credit applied"

### 11.6 Group class absence

When a student misses a cohort session:
- Class still runs for the other students
- The absent student's attendance is marked `absent`
- The student still receives: transcript, AI summary, vocabulary list, flashcards, recording (if captured)
- No credit by default (group classes are group dynamics; configurable per tenant)

---

## 12. Video & AI Pipeline

### 12.1 Video (retained: Google Meet external)

- Teacher creates a Google Meet externally (or the platform generates a link if Google Calendar API is connected — future enhancement)
- Meeting URL is pasted into the lesson's `meetingUrl` field
- Students click "Join" from their `schedule` tab → opens Google Meet in new tab
- Teacher runs the class as normal

### 12.2 Transcription (retained: Soniox tab-capture)

- Teacher opens the Google Meet tab
- Teacher opens the platform's "Lesson Runner" (module `teacher_lesson_runner`) in a sidepanel/second tab
- Teacher clicks "Start Recording" → browser requests tab-audio permission via `getDisplayMedia()`
- Audio stream piped to Soniox `stt-rt-v4` over WebSocket
- Live transcript appears in the lesson runner with speaker diarization
- Teacher ends recording → transcript saved to `lessons.transcript` + `lessons.transcriptSegments`

### 12.3 AI post-processing (retained: OpenRouter → Gemini 2.5 Flash)

After recording ends, teacher triggers:
1. **Summary generation** — prompt: `lesson_summary`
2. **Vocabulary extraction** — prompt: `vocab_extraction` (returns JSON array)
3. **Flashcard generation** — prompt: `flashcard_generation` (returns SM-2-compatible cards)
4. **Quiz generation** — prompt: `quiz_generation` (returns multiple choice questions)

Teacher reviews + edits each output, then clicks "Publish" → lesson becomes visible to students + cards seed the SM-2 queue.

Cost per lesson: ~$0.0001 (current Gemini Flash pricing). Analytics module tracks cumulative AI cost per tenant.

### 12.4 SM-2 SRS (retained)

- Algorithm lives in `/convex/lib/sm2.ts` + `/src/lib/srs/sm2.ts`
- No changes required beyond adding `tenantId` to `srsCards`

### 12.5 Future video enhancements (out of scope for v1)

- Embedded video (LiveKit / Daily.co) for in-platform experience
- Automatic Google Meet creation via Google Calendar API
- Video recording storage
- Post-class playback

---

## 13. CRM (v1 Basic)

### 13.1 v1 scope

Preserve the existing Students CRM:
- Kanban board with statuses: New, Trial, Active, Overdue, Paused, Cancelled
- Student detail pane
- CSV export
- Manual status updates

### 13.2 v2 scope (deferred until Meta APIs are approved)

- **Environment A — Floating Leads Inbox:** unmatched DMs from WhatsApp/Instagram/Telegram land here
- **Environment B — Master Student Database:** registered students with channel-linked profiles
- Merging protocols: auto-merge by phone number (WhatsApp); manual merge by email (Instagram/Telegram)
- Message echoes: outbound messages from sales reps' phones auto-clear "needs attention" dot
- Middleware: Make.com (confirmed) with webhook endpoints in Convex

### 13.3 Meta API approval — critical path

**Status:** not yet started. This is a blocker for CRM v2.

Approvals needed:
- Meta Business verification
- WhatsApp Business API (via Meta or BSP like Twilio / 360dialog)
- Instagram Graph API (requires business Instagram + Facebook page linking)

**Timeline:** 2–6 weeks. Start immediately in parallel with development.

---

## 14. Notifications

### 14.1 Channels

| Channel | v1 | v2 | Notes |
|---|---|---|---|
| In-app toasts | ✅ | ✅ | Existing (sonner) |
| In-app notification center | ✅ | ✅ | New table `notifications` |
| Email | ✅ | ✅ | Via Resend or Postmark |
| WhatsApp | ❌ | ✅ | After Meta approval |
| Instagram DM | ❌ | ✅ | After Meta approval |
| Telegram | ❌ | ✅ | Telegram Bot API (no approval needed, easy win) |
| SMS | ❌ | ✅ | Via Twilio (Kazakhstan carrier support: verify) |
| Push (web) | ❌ | ✅ | Web Push API |
| Push (native) | ❌ | Future | If native apps are built |

### 14.2 Triggers

- Class reminder (24h + 1h before)
- Teacher assigned / reassigned
- Class cancelled / rescheduled
- New lesson published (transcript + flashcards ready)
- Due flashcards waiting
- Achievement unlocked
- Event invitation
- Payment confirmation (when admin logs payment)
- Package near expiry (3 days before)
- Admin messages (manual send)

### 14.3 User preferences

Per-user `notificationPreferences` table lets each user toggle channels per trigger type. Tenant admin sets defaults; users can override.

---

## 15. Events System

### 15.1 Admin-side

Admin creates events via `admin_events`:
- Title (localized)
- Description (localized rich text)
- Type: `online` | `offline` | `hybrid`
- Location (free-text for offline: "Mingle Cafe, Almaty" or URL for online)
- Start time / end time (UTC, with timezone hint for offline)
- Capacity: any integer (0 = unlimited; 9999+ accepted)
- Price: free-text field (empty = free; "$10" = paid; "Bring a lemon" = whatever)
- RSVP deadline
- Visibility: all students | specific packages | specific users | specific cohorts

### 15.2 Student-side

Students see events in their `events` tab:
- List of upcoming events
- RSVP button (disabled when capacity full, unless capacity is 0/unlimited)
- Cancel RSVP
- Filter by online/offline

### 15.3 RSVP tracking

`eventRSVPs` table:
```ts
{
  eventId,
  userId,
  tenantId,
  status: "going" | "maybe" | "cancelled",
  paymentNote?: string,  // free-text, for paid events
  rsvpedAt: timestamp,
}
```

Admin can view attendees list, export CSV, mark attended/no-show after the event.

---

## 16. Analytics & Reporting

### 16.1 Preserve existing

The current Analytics module is already strong. Retain:
- Monthly / Yearly / Custom range / All time filters
- Total Revenue, Ad Spend, Other Expenses, Teacher & Employee Payments, Net Profit
- KGS / USD currency switcher with editable exchange rate
- Students: Total (month), Active, New (with "from ads" attribution), Renewed, Stopped, Paused, Trial, Unique
- Manual expense entries
- CSV export

### 16.2 Additions

- Churn rate (monthly/quarterly)
- Retention curve (week 1 / week 4 / week 12)
- Attendance rate per teacher
- AI cost per lesson (from Gemini usage)
- Per-package metrics (lessons consumed, satisfaction if added)
- Cross-tenant aggregate (super-admin only)

### 16.3 Audit log

All admin actions on sensitive data (financial entries, user deletion, role changes, impersonation) are logged in `auditLog` with:
- Timestamp, actor, action, target, before/after snapshot, tenant

---

## 17. Internationalization (i18n)

### 17.1 Current state (retained)

- Languages: EN / RU / AR (with RTL support)
- Fonts: Plus Jakarta Sans (Latin/Cyrillic) + Noto Sans Arabic

### 17.2 Additions

- Kazakh (KK) — add as priority 1 for FluentLap's Central Asia market
- Kyrgyz, Uzbek — add as priority 2 (optional)
- Per-tenant default language
- Per-user preferred language
- Per-tenant ability to disable languages they don't want

### 17.3 Translation approach

- All user-facing strings live in `/locales/{lang}/*.json` namespaces
- Tenant-configurable strings (tab titles, achievement names, package names) use a JSON map: `{ en: "...", ru: "...", ar: "...", kk: "..." }`
- Tenant admins can provide their own translations via the tenant settings UI

---

## 18. Compliance & Data Residency

### 18.1 Jurisdictional scope (confirmed: Central Asia)

- Primary market: Kazakhstan
- No EU / US marketing = no GDPR / CCPA required at launch
- Kazakhstan Personal Data Protection Law #94-V applies

### 18.2 Kazakhstan compliance requirements

- Personal data of Kazakhstan citizens must be **stored on servers physically located in Kazakhstan** (per law, for primary storage)
- **Convex hosts in the US by default.** This is a legal risk.
- **Options:**
  - (a) Accept the risk at launch (many KZ SaaS companies do); register as data operator with the state
  - (b) Architect for dual-region storage (Convex US + KZ mirror via local provider) — complex
  - (c) Move primary backend to a KZ-hosted provider — defeats Convex's purpose
- **Recommendation:** Option (a) for v1 + consult a Kazakhstan data-protection lawyer before 500 active users

### 18.3 Phase 2 (multi-tenant PaaS)

When foreign tenants onboard, their users' data residency becomes their own compliance problem. The platform should:
- Let tenants declare their jurisdiction
- Provide data export + delete on request (DSAR-compatible)
- Maintain audit logs for 3+ years

---

## 19. Multi-Tenancy Implementation Details

### 19.1 Tenant resolution

Priority order:
1. **Subdomain** (`fluentlap.app`, `spanishpro.app`) — production
2. **Path prefix** (`app.fluentlap.com/spanishpro/`) — fallback
3. **Custom domain** (`learn.spanishpro.com` → CNAME to FluentLap platform) — Phase 2 premium feature
4. **Query param** (`?tenant=spanishpro`) — dev/testing only

Tenant is resolved in Next.js middleware and attached to every request context.

### 19.2 Branding customization

Per-tenant `tenantSettings.branding`:

```ts
{
  logoUrl: string,
  faviconUrl: string,
  primaryColor: string,      // hex
  secondaryColor: string,
  accentColor: string,
  fontFamilyHeading: string,
  fontFamilyBody: string,
  customCSS?: string,        // advanced: raw CSS overrides
  emailHeaderTemplate?: string,
}
```

Applied via CSS variables on the root element:

```css
:root[data-tenant="fluentlap"] {
  --primary: #...;
  --accent: #...;
  ...
}
```

### 19.3 Module enable/disable per tenant

`tenantModules` table:

```ts
{
  tenantId,
  moduleKey,
  isEnabled: boolean,
  config?: object,  // tenant-level module config (different from tab-level)
}
```

### 19.4 Data isolation enforcement

- Database: every query wrapped in tenant scope
- Storage: Convex file storage keyed by `tenantId` path prefix
- AI: separate prompt configurations per tenant
- Analytics: cross-tenant views only for super-admin with explicit permission
- Logs: include `tenantId` in every log entry

### 19.5 Cross-tenant resources

Some resources are global (shared):
- Module registry (code)
- System translations (EN/RU/AR/KK base strings)
- Super-admin dashboard

Some resources are per-tenant:
- Everything else

---

## 20. Migration Plan (Current State → Target State)

### 20.1 Phase 0 — Prep (week 0)

- Initialize Git repo (currently not a repo per audit)
- Set up GitHub + branch protection
- Set up CI/CD (Vercel + Convex)
- Environment config (dev / staging / prod)
- Spin up staging Convex deployment

### 20.2 Phase 1 — Foundation refactor (weeks 1–3)

- Add `tenantId` to all 15 existing tables
- Create `tenants`, `tenantSettings`, `userRoles` tables
- Seed FluentLap as the first tenant
- Migrate existing users to FluentLap tenant
- Wrap all Convex queries in tenant scope
- Deploy to staging; full regression test

### 20.3 Phase 2 — Modular shell (weeks 4–6)

- Create `tabs` and `modules` tables
- Extract existing hardcoded tabs into module components
- Build Tab Renderer + module registry
- Build `admin_tabs` module for tab configuration
- Seed default tab configuration matching current UI (so users notice no difference)
- Deploy to staging; verify

### 20.4 Phase 3 — Schedule + package refactor (weeks 7–9)

- Add timezone fields to users
- Convert scheduleEvents times to UTC
- Build `packageTemplates` + `packageInstances`
- Build recurring class auto-generation
- Refactor `lessons` for unified roster (1-on-1 + cohort + ad-hoc)
- Build `cohorts` + `admin_cohorts`
- Make-up credits system

### 20.5 Phase 4 — Events + notifications (weeks 10–11)

- Build `events` module + `admin_events`
- Build notification infrastructure (in-app, email)
- Wire up class reminders, payment confirmations, new lesson published

### 20.6 Phase 5 — Super-admin + tenant creation UI (week 12)

- Build `admin_tenants` super-admin module
- Build tenant onboarding flow (for PaaS)
- Branding configuration UI
- Module enable/disable UI per tenant

### 20.7 Phase 6 — CRM v2 + messaging (weeks 13+, gated on Meta approval)

- Meta approval in parallel from week 1
- Once approved: build omnichannel inbox, Make.com webhooks, merge protocols
- WhatsApp / Instagram / Telegram / SMS notifications

### 20.8 Phase 7 — Polish + launch

- Accessibility audit
- Performance optimization
- Documentation for PaaS customers
- Launch FluentLap publicly
- Open PaaS onboarding

**Estimated total:** 14–16 weeks of full-time dev work for a small team (2 full-stack devs).

---

## 21. API Design Principles

### 21.1 Convex function conventions

- `queries/` — read-only
- `mutations/` — writes
- `actions/` — side effects (external API calls, e.g., Soniox, OpenRouter, Make.com)
- Every function:
  - Validates `tenantId` scoping
  - Validates user permissions
  - Returns `Result<T, Error>` for consistent error handling
  - Has a Zod schema for args

### 21.2 Naming

- `list*` — returns arrays
- `get*` — returns single record or null
- `create*`, `update*`, `delete*` — mutations
- `*ByTenant`, `*ByUser` — scoped variants

### 21.3 External webhooks

All incoming webhooks (from Clerk, Soniox, Make.com, payment providers if added later) land on Convex HTTP actions at `/api/webhooks/{provider}`. Each webhook validates its signature.

---

## 22. Testing Strategy

### 22.1 Unit tests

- All Convex functions have tests covering tenant scoping, permissions, edge cases
- All modules have component tests (React Testing Library)
- SM-2 algorithm has deterministic tests

### 22.2 Integration tests

- Full signup → package assignment → class scheduling → AI generation → publication flow
- Tenant isolation tests (tenant A cannot see tenant B's data under any query)
- Timezone tests (Cairo teacher + Almaty student)

### 22.3 E2E tests (Playwright)

- Critical user journeys on staging before every production deploy

### 22.4 AI output quality tests

- Snapshot tests for prompt outputs on reference transcripts
- Cost regression tests (alert if per-lesson AI cost exceeds threshold)

---

## 23. DevOps & Deployment

### 23.1 Environments

| Env | Frontend | Backend | Purpose |
|---|---|---|---|
| Local | `next dev` | `npx convex dev` | Developer machines |
| Staging | Vercel preview | Convex staging deployment | QA + integration |
| Production | Vercel prod | Convex prod deployment | Live |

### 23.2 CI/CD

- Pull requests trigger Vercel previews + Convex function deploy to staging
- Merges to `main` deploy to production
- Playwright E2E tests run on every PR
- Dependency updates via Renovate

### 23.3 Monitoring

- Convex built-in logs + dashboard
- Vercel analytics for frontend performance
- Sentry for error tracking (new)
- Custom metrics dashboard for business KPIs (lesson volume, AI cost, active users)

### 23.4 Backups

- Convex automated backups (verify retention period)
- Weekly manual export of critical tables to S3 (redundancy)

---

## 24. Open Questions & Future Considerations

### 24.1 To be resolved before Phase 1

- [ ] Data residency approach for Kazakhstan (Option A/B/C — see Section 18)
- [ ] Super-admin email addresses
- [ ] First pass of tab configuration for FluentLap (what tabs, what order)
- [ ] Package templates for FluentLap launch (starter / standard / premium?)

### 24.2 Future enhancements (out of scope for v1)

- Native iOS / Android apps (currently responsive web only)
- Embedded video (LiveKit / Daily.co) replacing external Google Meet
- Automated payment gateways (Stripe, Kaspi Pay)
- AI-generated mini-games from student vocabulary (mentioned in business blueprint)
- Teacher marketplace (students pick teachers instead of admin matchmaking)
- Parent accounts (for younger students)
- Live group polling / quizzes during class
- Custom domain for tenants (Phase 2 PaaS feature)
- SSO / SAML for enterprise tenants

---

## 25. Appendix A — Module Config Schema Examples

### A.1 `events` tab config

```ts
{
  filterDefaults: ["online", "offline"],
  showPastEvents: false,
  maxUpcomingToShow: 20,
  rsvpButtonLabel: { en: "RSVP", ru: "Записаться", ar: "احجز", kk: "Жазылу" }
}
```

### A.2 `stats` tab config

```ts
{
  enabledMetrics: ["streak", "cardsReviewed", "lessonsCompleted", "vocabLearned"],
  chartType: "line" | "bar",
  dateRange: "week" | "month" | "all"
}
```

### A.3 `custom_iframe` tab config

```ts
{
  url: "https://some-external-app.com/embed?user=${userId}",
  height: "800px",
  allowFullscreen: true,
  sandbox: ["allow-scripts", "allow-same-origin"]
}
```

---

## 26. Appendix B — Glossary

- **Tenant** — An academy using the platform (FluentLap, SpanishPro, etc.)
- **Module** — A self-contained feature renderer (code)
- **Tab** — A navigable section in a portal (data); references one module
- **Package template** — Reusable definition of a class package
- **Package instance** — A specific student's active package
- **Cohort** — A named group of students taking recurring classes together
- **Roster** — List of students in a specific lesson
- **Credit** — A unit of owed class time from cancellation/make-up
- **SRS** — Spaced-Repetition System (SM-2 algorithm)
- **STT** — Speech-to-Text (Soniox)
- **PaaS** — Platform as a Service (Phase 2 white-label offering)
- **DSAR** — Data Subject Access Request (privacy law term)

---

*End of specification. Questions, corrections, and change requests: go through the founder (Moumen). All changes to this document are versioned.*
