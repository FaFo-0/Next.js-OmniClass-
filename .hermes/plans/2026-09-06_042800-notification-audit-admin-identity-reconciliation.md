# Notification Integrity and Admin Identity Reconciliation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make every meaningful OmniClass notification deliberate, recipient-correct, deduplicated, auditable, and reliably delivered to the bell/Telegram; explain and safely reconcile duplicate admin identities without permitting an unsafe removal of the only owner.

**Architecture:** Treat the notification registry as the single typed contract for message copy, recipients, required payload, destination, and delivery eligibility. Add a small admin-only audit surface that correlates domain actions with notification rows and Telegram delivery state, then test real Convex mutations—not only registry rendering. Treat duplicate people as an identity-data reconciliation problem: detect duplicate external IDs sharing an email, preserve a safe owner, and retire only an explicitly selected redundant record.

**Tech Stack:** Next.js/React, Convex mutations/queries/actions/crons, Clerk identity, Node built-in test runner, TypeScript, Telegram Bot API.

---

## Investigation Findings (read-only; 2026-09-06)

### One-time unpaid lesson notification

1. The deployed source of `convex/lessons.ts:startOneTime` calculates `canPay` from point grants, stores `unpaid: !canPay` on the generated event, and always emits `one_time_lesson_started` for:
   - every distinct admin `externalId`, and
   - the student.
   It does **not** suppress a notification merely because the student has no credit.
2. The canonical contract correctly renders this event as **“One-time lesson started”** and adds an explicit no-credit warning for `unpaid: true`.
3. The production admin bell was inspected. It showed two older **“Lesson booked”** entries and no one-time-start/unpaid entry. Therefore this is not solely a Telegram problem: the in-app notification row was not visible to this signed-in production admin.
4. The actual cause remains unproven because there is no current admin audit query that correlates the exact lesson/event to the `notifications` table, and the production frontend/backend deployment pairing has not been established. Plausible causes to eliminate with evidence:
   - the teacher action reached a different Convex deployment than the one audited/deployed;
   - the lesson was created by an older mutation/frontend path;
   - the action was retried through an idempotency path whose original creation predates notification support;
   - the notification exists for a different user record/recipient identity;
   - the notification write failed or was withdrawn (less likely, but must be checked from rows).

### Notification system audit

- `convex/lib/notificationRegistry.ts` defines 29 kinds and the display/Telegram/destination contract.
- `tests/notificationRegistry.test.ts` verifies all listed kinds render, have fallback destinations, and specifically tests the unpaid one-time text. It **does not** prove actual Convex producers emit every kind with valid recipients/payloads, nor that writes/delivery occur exactly once.
- `convex/notifications.ts:_notify` accepts `payload: v.any()` and any listed kind. It currently does not enforce contract-required fields, allowed recipient roles, or a domain-event idempotency key.
- Telegram is an outbox polled every minute by `convex/crons.ts`. Delivery intentionally begins only after a member connects Telegram and marks `telegramSentAt` only after the Bot API succeeds. This is correct directionally, but errors are logged and retried forever with no durable error/retry count or operator visibility.
- Admin fan-out is deduplicated only in the one-time-start path. Other producers iterating `role === "admin"` can produce duplicate notification rows when duplicate identities exist.

### Duplicate admins

- Production People → Admins contains **two distinct records**, not a duplicate React key/rendering defect. Both are designated “Platform owner,” with shared account details but different profile completeness and join dates.
- `convex/lib/superadmin.ts` marks *every row with the configured owner email* as superadmin. It is email-based rather than external-ID based; two user rows with the same configured email both become immutable owners.
- `convex/users.ts:listAdmins` returns all rows with role `admin`, with no deduplication or reconciliation indicator. The People UI exposes only the Access action, and there is no user deletion/deactivation mutation.
- No record should be deleted immediately. First identify which `externalId` is bound to the currently valid Clerk identity/session and whether either row owns lessons, assignments, Telegram linkage, pending notifications, or other relations. The retained owner must not be removable, and the system must never leave the tenant with zero active admins.

## Definition of Done

