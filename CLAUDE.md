# OmniClass — AI Instructions

Multi-tenant language-academy platform (software: **OmniClass**; first tenant: **Omnica English**). Owner: Mustafa (FaFo).

## Files that matter

| File | Purpose |
|---|---|
| `MASTER_PLAN.md` | **Read first.** Platform reference: what exists, standing rules, known-issues queue, deployment. |
| `POLICY.md` | Business policy source of truth (payments, cancellation, no-show, pauses, trials). Never restate it elsewhere — link to it. Don't edit unless FaFo changes policy. |
| `CLAUDE.md` | This file — AI behavior only. |
| `.env.local` | API keys. Never commit or expose. |

## Workflow (FaFo's — do not impose your own)

1. **No phases, no steps, no roadmaps, no audit reports.** FaFo opens a page, dumps what he wants changed, you change it. Make routine calls yourself; ask only when readings genuinely diverge.
2. **Always ship at the end of every task, without asking:** `npx convex deploy` (backend does NOT auto-deploy), then commit + `git push origin master` (Vercel builds frontend). Backend first so new UI never runs against old functions. Flag destructive schema changes in the summary, but ship.
3. Build now, test at the very end. Mobile pass dead last. i18n fix deliberately last.
4. Verify your work in the browser (`node scripts/dev-login.mjs [role]` mints a login URL) rather than asking FaFo to check.
5. When work lands: update MASTER_PLAN §5 (known issues) and §7 (change log). **Attribution mandatory** — tag change-log entries `[Claude]` / `[DeepSeek V4 Pro]` / `[AI-Name]`.
6. Keep MASTER_PLAN minimal and organized — update the relevant section in place, never scatter.

## Tech stack (locked — discuss before changing)

Next.js 16 (App Router, Turbopack) · Tailwind CSS v4 + shadcn/ui · **Convex** (all data; org-scoped via `convex/lib/tenant.ts`) · **Clerk Organizations** (auth; JWT template `convex`) · Soniox v4 STT · OpenRouter LLMs · next-intl (en/ru/ar) · Inter font · Lucide icons. Convex function conventions: `.claude/rules/convex-rules.md`.

## Hard rules (each earned by a real bug — details in MASTER_PLAN §1)

- **Never `new Date(date + "T" + time)` without a timezone.** Stored times are academy wall-clock (Asia/Almaty). Use `wallTimeToMs` / `zonedToInstant`.
- **Reading model locked:** word on the student's list (green) or plain prose. No per-word statuses. One shared `ReadingView` for all portals.
- **`srsCards` is the one word list** — flashcards, My Words, reading tint all derive from it. Card answers = translation into the student's L1 (`users.getLearnerLocale`).
- **Say "lessons", never "points"** in any user-facing copy.
- Logical CSS properties (`ms-`/`me-`/`ps-`/`pe-`) for future RTL. No hardcoded tenant branding — `tenantSettings` owns it.
- No over-engineering. Pre-launch, ~50 students target — build for that.

## Context

- Students are Russian or Arabic speakers learning English; lessons happen over Google Meet (recording must capture both sides — teacher + student audio).
- FaFo uses Mac + Firefox.
- Dev quirk: stale styles in dev → delete `.next` (Turbopack cache).
