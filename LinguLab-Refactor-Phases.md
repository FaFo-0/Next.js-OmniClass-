# LinguLab Refactor — Phases 6 through 10

> **Read first:** `MASTER_PLAN.md` (existing project plan, Phases 1–5 complete — authored under previous ownership), `CLAUDE.md` (project rules), `LinguLab-Technical-Specification.md` (the full vision document this plan implements).
>
> **Software name:** LinguLab (the platform itself)
> **First tenant (placeholder name, will change):** "FluentLap" — used only as a stub during Phase 6. Mustafa will pick the real tenant name later; the architecture must make this a one-line config change, not a rename sweep.
> **Owner:** Mustafa (current)
> **Previous owner:** Moumen (Phases 1–5, now separated — he runs his own Arabic academy independently and is no longer involved in this codebase's direction)
> **Started:** 2026-04-20
> **Previous phase:** Phase 5 (Convex + Auth + i18n + Production) — COMPLETE (under previous ownership)
> **Current phase:** Phase 6 — Rename + brand separation (software vs tenant)
> **Target:** Launch Mustafa's first academy tenant + open LinguLab as PaaS-ready platform

---

## 0. Rules of engagement (for the AI executing this plan)

1. **Follow the CLAUDE.md rules.** Read `MASTER_PLAN.md` before starting work. Check off items as completed. Update the Change Log.
2. **Do NOT rewrite working code.** This is a refactor, not a rebuild. Phases 1–5 shipped real functionality. Preserve it unless a phase ticket explicitly says to restructure.
3. **Don't over-engineer.** Moumen is pragmatic. Build iteratively. Ship a phase, verify, move on.
4. **Stay within the existing stack.** Next.js 16, Tailwind v4, Convex, Clerk, Soniox, OpenRouter, next-intl. No new frameworks without approval.
5. **Multi-tenancy is the big change.** Add `tenantId` carefully — one table at a time, with data migration and verification, never a big bang.
6. **Ask before destructive changes.** Schema migrations, data deletion, renaming published routes — flag and confirm.
7. **One PR per phase, broken into sub-PRs per section** (e.g., `phase-6a-rename-brand`, `phase-6b-visual-refresh`).

---

## Phase 6 — Rename + Brand Separation Architecture

> **Goal:** Rename the **software** to "LinguLab". Introduce a **clean separation between the software brand (LinguLab) and any tenant brand**. All tenant-facing UI shows the tenant's brand (pulled from a config object that's trivial to change). Only neutral/system contexts (login fallback, legal, super-admin) show LinguLab. No schema changes beyond adding brand config fields. No functional changes.
>
> **Estimated effort:** 1 week
>
> **Critical concept:**
> - **LinguLab** = the software product (like "Shopify")
> - **The tenant brand** = the academy's name, logo, colors. For Phase 6, the stub uses "FluentLap" as a placeholder because Mustafa hasn't finalized his academy name yet.
> - **"FluentLap" must appear in exactly ONE place in the codebase** (a config stub file). Changing the tenant brand to anything — "WhaleLearn", "Lingua Nova", "مدرستي", literally any string — must be possible by editing that single file, with zero code changes elsewhere.
> - **The architecture does not care what the tenant is called.** Tenants are data, not code.

### 6a — Replace old names with LinguLab (software layer)

- [ ] Search entire codebase for `Talk Club`, `TalkClub`, `talk club`, `talk-club`, `talkclub` → replace with `LinguLab` / appropriate casing
- [ ] Search for `Arabikum`, `arabikum` → replace with `LinguLab` / `lingulab`
- [ ] Update `package.json` `name` field → `"lingulab"`
- [ ] Update `README.md` — replace default Next.js boilerplate with a proper "LinguLab Platform" readme describing the software + tech stack
- [ ] Update `CLAUDE.md` header: "LinguLab Platform — AI Instructions" (from "Arabikum Platform — AI Instructions")
- [ ] Update CLAUDE.md project description: from "digital Arabic language academy platform" to "multi-tenant language academy platform (software name: LinguLab)"
- [ ] Rename `MASTER_PLAN.md` header: "LinguLab Platform — Master Plan" (tenant is separate from the software)
- [ ] Update Convex project name if possible (via Convex dashboard); otherwise leave as-is
- [ ] Update page `<title>` default in `src/app/layout.tsx` — but make it read from brand config (see 6c)
- [ ] Update email sender defaults (if any)

