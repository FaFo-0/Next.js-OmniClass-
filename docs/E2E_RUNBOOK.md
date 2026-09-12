ORG-SAFETY FIRST: verify E2E_ORGANIZATION_ID is the dedicated E2E organization and is not the launch organization before provisioning; if it is missing, mismatched, or protected, STOP. Never run this walk against the launch organization.

NORMAL-USE EXCEPTION: `npm run test:walk -- --normal-use --persona <Russian|Kazakh|Arabic> --base <approved-test-origin>` is a separate no-fixture QA mode for a verified test/dev deployment with an existing tenant. It does not provision, snapshot, reset, delete, or seed data; record unavailable prerequisites as state-dependent `NA` or a setup blocker. The executor accepts localhost plus the exact approved test deployment and rejects every other remote origin.

# OmniClass student-teacher loop: routine walker

This is the single routine runbook. Load it once at the start of a walk. It is an exhaustive binary checklist for a low-cost vision-capable runtime agent. The input persona is Russian, Kazakh, or Arabic; the persona changes fixture locale/L1, expected learner translations, and every T- check.

Routine target: the configured real deployment, normally `https://next-js-omni-class.vercel.app` or an explicitly supplied preview URL. This is not a local unit test. The fixture is the only permitted setup boundary.

## 0. Operator contract

Normal outcomes are only `pass`, `fail`, or `NA`. A provider-outage result is `WARN-degraded`, which is recorded as a finding and is never silently converted to pass. Do not describe a screen or ask an open-ended vision question. For every row below use:

    PROBE: one DOM/text/CSS or state observation.
    EXPECT: one observable truth.
    RECORD: pass / fail / NA / WARN-degraded + literal evidence.
    SHOT: named evidence image only when specified or when a failure slot is needed.

On each settled screen run one batched probe bundle and record all rows from that bundle together. Use DOM/text/CSS before vision:

    const text = document.body.innerText;
    const rawKeys = [...document.querySelectorAll('*')].filter(e => /^[A-Za-z]+\.[\w.]+$/.test((e.textContent ?? '').trim())).map(e => e.textContent.trim());
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth;
    const direction = document.documentElement.getAttribute('dir') ?? getComputedStyle(document.documentElement).direction;
    const clipped = [...document.querySelectorAll('button,input,textarea,[role="button"]')].filter(e => { const r=e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.right > innerWidth || r.bottom > innerHeight); }).length;

Capture the compact keyed result, not the whole DOM. Re-probe once only if the page was not settled or a selector was structurally missing. Do not retry a failed product action in a loop.

Do not fix code, edit translations, alter production data, or change credentials during the walk. File a finding and continue. The runbook is maintained only when the product flow changes, not when a single button label moves.

### Persona input

| Persona argument | UI locale | Student L1 | Expected word translation for `lantern` | Direction | T-check rule |
|---|---|---|---|---|---|
| Russian | `ru` | `ru` | `фонарь` | LTR | Russian visible learner copy; flashcard answer is Russian |
| Kazakh | `kk` | `kk` | `шам` | LTR | Kazakh visible learner copy; flashcard answer is Kazakh |
| Arabic | `ar` | `ar` | `فانوس` | RTL | Arabic visible learner copy; flashcard answer is Arabic; logical start/end |

The expected translation is an evidence check, not a request to translate arbitrary AI content. Lesson transcript, AI summary, English definitions, and source-library prose remain English by design.

### Evidence budget

The hard limit is 24 PNGs: the 14 required moment IDs below plus `failure-01.png` through `failure-10.png`. Stop capturing at 24. Routine vision is limited to the visual-shortlist IDs marked `[VISION]`; all other required shots are evidence-only unless a failed probe needs one failure slot. Never send all stored images through vision.

Required moment IDs:

1. `01-student-onboarding.png`
2. `02-student-packs.png`
3. `03-student-claim.png`
4. `04-student-booking.png`
5. `admin-claims.png` `[VISION]`
6. `06-teacher-live.png`
7. `live-transcript.png` `[VISION]`
8. `08-teacher-review.png` `[VISION]`
9. `10-student-lesson.png` `[VISION]`
10. `11-homework-roundtrip.png`
11. `12-library-reader.png`
12. `vocab-row.png`
13. `13-locale-rtl.png` `[VISION]`
14. `14-mobile-student.png` `[VISION]`

The three exact evidence exemplars are binding:

```
5.6 SESSION-LIVE: transcript area shows non-empty text after upload?
    PROBE: /teacher/sessions/[id]/live → transcript panel textContent.
    EXPECT: ≥ 1 non-empty utterance line (real Soniox transcribe of fixture clip).
    RECORD: pass / fail / NA + first 80 chars of transcript.
    SHOT: live-transcript.png
```

```
2.8 BILLING-CLAIM: exactly one pending claim, correct money?
    PROBE: /admin/billing → Claims tab rows for the fixture student.
    EXPECT: 1 row · amount 15,000 ₸ · currency KZT · package "Lite".
    RECORD: pass / fail / NA + literal row text.
    SHOT: admin-claims.png
```

