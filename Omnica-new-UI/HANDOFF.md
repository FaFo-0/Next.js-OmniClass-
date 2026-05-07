# OmniClass — Session Handoff

> **Date:** May 7, 2026
> **Stack:** Next.js 16 (App Router, Turbopack) · Tailwind CSS v4 · TypeScript
> **Target backend:** Convex + Clerk (Organizations)
> **Status:** UI complete, backend scaffolded, ready for backend wiring

---

## Quick Start

```bash
npm run dev     # → http://localhost:3000 → redirects to /portal
npm run build   # Clean build, 0 errors
```

No `.env` needed for UI demo. The app uses mock data (`lib/mock-data.ts`).

---

## Architecture

```
app/
├── layout.tsx                    Root layout (Inter font, globals)
├── page.tsx                      Redirect / → /portal
├── globals.css                   Full design system (tokens, components, layout)
├── portal/
│   ├── layout.tsx                Role-aware sidebar + topbar (student/teacher/admin)
│   ├── page.tsx                  Role-switching dashboard (1 file, 3 views)
│   ├── lessons/page.tsx          Student: lesson list with search, tabs
│   ├── lessons/[id]/page.tsx     Student: AI summary, vocab grid, flashcards, quiz
│   ├── study/page.tsx            Student: SRS engine (deck select → flip → rate)
│   ├── vocabulary/page.tsx       Student: searchable word table with TTS
│   ├── calendar/page.tsx         Shared: day/week/month calendar (toolbar present)
│   ├── achievements/page.tsx     Student: locked/unlocked grid with progress
│   ├── profile/page.tsx          Student: avatar, stats, subscription, sign out
│   ├── library/page.tsx          Shared: CEFR-filtered book grid + full-screen reader
│   ├── sessions/page.tsx         Teacher: recording list with status/workflow
│   ├── sessions/[id]/page.tsx    Teacher: transcript/summary tabs, sticky action bar
│   ├── transcribe/page.tsx       Teacher: full-screen dark live recording UI
│   ├── students/page.tsx         Teacher: student roster table
│   ├── reports/page.tsx          Teacher: engagement table + pipeline stats
│   ├── people/page.tsx           Admin: combined page with 3 sub-tabs (Students/Instructors/Permissions)
│   ├── billing/page.tsx          Admin: invoices/subscriptions/payments tabs
│   ├── settings/page.tsx         Admin: scrollable (Branding → AI → Achievements → Scheduling)
├── middleware.ts                  Pass-through proxy (Clerk/intl stripped for demo)

components/
├── role-provider.tsx             React context: role state + switcher
├── convex-provider.tsx           Convex client (not wired in layout yet)
├── tenant-provider.tsx           Tenant branding (not wired yet)
├── shared/
│   ├── sidebar.tsx               SidebarItem, SidebarSection, SidebarNav
│   ├── bottom-nav.tsx            Mobile student bottom nav (Home/Lessons/Study/Calendar/Profile)
│   ├── icons.tsx                 55+ SVG icons (home, book, brain, video, users, etc.)
│   ├── status-pill.tsx           Status badges (Active/Paused/Cancelled/Trial/Draft/Paid...)
│   ├── metric-card.tsx           Stat card with icon, value, label
│   ├── page-header.tsx           Page title + subtitle + right actions
├── ui/
│   ├── button.tsx                shadcn Button component
│   └── card.tsx                  shadcn Card component

lib/
├── mock-data.ts                  All prototype data (tenant, student, lessons, vocab, etc.)
├── utils.ts                      cn() utility (clsx + tailwind-merge)
├── convex.ts                     Convex HTTP client
├── clerk.ts                      Clerk helpers
├── soniox.ts                     Soniox STT API wrappers
└── openrouter.ts                 OpenRouter LLM API wrappers

convex/
└── schema.ts                     19 tables (tenants, users, lessons, vocab, SRS, billing, etc.)

messages/
├── en.json, ru.json, ar.json     i18n messages (not wired — next-intl stripped for demo)

project/                          Original prototype files (reference only)
public/
└── logo-mark.svg                 Omnica logo mark
```

---

## Design System (1:1 from prototype)

### Colors
| Token | Value | Usage |
|---|---|---|
| `--brand-purple` | `#6716A4` | Primary brand, sidebar gradient |
| `--brand-yellow` | `#FFCA00` | Active sidebar items, gold accents |
| `--app-bg` | `#FFF9E6` | Page background (warm cream) |
| `--sidebar-bg` | `#3D0D6B` | Sidebar base |

### Sidebar
- Dark purple gradient (`#4E1280` → `#350B61` → `#2A0850`)
- Active items: gold gradient (`#FFCA00` → `#FFD633`) with gold shadow
- Collapses to 60px icons-only, yellow expand button at top
- Serif logo: "Omnica.english" in gold

### Cards
- White bg, `rgba(103,22,164,0.06)` border, 12px radius
- Purple-tinted shadow (`0 2px 12px rgba(103,22,164,0.1)`)
- Hover: enhanced shadow

### Topbar
- 60px, `#FFFDF7` bg, sticky
- Gold 3px gradient stripe at top
- Contains: role breadcrumb, tenant pill, language switcher, role switcher, notification bell

---

## Features Implemented