- A teacher’s one-time start with zero credit creates exactly one unpaid event/lesson and exactly one bell notification per distinct intended recipient; its admin bell text clearly says that the lesson started and the student has no credit.
- The same source notification is sent to Telegram once when—and only when—the recipient has a connected chat; failures are inspectable and retry safely without duplicate sends.
- Every notification producer has a documented contract row, valid payload/recipient validation, an appropriate role-aware deep link, and mutation-level coverage.
- The notification audit shows the lifecycle: source action → notification rows → bell visibility → Telegram status.
- The People page flags (and no longer silently duplicates) logically duplicate admin identities. A superadmin can safely retire a confirmed redundant record only after dependency and last-admin checks; the canonical active owner remains protected.
- Existing notification/lesson behaviour remains intact, and no teacher-only operational action is treated as a platform bug.

## Notification Inventory to Reconcile

The implementation must build a generated/audited matrix rather than relying on this manually maintained list. Current registry kinds include:

| Domain | Current kinds |
|---|---|
| Lessons and calendar | `one_time_lesson_started`, `lesson_assigned`, `lesson_cancelled`, `lesson_rescheduled`, `session_reminder`, `reschedule_request`, `reschedule_resolved`, `teacher_time_off`, `teacher_no_show`, `makeup_credit_issued`, `booking_reminder`, `unscheduled_session` |
| Lesson output/homework | `session_published`, `homework_assigned`, `homework_submitted`, `homework_reviewed` |
| Students and permissions | `student_assigned`, `student_unassigned`, `permission_request`, `lessons_requested` |
| Finance and points | `points_granted`, `points_refunded`, `invoice`, `finance_entry_due`, `salary_paid`, `payment_received`, `payment_refunded`, `payment_failed` |
| Product/system | `achievement_unlocked`, `impersonation` |

During implementation, classify each row as **required**, **action-required**, **informational**, or **deprecated/unemitted**, identify all actual producer paths, and either wire a missing required event or remove the dead registry entry deliberately. Do not add notification noise for events that have no recipient action or value.

---

### Task 1: Capture the exact production incident before changing behavior

**Objective:** Determine why the zero-credit one-time lesson produced no visible notification from durable production data.

**Files:**
- Modify: `convex/notifications.ts`
- Modify: `convex/lessons.ts`
- Test: `tests/notificationAudit.test.ts` (new)
- No production data mutation until the diagnostic query is reviewed.

**Step 1: Add an admin-only read-only incident/audit query**

Implement an authenticated `notifications.getAuditForLesson` query accepting `lessonId` and/or `eventId`. It must:

1. require `users.view.any` (or a narrower newly introduced `notifications.audit` permission);
2. validate tenant ownership of the lesson/event;
3. return a minimal, non-secret correlation record:
   - lesson/event IDs and timestamps;
   - `adHocSource`, `unpaid`, teacher/student external IDs;
   - notification rows for those recipient IDs created within the source-action window;
   - each row’s kind, recipient role, created/read/withdrawn/Telegram-delivered timestamps;
   - recipient identity **IDs only** (not email, phone, chat ID, Telegram code, or content secrets);
   - warnings for missing expected recipients or unexpected duplicates.
4. explicitly never return Telegram chat IDs/tokens, Clerk tokens, email, or phone.

**Step 2: Verify the actual incident in production**

Use the authenticated admin UI or an approved production query invocation to inspect the specific recent one-time lesson. Record only the diagnosis in the issue/plan, redacting identity and connection values. Establish whether notification rows are absent, misaddressed, withdrawn, or present but not visible.

**Step 3: Verify frontend/backend topology**

Identify the production web build revision and its `NEXT_PUBLIC_CONVEX_URL`/deployment target through approved deployment configuration or an admin-safe runtime diagnostic. Compare it to the Convex deployment where the audited code was deployed. If they differ, make the release pipeline deploy/verify both services together and add a release check that fails on mismatch.

**Step 4: Add an incident regression test**

Create a real Convex mutation harness/fake database test that starts a one-time lesson with zero usable point grants and asserts:

```ts
assert.equal(event.unpaid, true);
assert.equal(lesson.status, "recording");
assert.deepEqual(
  notifications.map((n) => [n.recipientId, n.kind, n.payload.unpaid]),
  expectedRecipients.map((id) => [id, "one_time_lesson_started", true])
);
```

Assert one row per **distinct external recipient ID**, not per duplicate database row.

**Step 5: Run the focused test**

Run: `npm run test -- --test-name-pattern="one-time.*unpaid|audit"`

Expected: the new test fails before the relevant production cause/fix and passes after it.

**Step 6: Commit**

