# OmniClass production launch — single-tenant refactor, landing page, cutover

> **Status:** plan only. No app code written, nothing purchased, calendar refactor untouched.
> **Supersedes** `.hermes/plans/2026-09-26_200647-production-launch-with-paid-acquisition.md` and `.hermes/plans/2026-09-26_212622-execution-mission.md` (both replaced by this single file).
> **How to use:** hand this to one coding agent in the repo root and paste the handoff prompt in §7. Tasks marked `HUMAN:` are the only ones an agent must not attempt; each has steps written for a non-technical person.

**Goal:** OmniClass live on `omnicaenglish.com` with a public landing page, working public sign-up, Clerk reduced to an identity provider (no Organizations), and a production deployment with no dev-era data.

**Architecture:** the same Next.js app on Vercel serves the landing page, Clerk auth and all three portals on one domain. Convex stays on `valuable-loris-929` (`*.convex.cloud`). The production Clerk instance replaces the dev instance currently trusted in production. Dev-era Convex rows are deleted, not migrated.

**Stack:** Next.js 16 · Convex · Clerk (identity only — Organizations dropped) · Vercel · next-intl (en/ru/ar/kk)

---

## 1. Decisions (locked by FaFo 2026-09-26)

- **Single academy, no Clerk Organizations.** OmniClass runs as one business for a year or more; tenancy is revisited later. Clerk becomes sign-in/sessions/email only → **$0 forever** at this scale (50,000 retained users free, no member cap, no add-on).
- **"Forget tenants" does not mean deleting the tenancy code.** `organizationId`, `tenantTable`, indexes and every query stay exactly as they are and hold a single constant value. Removing them would mean rewriting ~40 domain files for no benefit and would destroy the year-2 option.
- **The tenant id keeps its existing string** (`org_3DIbJAWeR5CjVaBRlB4AZXL1UpD`), exposed as a named `ACADEMY_ID` constant. It is now an opaque tenant key, not a Clerk reference. This keeps existing `tenantSettings` (branding, policies), catalogue, achievements and prompt configs valid with no data rewrite. Renaming it later is a separate task requiring a row rewrite.
- **Start clean:** deletion of production rows is authorized; that is not a migration.
- **Shipping rule unchanged:** after each phase the agent ships (`npx convex deploy` → commit → `git push origin master`). FaFo tests on the deployed site, not localhost, and there are no clients yet. This is relaxed once there are real users.
- **Two agent runs, one stop between them:** Phase A (auth refactor) → STOP POINT 1 → Phase B (landing + legal).
- **Nothing from Clerk is ever purchased.**

---

## 2. Verified facts (checked 2026-09-26 — cheap to re-verify)

| Fact | Evidence |
|---|---|
| Live root `/` is a redirector; middleware sends unauthenticated visitors to Clerk sign-in | `src/app/page.tsx`, `src/middleware.ts`; `curl -I https://next-js-omni-class.vercel.app/` → 307 to `secure-husky-22.accounts.dev` |
| Production Convex trusts the **Clerk dev instance** | `npx convex env get CLERK_JWT_ISSUER_DOMAIN --prod` |
| Production Convex `APP_URL` is the vercel.app URL | `npx convex env get APP_URL --prod` |
| Production data is demo-only (no real students) | `npx convex data users --prod` → 5 rows, 4 real identities, 1 duplicate admin row; 16 scheduleEvents, 12 lessons, 8 billingPlans, 0 teacherVacancies |
| `omnicaenglish.com` is **available**; Vercel registrar price **$11.25/yr purchase and renewal** | `npx vercel domains check omnicaenglish.com`; `npx vercel domains price omnicaenglish.com` |
| Vercel CLI can buy/attach domains, manage env vars, redeploy, promote | `vercel domains buy/add/check/price`, `vercel env`, `vercel redeploy`, `vercel promote` (CLI 60.1.3) |
| Clerk CLI can do the production deploy from the terminal | `clerk auth login` (browser OAuth), `clerk deploy` + `deploy status`, `clerk link`, `clerk env pull --instance prod`, `clerk api`, `--mode agent` |
| Vercel CLI is currently logged out | `npx vercel whoami` → "Logged out" |
| Tenancy resolves through one function | `readOrgId()` at `convex/lib/tenant.ts:24` |
| Admin role does not come from Clerk org roles | `upsertFromAuth` path 2 links a **pre-created row matched by email** (`convex/users.ts:826-843`); role is read from that row |
| Clerk free tier caps 20 members per org; only the $100/mo B2B add-on lifts it; Clerk Pro does not | clerk.com/pricing, clerk.com/docs/guides/organizations/configure |
| Vercel free-domain offer covers only `.app .dev .online .site .space .store .tech .website` — **not `.com`** | vercel.com/docs/domains/free-domain-with-pro |
| Vercel Pro is $20/mo; Hobby is non-commercial personal use only | vercel.com/pricing |
| Lesson audio uploads in 2-minute chunks and is never pruned | `convex/lessonAudio.ts` header comment |

