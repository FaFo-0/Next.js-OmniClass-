# OmniClass Platform — AI Instructions

## How This Project Works

This is the **OmniClass Platform** — a multi-tenant language academy platform (software name: **OmniClass**). the files you see are the result of refactoring the old single-tenant code. See the `MASTER_PLAN.md` file to understand the context and current progress. 

## Critical Files

| File | Purpose |
|------|---------|
| `MASTER_PLAN.md` | **READ THIS FIRST.** Full project plan, phase checklists, design specs, architecture decisions, and change log. This is the single source of truth. |
| `CLAUDE.md` | This file. AI behavior rules. |
| `.env.local` | API keys (Soniox, future OpenAI). Never commit or expose. |

## Rules for AI Assistants

### 1. Always Check the Master Plan First
Before starting any work, read `MASTER_PLAN.md` to understand:
- What phase we're in
- What's already been done (checked items)
- Current design specs (colors, fonts, architecture)
- Known bugs and notes

### 2. Update the Master Plan When You Complete Work
After finishing a task, go to `MASTER_PLAN.md` and:
- Check off completed items in the relevant phase checklist (`- [x]`)
- Add any new files you created to the file registry
- Note any decisions made in the Change Log section

### 3. Update the Master Plan When Fundamentals Change
When Mustafa asks to change something fundamental (colors, fonts, architecture, data shapes, tech stack, workflow), you MUST:
- Find the relevant section in `MASTER_PLAN.md`
- Update it to reflect the new reality
- Add an entry to the Change Log at the bottom with the date and what changed
- **Do NOT scatter changes** — keep them in the appropriate section so information stays organized

### 4. Don't Re-Read the Whole Plan Every Turn
The master plan is long. Only re-read sections relevant to your current task. The checklist structure lets you quickly scan what's done vs. pending.

### 5. Design & UX Principles
- Mustafa is pragmatic — no over-engineering, no premature abstractions
- Build iteratively: get it working, then polish
- Use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`) everywhere for future RTL
- English first then Russain and last Arabic
- Keep it clean, professional and modern

### 6. Tech Stack (Do Not Change Without Discussion)
- **Framework:** Next.js 16 (App Router, Turbopack)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **State:** Zustand with localStorage persistence (Phases 1-4)
- **Backend:** Supabase (Phase 5)
- **Transcription:** Soniox v4 real-time (`@soniox/speech-to-text-web`)
- **AI:** TBD provider, abstracted behind prompt config system (Phase 2)
- **Font:** Plus Jakarta Sans
- **Icons:** Lucide React

### 7. Project Structure
All source code lives in `src/`:
```
src/
  app/           — Next.js App Router pages and layouts
  components/    — Reusable UI (ui/ = shadcn, others = custom)
  lib/
    store/       — Zustand stores (shapes mirror future Supabase tables)
    mock-data/   — Pre-written mock content
    soniox/      — Soniox transcription wrapper
```

### 8. Known Context
- Mustafa want to run a language learning academy for english
- Students are Russian or arabic speakers learning english
- Lessons happen over **Google Meet** — the recording needs to capture BOTH sides of the call (teacher + student audio), not just the local microphone and must be saved to the cloud
- Mustafa uses Mac with firefox browser
- The platform must eventually support real-time transcription of full meeting audio (system audio + mic)