```bash
git add convex/notifications.ts convex/lessons.ts tests/notificationAudit.test.ts
git commit -m "test(notifications): audit one-time unpaid delivery"
```

### Task 2: Make notification contracts executable, not display-only

**Objective:** Ensure producers cannot silently emit a notification with an impossible recipient or incomplete payload.

**Files:**
- Modify: `convex/lib/notificationRegistry.ts`
- Modify: `convex/notifications.ts`
- Modify: `convex/schema.ts` only if a durable notification event key/status needs storage
- Test: `tests/notificationRegistry.test.ts`
- Test: `tests/notificationMutation.test.ts` (new)

**Step 1: Extend each registry contract with machine-checkable metadata**

Add to each contract:

```ts
type NotificationContract = {
  audiences: readonly NotifRole[];
  requiredPayload: readonly string[];
  category: "action-required" | "informational";
  dedupe: "source-event-recipient" | "none";
  // existing view/destination/telegram functions
};
```

Use the smallest schema sufficient for currently emitted fields. Do not build a broad generic JSON-schema system.

**Step 2: Add failing validation tests**

Test that `_notify` rejects:
- an invalid/missing required field for `one_time_lesson_started` (`lessonId`, `eventId`, `unpaid`, teacher/student/date/time);
- an admin-only notification addressed to a student;
- a student-only notification addressed to an admin;
- an unknown kind.

Also test legacy rows still render safely in the UI fallback path; validation applies to new writes, not historical reads.

**Step 3: Validate recipient role and payload in `_notify`**

Resolve the recipient inside the tenant and reject a role outside `contract.audiences`. Validate `requiredPayload` presence/type before inserting. Use a typed payload validator per kind where format matters (IDs, dates, boolean `unpaid`) rather than trusting `v.any()`.

**Step 4: Add source-event idempotency for required notification events**

Add an optional `sourceKey` to `notifications` with an index scoped by organization/recipient/source key. For domain events that must appear once (`one_time_lesson_started`, reminders, payment webhooks, no-show, reschedule resolution), derive a stable key such as:

```ts
`one-time-start:${lessonId}:${recipientId}`
```

Make `_notify` return an existing row rather than insert another one for the same dedupe key. Do not coalesce intentionally separate actions that happen to have similar payloads.

**Step 5: Test race/retry behavior**

Call the producer twice with the same one-time-start idempotency key and assert:
- one lesson;
- one schedule event;
- one notification per recipient;
- one Telegram outbox candidate per recipient.

**Step 6: Commit**

```bash
git add convex/lib/notificationRegistry.ts convex/notifications.ts convex/schema.ts tests/notificationRegistry.test.ts tests/notificationMutation.test.ts
git commit -m "feat(notifications): enforce recipients and idempotency"
```

### Task 3: Reconcile every producer with the canonical registry

**Objective:** Audit all notification creation sites and deliberately add, fix, or retire each contract kind.

**Files:**
- Modify as required after the producer inventory: `convex/lessons.ts`, `convex/calendar.ts`, `convex/schedule.ts`, `convex/scheduleCron.ts`, `convex/permissions.ts`, `convex/achievements.ts`, `convex/payments.ts`, `convex/finance.ts`, `convex/payroll.ts`, and related modules
- Modify: `convex/lib/notificationRegistry.ts`
- Create: `docs/notification-matrix.md` or `convex/lib/notificationProducerMatrix.ts`
- Test: `tests/notificationProducerCoverage.test.ts` (new)

**Step 1: Generate an authoritative producer inventory**

Search all calls to `internal.notifications._notify`. For every call, record:
- module/function and trigger;
- kind;
- recipient role/source;
- payload fields;
- stored link;
- whether a repeated mutation/cron/webhook can re-fire it;
- whether it is bell-only, Telegram-eligible, or both.

Compare it with `NOTIFICATION_KINDS` and fail a test if a registered kind has no documented status (`emitted`, `deprecated`, or intentionally manual) or a producer uses a non-registry kind.

**Step 2: Correct semantic copy and destinations**

For each emitted kind, review the title/body/tone and action destination in all three surfaces:
- bell;
- Telegram text/button;
- route actually accepted by that role.

Replace generic `/admin/calendar` links with an event/request/lesson-specific target when the source ID exists. Preserve generic navigation only for genuinely broad informational events.

**Step 3: Standardize admin recipient fan-out**