### Student Portal (8 pages)
| Route | Features |
|---|---|
| `/portal` | Welcome banner, streak card, purple gradient "Next Up" card (join class countdown), study due card, 4 stat cards, recent lessons |
| `/portal/lessons` | Searchable list, tabs (All/Upcoming/Past), lesson rows with word badges |
| `/portal/lessons/[id]` | AI summary (expandable), vocab grid with TTS speaker buttons, flashcard preview flip, interactive quiz with scoring |
| `/portal/study` | Deck selection screen, SRS flashcards with 3D CSS flip animation, 4 rating buttons (Again/Hard/Good/Easy), progress bar, session complete celebration |
| `/portal/vocabulary` | Searchable table, speaker TTS buttons, filter chips, "Create deck" button |
| `/portal/calendar` | View switcher (Day/Week/Month), toolbar with navigation, Google-style time grid placeholder |
| `/portal/achievements` | Stat cards, locked/unlocked grid (grayscale locked, gold-border unlocked), progress bars |
| `/portal/profile` | Avatar, stats grid (Lessons/Words/Streak), subscription progress bar, sign out |

### Teacher Portal (6 pages)
| Route | Features |
|---|---|
| `/portal` | Today's classes, recent recordings, stat cards, quick action buttons |
| `/portal/sessions` | Recording table with status/workflow pills, "Start Session" button |
| `/portal/sessions/[id]` | Tabbed (Transcript/Summary/Vocabulary/Flashcards/Quiz), editable textarea, sticky action bar (Save/Generate/Publish/Delete) |
| `/portal/transcribe` | Full-screen dark mode, elapsed timer, mic/tab indicators, live transcript area |
| `/portal/students` | Student roster table with avatar, status, lessons, activity |
| `/portal/reports` | Engagement table + pipeline stats (Total/Finalized/Draft/Failed) |

### Admin Portal (6 pages)
| Route | Features |
|---|---|
| `/portal` | Metric cards (Teachers/Students/Sessions/AI), Monthly P&L card, subscription summary |
| `/portal/people` | 3 sub-tabs: Students table, Instructors table, Permissions role-capability matrix |
| `/portal/calendar` | Shared calendar |
| `/portal/library` | Shared library |
| `/portal/billing` | 3 tabs: Invoices table, Subscriptions table, Payments |
| `/portal/settings` | Scrollable: Branding (name/color/logo/toggles), AI Manager (4 prompt cards + cost summary), Achievements (definition cards), Scheduling Policies (windows + credit auto-grant toggles) |

### Library (all roles)
| Route | Features |
|---|---|
| `/portal/library` | CEFR filter chips (A2/B1/B2/C1), book cards with gradient covers, full-screen ReadingView with clickable words → dictionary popover, font size controls (A+/A-), save-to-flashcards, teacher mode with student selector |

### App Shell
- **Role switcher:** dropdown in topbar (like language picker) — Student / Teacher / Admin
- **Collapsible sidebar:** chevron toggle → 60px icons-only with yellow dot badges
- **Language switcher:** EN/ES/PT/FR/AR/TR dropdown
- **Mobile:** Bottom nav for student role only

---

## What's NOT Done (for next session)

### Backend
1. **Convex:** Schema is defined (`convex/schema.ts` — 19 tables). Queries/mutations/actions need to be written. Run `npx convex dev`.
2. **Clerk:** Provider removed from layout for demo. Add `ClerkProvider` back in `app/layout.tsx`, configure Organizations. Re-add `@clerk/nextjs` middleware.
3. **Soniox STT:** API wrappers in `lib/soniox.ts` — wire to Convex actions.
4. **OpenRouter LLM:** API wrappers in `lib/openrouter.ts` — wire to Convex actions.
5. **next-intl:** Message files exist (`messages/`). Re-add plugin to `next.config.ts`, re-add provider to layout, re-add middleware.

### UI Gaps
- **Student Calendar:** Full WeekCalendar component with time grid and colored event chips (prototype has it in `components.jsx` lines 238-350 — needs porting to React/TSX)
- **Teacher Transcribe:** Live audio capture + streaming to Soniox (UI shell done, real functionality needs wiring)
- **Admin Permissions:** Currently hardcoded — needs real role-permission data from Convex
- **Admin Library Management:** Upload modal + management table (prototype `AdminLibrary` in `library.jsx`)

### Design Fidelity
- The prototype's `data.jsx` MOCK object is fully replicated in `lib/mock-data.ts`
- All CSS classes from `tokens.css` + `layout.css` are in `app/globals.css`
- Icons match the prototype's 55+ SVG paths exactly
- Status pills match the original color mapping exactly

---

## Key Patterns

- **All pages are `"use client"`** — ready for Convex hooks when backend is wired
- **Mock data** lives in `lib/mock-data.ts` as a plain object — swap with Convex `useQuery` calls
- **Role state** is managed via `RoleProvider` context (`components/role-provider.tsx`) — shared between sidebar and dashboard
- **No page reloads** — all navigation is Next.js `<Link>` client-side
- **Styles are inline objects** matching the prototype's React inline styles (no Tailwind classes needed in pages)
- **Design tokens** are CSS custom properties in `globals.css` matching `tokens.css` exactly

---

## Prototype Reference

The original Claude Design prototype lives in `project/`:
- `Omnic-Portal.html` — entry point
- `app.jsx` — app shell, router, sidebars
- `components.jsx` — shared components (Modal, Tabs, SearchInput, WeekCalendar, etc.)
- `student.jsx`, `teacher.jsx`, `admin.jsx`, `library.jsx` — page components
- `data.jsx` — MOCK object
- `tokens.css`, `layout.css` — design system
- `OMNIC_PORTAL_DESIGN_SPEC.md` — detailed spec (updated to Next.js stack)
- `Handoff notes.md` — backend architecture notes