```
7.4 LIBRARY-WORD: saving a word from the reader adds it once?
    PROBE: reader word tap → popover → Save → /student/vocabulary row count.
    EXPECT: the word appears exactly once with a Russian translation.
    RECORD: pass / fail / NA + literal word + translation.
    SHOT: vocab-row.png
```

For Kazakh or Arabic, replace only the exemplar's expected translation with the persona table value; preserve the evidence ID and structure. For the live product's paid-trial fixture, the binding billing exemplar above is preserved verbatim for the contract record, but the operational amount check is product-aware: `priceSnapshotLocal=15,000 KZT`, `trialCreditApplied=1,500 KZT`, and payable `amount=13,500 KZT` is the expected pass. If the UI shows 15,000 payable without the 1,500 credit, record a pricing finding; do not treat the 13,500 payable amount as a failure.

## 1. One-time preparation and login hygiene

The executor creates one `fixtureKey` and three persistent isolated browser contexts. Consume exactly one private Clerk ticket per role: student, admin, teacher. Keep contexts alive and revisit them. Never print, paste into a finding, put in a screenshot, or commit a URL containing `__clerk_ticket`.

### 1.1 Private login handoff

The executor calls `mintLoginUrl` from `scripts/dev-login.mjs` for each role. Each result is a mode `0600` JSON file in a private temporary directory containing the one-shot URL and the resolved external ID. The runtime agent reads the file only to navigate that context, then deletes or leaves it private until process cleanup. The terminal receives only the file path and role, never the URL or token.

For each context:

- open the ticket URL once;
- wait for the deployment shell and Convex identity to settle;
- confirm the role by visible role/navigation text and `users.getMe`-equivalent UI state;
- set the persona locale before learner checks;
- restore the persona locale before every role switch and restore the deployment default/English before ending the run;
- if the ticket is expired, record `NEEDS-ESCALATION` and stop trying tickets; do not print a replacement URL.

Normal-use state adaptation is binding. Authentication and locale are separate records: a usable authenticated role shell is `PASS` even when its locale selector is absent or fails one bounded selection. Record that locale result separately as `NA` or `BLOCKED` with route, selected value, and visible-shell evidence, then continue functional rows; only locale-dependent T-checks depend on it. Treat `/` as transitional, wait once for the role route, and navigate directly to `/student` once if needed. For an existing student whose onboarding is already complete, record `F-2.1` as state-dependent `NA`, batch `F-2.2` through `L-2.6` as `NA` because their wizard precondition is absent, and continue immediately to `/student/billing`, claim-state inspection, and `/student/calendar`. Never wait for or recreate onboarding state, and never create a duplicate claim. Normal-use is read-only for payment state: never click `I have paid` and never confirm/approve a claim; inspect an existing claim or record the action rows `NA`, then continue.

Before `F-2.15`, inspect the settled lesson balance. If it is zero, missing, still loading, or ambiguous, classify it as `settled-zero` or `loading-or-unknown`, record `F-2.15` and `F-2.16` as state-dependent `NA` or precondition-blocked, do not click a slot or confirmation, and continue to the admin stage. For these preflight-blocked branches, record `batchConflictsText: "<not-rendered>"` and `confirmDisabled: "not-rendered"`; do not claim that booking controls rendered. After a slot is staged, record the literal visible `batchConflicts` summary/reason text (or literal absence) and the Confirm booking button's actual `disabled` state as a boolean.

### 1.2 Fixture call sequence

The executor calls Convex CLI only, with the exact guarded function names below. It must fail closed unless `E2E_FIXTURES_ENABLED=true`, `E2E_ORGANIZATION_ID` names the requested organization, `E2E_DEDICATED_ORGANIZATION_ID` matches it, and `E2E_DEDICATED_ORGANIZATION_AUTH=verified`; the tenant's server-side settings row must also carry verified dedicated-E2E authorization. The CLI target must be explicit (`--prod` for the deployed walk or the configured preview deployment). Never call `_wipeOldData`.

Provision once:

    npx convex run e2eFixtures:provisionStudentLoop '<JSON>' --prod

The JSON contains:

    {
      "organizationId": "<E2E_ORGANIZATION_ID>",
      "fixtureKey": "<run-key>",
      "persona": "Russian|Kazakh|Arabic",
      "booking": { "date": "YYYY-MM-DD", "startTime": "HH:mm", "endTime": "HH:mm" },
      "actors": {
        "student": { "externalId": "<Clerk student id>", "email": "<configured dev email>", "name": "E2E <Persona> Student" },
        "teacher": { "externalId": "<Clerk teacher id>", "email": "<configured dev email>", "name": "E2E Teacher" },
        "admin": { "externalId": "<Clerk admin id>", "email": "<configured dev email>", "name": "E2E Admin" }
      },
      "teacherMeetLink": "https://meet.google.com/<dedicated-e2e-room>"
    }