---

## 3. Cost model

| Stage | Monthly | One-off |
|---|---|---|
| A. Code + landing, still on Hobby + dev Clerk | $0 | $0 |
| B. Public + ads running | **$20** (Vercel Pro — required, Hobby is non-commercial) | **$11.25** (`omnicaenglish.com` via Vercel CLI; buying through Vercel keeps DNS in the same CLI the agent drives) |
| C. Any number of students | **$0** — no Clerk plan, no add-on, ever | — |
| D. Lesson audio passes 1 GB | **+$25** (Convex Professional) — or add pruning (B7) and stay free | — |

Variable, unchanged: Soniox ≈ $0.40 per 60-minute lesson, OpenRouter usage, ad spend.

---

## 4. HUMAN steps — four, all one-time

None can be delegated: they involve FaFo's accounts and his card. **Never type a password, card number or verification code into chat, a file, or a terminal command.**

**HUMAN-1 — Log in to Vercel (2 min).** Terminal → `npx vercel login` → browser opens → Continue → back to Terminal. If it asks for a scope, pick `fafo-s-projects`. Then tell the agent "HUMAN-1 done".

**HUMAN-2 — Upgrade the team to Pro (5 min).** vercel.com/dashboard → team `fafo-s-projects` → Settings → Billing → Upgrade to Pro → enter card yourself → choose **monthly** ($20), not annual. Tell the agent "HUMAN-2 done".

**HUMAN-3 — Log in to Clerk (2 min).** Terminal → `npx clerk auth login` → browser → sign in to the account that owns the current app (`secure-husky-22`) → approve. Tell the agent "HUMAN-3 done".

**HUMAN-4 — Approve the production switch, only when the agent asks at Task C7.** This is the moment the live site stops accepting the old sessions and dev-era rows are deleted. Nothing before it affects anyone.

---

## 5. Phase A — single-tenant auth refactor (agent run 1)

Do this first and alone. It is the safety-critical change; everything else is cosmetic beside it.
**Post-condition:** the app runs with zero Clerk Organizations; `organizationId` keeps working as a constant tenant key; every existing guard still fires.

### A1 — Constant tenant id
`convex/lib/tenant.ts:24` — `readOrgId()` returns `ACADEMY_ID` (exported from the same file, value = the existing org string, with a comment that it is now an opaque tenant key). Apply the same change in `requireTenantAction` (~line 67).
Verify: `npx convex codegen` and `npm run typecheck` pass; `grep -rn "identity.org_id\|org_role" convex/` is empty.

