# Production Clerk and custom-domain runbook

Use this when replacing the current Clerk development instance or attaching the launch domain. Never copy key values into this file.

## Before changing keys

The live Vercel site currently uses the Clerk development instance, and production Convex data is scoped to its Clerk organization ID. A new Clerk production instance normally has different user and organization IDs.

**Do not replace the Clerk keys until the ID migration is prepared.** Changing only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` will lock out existing users and point new sessions at an organization ID that does not match Convex data.

Before the cutover:

1. Create the Clerk production instance.
2. Under **Organizations → Settings**, select **Membership optional**. OmniClass needs an organization-less session briefly so its server route can add a public signup to the academy.
3. Under **Organizations → Roles & Permissions**, create the custom role:
   - Name: `Teacher`
   - Key: `org:teacher`
   - Clerk permissions may remain empty; OmniClass permissions and role enforcement live in Convex.
4. Create the `Omnica English` organization and record its production `org_…` ID.
5. Create or import the four real accounts and add them to that organization with the appropriate Clerk roles (`org:admin`, `org:teacher`, or `org:member`).
6. Build and run a one-time Convex migration before cutover:
   - replace the old Clerk organization ID with the new one on **every organization-scoped row**, not only `tenantSettings`;
   - preserve each Convex user document ID so lessons, students, teachers, billing, and schedules keep their references;
   - relink each real user row to the new Clerk user ID/token identifier, preferably by a controlled email mapping;
   - verify row counts by table before and after.

The repository does not currently contain that cross-organization migration. Add and review it before the live-key swap; do not edit only `tenantSettings.organizationId`.

## Clerk and Convex configuration

In the production Clerk instance:

1. Create a JWT template named exactly `convex`.
2. Use Clerk's displayed production issuer/frontend API domain as the issuer value.
3. Add the final application origin and callback/redirect URLs. Keep the existing Vercel production URL during transition.

Set the Convex production environment variable:

```text
CLERK_JWT_ISSUER_DOMAIN=<exact production Clerk issuer domain>
```

Keep the existing `OPENROUTER_API_KEY` and `SONIOX_API_KEY` unchanged.

Set these Vercel **Production** variables as one coordinated change:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<pk_live_…>
CLERK_SECRET_KEY=<sk_live_…>
NEXT_PUBLIC_CONVEX_URL=https://valuable-loris-929.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=<current production Convex site URL>
```

The publishable and secret Clerk keys must come from the same production instance. Do not mix `pk_live` with a development `sk_test` key.

## Custom domain

1. Add the chosen domain to Vercel project `next-js-omni-class` and apply the DNS records Vercel displays.
2. Wait until Vercel reports the domain and certificate as valid.
3. Add the same origin in Clerk's production domain/origin configuration and follow Clerk's DNS instructions for its authentication endpoints.
4. Keep `https://next-js-omni-class.vercel.app` attached until the custom-domain checks pass.
5. Make the custom domain primary in Vercel only after Clerk sign-in works there.

No code constant needs changing for public or teacher links:

- Public student signup: `https://<domain>/sign-up`
- Teacher invite: Admin → Settings → **Teacher invite link**

The teacher link uses `window.location.origin`, so opening Admin Settings on the custom domain automatically produces a custom-domain invite URL. Rotate the token only when intentionally revoking the previous link.

## Deployment order

1. Put the site in a controlled maintenance window.
2. Back up/export production Convex data.
3. Run and verify the organization/user-ID migration.
4. Configure the production Clerk instance, roles, organization, users, JWT template, and domains.
5. Set `CLERK_JWT_ISSUER_DOMAIN` in production Convex.
6. Run `npx convex deploy --yes`.
7. Replace both Clerk keys in Vercel and redeploy.
8. Verify the generated deployment on the Vercel URL first, then the custom domain.

## Required verification

Use disposable accounts and delete both their Clerk identities and Convex user rows afterward.

- Fresh public signup lands on `/onboarding/student`.
- The Clerk membership is `org:member` and the academy is active in the session.
- A teacher invite lands on `/onboarding/teacher` and the Clerk membership is `org:teacher`.
- Existing admin, teacher, and student accounts retain their Convex records and historical relationships.
- Sign-in, sign-out, middleware redirects, and Convex authenticated queries work on both domains.
- The organization has enough member capacity for the real accounts plus pending invitations.

After verification, remove the old Vercel origin from Clerk only if it is no longer needed.