Expected return values: `ids.student`, `ids.teacher`, `ids.admin`, `ids.litePack`, `ids.standardPack`, `ids.intensivePack`, `ids.trialEvent`, `ids.trialGrant`, `ids.libraryWork`, `ids.libraryUnit`, and `ids.teacherVacancy`, plus `reset.deleted` and `reset.archivedPackages`. A second call with the same key must return the same stable IDs and no duplicate actor/package/trial/library rows. If it does not, record a high-severity fixture finding and do not repeat provisioning.

The provisioner must have created only prerequisites: three real Clerk-bound actor rows, the launch packs Standard Tutoring and IELTS 4/8/12 catalogue rows, the one non-purchase trial-credit prerequisite, a teacher Meet link and availability that covers `booking.date`, and one published seeded library work/unit. It must not create the student booking, manual pack claim, scheduled event, lesson, homework, or session content.

Before booking, fixture-backed runs require a verified non-purchase trial credit with `remaining >= 1`; verify that grant and balance in the fixture snapshot. If any part is absent, record a fixture precondition blocker and do not attempt `F-2.15` or `F-2.16`.

Before stage 2 and after stage 7, the runtime agent may read the cross-role state with:

    npx convex run e2eFixtures:snapshotStudentLoop '{"organizationId":"<E2E_ORGANIZATION_ID>","fixtureKey":"<run-key>"}' --prod

Expected snapshot shape includes `actors`, `billing`, `calendar`, `lessons`, `homework`, and `reading`. Snapshot reads are evidence only; the browser action remains the product test.

## 2. Student: onboarding, billing, trial, manual pack, booking

Use the persistent student context. Set the chosen learner locale and verify it is hydrated before reading text. The fixture's paid-trial prerequisite means the walk verifies a once-only trial rather than creating a second trial.

### 2.1 Student onboarding

`F-2.1` authenticated student lands on `/onboarding/student` when incomplete?
    PROBE: route plus visible wizard title and progress.
    EXPECT: no sign-in redirect; three-step student wizard is visible.
    RECORD: pass / fail / NA + route/title.
    SHOT: 01-student-onboarding.png

`F-2.2` step one saves real answers?
    PROBE: fill `phone`, `timezone`, and adult `age`; move to step two; refresh once.
    EXPECT: saved values remain and the wizard advances; no duplicate notification is visible.
    RECORD: pass / fail / NA + visible saved field evidence.

`F-2.3` persona drives the learner language?
    PROBE: step two native-language chips and selected locale.
    EXPECT: `ru`, `kk`, or `ar` is selected for the supplied persona; CEFR, goal, and at least one interest are accepted.
    RECORD: pass / fail / NA + literal chip/locale text.

`F-2.4` availability and consent finish onboarding?
    PROBE: step three days/times, consent control, Finish/Complete action; then snapshot.
    EXPECT: consent is required and accepted; `onboardingComplete=true`; snapshot actor locale/L1 matches persona; no free lesson grant is created by finishing.
    RECORD: pass / fail / NA + snapshot counts.

`T-2.5` onboarding copy is usable in the persona locale?
    PROBE: batched raw-key scan plus visible wizard headings, labels, validation text, and Finish label.
    EXPECT: no raw message key; Russian/Kazakh/Arabic text is present for learner copy; English product/AI content is not treated as a failure.
    RECORD: pass / fail / NA + literal strings.

`L-2.6` onboarding layout is intact?
    PROBE: overflow, clipped controls, wizard progress bounding boxes.
    EXPECT: no horizontal overflow; every active input/control is within the viewport; no overlapping wizard controls.
    RECORD: pass / fail / NA + compact CSS result.

### 2.2 Trial credit and versioned catalogue

Navigate to `/student/billing`.

`F-2.7` fixture trial credit is usable and non-commercial?
    PROBE: billing summary plus fixture snapshot grants filtered to the fixture student.
    EXPECT: exactly one usable `trial` grant and one lesson credit; no payment event, finance sale, or package row exists.
    RECORD: pass / fail / NA + grant/balance evidence.
    SHOT: 02-student-billing.png

`F-2.8` the versioned catalogue is buyer-visible in exact order?
    PROBE: family/card text and snapshot catalogue rows.
    EXPECT: Standard Tutoring before IELTS; each family renders 4 / 8 / 12 lessons in order. Standard is 15,000 / 26,000 / 36,000 KZT; IELTS is 20,000 / 35,000 / 48,000 KZT.
    RECORD: pass / fail / NA + literal card text.

`T-2.9` every card preserves mandatory commercial fields and localized benefits?
    PROBE: text scan for family, pack name, price/currency, lesson count, 60-day expiry, configured benefit bullets, raw keys, and locale direction.
    EXPECT: no raw key; user-facing unit says lessons; every mandatory field and benefit is visible; persona copy is translated where the locale catalogue provides it.
    RECORD: pass / fail / NA + captured text.

`L-2.10` billing cards fit the viewport?
    PROBE: card bounding boxes and horizontal overflow.
    EXPECT: no horizontal overflow; price, CTA, benefit list, and amount are not clipped.
    RECORD: pass / fail / NA + CSS result.

### 2.3 Canonical order request (no real payment)