### 6b — Brand configuration data layer

- [ ] Create `src/lib/brand/config.ts`:
  ```ts
  // Software-level constants (hardcoded — these identify LinguLab itself)
  export const SOFTWARE_BRAND = {
    name: "LinguLab",
    tagline: "The operating system for language academies",
    supportEmail: "support@lingulab.app",
    websiteUrl: "https://lingulab.app",
  } as const;

  // Tenant brand is looked up per request, never hardcoded inline in components.
  export interface TenantBrand {
    name: string;           // the academy's display name — anything Mustafa wants
    shortName?: string;     // optional abbreviation for tight UI spaces
    tagline?: string;
    logoUrl?: string;
    logoDarkUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;  // oklch string — overrides default green if set
    supportEmail?: string;
    websiteUrl?: string;
  }
  ```
- [ ] Create `src/lib/brand/current-tenant-brand.ts` — the **single source of truth for the active tenant's brand during Phase 6**. This file is the only place "FluentLap" (or whatever placeholder name) appears:
  ```ts
  // TEMPORARY STUB — Phase 6 only.
  // Phase 7 replaces this with a Convex database lookup per tenant.
  //
  // To change the tenant brand right now: edit the values in this object.
  // No other file in the codebase should contain the tenant's name.
  //
  // Mustafa has not finalized the academy name yet. "FluentLap" is a placeholder.
  import type { TenantBrand } from "./config";

  export const CURRENT_TENANT_BRAND: TenantBrand = {
    name: "FluentLap",  // ← change this to rebrand, nothing else needs to change
    tagline: "Fluent English, one lap at a time",  // placeholder — update when real
    logoUrl: "/brand/tenant/logo.svg",
    logoDarkUrl: "/brand/tenant/logo-dark.svg",
    faviconUrl: "/brand/tenant/favicon.ico",
    primaryColor: undefined, // use default green theme
    supportEmail: "hello@example.app",
    websiteUrl: "https://example.app",
  };
  ```