Create one helper such as `notifyDistinctAdmins(ctx, orgId, args)` that deduplicates by `externalId`, creates role-correct source keys, and is used by all admin-facing producers. This prevents duplicate admin records from creating duplicate bells/Telegram messages in reschedules, no-shows, time off, permission requests, and one-time starts.

**Step 4: Decide the required notification set with product intent**

Keep action-worthy notifications (payments, session changes, no-show, homework/review, point changes, time-off requiring approval). Mark or remove dead/never-produced entries only after explicit product confirmation. Avoid notification spam: do not add notifications for teacher-owned manual portal actions such as repainting availability or setting a Meet link.

**Step 5: Add producer-level tests**

For each high-risk domain route, execute its real mutation/action against a controlled database and assert kind, recipient, payload, destination, and source-key behavior:
- start one-time paid/unpaid;
- discard paid/unpaid one-time (including withdrawal of pending Telegram delivery);
- reschedule requested/resolved;
- student booking/reminder;
- teacher and student no-show;
- points grant/refund;
- payment success/refund/failure;
- homework assigned/submitted/reviewed;
- teacher time-off/approval;
- session published.

**Step 6: Commit**

```bash
git add convex docs tests
git commit -m "refactor(notifications): align all domain producers"
```

### Task 4: Make Telegram delivery observable and bounded

**Objective:** Preserve exactly-once success marking while giving administrators evidence and safe retry behavior for failures.

**Files:**
- Modify: `convex/telegram.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/notifications.ts`
- Create/Modify: admin diagnostics UI only if audit query needs a view
- Test: `tests/telegramOutbox.test.ts` (new)

**Step 1: Add durable delivery status fields**

Use only non-secret fields on `notifications`, for example:

```ts
telegramAttemptCount?: number;
telegramLastAttemptAt?: string;
telegramLastErrorCode?: string;
telegramLastErrorAt?: string;
telegramSentAt?: string;
```

Never save Bot API response bodies, token, chat ID, or secret URLs in an admin list.

**Step 2: Write failing outbox tests**

Cover:
- connected recipient + new notification → exactly one send and `telegramSentAt` set;
- a second cron run → no duplicate send;
- recipient connected after notification creation → old notification intentionally not sent;
- withdrawn notification → never sent;
- transient failure → error state recorded and retry candidate backoff honored;
- permanent blocked/invalid chat failure → durable terminal status, no infinite retry loop.

**Step 3: Implement bounded retry/backoff and operator visibility**

Classify Telegram errors by HTTP status/code. Keep transient retries with exponential backoff; treat known permanent invalid/blocked chat failures as terminal and prompt the user to reconnect in the product. Add an admin audit count/status view without exposing chat IDs.

**Step 4: Confirm deployment configuration**

In a secure deployment environment, verify—not print—that:
- the delivery cron is registered;
- Telegram bot token and app URL configuration exist on the intended Convex deployment;
- web-app URL and backend deployment are paired.

**Step 5: Commit**

```bash
git add convex tests src
git commit -m "feat(telegram): audit and bound outbox delivery"
```

### Task 5: Diagnose and reconcile duplicate platform-owner records safely

**Objective:** Make duplicate logical identities visible and provide a guarded remediation path.

**Files:**
- Modify: `convex/lib/superadmin.ts`
- Modify: `convex/users.ts`
- Modify: `src/app/admin/people/page.tsx`
- Create: `convex/lib/userIdentityReconciliation.ts`
- Test: `tests/userIdentityReconciliation.test.ts` (new)

**Step 1: Add an admin-only duplicate-identity report**

Group users by normalized email *only within the tenant*. Return, for each group with multiple rows:
- external IDs;
- roles;
- created dates;
- profile completeness;
- whether each is the current authenticated row;
- counts of linked durable records (lessons, events, notifications, Telegram connected state), not sensitive values.

Do not automatically merge or delete rows based on email.

**Step 2: Tighten platform-owner identity semantics**

Replace the current “every record with the configured owner email is immutable” rule with an explicit allowlist of canonical external IDs, or a separate immutable owner identity mapping created by a privileged deployment/reconciliation process. Do not rely on an editable database role row to confer superadmin power.

Migration order:
1. determine the real current Clerk external ID;
2. configure it as canonical owner in deployment-controlled configuration;
3. deploy and verify it retains owner access;
4. only then remove superadmin protection from the redundant row.