Select Standard Tutoring 4 lessons; do not make a transfer or click a provider/receipt control.

`F-2.11` automatic discount preview and payment instructions match the selected order?
    PROBE: select the card and inspect the in-page order panel.
    EXPECT: server preview shows either the one automatic matching rule or no discount; it contains no voucher/code input and manual instructions do not alter the snapshot amount.
    RECORD: pass / fail / NA + literal amount/discount/instructions.

`F-2.12` the student creates one pending billing order?
    PROBE: submit the order request once; wait for settled UI; snapshot billing orders.
    EXPECT: one pending Standard Tutoring 4-lesson order; the student action issues no grant, finance entry, or payment event; the card moves to pending state.
    RECORD: pass / fail / NA + row/status/count.
    SHOT: 03-student-order.png

`F-2.13` duplicate request protection is visible?
    PROBE: after the first success, inspect the catalogue without clicking again.
    EXPECT: no second pending order; a different plan cannot be requested until the pending order is granted, rejected, or cancelled.
    RECORD: pass / fail / NA + counts.

### 2.4 Calendar booking

Go to `/student/calendar`. Use the teacher vacancy and `booking.date` from the fixture. This is the real student booking action. The booking is intentionally future-dated far enough to satisfy the 12-hour notice policy. The teacher live lesson below is started through the product's explicit Start session/one-time-now path so this routine does not wait twelve hours; the booking itself remains the evidence for the booking path.

`F-2.14` the fixture teacher's open slot is visible?
    PROBE: calendar range containing `booking.date`; slot text/bounding box and teacher name.
    EXPECT: one bookable open slot covering the fixture date/time, with no cross-tenant or unrelated teacher row.
    RECORD: pass / fail / NA + date/time/name.

`F-2.15` selecting a slot stages one booking?
    PROBE: inspect settled lesson balance first; only with usable balance click the open slot once, then inspect the staged-booking bar, visible conflict summary/reasons, and Confirm booking button `disabled` property.
    EXPECT: exactly one staged booking, correct date/time, lessons-left indicator, no repeat expansion unless deliberately selected, no unexpected batch conflict, and Confirm booking enabled. With zero, missing, still-loading, or ambiguous balance, do not click and use the precondition branch above.
    RECORD: pass / fail / NA + balance, literal staged text, literal visible `batchConflicts` summary/reason text or absence, and button disabled=true/false.

`F-2.16` confirmation creates the booked event and spends one available lesson?
    PROBE: when F-2.15 has usable balance and an enabled conflict-free Confirm booking button, click it once; wait once; snapshot calendar/balance. Otherwise record the precondition result without clicking.
    EXPECT: one scheduled event for student+teacher+fixture date/time, correct Meet link, and balance reduced by exactly one reservation; no duplicate event.
    RECORD: pass / fail / NA + event/balance values, literal visible `batchConflicts` text or absence, and pre-click button disabled=true/false.
    SHOT: 04-student-booking.png

`T-2.17` calendar learner text is translated without raw keys?
    PROBE: text/raw-key bundle on the calendar, staged bar, and confirmation result.
    EXPECT: no raw key; learner-facing labels are in the selected locale; stored English names/AI text are not judged as UI translation failures.
    RECORD: pass / fail / NA + literal strings.

`L-2.18` calendar is usable at desktop width?
    PROBE: document/body overflow, event rectangle intersections, sticky header bounds.
    EXPECT: no horizontal overflow or overlapping confirmation controls; slot and staged bar stay inside the viewport.
    RECORD: pass / fail / NA + CSS result.

## 3. Admin: inspect the canonical commercial queue

Switch to the persistent admin context without consuming another ticket. Restore the admin default locale before reading staff copy. This walk does not represent or make a payment and must not grant a requested order.

`F-3.1` admin billing opens in the right role?
    PROBE: `/admin/billing`, visible admin navigation and billing tabs.
    EXPECT: admin surface loads; student-only routes are not shown as the active role.
    RECORD: pass / fail / NA + route/title.

`F-3.2` one pending order retains its immutable commercial snapshot?
    PROBE: `/admin/billing` → Commercial tab rows for the fixture student.
    EXPECT: one pending Standard Tutoring 4-lesson order; family, pack, list/net KZT amount, expiry, all discount fields (or explicit no-discount), buyer, and request time are readable.
    RECORD: pass / fail / NA + literal row text and snapshot fields.
    SHOT: admin-commercial.png

`F-3.3` Admin Grant is the sole visible fulfillment control, but is not invoked?
    PROBE: inspect the pending row action and confirmation boundary without clicking confirmation.
    EXPECT: no payment-event/claim or direct points-grant control is present; the only fulfillment route is the order queue’s Grant action with a confirmation boundary.
    RECORD: pass / fail / NA + control labels/state.

`F-3.4` queue snapshot and idempotency details are inspectable without payment?
    PROBE: inspect order identifiers, status, notification link, and any already-settled rows; do not create or grant a new order.
    EXPECT: pending locks prevent a second request; immutable snapshot fields remain available; no duplicate order/grant/finance record is created by inspection.
    RECORD: pass / fail / NA + counts.

