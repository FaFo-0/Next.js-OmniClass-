# Testing

OmniClass uses automated developer checks for code correctness and a human-operated runbook for product behavior.

## Developer gates

Run these from the repository root before handing off a code change:

```bash
npm test
npm run typecheck
npx eslint <touched JavaScript/TypeScript files>
npm run build
```

What each gate covers:

- `npm test` runs the repository's Node/TypeScript unit and integration tests in `tests/*.test.ts`.
- `npm run typecheck` checks both the Next.js application and Convex TypeScript projects without emitting files.
- Touched-file lint keeps new or edited JavaScript/TypeScript clean without turning a focused change into a repository-wide lint rewrite. Pass the actual touched source paths to `npx eslint`.
- `npm run build` verifies the production Next.js build and route compilation.

Also run `npm run lint` when preparing a release or assessing overall health. It is a visibility check: report existing repository-wide findings separately and do not fix unrelated legacy lint during a focused task.

If a command fails, preserve its exact exit status and useful error summary. Do not report a gate as passing because a narrower command passed.

## Product QA

Automated developer gates do not prove multi-role behavior, responsive layout, localization, provider interactions, or accounting handoffs. Follow [MANUAL_QA_RUNBOOK.md](MANUAL_QA_RUNBOOK.md) for human product QA across public/auth/onboarding, student, teacher, and admin routes.

The runbook includes:

- PASS / BUG / BLOCKED / NA outcomes and a bug-report template;
- current route-by-route checks and cross-role lifecycle scenarios;
- Russian, Kazakh, Arabic/RTL, mobile, accessibility, validation, loading, error, and empty-state coverage;
- explicit safety boundaries for real-money transfers, destructive actions, provider outages, and Google Meet two-sided audio.

Record the deployment/commit, actors, device/browser/locale, starting state, evidence, final state, and bug totals for each run. Continue independent checks after recording a bug; mark only its true dependents BLOCKED.

## Test maintenance

- Add or update automated tests for stable code contracts, authorization boundaries, accounting/idempotency invariants, and reproduced defects.
- Keep product judgment and real multi-role workflows in the manual runbook rather than adding executable browser-walking machinery or fixture-only product APIs.
- When mounted routes or user-visible behavior change, update `docs/MANUAL_QA_RUNBOOK.md` in the same change.
- Never place credentials, login tickets, private transcripts, or production personal data in test output, screenshots, or repository files.