### A2 — Provisioning without org roles
`convex/users.ts:788-859` — `upsertFromAuth`: delete the `orgRole → mappedRole` mapping (lines 796-802) and insert new rows as `"student"`. **Keep** path 1 (existing `tokenIdentifier` link) and path 2 (pre-created row by email, lines 826-843 — this is how admin and teacher rows claim their role). Keep the `by_organization_and_email` lookup keyed on `ACADEMY_ID`.
Verify: a fresh signup with no pre-created row becomes `student`; a pre-created row keeps its role.

### A3 — Remove the auto-join route's Clerk work
`src/app/api/auth/auto-join/route.ts` exists only to create a Clerk membership. Delete the tenant resolution and membership creation, or delete the route if nothing else needs it.
Verify: `grep -rn "auto-join" src/ convex/ docs/` — update every reference (middleware, post-signup page) so nothing calls a dead endpoint.

### A4 — Teacher invite without Clerk membership
`src/app/api/auth/teacher-invite/accept/route.ts` — delete the Clerk membership upsert (calls near lines 72 and 87) and the `org:teacher` role. **Keep** the invite cookie, token validation, and the `tenantSettings.acceptTeacherInvite` mutation (line 121) — it already sets `role: "teacher"` in Convex and is Clerk-independent.
Verify: a valid invite flips the Convex role to `teacher`; an invalid/expired token is still rejected.

### A5 — Middleware
`src/middleware.ts` — remove the "signed in but no active organization → /onboarding/select-org" block (lines 28-31) and the dead `isOrgSelectRoute` entry for `select-org`. Keep `/onboarding/post-signup` and the surviving auth routes reachable for signed-in users.

### A6 — Delete the org selector
Delete `src/app/onboarding/select-org/page.tsx` and any import or link pointing at it.

### A7 — Post-signup page
`src/app/onboarding/post-signup/page.tsx:35,71` — remove `setActive({ organization })` and the org dependency; keep routing new students into onboarding.

### A8 — Client auth gate
`src/lib/auth.tsx:44-70` — remove `useOrganization`; gate the `upsertFromAuth` effect on `clerkLoaded && isSignedIn`; drop `organization` from the dependency array.

### A9 — Sweep
`grep -rn "useOrganization\|OrganizationList\|OrganizationSwitcher\|org_id\|orgRole" src/ convex/` — every hit must be either the `ACADEMY_ID` constant or a plain data field.

### A10 — One focused regression test (earned)
Prove the isolation guard still works: a user row whose `organizationId` differs from `ACADEMY_ID` makes `requireTenant` throw `Cross-tenant access denied` (`convex/lib/tenant.ts:56`). No broader tests restating the refactor.

### Phase A gates (in order, all must pass)
```
npx convex codegen
npm run typecheck
npm test
npm run build
node scripts/dev-login.mjs student   # then teacher, then admin — confirm each portal loads
```
Then ship: `npx convex deploy` → commit → `git push origin master`.

**STOP POINT 1** — report: files changed; exact gate output; which portals were verified in a browser and how; anything not verified; next step. **Do not start Phase B before this report exists.**

---

## 6. Phase B — landing page, legal pages, attribution (agent run 2)

**Post-condition:** a signed-out visitor on the production URL sees a real page in Russian with live prices and working Sign in / Start buttons; ad traffic is attributable; Meta/Google ad review would accept the site.

### B1 — Public landing page
`src/app/page.tsx` is currently a role-redirector. Move that logic to `src/app/portal/page.tsx` and make `/` a real marketing page. Requirements: Russian-first copy (POLICY §0), mobile-first layout (ad traffic is phone traffic), hero, what Omnica English is, how a lesson works, lesson packs with real KZT prices, how paying by Kaspi works, the trial credit, a WhatsApp contact button, and Sign in / Start buttons. Reuse the tenant branding/policy values the student billing page reads so the page cannot contradict the product.

### B2 — Live prices
Add a public read-only query in `convex/billing.ts` returning the published catalogue (family, pack name, price, lesson count, expiry, benefits) for the signup tenant; consume it on the landing page. No hardcoded prices.
Verify: change a price in `/admin/billing`, reload the landing page.

