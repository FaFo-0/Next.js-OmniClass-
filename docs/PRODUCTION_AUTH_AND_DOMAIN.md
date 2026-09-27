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