`T-3.5` admin commercial labels contain no raw keys?
    PROBE: raw-key scan plus commercial row text.
    EXPECT: no raw message keys; staff English labels may remain English.
    RECORD: pass / fail / NA + text.

`L-3.6` commercial queue remains readable?
    PROBE: row/control bounding boxes and overflow.
    EXPECT: student, family, pack, price, status, and action are not clipped or overlapping.
    RECORD: pass / fail / NA + CSS result.

## 4. Teacher: live session, real Soniox, real OpenRouter generation, review, publish

Switch to the persistent teacher context. The teacher fixture has a completed onboarding row, Meet link, and availability. Never fake Clerk identity or call a backend mutation from the browser console.

### 4.1 Teacher setup and session choice

`F-4.1` teacher onboarding and Meet availability are usable?
    PROBE: teacher profile/onboarding and `/teacher/calendar` or `/teacher/sessions`.
    EXPECT: teacher is onboarded; Meet link is visible; an availability band covers the fixture booking date; the booked event is visible with the fixture student.
    RECORD: pass / fail / NA + route/link/date.
    SHOT: 06-teacher-live.png

`F-4.2` the booked event is not silently replaced?
    PROBE: teacher calendar/session list and snapshot event IDs.
    EXPECT: the student booking from F-2.16 remains one scheduled event; no duplicate lesson is created merely by opening it.
    RECORD: pass / fail / NA + IDs/count.

`F-4.2a` the booked lesson's Start control follows the T-10 window?
    PROBE: on the settled authenticated teacher `/teacher/sessions` view, select a valid upcoming booked event with no active lesson and capture the event's scheduled lesson start, current time, computed start window, and the Start button's actual `disabled` property. The startable window is `[lessonStart - 10 minutes, lessonEnd + 30 minutes]`; the opening boundary is inclusive.
    EXPECT: inside the window, Start is enabled (`disabled=false`); before the opening boundary or after the closing boundary, disabled is expected. Do not infer a product bug from a missing/non-rendered control, an unauthenticated page, a different teacher's event, an active lesson, stale/loading data, or an event outside the window.
    RECORD: pass / fail / NA + sanitized JSON `{lessonStart,currentTime,windowStart,windowEnd,controlDisabled,classification}`. Use `classification=expected-disabled-outside-window` outside the window, `classification=enabled-inside-window` inside it, and `classification=confirmed-product-finding` only when the authenticated valid booked event is inside the window and `controlDisabled=true`.
    SHOT: 06-teacher-live.png when this is the selected teacher evidence moment; do not capture another routine shot.

`F-4.3` Start session is an honest current-time path?
    PROBE: use the visible Start session/one-time-now control on the teacher calendar, select the fixture student, and confirm once.
    EXPECT: the product creates one current lesson/event with the fixture student and opens `/teacher/sessions/[id]/live`; request is idempotent if the UI reports a lost response. Do not use a raw Convex call.
    RECORD: pass / fail / NA + route and visible lesson title.

The future booking and the current live lesson are two deliberately separate product checks: waiting for a booked future slot would make a routine run consume a day. Do not mark the booking as the live lesson unless the product itself opens it inside its server-enforced T-10 window.

### 4.2 Live recording and Soniox upload path

Use `fixtures/e2e/lesson-fixture.wav`. The file contains a short spoken English fixture sentence and is not a secret. In the live page, pass the mic preflight, choose the Upload audio path in `RecordingPanel`, select the file, and wait for the UI to settle.

`F-4.4` the live page has the required recording controls?
    PROBE: `/teacher/sessions/[id]/live` controls, MicCheck result, upload input, End Session.
    EXPECT: the page renders the recording panel, an upload path, and End Session; browser events have no pageerror.
    RECORD: pass / fail / NA + control labels.

`F-4.5` real Soniox processes the fixture upload?
    PROBE: upload state transition and network/browser event result.
    EXPECT: a real provider request completes; UI leaves Transcribing/Saving state; no fabricated transcript is pasted.
    RECORD: pass / fail / NA / WARN-degraded + provider outcome class.

If Soniox reports a hard provider outage (auth failure, hard timeout, or provider 5xx), allow exactly one bounded provider retry when the UI exposes a safe retry. If the second attempt has the same hard outage, record WARN-degraded and continue only with the product's explicit server fallback; otherwise mark dependent transcript/content rows NA. Never re-upload blindly after finalization.

5.6 SESSION-LIVE: transcript area shows non-empty text after upload?
    PROBE: /teacher/sessions/[id]/live → transcript panel textContent.
    EXPECT: ≥ 1 non-empty utterance line (real Soniox transcribe of fixture clip).
    RECORD: pass / fail / NA + first 80 chars of transcript.
    SHOT: live-transcript.png

`F-4.7` End Session finalizes without duplicating transcript utterances?
    PROBE: click End Session once; inspect review route and snapshot `lessons`, `lessonTranscriptUtterances`.
    EXPECT: one lesson moves from recording to transcribed/review; transcript is non-empty; utterances are non-empty and not duplicated; review route opens.
    RECORD: pass / fail / NA + status/chars/utterance count.

