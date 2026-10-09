# Production Clerk and custom-domain runbook

Use this after the single-tenant auth refactor when replacing the current Clerk development instance or attaching the launch domain. Never copy key values into this file.

## Identity model

OmniClass uses Clerk for identity, sessions, email, and the `convex` JWT template only. It does not use Clerk Organizations, Clerk organization roles, organization activation, or organization membership limits.

Convex retains every `organizationId` field, index, query scope, and authorization guard. The one production academy is the opaque `ACADEMY_ID` value already stored on its existing rows. Do not rename that value without a separately approved data rewrite.

Application roles live in Convex:

- Unknown identities are provisioned as `student`.
- A pre-created admin or teacher row is linked by its matching email and retains its stored role.
- A valid teacher invite changes the authenticated Convex user to `teacher`.

## Clerk and Convex configuration

In the production Clerk instance:

1. Create a JWT template named exactly `convex`, with no organization claims.
2. Add the final application origin and callback/redirect URLs. Keep the Vercel production URL during transition.
3. Do not configure Organizations, custom organization roles, or a production academy organization.

Set the Convex production environment variable:

```text
CLERK_JWT_ISSUER_DOMAIN=<exact production Clerk issuer domain>
```

Keep the existing `OPENROUTER_API_KEY` and `SONIOX_API_KEY` unchanged.

Set these Vercel Production variables as one coordinated change:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<production publishable key>
CLERK_SECRET_KEY=<production secret key>
NEXT_PUBLIC_CONVEX_URL=https://valuable-loris-929.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=<current production Convex site URL>
```

The Clerk keys must come from the same production instance. Do not print, commit, or put secret values in this runbook.

## Custom domain

1. Add the chosen domain to Vercel project `next-js-omni-class` and apply the DNS records Vercel displays.
2. Wait until Vercel reports the domain and certificate as valid.
3. Add the same origin in Clerk's production domain/origin configuration and follow Clerk's DNS instructions for authentication endpoints.
4. Keep `https://next-js-omni-class.vercel.app` attached until the custom-domain checks pass.
5. Make the custom domain primary in Vercel only after Clerk sign-in works there.

Public student signup is `https://<domain>/sign-up`. Teacher invite links are generated in Admin Settings and use `window.location.origin`, so they automatically use the domain on which the admin opens Settings.

## Deployment order

1. Back up/export production Convex data before an approved clean start.
2. Pre-create the intended staff rows in Convex with their application roles before their first production sign-in.
3. Configure the production Clerk instance and production domain/origins.
4. Set `CLERK_JWT_ISSUER_DOMAIN` in production Convex.
5. Run `npx convex deploy --yes`.
6. Replace both Clerk keys in Vercel and redeploy.
7. Verify the generated deployment on the Vercel URL first, then the custom domain.

## Required verification

- Fresh public signup lands on `/onboarding/student` and has Convex role `student`.
- A valid teacher invite lands on `/onboarding/teacher` and has Convex role `teacher`.
- A pre-created admin sign-in links to the existing admin row rather than inserting a student row.
- Existing authenticated reads retain the academy tenant guard; cross-tenant rows remain rejected.
- Sign-in, sign-out, middleware redirects, and Convex authenticated queries work on both domains.

After verification, remove the old Vercel origin from Clerk only if it is no longer needed.

## Current production verification — 2026-10-09

Current observations supersede old completion notes. No production data reset or account creation was performed.