**Step 3: Add a guarded archive/retire mutation—not a blind delete**

Implement `users.retireDuplicateIdentity` callable only by the canonical platform owner. It must reject:
- retiring the caller/current owner;
- retiring the last active admin;
- rows with unresolved critical relationships unless a documented transfer plan is supplied;
- cross-tenant targets;
- non-duplicate targets (unless a separate staff-offboarding flow exists).

Use a reversible `retiredAt`, `retiredBy`, `retiredReason`, and exclude retired records from normal People lists, admin fan-out, and scheduling selectors. Do not delete historical lessons, schedule events, notifications, or ledger records.

**Step 4: Build a People UI remediation flow**

Show a clear “Possible duplicate identity” badge instead of two indistinguishable owners. For the canonical platform owner only, provide a review screen with dependency counts and a typed confirmation requiring the target’s display name/external-ID suffix. The default action must be **Cancel**.

**Step 5: Test safety boundaries**

Test:
- duplicate same-email rows appear as a group;
- only designated canonical owner can retire a duplicate;
- last-admin retirement fails;
- canonical/current identity retirement fails;
- retired row no longer receives admin notifications;
- historical records remain readable and linked;
- no two owners are silently produced from one owner email.

**Step 6: Commit**

```bash
git add convex/users.ts convex/lib/superadmin.ts convex/lib/userIdentityReconciliation.ts src/app/admin/people/page.tsx tests/userIdentityReconciliation.test.ts
git commit -m "feat(users): safely reconcile duplicate admin identities"
```

### Task 6: Complete release verification against real production behavior

**Objective:** Prove the fix works beyond unit tests before shipping.

**Files:**
- Modify only test/docs/deployment files required by prior tasks.

**Step 1: Automated gates**

Run:

```bash
npm run test
npx tsc --noEmit
npm run build
git diff --check
npx convex codegen
```

Run focused notification/outbox/identity tests separately and capture their actual test counts.

**Step 2: Deploy frontend and backend as one release**

Deploy the Convex backend and production web frontend from the same reviewed commit. Verify their versions/deployment target match with the non-secret runtime diagnostic added in Task 1.

**Step 3: Production smoke test with controlled data**

Using a non-destructive test student/teacher:
1. start a one-time lesson with zero credit;
2. verify the event is marked unpaid;
3. verify exactly one admin bell card per distinct admin identity, with “started” and the no-credit warning;
4. verify student bell card wording/destination;
5. where a test recipient has Telegram connected, verify exactly one Telegram delivery and the correct role-aware deep link;
6. retry the same action/idempotency key and verify no duplicate event, lesson, bell card, or Telegram message;
7. inspect audit data, then clean up using the established safe discard flow.

**Step 4: Production People smoke test**

Verify the duplicate identity badge/report, canonical-owner protections, guarded retirement preview, and no changes to teacher availability/Meet-link workflows.

**Step 5: Final independent review and commit/push**

Run a focused code review on notification recipient authorization, idempotency, webhook/Telegram secret handling, and identity-retirement guards. Commit and push only after review and production smoke evidence are captured.

---

## Risks and Guardrails

- **No silent data merge:** matching email is an indicator, not proof two user rows are interchangeable.
- **No owner lockout:** never retire/delete the current canonical owner or last active admin.
- **No credentials in audits:** never expose Telegram tokens/chat IDs, Clerk tickets, email/phone, webhook secrets, or full Bot API error payloads.
- **No notification spam:** keep notifications tied to useful, recipient-relevant state changes; manual teacher portal setup remains teacher-owned, not a platform alert.
- **No false release claim:** backend deployment success alone does not prove the web app invokes that deployment. Verify topology and real mutation output.
- **No migration without correlation:** determine the actual one-time lesson/event and its existing notification state before attempting repair/backfill.

## Open Product Decisions (resolve before Task 3 implementation)

1. Should the student be notified immediately when an unpaid one-time lesson starts, or only the admin/teacher? Current code notifies both; the audit should confirm this is desired.
2. For an unpaid start, should the admin’s card be action-required (e.g., “Review billing”) and point to billing/student detail rather than the lesson session page?
3. Do all platform-owner identities need the same email, or should exactly one canonical Clerk external ID be the owner regardless of email changes?
4. For the redundant admin record, does any business data need to be transferred, or is it safe to retire once dependency counts are confirmed?