`L-4.8` live two-panel layout is safe?
    PROBE: overflow, right-panel bounds, tab/control clipping.
    EXPECT: no unexpected horizontal overflow; End Session is reachable; transcript and interaction tabs do not overlap.
    RECORD: pass / fail / NA + CSS result.

### 4.3 Real OpenRouter generation and teacher review

On `/teacher/sessions/[id]`, use the review tabs. The teacher must test each generated section, not merely observe a seeded row.

`F-4.9` summary generation uses the real provider?
    PROBE: Summary tab → Regenerate once; wait for status transition.
    EXPECT: provider-generated English summary is non-empty; content status reaches review; provider/network event is captured without secrets.
    RECORD: pass / fail / NA / WARN-degraded + character count/provider class.

`F-4.10` vocabulary generation is anchored to transcript evidence?
    PROBE: Vocabulary tab rows, translation fields, context/utterance selector, lesson snapshot.
    EXPECT: at least one word row; English word + learner-L1 translation; the row can show a recorded utterance/context; status is review.
    RECORD: pass / fail / NA + first word/translation/anchor text.
    SHOT: 08-teacher-review.png

`F-4.11` teacher can edit and save vocabulary?
    PROBE: change one generated translation or definition to a clearly marked correction; click Save changes once; reload the tab.
    EXPECT: correction persists, the row remains attached to the lesson, and no duplicate word is created.
    RECORD: pass / fail / NA + before/after literal values.

`F-4.12` real OpenRouter flashcards and quiz are generated?
    PROBE: lesson snapshot plus visible generated content or the review tabs used by this deployment.
    EXPECT: non-zero flashcards and quiz questions are generated from this transcript; each card has an English front and the persona L1 answer; each quiz has question/options/correct choice.
    RECORD: pass / fail / NA / WARN-degraded + counts and one literal sample.

If OpenRouter has a hard provider outage, permit one bounded retry per generation action only. On a second hard outage, record WARN-degraded, do not call Generate again, and use only any explicit server-owned fallback. Do not call a provider directly from the browser or insert invented content.

`F-4.13` teacher can approve each content section after review?
    PROBE: Summary, Vocabulary, Flashcards, and Quiz approve controls/status badges.
    EXPECT: each approved section transitions to approved; edits made before approval persist; no section is silently approved without an observable status.
    RECORD: pass / fail / NA + status text/count.

`F-4.14` homework draft is created from the lesson?
    PROBE: Homework tab; wait for the draft; Generate once if empty.
    EXPECT: one draft attached to this lesson/student, generated or editable content from the transcript, and no duplicate draft after refresh.
    RECORD: pass / fail / NA + homework ID/title/status.

`F-4.15` teacher can edit, approve, and publish the lesson?
    PROBE: edit a safe teacher note or homework sentence; approve homework; click Publish once; inspect snapshot.
    EXPECT: lesson status becomes published; all required content statuses are approved; approved homework becomes assigned; student notification/link exists; the booked event/live event is completed once.
    RECORD: pass / fail / NA + statuses/counts.

`L-4.16` review/editor surfaces are readable?
    PROBE: tabs, editable table inputs, status badges, buttons, and overflow.
    EXPECT: no raw keys, clipped table controls, overlapping buttons, or horizontal overflow at the standard viewport.
    RECORD: pass / fail / NA + CSS/text result.

## 5. Student: consume the published lesson and homework

Return to the persistent student context and restore the selected persona locale. Use the published lesson and assigned homework created by the teacher; do not seed or edit it from CLI.

`F-5.1` published lesson is visible in the student's lesson history?
    PROBE: `/student/lessons` or dashboard published/history row.
    EXPECT: one new completed/published lesson for the fixture teacher; opening it does not expose teacher-only controls.
    RECORD: pass / fail / NA + row/status.
    SHOT: 10-student-lesson.png

`F-5.2` student can read summary and transcript-safe content?
    PROBE: lesson detail Summary/Transcript/Vocabulary tabs.
    EXPECT: published summary and lesson content render; student cannot edit/approve/publish; no raw answer keys or teacher-only controls.
    RECORD: pass / fail / NA + controls/status.

`F-5.3` vocabulary translations use the fixture L1?
    PROBE: one lesson vocabulary row and snapshot card translation locale.
    EXPECT: at least one generated/reviewed word has a translation in `ru`, `kk`, or `ar` as selected; Russian/Kazakh/Arabic expected `lantern` value is accepted when the word is present.
    RECORD: pass / fail / NA + word/translation/locale.

`F-5.4` flashcards and quiz are consumable?
    PROBE: open flashcards/study and lesson quiz; reveal/rate one card and answer one quiz question.
    EXPECT: card front/reveal/rating works; answer is in persona L1; quiz records one attempt/result; snapshot card/review/quiz-attempt counts increase once.
    RECORD: pass / fail / NA + counts/literal card.