### B3 — Legal pages
Create `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`: data collected (name, contact, timezone, native language, lesson recordings and transcripts), recording consent per POLICY §8, minors' guardian consent, payment handling, retention, contact. Link both from the landing footer.
Verify: both render signed-out.

### B4 — Middleware public routes
`src/middleware.ts` — add `/`, `/privacy`, `/terms` to `isPublicRoute`.
Verify: `curl -I` on each returns 200 signed-out, not a Clerk redirect.

### B5 — Ad attribution
Capture `?utm_source` / `?utm_medium` / `?utm_campaign` / `?ref` on the landing, carry them through sign-up, and write them to `studentOnboarding.referralSource` (field exists) at onboarding submit.
Verify: visit `/?utm_source=test-ad`, complete signup + onboarding on dev, read the `studentOnboarding` row.

### B6 — Metadata
`src/app/layout.tsx` — real title, description and OG image so link previews in ads and WhatsApp look deliberate.

### B7 — Optional, decides Stage D cost
`convex/lessonAudio.ts` — chunks are never deleted, so file storage grows forever. Add pruning (drop superseded chunks, keep the latest) or accept Convex Professional at $25/mo. Recommended: add pruning.

### Phase B gates
The same four commands as Phase A, plus a signed-out browser check of `/`, `/privacy`, `/terms` on the deployed site, then ship.

**STOP POINT 2** — report the deployed URL and the verification list.

---

## 7. Phase C — production cutover

Prerequisites: Phases A and B shipped and verified; HUMAN-1/2/3 done.

**C1 — Domain**
```
npx vercel domains check omnicaenglish.com
npx vercel domains buy omnicaenglish.com       # spends money — ask FaFo first
npx vercel domains add omnicaenglish.com next-js-omni-class
npx vercel domains inspect omnicaenglish.com   # expect valid + certificate issued
```
DNS is Vercel-managed because the domain is registered there, so no third-party DNS step is needed.

**C2 — Clerk production instance**
```
npx clerk link
npx clerk deploy          # creates/deploys the production instance
npx clerk deploy status   # repeat until DNS + SSL report ready
```
Configure: no organizations, no custom roles, JWT template named exactly `convex` (no org claims). Leave `OPENROUTER_API_KEY`, `SONIOX_API_KEY` and the Telegram variables unchanged.

**C3 — Production keys into Vercel without exposing them**
```
npx clerk env pull --instance prod --file .env.prod-pull
npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production < .env.prod-pull
npx vercel env add CLERK_SECRET_KEY production < .env.prod-pull
rm .env.prod-pull
```
Never print, copy or commit key values. `.env*` is gitignored — confirm the file is gone afterwards.

**C4 — Convex production environment**
```
npx convex env set CLERK_JWT_ISSUER_DOMAIN <production issuer domain> --prod
npx convex env set APP_URL https://omnicaenglish.com --prod
```

**C5 — Backend deploy:** `npx convex deploy` (before the frontend serves new UI).

**C6 — Frontend deploy:** `npx vercel --prod` or push to master. Verify on the vercel.app URL before the custom domain.

**C7 — `HUMAN:` approve the clean start.** Ask in one line: "Approve deleting dev-era production rows and the duplicate admin row, and switching the live site to production Clerk keys?" Wait for an explicit yes.

**C8 — Clean start (after approval)**
- export first: `npx convex export --prod --path /tmp/omniclass-prod-backup.zip`
- delete dev-era rows and the duplicate admin row (`warp.smp@gmail.com`, `tokenIdentifier: "t"`) via a reviewed maintenance mutation or targeted script, printing counts before and after
- **pre-create the staff rows** (admin + teacher) with correct roles **before** those accounts sign in — `upsertFromAuth` inserts unknown identities as `student` and only a pre-created row matched by email preserves the role
- re-seed the catalogue with the standing launch-config helper

