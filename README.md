# LinguLab

Multi-tenant language academy platform. One codebase, many tenants: each tenant is an academy (teachers, students, admins, lessons, packages, content). LinguLab handles recording, real-time transcription, AI-generated lesson content (summary / vocab / flashcards / quiz), SRS review, scheduling, and gamification.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Backend / DB / Realtime / Storage | Convex |
| Authentication | Clerk (JWT → Convex) |
| i18n | next-intl (EN / RU / AR with RTL; Kazakh in Phase 6) |
| Transcription | Soniox `stt-rt-v4` (real-time, speaker diarization) |
| LLM | OpenRouter → Gemini 2.5 Flash (via Convex actions) |
| Fonts | Plus Jakarta Sans + Noto Sans Arabic |
| Icons | Lucide React |
| Tables | `@tanstack/react-table` |
| Charts | `recharts` |
| Dates | `date-fns` |

## Dev Setup

```bash
npm install
npx convex dev       # starts Convex backend + generates types
npm run dev          # starts Next.js at http://localhost:3000
```

Required env vars in `.env.local`:

```
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
SONIOX_API_KEY=
OPENROUTER_API_KEY=
```

## Source of Truth

- **`MASTER_PLAN.md`** — current project state, phase checklists, file registry, change log. Read first.
- **`LinguLab-Refactor-Phases.md`** — executable ticket plan for Phases 6–10.
- **`LinguLab-Technical-Specification.md`** — full architectural vision.
- **`CLAUDE.md`** — AI agent behavior rules.

## Ownership

Originally authored by Moumen (Phases 1–5, under the project codename "Arabikum" deployed as "Talk Club"). Ownership transitioned to Mustafa in April 2026. Moumen now runs his own separate Arabic academy and is no longer involved in this codebase.