`F-5.5` assigned homework opens independently?
    PROBE: notification/study link or `/student/homework/[id]` from the assigned row.
    EXPECT: homework page opens without requiring unpublished lesson access; status is assigned and teacher answer key is not visible.
    RECORD: pass / fail / NA + route/status.

`F-5.6` student edit moves homework to in_progress?
    PROBE: edit one answer in the editor; allow its save; refresh once.
    EXPECT: answer persists; status changes from assigned to in_progress; teacher expected/correct attrs are not delivered before review.
    RECORD: pass / fail / NA + status/evidence.

`F-5.7` student submit changes status exactly once?
    PROBE: click Submit once; inspect status and teacher notification/snapshot.
    EXPECT: status becomes submitted; submitted timestamp and one teacher notification appear; no duplicate notification.
    RECORD: pass / fail / NA + status/count.
    SHOT: 11-homework-roundtrip.png

`T-5.8` published student surfaces use the selected locale?
    PROBE: raw-key scan and visible headings/status/buttons on lesson, study, and homework routes.
    EXPECT: no raw key; learner controls/statuses are translated; English content from lesson/AI is not misclassified.
    RECORD: pass / fail / NA + literal text.

`L-5.9` lesson/homework/editor layout is safe?
    PROBE: overflow, editor control bounds, card/table intersections.
    EXPECT: no horizontal overflow or clipped submit/rating controls.
    RECORD: pass / fail / NA + CSS result.

## 6. Teacher: grade, comment, and reopen

Switch back to the existing teacher context. Do not mint another ticket.

`F-6.1` submitted homework appears in teacher attention/session view?
    PROBE: `/teacher/calendar`, dashboard Needs attention, or lesson Homework tab.
    EXPECT: the fixture student and homework are shown as submitted/needs review.
    RECORD: pass / fail / NA + row/status.

`F-6.2` teacher can grade and comment?
    PROBE: open the submitted homework; mark the open response or one exercise; enter a short comment; Review/Save once.
    EXPECT: status becomes reviewed; score/max score are present; exact teacher comment is visible to the student later; no answer-key corruption.
    RECORD: pass / fail / NA + score/comment/status.

`F-6.3` student receives reviewed feedback?
    PROBE: return to the existing student context and open the same homework.
    EXPECT: reviewed status, score, teacher comment, and correct answers are now visible; no raw key.
    RECORD: pass / fail / NA + literal feedback.

`F-6.4` teacher can reopen the published lesson homework without erasing student work?
    PROBE: teacher lesson action Reopen once; snapshot lesson/homework; return to student homework.
    EXPECT: the lesson reopens only the assigned draft allowed by product policy; reviewed/student-started work is not silently erased; the observable status and explanation match the product.
    RECORD: pass / fail / NA + statuses.

If the product intentionally refuses reopening after a student has started/submitted, record that exact policy result as pass when the UI explains it. Do not force a destructive workaround.

## 7. Student: library reading, save word, study, locale, mobile

Return to the persistent student context.

### 7.1 Library and reader

`F-7.1` seeded work is visible in the student library?
    PROBE: `/student/library` catalogue and snapshot reading work.
    EXPECT: the fixture work is published, one unit is listed, and the student can open its reader.
    RECORD: pass / fail / NA + title/unit.

`F-7.2` reader opens prose and preserves progress?
    PROBE: open the unit; read/scroll; return and reopen.
    EXPECT: source prose is visible, unit progress is stored, and the same work/unit reopens without a blank body.
    RECORD: pass / fail / NA + title/progress.
    SHOT: 12-library-reader.png

`F-7.3` word lookup is learner-safe?
    PROBE: tap the fixture word `lantern` in the shared reader; inspect the popover.
    EXPECT: the word is identifiable, definition/source context is present, and the save action is visible; no student-side AI generation control appears.
    RECORD: pass / fail / NA + literal popover text.

7.4 LIBRARY-WORD: saving a word from the reader adds it once?
    PROBE: reader word tap → popover → Save → /student/vocabulary row count.
    EXPECT: the word appears exactly once with a Russian translation.
    RECORD: pass / fail / NA + literal word + translation.
    SHOT: vocab-row.png

For Kazakh or Arabic, use the selected persona translation rather than Russian while retaining the same once-only assertion.

`F-7.5` saved word is the same source as flashcard study?
    PROBE: `/student/vocabulary`/My Words and `/student/study` queue; snapshot `srsCards`.
    EXPECT: exactly one saved card for the word, its answer uses the persona L1, and the same card is available to study.
    RECORD: pass / fail / NA + card/locale/count.

`F-7.6` one study rating is recorded?
    PROBE: start a study session, reveal the saved word, rate it once; snapshot.
    EXPECT: session/review log increments once; card remains in the correct queue; no duplicate card.
    RECORD: pass / fail / NA + counts/status.

### 7.2 Locale sweep

Run the following in the existing student context, changing locale through the actual locale control, not by editing storage or URL parameters. After each change wait for the hydrated shell and run one batched probe.