- [ ] **No `tenants` table yet** (that's Phase 7). Phase 7 will replace `CURRENT_TENANT_BRAND` with a Convex query. Document this as a planned swap in the Change Log.
- [ ] Place logo assets under `public/brand/tenant/` (generic path, not named after any specific tenant). When the tenant brand changes, you only swap the files — you don't rename the directory.

### 6c — Consume brand config in UI

- [ ] Create `<BrandProvider>` React context in `src/lib/brand/provider.tsx` that exposes both `softwareBrand` (from `config.ts`) and `tenantBrand` (from `current-tenant-brand.ts`)
- [ ] Wrap app in `BrandProvider` in `src/app/providers.tsx`
- [ ] Create `useBrand()` hook
- [ ] **Rigorous audit:** grep the entire codebase for `"Talk Club"`, `"Arabikum"`, `"FluentLap"`, or any other brand-name literal in `.tsx`, `.ts`, `.json`, `.md` files. Every single occurrence in tenant-facing UI must be replaced with `useBrand().tenantBrand.name`. The only allowed literal "FluentLap" in the shipped code is inside `src/lib/brand/current-tenant-brand.ts`.
- [ ] Replace hardcoded logo `<img>` tags with `<Logo variant="light" />` / `<Logo variant="dark" />` component that reads from brand config
- [ ] Page `<title>` uses `${tenantBrand.name}` (dynamically via Next.js `generateMetadata`) — NOT hardcoded
- [ ] Topbar shows tenant logo + name via `useBrand()`
- [ ] Sidebar header shows tenant name via `useBrand()`
- [ ] Email footer template: tenant name as primary sender, with small `Powered by {softwareBrand.name}` line
- [ ] Super-admin portal (doesn't exist yet — built in Phase 7e) is the ONLY surface that shows LinguLab prominently
- [ ] Sign-in / sign-up pages — show tenant brand by default; fallback to LinguLab only if no tenant resolved yet

### 6d — Placeholder logo assets

- [ ] Create directory `public/brand/tenant/` (generic path — not named after any specific tenant, so swapping brands is a file-copy, not a code change)
- [ ] Generate simple text-based placeholder SVG logos for the tenant. Renders the tenant name from `CURRENT_TENANT_BRAND.name` in the primary brand color. Keep them minimal — these exist so the UI doesn't look broken, not to be production-quality design.
  - `public/brand/tenant/logo.svg` (light mode)
  - `public/brand/tenant/logo-dark.svg` (dark mode)
  - `public/brand/tenant/favicon.ico` (simple text-based favicon)
- [ ] Also create `public/brand/lingulab/` with placeholder LinguLab wordmark assets for the super-admin / neutral screens (used by `SOFTWARE_BRAND`)
  - `public/brand/lingulab/logo.svg`
  - `public/brand/lingulab/logo-dark.svg`
  - `public/brand/lingulab/favicon.ico`
- [ ] Verify placeholders render correctly at all common sizes (16px favicon, sidebar, topbar, email header)
- [ ] Document in a `public/brand/tenant/README.md`: "To change the tenant logo, replace these files. No code change needed. The tenant name lives in `src/lib/brand/current-tenant-brand.ts`."

### 6e — Translation file brand strings

- [ ] Audit `messages/en.json`, `messages/ru.json`, `messages/ar.json` for any hardcoded brand strings (product name, tagline, etc.)
- [ ] Replace hardcoded names with interpolation placeholders:
  ```json
  "welcome": "Welcome to {brandName}"
  ```
- [ ] Wire up via `next-intl` — pass `brandName` from `useBrand()` when calling `useTranslations`
- [ ] Add Kazakh locale `messages/kk.json` — same keys, starter translations (can be machine-translated and refined later by admin)
- [ ] Update `src/i18n/config.ts` to include Kazakh: `['en', 'ru', 'ar', 'kk']`
- [ ] Update language switcher component to show Kazakh option
- [ ] Verify Kazakh doesn't require custom font (Cyrillic — Plus Jakarta Sans covers it)

### 6f — Keep the green theme (confirmed)

- [ ] No color changes in Phase 6
- [ ] BUT: verify that `primaryColor` in `TenantBrand` can override the theme if set. Implement CSS variable override via inline `<style>` in the root layout when a tenant sets a custom color. For the initial tenant (currently stubbed as "FluentLap"), leave `primaryColor` as undefined — default green theme applies.

### 6g — Master plan update

- [ ] Append Phase 6 full checklist to `MASTER_PLAN.md`
- [ ] Update header: "LinguLab Platform — Master Plan" + "Current Phase: Phase 6 (renaming)" + "Owner: Mustafa (transitioned from Moumen 2026-04-20)"
- [ ] Add to Architecture Decisions section:
  - **"Software name (LinguLab) is decoupled from tenant name. All tenant-facing UI reads from brand config via `useBrand()`. The active tenant's brand lives in a single file (`src/lib/brand/current-tenant-brand.ts`) during Phase 6; Phase 7 replaces this with a per-tenant Convex query. Changing the tenant brand is a one-file edit, never a code-wide rename."**
  - **"Ownership transitioned from Moumen (original author, Phases 1–5) to Mustafa (Phase 6 onward). Moumen continues operating his Arabic academy independently on his own fork. This codebase serves Mustafa's business."**
- [ ] Add Change Log entries:
  - `2026-04-20 | Ownership transitioned from Moumen to Mustafa | header, ownership note`
  - `2026-04-20 | Software renamed: Arabikum/Talk Club → LinguLab | all brand references`
  - `2026-04-20 | Brand separation architecture introduced: software brand vs tenant brand, single source of truth | Architecture Decisions, file registry`

### Verification
- Start the dev server. Every page a student/teacher/admin sees shows the current tenant name (from `CURRENT_TENANT_BRAND.name`), never "Talk Club", "Arabikum", or "LinguLab".
- Sign-in page shows the tenant brand.
- **Rebrand smoke test:** Edit `src/lib/brand/current-tenant-brand.ts` and change `name` to `"English Hub"` and `primaryColor` to `"oklch(0.5 0.2 260)"`. Reload. Every tenant-facing surface now says "English Hub" and renders in purple. No other code change was required. Revert to original values.
- Kazakh language option appears in the language switcher; UI strings render in Kazakh.
- RTL Arabic still works.
- Favicon + page title reflect the tenant brand.
- grep the codebase for the current placeholder name ("FluentLap"). It should appear in `src/lib/brand/current-tenant-brand.ts` and possibly documentation files — NOWHERE in `.tsx` or `.ts` component code, NOWHERE in translation JSON, NOWHERE in user-visible strings.

---

## Phase 7 — Multi-Tenancy Foundation

> **Goal:** Introduce `tenantId` across the schema. Create the concept of a tenant. Scope all queries. Seed the first tenant as #1 (replacing the Phase 6 file-based brand stub with a database lookup). Everything continues to work for the existing tenant exactly as before.
>
> **Estimated effort:** 2–3 weeks
>
> **Risk:** High — every table touched. Do this carefully, one table at a time, with verification.

### 7a — Tenant schema

- [ ] Create `convex/tenants.ts` with:
  - `tenants` table: `{ slug, name, brandConfig, localeConfig, status, createdAt }`
  - `tenantSettings` table: `{ tenantId, key, value }` (flexible KV for per-tenant config)
  - `userRoles` table: `{ userId, tenantId, role, assignedAt }` (supports multi-role per user)
  - `rolePermissions` table: `{ tenantId, role, permissions: string[] }`
- [ ] Mutation: `createTenant(slug, name)` — super-admin only
- [ ] Mutation: `updateTenantBranding(tenantId, brandConfig)`
- [ ] Query: `getTenantBySlug(slug)`, `listTenants()` (super-admin only)
- [ ] Seed: create the first tenant on first deploy. Use a slug derived from `CURRENT_TENANT_BRAND.name` or prompt during seed script. Do not hardcode "fluentlap" in migration scripts.

### 7b — Add `tenantId` to all existing tables

One table per sub-ticket. Each sub-ticket: add field → migrate existing rows to the first tenant (whatever slug was chosen at seed time) → add index → update queries to filter by tenant.

- [ ] `users` — add `tenantId` + `by_tenant_role` index
- [ ] `lessons` — add `tenantId` + `by_tenant_teacher`, `by_tenant_student` indexes
- [ ] `srsCards` — add `tenantId`
- [ ] `reviewLogs` — add `tenantId`
- [ ] `quizAttempts` — add `tenantId`
- [ ] `scheduleEvents` — add `tenantId`
- [ ] `achievements` — add `tenantId`
- [ ] `studentAchievements` — add `tenantId`
- [ ] `streaks` — add `tenantId`
- [ ] `aiPrompts` — add `tenantId` (each tenant can have their own prompt configs)
- [ ] `certificates` / `certificateTemplates` / `issuedCertificates` — add `tenantId`
- [ ] `schedulePolicy` — add `tenantId`
- [ ] `decks` — add `tenantId`
- [ ] Any other tables discovered during audit — add `tenantId`

### 7c — Tenant scoping wrapper

- [ ] Create `convex/lib/tenantScope.ts`:
  - `requireTenant(ctx)` — returns the current user's tenantId, throws if not set
  - `scopedQuery(ctx, table)` — returns a query builder pre-filtered by tenant
  - `requireSuperAdmin(ctx)` — for cross-tenant operations
- [ ] Refactor `convex/lib/auth.ts` to also enforce tenant match on `requireAuth` / `requireRole`
- [ ] Update all 56+ Convex functions to use `scopedQuery` instead of raw `ctx.db.query`. Audit each one.
- [ ] Add tests: verify tenant A cannot read tenant B's data under any query (critical)

### 7d — Tenant resolution in Next.js

- [ ] Middleware: resolve tenant from subdomain OR path prefix OR query param (dev)
  - Priority: subdomain > path prefix > query param
  - Production: `{tenant-slug}.lingulab.app` (primary) and/or custom tenant domains via CNAME
  - Dev: `localhost:3000/?tenant={slug}`
- [ ] Create `TenantProvider` React context in `src/lib/tenant.tsx`
- [ ] Inject tenant into Convex queries via Clerk JWT custom claim OR query arg
- [ ] Update `AuthProvider` to pick up tenantId from user's Clerk session

### 7e — Super-admin role + platform admin UI

- [ ] Add `isPlatformSuperAdmin` flag to `users` table
- [ ] New module: `admin_tenants` at `/superadmin/tenants` (separate from tenant-admin `/admin`)
- [ ] UI: list tenants, create, suspend, delete, impersonate
- [ ] Audit log for all super-admin actions (`auditLog` table)

### 7f — Master plan update

- [ ] Update schema section in MASTER_PLAN with new tables + `tenantId` fields
- [ ] Add Phase 7 to checklist
- [ ] Change Log entry

### Verification
- Seed a second tenant (`testacademy`). Log in as a user in `testacademy`. Verify: cannot see any of the first tenant's data under any query.
- Super-admin can list both tenants.
- Existing tenant functionality works identically to before the refactor.

---

## Phase 8 — Modular Tabs + Component Registry

> **Goal:** Turn hardcoded tabs/pages into database-driven tab configurations. Introduce a module registry. Admins can add/rename/hide/reorder tabs per role.
>
> **Estimated effort:** 2–3 weeks

### 8a — Module registry

- [ ] Create `src/lib/modules/registry.ts`:
  ```ts
  export interface PlatformModule {
    key: string;
    displayName: Record<Locale, string>;
    render: (props: ModuleProps) => ReactNode;
    configSchema: ZodSchema;
    defaultConfig: () => Record<string, any>;
    allowedRoles: Role[];
  }
  ```
- [ ] Extract each existing page into a module component in `src/modules/`:
  - `src/modules/student/schedule.tsx`
  - `src/modules/student/lessons-list.tsx`
  - `src/modules/student/srs-study.tsx`
  - `src/modules/student/srs-decks.tsx`
  - `src/modules/student/stats.tsx`
  - `src/modules/student/achievements.tsx`
  - `src/modules/student/journey.tsx` (Duolingo path)
  - `src/modules/student/profile.tsx`
  - `src/modules/teacher/dashboard.tsx`
  - `src/modules/teacher/roster.tsx`
  - `src/modules/teacher/calendar.tsx`
  - `src/modules/teacher/lesson-runner.tsx`
  - `src/modules/admin/*` (one file per existing admin page)
- [ ] Each module exports a default export matching `PlatformModule` interface
- [ ] `registry.ts` imports all modules and exposes `getModule(key)`

### 8b — Tabs schema + API

- [ ] New table `tabs`:
  ```
  { _id, tenantId, role, key, title (localized),
    icon, moduleKey, config (json), order, visibleTo, isEnabled }
  ```
- [ ] Convex queries: `listTabs(tenantId, role)`, `getTab(tabId)`
- [ ] Convex mutations: `createTab`, `updateTab`, `reorderTabs`, `deleteTab`
- [ ] Seed default tabs for the first tenant matching current UI (so users see no difference after migration)

### 8c — Tab Renderer

- [ ] Create `src/app/[portal]/[...tabKey]/page.tsx` — catch-all route that:
  1. Resolves portal (`admin` / `teacher` / `student`) and tab key from URL
  2. Fetches tab config from Convex
  3. Looks up module in registry
  4. Validates tab config against module's Zod schema
  5. Renders module with config + user + tenant props
- [ ] Legacy routes (`/student/stats`, `/admin/users`, etc.) redirect to new catch-all
- [ ] Sidebar fetches tabs dynamically per role instead of hardcoded nav

### 8d — Admin tab configurator UI

- [ ] New admin module: `admin_tabs` at `/admin/tabs`
- [ ] UI:
  - Three sub-tabs for student / teacher / admin role tabs
  - List of tabs (drag to reorder)
  - "Add Tab" → pick module from registry, enter title per locale, set icon, set visibility
  - "Edit Tab" → form generated from module's `configSchema` (e.g., using `@hookform/resolvers/zod` + generic form renderer)
  - "Hide Tab" / "Delete Tab"
- [ ] Live preview: admin can switch to "View as student" and see their changes

### 8e — Master plan update

- [ ] Document module registry + tabs in MASTER_PLAN
- [ ] List every module key in the File Registry
- [ ] Change Log entry

### Verification
- Admin adds a new "Community Link" tab to the student portal pointing to `custom_iframe` module with a URL config.
- Students see the new tab immediately.
- Admin reorders tabs; order persists.
- No dev code changes needed for the above.

---

## Phase 9 — Packages, Cohorts, Timezone, Events

> **Goal:** Replace hardcoded mock package data with a real package system. Add group classes (cohorts). Fix timezone handling. Add events module.
>
> **Estimated effort:** 3–4 weeks

### 9a — Timezone refactor

- [ ] Add `timezone: string` (IANA) to `users` table — default timezone per tenant in tenant settings (initial tenant: `Asia/Almaty` for students, `Africa/Cairo` for teachers — adjust as needed)
- [ ] Convert all `scheduleEvents` and `lessons` time fields from strings to UTC timestamps (ms since epoch)
- [ ] Data migration: convert existing records using tenant default tz
- [ ] Install `date-fns-tz` OR use built-in `Intl.DateTimeFormat` for rendering
- [ ] All UI: render times in logged-in user's timezone
- [ ] All Convex time comparisons use UTC
- [ ] Calendar component: ensure DST transitions render correctly

### 9b — Package templates + instances

- [ ] New tables: `packageTemplates`, `packageInstances`, `credits`
- [ ] Schema per `LinguLab-Technical-Specification.md` §5.4
- [ ] Convex CRUD functions
- [ ] Admin module `admin_packages`:
  - Template manager (create, edit, activate/deactivate templates)
  - Per-student assignment UI (pick template or go custom, free-text payment note, override fields)
- [ ] Student profile shows package status (lessons remaining, expiry)
- [ ] Locked state when no active package: user sees welcome + payment CTA only
- [ ] Remove the hardcoded "Standard Plan, 12 lessons remaining" mock

### 9c — Recurring class auto-generation

- [ ] On package assignment: admin picks preferred weekly slot(s) (e.g., Mon/Wed 18:00)
- [ ] System generates N `lessons` records at correct UTC times across package validity
- [ ] Admin can also create individual one-off lessons
- [ ] Teacher can move/cancel individual lessons (policy-bound)

### 9d — Cohorts (group classes) + unified lesson schema

- [ ] New table `cohorts` per §5.5 of spec
- [ ] Refactor `lessons` schema:
  - `studentId: Id<"users">` → `roster: Id<"users">[]` (always array, length 1 for 1-on-1)
  - Add `cohortId?: Id<"cohorts">` (nullable)
  - Add `attendance: Array<{ userId, status, joinedAt? }>`
- [ ] Data migration: convert existing 1-on-1 lessons to roster format
- [ ] Update all queries/mutations that read `studentId` to iterate roster
- [ ] Admin module `admin_cohorts`:
  - Create cohort, add/remove students, set recurring schedule, assign teacher
  - No hardcoded size limit (0 = unlimited, any integer allowed)
- [ ] Lesson Runner: when a cohort class, show all attendees and mark attendance
- [ ] Absent student handling: transcript/summary/flashcards still delivered to them

### 9e — Make-up credits

- [ ] `credits` table: `{ tenantId, studentId, amount, reason, source, appliedToLessonId?, createdAt }`
- [ ] On teacher cancellation: auto-grant credit
- [ ] On student cancellation within policy: auto-grant credit
- [ ] On student cancellation outside policy: no credit
- [ ] Admin can manually grant/revoke credits
- [ ] Student sees credit balance in profile
- [ ] Admin can apply credits when assigning additional lessons

### 9f — Events module

- [ ] New tables: `events`, `eventRSVPs`
- [ ] Fields per §15 of spec
- [ ] Admin module `admin_events`: create/edit events, view RSVP list, mark attended post-event, export CSV
- [ ] Student module `events`: list upcoming, RSVP, cancel RSVP
- [ ] Capacity: any integer; 0 means unlimited (explicit)
- [ ] Price: free-text field — no validation; "Free", "$10", "Bring cookies" all valid
- [ ] Visibility rules: all students | specific packages | specific cohorts | specific users

### 9g — Master plan update
- [ ] Document all new tables in schema section
- [ ] Add Phase 9 checklist
- [ ] Change Log entries per sub-phase

### Verification
- Create a 12-lesson package template. Assign to a student with Mon/Wed 18:00 Almaty time. Verify 12 lessons appear in teacher + student calendars at correct times for each person's timezone.
- Create a cohort with 3 students. Schedule recurring lessons. All 3 see the same lesson. One marks absent — they still get the transcript.
- Teacher cancels a lesson. Student automatically gets a credit. Admin applies it to extend the package.
- Admin creates an online event with capacity 0 (unlimited) and price "$0". 5 students RSVP.

---

## Phase 10 — CRM (Basic), Notifications, Super-Admin Polish

> **Goal:** Ship a basic CRM that extends the existing Students CRM. Add email notifications. Polish the super-admin / tenant management flow. Prepare platform for PaaS onboarding.
>
> **Estimated effort:** 2–3 weeks

### 10a — CRM basic extensions

- [ ] Extend existing Students CRM with:
  - Notes field per student (free-form, admin + teacher visibility)
  - Tags (multi-select, configurable per tenant)
  - Status pipeline configurable per tenant (not hardcoded New/Trial/Active/etc.)
  - Lead capture public form endpoint (POST → `crmLeads` table)
- [ ] `crmLeads` table for unregistered contacts (name, channel, identifier, notes, assignedTo)
- [ ] Admin can convert lead → registered student (creates user + package)
- [ ] **Defer full omnichannel (WhatsApp/Instagram/Telegram) until Meta approval completes**

### 10b — Email notifications

- [ ] Install Resend or Postmark (pick one; Resend is cheaper for low volume)
- [ ] Convex action `sendEmail` at `convex/notifications.ts` — uses `"use node"` runtime
- [ ] Templates: lesson reminder (24h + 1h), new lesson published, payment recorded, package near expiry, welcome email
- [ ] `notificationPreferences` table per user — toggles per event type
- [ ] Cron triggers: class reminders via Convex scheduled functions
- [ ] Admin can preview emails before broadcast

### 10c — Telegram bot (easy win, no Meta approval needed)

- [ ] Register Telegram bot via BotFather
- [ ] Students link their Telegram by scanning a QR or clicking a deep link
- [ ] Bot sends notifications per user preferences
- [ ] Two-way messaging: students can reply (stored in `crmMessages`)

### 10d — Meta approvals — tracking only (parallel to development)

- [ ] Document status in `MASTER_PLAN.md` under "External Dependencies"
- [ ] Checklist: Meta Business Verification → WhatsApp Business API → Instagram Graph API
- [ ] Once approved, activate CRM v2 work (separate phase)

### 10e — Super-admin + tenant onboarding

- [ ] Tenant signup flow at `signup.lingulab.app` (or similar):
  1. New academy fills a form (name, slug, admin email)
  2. Super-admin reviews and approves
  3. Tenant created, admin invited via Clerk
  4. New admin logs in, gets guided setup wizard (tabs, locales, branding, first package template)
- [ ] Billing for PaaS customers: deferred, manual external for now (mirrors tenant-level manual payment approach)
- [ ] Subdomain routing: each tenant gets `{slug}.lingulab.app` automatically

### 10f — Audit log

- [ ] `auditLog` table: admin actions (role changes, user deletes, financial entries, impersonation)
- [ ] Admin UI to browse logs
- [ ] Retention: 3 years minimum

### 10g — Kazakhstan data compliance review

- [ ] Document current data residency status (Convex US region)
- [ ] Decide on approach per spec §18.2 (Option A/B/C)
- [ ] Implement DSAR export/delete for students on request
- [ ] Register as data operator with Kazakhstan state if Option A

### 10h — Master plan update + launch checklist

- [ ] Update MASTER_PLAN with full Phase 6–10 history
- [ ] Pre-launch verification checklist
- [ ] Production deployment runbook
- [ ] Change Log final entries

### Verification
- Telegram notifications working end-to-end.
- Super-admin creates a second tenant via UI. Tenant admin logs in, configures tabs, invites teacher, creates package, activates student. All works.
- Email reminders arrive 24h before lessons.
- Audit log captures all admin actions.
- CSV export works for CRM.

---

## Cross-cutting concerns (apply throughout all phases)

### Testing
- [ ] Every new Convex function has a unit test covering tenant scoping
- [ ] Every module has at least a render smoke test
- [ ] Playwright E2E on critical flows before each phase merge

### Performance
- [ ] Keep per-request Convex calls under 200ms p95
- [ ] AI generation stays async where possible
- [ ] Tab switch should be instant (pre-fetch on hover)

### Documentation
- [ ] Every new module has a header comment explaining purpose + config schema
- [ ] README updated after each phase
- [ ] API changes documented in CHANGELOG

### Deployment
- [ ] Every phase deploys to staging first, soak for 48 hours minimum
- [ ] Rollback plan documented per phase
- [ ] Database migrations are reversible where possible

---

## Open questions (resolve with Moumen before starting each phase)

### Before Phase 6
- [ ] Keep the green theme or full rebrand? Colors?
- [ ] Logo asset ready?
- [ ] Platform domain `lingulab.app` ownership confirmed? (Tenant domain is Mustafa's call once he finalizes the academy name.)

### Before Phase 7
- [ ] Super-admin email addresses
- [ ] Subdomain strategy (`{slug}.lingulab.app` vs `{slug}.platform.com`)?

### Before Phase 9
- [ ] First package templates (names, lesson counts, prices, validity windows)
- [ ] Default student onboarding flow — what does a locked student see exactly?

### Before Phase 10
- [ ] Email provider (Resend / Postmark / SES)?
- [ ] Kazakhstan data residency decision
- [ ] Meta Business approval started? Status?

---

## Glossary

- **Arabikum** — project codename (original, pre-rename)
- **Talk Club** — current deployed brand name (pre-rename)
- **LinguLab** — the software product (this refactor's target name for the platform itself)
- **FluentLap** — placeholder name used during Phase 6 for the first tenant brand stub. Mustafa will replace this with his actual academy name once finalized. Will NOT appear hardcoded anywhere outside `src/lib/brand/current-tenant-brand.ts`.
- **Tenant** — one academy using the platform
- **Module** — a self-contained feature renderer (code)
- **Tab** — a navigable section (database record referencing a module)
- **Cohort** — a named group of students taking recurring classes together
- **Credit** — a unit of owed class time from cancellation

---

*This document extends `MASTER_PLAN.md`. Phases 1–5 completed before this plan. Phases 6–10 implement the LinguLab platform refactor + Mustafa's first tenant launch (placeholder name: "FluentLap", to be renamed).*