**C9 — Verification**
- fresh signup on `https://omnicaenglish.com` → `/onboarding/student`, row role `student`
- teacher invite → `/onboarding/teacher`, row role `teacher`
- admin sign-in resolves the pre-created admin row, not a new student row
- every portal loads per role; sign-out then sign-in works
- `node scripts/dev-login.mjs [role]` still works
- landing, `/privacy`, `/terms` render signed-out
- attribution lands on a disposable signup; delete that test identity afterwards

**C10 —** make the custom domain primary; confirm both URLs behave.

**STOP POINT 3** — report domain status, deploy IDs, verification results, deleted row counts, anything not verified.

---

## 8. Approval boundary

- **May run without asking:** code edits, tests, `npx convex deploy`, commits, `git push origin master`, read-only `vercel`/`clerk` commands.
- **Must ask first:** buying the domain, the Vercel Pro upgrade, deleting production rows, swapping production Clerk keys, anything that spends money or is irreversible.
- **Never:** type, print or commit a password, card number, verification code or secret value.

## 9. Handoff prompt (paste into the agent)

```
Repo: /Users/fafo/Desktop/Projects/Next.js OmniClass
Read first: AGENTS.md, MASTER_PLAN.md, and
.hermes/plans/2026-09-26_212622-production-launch-plan.md (this plan).

Execute Phase A only (Tasks A1–A10) and stop at STOP POINT 1.

The tenancy refactor is safety-critical: keep every organizationId field and every
guard exactly as-is; only the SOURCE of the tenant id changes, to the ACADEMY_ID
constant in convex/lib/tenant.ts, whose value stays the existing org string.

Rules:
- The repo's always-ship rule applies: after all gates pass, run npx convex deploy,
  commit and git push origin master. FaFo tests on the deployed site, not localhost.
- Do not buy a domain, change Clerk or Vercel account settings, delete production
  data, or swap production keys — that is Phase C and needs explicit approval.
- Never print or commit a secret.
- Run the exact Phase A gates and paste their output.

Report: files changed; gate commands and results; which portals you verified in a
browser and how; anything not verified; next step.
```

---

## 10. Risks / open questions

1. **Convex free-tier storage (1 GB) vs unpruned lesson audio** — decide by adding pruning (B7) or budgeting $25/mo.
2. **Teacher capacity and manual payment verification are the real limits on ad spend**, not software: 20 students at one lesson/week ≈ 20 teaching hours/week with you plus one teacher, and every pack purchase is a manual Kaspi check by an admin.
3. **Vercel Hobby must not serve paid traffic** — commercial-use restriction; Pro is required at Stage B.
4. **The calendar refactor must land before the cutover**, since the cutover touches the same deployment.
5. **The pre-created staff-row requirement (C8)** is easy to miss and silently produces a `student` role for the admin.

## 11. Not in scope

No payment gateway. No second marketing site. No cross-organization migration. No i18n expansion for staff portals beyond what exists. No Clerk purchases of any kind.

## 12. Files likely to change

- `convex/lib/tenant.ts` (constant tenant id) · `convex/users.ts` (provisioning)
- `src/app/api/auth/auto-join/route.ts` · `src/app/api/auth/teacher-invite/accept/route.ts`
- `src/middleware.ts` · `src/lib/auth.tsx`
- `src/app/onboarding/select-org/page.tsx` (delete) · `src/app/onboarding/post-signup/page.tsx`
- `src/app/page.tsx` (landing) · `src/app/portal/page.tsx` (new role-redirect target)
- `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` (new) · `src/app/layout.tsx`
- `convex/billing.ts` (public catalogue query) · `convex/onboarding.ts` (attribution)
- `convex/lessonAudio.ts` (optional pruning)
- `MASTER_PLAN.md` §4/§5/§7 · `docs/PRODUCTION_AUTH_AND_DOMAIN.md` (correct the free-domain and Clerk-cost assumptions, remove the org steps)