| Area | Current evidence / result |
|---|---|
| Apex | `https://omnicaenglish.com/privacy?lang=en&launch_probe=1` → 200 with validated TLS; HTTP → HTTPS 308 preserving path/query. |
| www | Initially TLS hostname mismatch; Vercel project had only apex and old Vercel host. Added `www.omnicaenglish.com`, redirect **308 to omnicaenglish.com**. Fresh validated-TLS request now returns `Location: https://omnicaenglish.com/privacy?lang=en&launch_probe=1`. |
| Canonical / Vercel | Apex dashboard shows **Valid Configuration / Production** and project card uses apex. Old `next-js-omni-class.vercel.app` returns 308 to apex preserving path/query via repository redirect. www is a Vercel domain redirect, not a separate app origin. No additional “primary” control was visible; observed routing establishes apex as canonical. |
| Clerk | Public production environment reports production mode, issuer `https://clerk.omnicaenglish.com`, home `https://omnicaenglish.com`, Google enabled, Organizations disabled. Embedded SignIn/SignUp force `/onboarding/post-signup`. Hosted component URLs still use `accounts.omnicaenglish.com`; hosted after-sign-in/up are apex root. |
| Teacher invite | Generate from Admin Settings on apex: `https://omnicaenglish.com/sign-up?invite=…`. Do not publish the token. App wrapper saves the short-lived invite cookie; post-signup handles authenticated acceptance before routing. A fresh valid production invite acceptance has **not** been exercised. Existing Firefox production admin session successfully opened `/admin` with real Convex metrics. |
| Teacher setup | Both stored teachers completed onboarding, have phone contacts, consent and HTTPS `meet.google.com/xxx-xxxx-xxx` rooms. Both bios empty. Mustafa: Mon–Fri 15:00–20:30; Sally: Mon 11:00–17:00, Fri 11:00–15:30, academy time. These are existing stored hours, not newly assigned or guarantees of dated booking availability. Meet room ownership/audio capture not tested. |
| Payments / catalogue | Existing website WhatsApp link persisted in tenant settings; support Telegram `https://t.me/Omnica_english`; obsolete support email removed; tenant website corrected to apex. Public query returns paid trial + Standard 8/12/24 and no IELTS. Current prices/financial terms are in [POLICY](../POLICY.md). No payment or order mutation tested. |
| Library | Feature enabled; 11 published works, 23 units total, one unpublished draft left untouched. |
| AI | Four stored prompt overrides use `google/gemini-3-flash-preview`; remaining tasks use built-in fallbacks. OpenRouter credential returns 200 with positive remaining key allowance; Soniox models request returns 200 including `stt-rt-v4`. This proves credential/model availability, not generated output or audio capture. |
| Telegram | Essential launch channel per FaFo. `getMe` matches `OmnicaEnglish_Bot`; webhook `https://valuable-loris-929.convex.site/telegram/webhook`, pending updates 0, no reported last error. `APP_URL` is apex. Metadata-only count: 17 notifications, 0 attempts / 0 sent / 0 failed; real delivery remains unproven. Support contact is a separate human account. |

### Remaining exact actions

- **Clerk Production → Configure → Developers → Paths:** choose “Sign-in page on application domain” = `https://omnicaenglish.com/sign-in`; “Sign-up page on application domain” = `https://omnicaenglish.com/sign-up`; Signing Out “Path on application domain” = `https://omnicaenglish.com`. Save if prompted. This ensures default navigation uses the app wrappers and invite handling instead of hosted auth pages. Automatic approval review rejected changing all-user auth routing without specific approval; approval requested from FaFo. Do not replace credentials or change instance.
- After routing changes, perform fresh production admin sign-in and student/teacher-invite flows with approved identities; verify resulting Convex role and onboarding destination. The existing dev-login script uses development Clerk credentials and cannot prove production auth. Avoid creating throwaway production accounts without authorization.
- Each teacher supplies their own introduction in **Teacher Profile** and confirms room ownership/real working hours. Existing Meet links and hours were preserved.
- Verify notifications by connecting an intended member from **Profile → Connect Telegram**, then observing an authorized real notification or read-only bot command. No message was sent on FaFo’s behalf during this task; webhook health alone is insufficient delivery proof.

No DNS dashboard action is currently needed for www: Vercel attachment and certificate issuance resolved its confirmed failure. The existing Vercel CLI token is expired; the Firefox dashboard session was used instead.
