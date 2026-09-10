# Testing contract

## The loop test

The canonical command is:

    npm run test:walk

The persona command is:

    npm run test:walk -- --persona Russian
    npm run test:walk -- --persona Kazakh
    npm run test:walk -- --persona Arabic

For a normal-use walk against an explicitly verified local test/dev deployment and
the existing tenant, use the no-fixture mode:

    npm run test:walk -- --normal-use --persona Russian --base http://localhost:3000

Normal-use mode is fail-closed to localhost targets, does not require or set
`E2E_FIXTURES_ENABLED` / `E2E_ORGANIZATION_ID`, and must not call fixture provisioning,
snapshots, resets, deletes, seeds, or raw Convex mutations. Existing data determines
which stages can run; unavailable prerequisites are recorded as state-dependent `NA`
or a setup blocker.

The magic words are: `run the loop test as [Russian|Kazakh|Arabic] student` (for example, `run the loop test as Russian student`). A runtime agent maps those words to the matching `--persona` value, reads `docs/E2E_RUNBOOK.md` once, provisions only the guarded dedicated E2E organization, and executes the real student + admin + teacher loop.

The routine path uses the real deployed UI, real Soniox upload transcription, and real OpenRouter lesson-content generation. Kaspi is intentionally simulated by the product's manual claim → admin confirmation path; no real money is transferred. A human microphone walk is on-demand only:

    npm run test:real-session -- --persona Russian

That command follows `docs/E2E_RUNBOOK_REAL_SESSION.md` and includes the 60-second human-speaks-into-mic step. It is not part of `test:walk`.

## Prerequisites and safety boundary

- `E2E_FIXTURES_ENABLED=true` must be present in the Convex deployment environment used by the CLI.
- `E2E_ORGANIZATION_ID` must name the requested dedicated E2E organization, match `E2E_DEDICATED_ORGANIZATION_ID`, and be paired with `E2E_DEDICATED_ORGANIZATION_AUTH=verified`. The tenant's server-side settings row must independently mark the organization as dedicated and verified; the launch organization and an arbitrary existing org fail closed.
- `CLERK_SECRET_KEY` is read from the local `.env.local` by `scripts/dev-login.mjs`; it is never printed, committed, or placed in an artifact.
- The three real Clerk dev actors are resolved by the login handoff. Synthetic auth identities are not supported.
- The deployment URL is `E2E_BASE_URL` or the plan default. Convex target is production by default; set `E2E_CONVEX_TARGET=dev` only for an explicitly isolated dev deployment.
- `E2E_BOOKING_DATE`, `E2E_BOOKING_START`, `E2E_BOOKING_END`, and `E2E_TEACHER_MEET_LINK` can override the routine fixture slot. The dedicated fixture org guard remains mandatory.

The executor never calls a global wipe. The fixture reset is org-scoped and only runs through the guarded Convex internal function. It archives historical pack rows rather than deleting purchase history. Do not copy fixture IDs, login tickets, cookies, provider responses, API keys, or connection strings into findings, screenshots, browser events, commits, or chat.

## Artifacts and reading order

Each run writes to:

    .artifacts/test-runs/<timestamp>-<short-sha>/

The required files are:

- `findings.md`: binary evidence and standardized findings.
- `visual-summary.md`: shot/probe/provider counts and `SHIP` or `FIX-N-TEST` verdict.
- `screenshots/`: no more than 24 named PNGs.
- `runbook.md.snapshot`: exact runbook loaded by that run.
- `browser-events.json`: console, pageerror, requestfailed, and relevant navigation events, sanitized.
- `summary.json`: sanitized shot count and runtime token/vision counters when available.

Read `findings.md` first, then `visual-summary.md`, then open only the visual-shortlist or failure evidence needed to understand a finding. The walker process exits nonzero only when it could not start/prep the walk; product findings are reported in the artifacts and do not change the executor exit code.

For a cheap tripwire without the full lesson loop:

    npm run test:smoke

Smoke is text/DOM/network only: anonymous redirects, per-role routing, five daily student surfaces, no raw message keys, no horizontal overflow, and browser error events. It captures no screenshots.

## Runtime model tiers

The eye model is selected at runtime through the configured agent/model (`E2E_WALKER_PROVIDER` and `E2E_WALKER_MODEL` when supported by the executor). A dumb vision-capable model is valid: it follows the probe-first binary checklist and produces a standardized report. A smarter vision model is an improvement in finding quality, not a different contract. DeepSeek/text-only models are suitable for orchestration but are not the routine eye because the required visual shortlist needs vision.

Use DOM/text/CSS probes first. Vision is limited to the six visual-shortlist moments plus failure escalation. The runbook allows one bounded provider retry and one end-of-run escalation only when the severity threshold is reached.

## Maintenance rule

Edit `docs/E2E_RUNBOOK.md` only when the product flow, security boundary, role behavior, supported locale, provider path, or artifact contract changes. Do not edit it for a renamed button that the adaptive walker can re-find. When a flow changes, update the routine runbook and real-session substitution together, then run the focused fixture tests and release gates. Keep the findings schema and screenshot budget stable.

The runbook is not a selector-based Playwright suite. It is an adaptive product-level walk with judgment at the escalation boundary. The walker records findings; it does not fix code during the walk. Fixes are separate implementation tasks followed by a fresh walk.