`T-7.7` Russian sweep works?
    PROBE: switch to `ru`; inspect dashboard, lessons, homework, study, library/reader, billing, calendar, profile.
    EXPECT: navigation/empty/status/action copy is Russian or intentional English product/content; no raw keys; `html[dir]` is ltr.
    RECORD: pass / fail / NA + route/key scan.

`T-7.8` Kazakh sweep works?
    PROBE: switch to `kk`; repeat the same seven learner surfaces.
    EXPECT: Kazakh catalogue values are visible, no cross-script Arabic/Russian contamination, no raw keys, and `html[dir]` is ltr.
    RECORD: pass / fail / NA + route/key scan.

`T-7.9` Arabic sweep works?
    PROBE: switch to `ar`; repeat the same seven learner surfaces, including the reader popover and payment amount.
    EXPECT: Arabic values are visible, no raw keys, `html[dir]` is rtl, and direction-sensitive controls use logical start/end rather than clipped or reversed geometry.
    RECORD: pass / fail / NA + route/key scan.
    SHOT: 13-locale-rtl.png

`L-7.10` locale controls remain geometrically valid?
    PROBE: direction, overflow, switcher/menu bounds, calendar/payment numeric spans.
    EXPECT: no horizontal overflow; numbers/phone/amounts remain readable LTR inside Arabic; no control is off-screen.
    RECORD: pass / fail / NA + CSS result.

Restore the selected persona locale before the mobile pass and before leaving the student context.

### 7.3 Mobile pass

Use a 375x812 mobile viewport or the runtime agent's mobile device emulation. Do not capture extra images for every route.

`L-7.11` mobile shell does not overflow?
    PROBE: `innerWidth=375`, document/body scroll widths, fixed top/bottom navigation bounds.
    EXPECT: no horizontal overflow; main content scrolls without covering the topbar or bottom navigation.
    RECORD: pass / fail / NA + widths.
    SHOT: 14-mobile-student.png

`F-7.12` five daily student surfaces remain usable on mobile?
    PROBE: dashboard, lessons, study, calendar, profile; tap one daily nav/drawer destination each.
    EXPECT: each route loads without pageerror; primary heading and one primary action are visible; calendar slot/confirm controls can be reached by document scroll.
    RECORD: pass / fail / NA + route/action text.

`T-7.13` mobile persona copy has no raw keys?
    PROBE: raw-key scan on those five routes.
    EXPECT: zero raw message keys and no accidental source-language contamination in the selected learner locale.
    RECORD: pass / fail / NA + key count.

## 8. External-service degrade mode

Default is real Soniox and real OpenRouter. The only permitted retry is one bounded retry for the same provider call when the error is a hard provider outage. Do not retry validation errors, authorization/role errors, duplicate state transitions, uploads after finalization, or unknown UI failures.

After the bounded retry:

- if an explicit server-owned fallback exists and completes, record the affected rows as `WARN-degraded`, name the provider outage class, and continue only through observable fallback content;
- if no fallback exists, record dependent rows `WARN-degraded`/`NA`, preserve the evidence, and continue independent billing/locale/layout probes;
- never fabricate transcript, vocabulary, flashcards, quiz, or homework to obtain a pass;
- never put provider response bodies, API keys, Clerk tickets, cookies, or authorization headers in findings, screenshots, browser events, or the final report.

## 9. Locale restore, teardown, and artifact rules

Before each role switch set and verify the next role's required locale. At the end restore the student's persona locale, then the deployment default/English if the runner's teardown requires it. Close browser contexts only after screenshots and browser-events are written. The executor removes private ticket files; artifacts remain under `.artifacts/test-runs/<timestamp>-<short-sha>/`.

Required artifact files:

- `findings.md`
- `visual-summary.md`
- `screenshots/` with no more than 24 named PNGs
- `runbook.md.snapshot`
- `browser-events.json`
- `summary.json` with sanitized shot/token counters when available

## 10. Findings and verdict

Every finding uses exactly this compact shape:

    - severity: S0|S1|S2|S3
      stage: setup|student|admin|teacher|lesson|homework|library|locale|mobile
      locale: ru|kk|ar|staff
      what: <observable failure>
      expected: <single expected truth>
      evidence: <artifact filename, route, literal text, and/or snapshot count>
      class: functional|translation|layout|auth|data-scope|provider|fixture

Severity guidance: S0 security/data-scope/launch-org risk; S1 loop blocker or money/content corruption; S2 important broken normal workflow; S3 cosmetic/copy/low-impact layout. A provider outage is `WARN-degraded` and must name `class: provider`.

The end-of-run `visual-summary.md` includes shot count, probe count, pass/fail/NA/WARN-degraded totals, provider mode, and a one-line verdict:

    VERDICT: SHIP

only when no S0/S1/S2 finding blocks the normal loop and no unresolved data-scope/security finding exists. Otherwise:

    VERDICT: FIX-N-TEST

A finding report is not a process gate for the executor: the runtime process exits nonzero only when the walk could not start. The verdict is the QA result. If there is at least one S0/S1 or three S2 findings, the executor may send exactly one escalation prompt with the runbook snapshot, findings, and relevant failure images. Never start an escalation loop.
