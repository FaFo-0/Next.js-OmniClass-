# OmniClass Manual Product QA Runbook

This is the durable, human-operated product QA guide for OmniClass. It describes the pages and flows mounted in the current App Router tree and the behavior implemented in the application. Use it for release checks, focused regression passes, and controlled pilot checks.

It is a checklist, not an implementation plan. Do not turn it into an automated browser runner or a source of test data.

## 1. Safety and data rules

1. Prefer a verified development or test deployment and clearly named QA accounts. Before any stateful check, record the deployment, academy, actors, starting lesson balance, relevant booking/order IDs, and expected cleanup.
2. Never put passwords, one-time sign-in links, cookies, API keys, provider responses, private transcripts, or personal contact details in screenshots or bug reports. Redact unrelated student information.
3. Use fictional, consented content. Do not record a real student or upload their audio unless the purpose, retention, and consent are explicit.
4. Use normal UI actions. Do not call Convex functions, edit database rows, mint identities, or reset data during an ordinary QA run.
5. A test that changes a booking, lesson balance, pending billing order, finance entry, payroll run, published reading, staff permission, or notification must have an identified owner and cleanup decision before it starts.
6. Do not delete sessions, readings, achievements, expenses, reminders, catalogue versions, users, or other records merely to restore a clean screen. Test destructive actions only in an intentionally disposable data set.
7. Keep a bug from stopping unrelated coverage. Record it, mark dependent checks **BLOCKED** if necessary, then continue every independent check that remains safe.

### Boundaries requiring a separate intentional run

| Boundary | Rule |
|---|---|
| **REAL-MONEY TRANSFER** | Never send money as part of routine QA. A real transfer needs a separate written scope, exact amount, sender/recipient confirmation, reconciliation owner, and rollback/accounting plan. The ordinary flow can verify the versioned catalogue, payment instructions, pending billing order, and admin **Grant** boundary without transferring money. |
| **DESTRUCTIVE RESET OR DELETE** | Never run data resets or broad deletion during routine QA. Test record-level delete/archive/restore only with disposable records and explicit approval. Production reset is outside this runbook. |
| **PROVIDER OUTAGE** | Soniox, OpenRouter, Clerk, Telegram, email, storage, and other provider failures are not simulated casually. If a real provider is unavailable, capture the failing request and user-visible recovery, mark provider-dependent checks **BLOCKED**, and continue independent checks. Do not retry a state-changing action blindly. |
| **GOOGLE MEET TWO-SIDED AUDIO** | Capturing both people requires a separate scheduled check with two consenting participants, a controlled Meet room, the correct shared tab, and **Share tab audio** enabled. Routine QA may verify mic-only, approved upload, controls, and UI guidance without recording another person. |
| **PAYROLL EXECUTION** | Keep routine earnings/payroll checks read-only. Do not execute a payroll run until the owner has confirmed the approved compensation model and rate for the run; otherwise mark execution **BLOCKED**. |
| **SECURITY REQUEST PROBING** | Routine access checks use role boundaries and direct URLs only. Request replay or mutation-authorization probing requires a separately approved disposable security test and is outside routine manual QA. |

## 2. Recommended coverage matrix

Use the smallest matrix that still exercises role, viewport, locale, and direction changes. Expand it when the change affects another browser or device.

| Lane | Role | Device / viewport | Browser | Locale | Primary purpose |
|---|---|---|---|---|---|
| A | Student | iPhone-sized, 375×812 or a real iPhone | Safari | Russian | Daily learner flow, bottom navigation, forms, booking, reading, study |
| B | Student | Android-sized, about 412×915 | Chrome | Kazakh | LTR localization, calendar density, touch interactions |
| C | Student | Phone and desktop | Safari or Chrome | Arabic | RTL shell, logical alignment, dates, dialogs, mixed English content |
| D | Student | Desktop, 1440×900 | Chrome | English | Full tables, billing, lesson review, keyboard study controls |
| E | Teacher | Desktop, 1440×900 | Chrome | English | Calendar, live lesson, review, homework, library |
| F | Admin | Desktop, 1440×900 | Chrome | English | People, scheduling, versioned catalogue, pending orders, finance, settings |
| G | Any affected role | Desktop | Firefox or Safari | Relevant locale | Browser-specific regression when media, date, dialog, upload, or layout code changed |

Staff portals are currently English-first. Their language switcher and shared shell must remain usable, but do not report untranslated teacher/admin working copy as a learner-localization defect unless the affected component is shared with the student portal or onboarding.

## 3. Run header and outcome markers

Copy this compact header to the top of each run record:

```text
Run ID:
Date/time + timezone:
Tester:
Commit/deployment URL:
Academy/environment:
Student / teacher / admin actors:
Device + OS + browser/version:
Viewport:
Locale + direction:
Starting lesson balance:
Starting booking / lesson / order IDs:
Scope:
Excluded intentional boundaries:
```

Use exactly one marker for every attempted check:

- **PASS** — observed result matches the expected result.
- **BUG** — product behavior is wrong and evidence is recorded.
- **BLOCKED** — prerequisite, provider, permission, or data state prevents a valid result.
- **NA** — deliberately not applicable to this run; give a short reason.

Do not turn an unattempted check into PASS. Do not turn missing data into a product bug unless the product promised that data. After a BUG, keep going with independent checks.

## 4. Bug report template

```markdown
### BUG-___ — concise title

- **Severity:** S0 data/security emergency | S1 release blocker | S2 major | S3 normal | S4 cosmetic
- **Category:** auth/access | onboarding | student | teacher | admin | scheduling | lesson | AI/provider | homework | library/SRS | notification | billing/finance | localization/RTL | responsive | accessibility | validation/state
- **Role:**
- **Device / OS:**
- **Browser + version:**
- **Locale / direction:**
- **URL:**
- **Deployment / commit:**
- **Preconditions:**
- **Exact reproduction:**
  1.
  2.
  3.
- **Expected:**
- **Actual:**
- **Frequency:** always | intermittent (__/__ attempts) | once
- **Data impact / IDs:**
- **Screenshot or video:**
- **Console evidence:** relevant error only; redact secrets and private content
- **Network evidence:** method, sanitized URL, status, sanitized response/error; redact auth and payload data
- **Workaround / dependent checks:**
```

Severity guidance:

- **S0:** cross-academy or cross-role data exposure, unauthorized mutation, unrecoverable loss, duplicate real accounting impact.
- **S1:** sign-in or core lifecycle cannot complete; incorrect lesson debit/refund; publish exposes unapproved content; main role is unusable.
- **S2:** major route or workflow is broken but a safe workaround exists.
- **S3:** localized or secondary behavior is wrong.
- **S4:** visual or copy defect with no functional impact.

## 5. Start-of-run checks

- [ ] Confirm the URL and academy. Do not assume a familiar logo means the correct deployment.
- [ ] Confirm each account's role from the destination and visible navigation.
- [ ] Record the student lesson balance and any pending billing order before mutations.
- [ ] Open DevTools once per browser lane. Preserve actionable console errors and failed requests; ignore neither a red error nor an obvious secret leak.
- [ ] Check the topbar, avatar menu, notification bell, locale switcher, sidebar/drawer, and mobile bottom navigation.
- [ ] Reload one authenticated page and open it in a second tab. The session and selected academy should remain coherent.
- [ ] Verify loading indicators settle. A permanent skeleton or blank card is BLOCKED/BUG, not PASS.

## 6. Public, authentication, and onboarding

### Public and auth pages

| Check | Page | Manual checks |
|---|---|---|
| PUB-01 | `/` | Signed out goes to sign-in. Signed-in users without an active academy go to academy selection. Incomplete onboarding goes to the correct wizard. Completed student, teacher, and admin users reach their own portal. No redirect loop or wrong-role flash. |
| AUTH-01 | `/sign-in` | Clerk sign-in renders on desktop/mobile; validation, recovery links, failed credentials, keyboard focus, and back navigation behave safely. Successful sign-in preserves the intended invite/onboarding path. |
| AUTH-02 | `/sign-up` | Public student signup renders; required fields and validation work; duplicate identity errors are understandable; success continues to post-signup rather than leaving an unaffiliated session. |
| AUTH-03 | avatar menu | Profile opens the role's profile; Manage account stays in Clerk; Sign out clears authenticated pages and caches, and Back cannot reveal private page data. |

### Organization and role handoff

| Check | Page or endpoint | Manual checks |
|---|---|---|
| ONB-01 | `/onboarding/post-signup` | The loading state resolves once; a teacher invite is accepted before ordinary student auto-join; the active academy is refreshed; the final redirect matches the stored role and onboarding state. |
| ONB-02 | `/onboarding/select-org` | In the single-tenant deployment, auto-join/activation and redirect to the configured academy is the primary behavior. Organization selection UI is a fallback only after auto-join fails; selecting there activates the chosen academy, while an empty/failure state never attaches an arbitrary academy. |
| ONB-03 | POST `/api/auth/auto-join` via signup flow | Fresh public signup joins the one configured academy as a student. Repeating the browser flow is idempotent. A deployment with ambiguous academy selection fails safely. Do not invoke the endpoint directly during routine QA. |
| ONB-04 | POST `/api/auth/teacher-invite/accept` via invite flow | A valid invite yields teacher membership and preserves teacher onboarding. An invalid/expired invite must show a useful error and must not fall back to student; silently auto-joining that identity as a student is a **BUG**. Do not invoke the endpoint directly during routine QA. |

### Student onboarding — `/onboarding/student`

- [ ] Signed-out access returns to sign-in; another role returns to its own portal.
- [ ] Progress and Back/Next behavior retain saved values after refresh.
- [ ] Contact, age/minor guardian handling, auto-detected editable timezone, CEFR descriptions, native language, goal, interests, preferred days/times, referral, and recording consent all validate.
- [ ] Rapid multi-select taps retain every selected chip.
- [ ] Completion happens once, shows a useful confirmation, and lands on `/student`.
- [ ] On first completion, when a free trial is configured, exactly the configured number of trial lessons is granted once. Record the starting/final balance, grant source/provenance, and configured duration/expiry behavior; reload or repeat completion must not grant it again.
- [ ] First completion creates exactly one admin signup notification whose link opens `/admin/people` or that student's `/admin/students/[id]`. Missing, duplicate, or invalid-link notification behavior is a **BUG**.
- [ ] The profile, teacher student-detail page, library recommendations, and availability hints reflect the submitted answers where implemented.

### Teacher onboarding — `/onboarding/teacher`

- [ ] Signed-out/wrong-role users are redirected; a completed teacher does not repeat the wizard.
- [ ] Name, app language, timezone, clock format, phone, meeting-room URL, recording consent, introduction, IELTS toggle, and weekly hours validate.
- [ ] Invalid timezone, malformed meeting URL, malformed time, or end-before-start cannot partially save availability.
- [ ] Existing active weekly hours are handled without a false success or duplicate slots.
- [ ] Completion lands on `/teacher`; profile and calendar show the saved room, bio/certification, and hours.

## 7. Student portal route checks

Run the mobile student lane first, then a desktop pass for wide tables and keyboard interactions.

### `/student` — dashboard

- [ ] Next lesson uses the learner's timezone and shows a date when far away; Meet appears only when a link exists.
- [ ] Completed lessons, words, cards reviewed, lessons left, streak, study due, and recent published lessons agree with their detail pages.
- [ ] Calendar, study, lessons, and recent-lesson links open the correct records.
- [ ] Zero-data dashboard has useful calls to action, not broken cards.
- [ ] Telegram connection prompt appears only while disconnected and routes to the profile connection control.

### `/student/lessons` and `/student/lessons/[id]`

- [ ] History includes upcoming, completed, cancelled, student no-show, and teacher no-show states in learner-local time.
- [ ] Search and All/Upcoming/Completed/Missed filters combine correctly; empty results explain themselves.
- [ ] Only a row with published notes opens a detail page.
- [ ] Detail shows title/date/duration, summary expand/collapse, vocabulary and pronunciation, flashcard flip, link to Study, quiz selection/submission/score, and homework when assigned.
- [ ] Submit the quiz once, record the attempt count plus streak and achievement state, then reload the lesson and those readbacks. Exactly one attempt and one set of streak/achievement side effects must remain; any duplicate after reload is a **BUG**, and answers cannot be changed afterward.
- [ ] Invalid or inaccessible lesson ID shows a safe not-found state without leaking another student's content.

### `/student/homework` and `/student/homework/[id]`

- [ ] To-do, waiting-review, and completed groups are accurate; due labels use learner locale/time and overdue remains neutral rather than punitive.
- [ ] A standalone assignment opens even before lesson notes are published.
- [ ] Fill-blank, multiple-choice, and open-answer content accepts learner input; autosave does not erase rapid typing.
- [ ] Submit is available only in the appropriate state; a double click does not create a duplicate transition.
- [ ] Reviewed work is read-only and shows score plus teacher feedback.
- [ ] Another student's homework ID fails safely.

### `/student/study`

- [ ] Hub combines open homework, waiting/recent review, due flashcards, and recommended reading; each link goes to the right destination.
- [ ] Empty due state is honest and still allows navigation to My Words/library.
- [ ] Session starts with the expected due cards and respects displayed limits.
- [ ] Card is translation-first, flips by click and Space/Enter, and ratings 1–4 work by button and keyboard.
- [ ] “Again” can reappear during the session without inflating the unique reviewed count; only the first rating affects the completion accuracy shown.
- [ ] Completion records the session, updates streak/progress, and Back to dashboard works.

### `/student/vocabulary`

- [ ] Search plus all/not-studied/learning/learned filters return consistent rows and counts.
- [ ] Pronunciation, definition, context, learner-language translation, due badge, and source information render when present.
- [ ] Editing a translation persists after reload.
- [ ] Removing a word requires intentional action and removes it from the study deck/reading tint as implemented.
- [ ] Study-due opens `/student/study`; empty state directs the learner to reading.

### `/student/library`, `/student/library/work/[workId]`, `/student/library/work/[workId]/[unitId]`

- [ ] Catalogue loads only published works, orders recommendations sensibly, and filters All/A1–C2.
- [ ] Cards show available cover, kind, level, description, reading time, source, and topics without overflow.
- [ ] Work detail shows metadata and ordered table of contents; Back returns to the catalogue.
- [ ] Unit reader renders Markdown, restores reading position, and navigates between/within units correctly.
- [ ] Tap/click a word: popover anchors within the viewport; dictionary result, IPA/audio, contextual sentence, and learner-language translation are coherent.
- [ ] Add to my words is idempotent, changes the in-reader state, and appears in `/student/vocabulary` and due SRS when appropriate.
- [ ] Draft/inaccessible work or unit IDs do not leak content.

### `/student/calendar`

- [ ] Day/week/month controls, date navigation, timezone labels, lesson/open-range rendering, sticky headers, and whole-page scrolling work on phone and desktop.
- [ ] With no assigned teacher, the explanation and academy contact path are useful.
- [ ] Green availability can be staged only on valid 15-minute starts within notice/horizon/balance rules.
- [ ] Stage, unstage, finite repeat, top/bottom confirmation controls, preview conflicts, and atomic confirmation behave consistently.
- [ ] Confirmed bookings persist after reload and appear for teacher/admin without duplicate lesson debits.
- [ ] Event dialog shows title/time/teacher/Meet; policy text appears before cancel or move.
- [ ] Reschedule only accepts a valid destination and keeps one booking. Cancel result states whether the lesson was returned or charged.
- [ ] A network retry does not create duplicate bookings.

### `/student/billing`

- [ ] Lesson balance and next expiry agree with profile, calendar, and admin view.
- [ ] The versioned catalogue shows **Standard Tutoring** before **IELTS**, with the configured 4/8/12-lesson plans, price, expiry, and all localized benefits.
- [ ] Hidden, archived, draft, or superseded versions are not buyable.
- [ ] Selecting an offer opens a confirmation with list amount, automatic discount snapshot when applicable, final amount, currency, lessons, and expiry. Expiry visibility is required at checkout; if it is absent, mark **BUG**.
- [ ] Confirm creates one **pending billing order**. While one is pending, other offer actions are disabled and explain why.
- [ ] The pending banner and recent order history show plan and status. Rejection shows the admin reason. Admin **Grant** changes the status and balance exactly once.
- [ ] Payment instructions (recipient, phone, note, QR, or academy contact fallback) render without implying that OmniClass itself completed a transfer.

### `/student/achievements`

- [ ] Loading and empty states are distinct.
- [ ] Progress bars and unlocked state match completed lessons, reviews, perfect quizzes, streak, and learned-word activity.
- [ ] Opening/reloading does not duplicate an unlock or notification.
- [ ] Closest-to-complete ordering remains stable.

### `/student/profile`

- [ ] Shared account card edits name, phone, timezone, and 12/24-hour format; local time updates.
- [ ] Native language is visible but staff-controlled; app locale remains learner-controlled through the shell.
- [ ] Telegram connect link/code and disconnect behave safely; stale code does not bind an unrelated account.
- [ ] Lesson balance links to billing.
- [ ] The ICS subscription URL is an opaque bearer token: only its owner may obtain it in the authenticated UI, but a copied feed intentionally works outside Clerk. Test token secrecy, owner isolation, correct events/timezones and Meet locations, plus revocation/rotation only if such a control is mounted; do not expect sign-out to invalidate the feed.
- [ ] Clerk Manage account and Sign out remain available through the avatar menu.

### `/student/book`

- [ ] Old bookmarks redirect to `/student/calendar` without an error or obsolete booking screen.

## 8. Teacher portal route checks

### `/teacher` — dashboard

- [ ] Setup checklist reflects actual timezone, meeting room, and availability and links to the correct fixes.
- [ ] Today's lessons, next-lesson countdown, recent recordings, and assigned-student context agree with detail pages. Record provisional earnings for the explicit cross-surface compensation reconciliation below rather than accepting the card in isolation.
- [ ] Needs-attention items link to the correct lesson/homework.
- [ ] Telegram prompt disappears after connection.

### `/teacher/sessions`

- [ ] Upcoming/Past grouping, search/filter if shown, student names, dates, status, and Meet links are correct.
- [ ] Inline rename persists everywhere the event title appears.
- [ ] A scheduled future booking does **not** become startable before **T-10**. Start is available from ten minutes before scheduled start through the implemented post-end grace window; Resume appears for an already-live lesson.
- [ ] Opening a future row does not create a new lesson or debit again.
- [ ] The separate **Start Session now** path requires a student and creates a one-time lesson at the current time; it is not a shortcut for starting a future booking.
- [ ] Missing room/balance and overlap errors are explicit and do not leave partial records.

### `/teacher/sessions/[id]/live`

- [ ] Header shows correct lesson/student, timer, Meet link, End Session, student no-show timing, and safe leave/discard prompts.
- [ ] Mic check and audio-source choices (mic, mic + shared tab, shared tab, approved upload) explain permissions and selected state.
- [ ] Start/connecting/recording/pause/resume/error states are visible; pause stops transcript intake while the lesson timer continues.
- [ ] Live transcript streams final/interim text and stable speaker labels where available; no secrets appear in errors.
- [ ] Reading tab selects published work and opens the share view; Quiz and Questions stay disabled/empty until transcript content exists; Notes autosave on blur.
- [ ] Stop/end saves transcript and duration, retains approved audio backup behavior, and routes to review exactly once.
- [ ] The mounted teacher action is **student no-show** only. It remains unavailable until the UI's displayed allowed time, then records the student no-show once.
- [ ] Teacher absence/no-show is a separate automatic/admin policy path, not a party choice in the live lesson; verify its outcome through that separate path when the scenario is safely available.
- [ ] Discard distinguishes a placed booking from a one-time start and does not remove/refund the wrong event.

### `/teacher/share/quiz` and `/teacher/share/reading`

- [ ] Each pop-out opens only from the live flow with its intended content, remains readable when screen-shared, and handles missing/closed source state without leaking other lessons.
- [ ] Controls intended only for the teacher are not exposed in the student-facing shared view.

### `/teacher/sessions/[id]` — review

- [ ] Transcript/Notes, Summary, Vocabulary, and Homework tabs load the same lesson and preserve edits after reload.
- [ ] Teacher notes save and are included in generation context as intended.
- [ ] Generate/regenerate Summary and Vocabulary show loading and provider errors; existing approved content is not silently overwritten after a failed request.
- [ ] Vocabulary rows retain anchored context, word, definition, learner-language translation, part of speech, and teacher edits; add/remove/save works.
- [ ] Summary and vocabulary require explicit **Approve**. **Publish** remains disabled until both are approved.
- [ ] Publishing creates learner-visible summary/vocabulary/flashcards/quiz content once and assigns any approved homework. Reopen returns editable content without destroying learner work.
- [ ] Soft delete is tested only with a disposable lesson and must appear in the admin deleted-session surface.

### `/teacher/students` and `/teacher/students/[id]`

- [ ] Roster shows only assigned students with level, lessons left, next lesson, recent activity, and homework flags.
- [ ] Whole row opens the correct student.
- [ ] Detail balance/expiry, history, homework counts, onboarding answers, timezone/local clock, contact, and upcoming/recent lessons agree with student/admin views.
- [ ] Native-language setter supports Russian, Kazakh, Arabic, and English; change persists and future learner translations use it.
- [ ] A teacher cannot open an unassigned or cross-academy student by editing the URL.

### `/teacher/library`, `/teacher/library/work/[workId]`, `/teacher/library/work/[workId]/[unitId]`

- [ ] “Reading with” requires an assigned student before saving vocabulary for someone else.
- [ ] Student selection remains in the query string while moving through work/unit pages.
- [ ] Missing learner language shows a warning linked to student detail.
- [ ] Word save goes to the selected student's one word list, uses that learner's language, and is idempotent.
- [ ] Catalogue filters, table of contents, reader position, source credit, and empty/not-found states match the student reader.

### `/teacher/calendar`

- [ ] Day/week/month views and academy/viewer time labels are clear.
- [ ] Open/block brush, tap/drag multi-slot selection, date-only/weekly scope, undo, and copy-to-next-week/four-weeks persist correctly.
- [ ] Meeting-room edit validates and updates future lesson links as intended.
- [ ] Time-off block/unblock reports conflicts; existing lessons are not silently removed; admin visibility/approval appears when required.
- [ ] Event dialog supports rename, Meet, Resume/Start using the same T-10 rule, move, and cancel with policy reason.
- [ ] One-time lesson has two distinct actions: add to calendar versus add and start now.
- [ ] Submitted homework and overdue notes appear in needs attention with correct links.

### `/teacher/guide`

- [ ] Links resolve to current teacher pages and terminology/actions match the live UI.
- [ ] Setup, running lessons, homework, library, student, and payment guidance remain readable on phone even though teacher work is desktop-first.

### `/teacher/profile`

- [ ] Account card, assigned students, open hours, upcoming lessons, meeting room, introduction, and IELTS status are accurate. Record provisional payable for comparison with the dashboard, admin teacher detail, Payroll, and POLICY §4.
- [ ] Editing meeting room/introduction/IELTS persists and affects student/admin views where shown.
- [ ] Links to calendar, sessions, roster, Telegram, Clerk account, and sign-out work.

## 9. Admin portal route checks

### `/admin` — dashboard

- [ ] Student/teacher/lesson metrics agree with source pages.
- [ ] Monthly income, expenses, and result come from the finance ledger and preserve currency distinctions.
- [ ] Needs-attention counts and pending reschedule card link to the exact filtered work.
- [ ] Empty academy renders zeros/empty copy rather than fabricated activity.

### `/admin/attention`

- [ ] Unpaid lessons, schedule/balance risks, expiring lessons, gone quiet, never booked, overdue notes, homework review, and finance reminders appear only when their conditions apply.
- [ ] Each action opens the correct student, lesson, calendar, or billing area.
- [ ] Dismiss hides one item for 30 days without changing student state; restore returns it.
- [ ] Empty sections and provider-independent loading/error states are understandable.

### `/admin/people`

- [ ] Students, Instructors, and Admins tabs show correct counts and academy-local/person-local time.
- [ ] Student row opens `/admin/students/[id]`; assign/reassign teacher, edit, pause/resume, and unpaired filter work without accidental row navigation.
- [ ] Pause dates/reason validate; pause sets the paused status and freezes expiry without silently deleting or changing confirmed bookings. Record confirmed bookings before/after, and confirm resume restores state once. If recurring-slot/materialization behavior is added later, record what occurs and compare it with POLICY §6 rather than assuming it exists.
- [ ] Instructor row opens `/admin/teachers/[id]`; meeting-room link, owed amount, Edit, and Availability board are accurate.
- [ ] Availability board edits the selected teacher only and uses academy time.
- [ ] Admin row opens `/admin/staff/[id]`; non-owner users cannot change protected access.
- [ ] Role/status editing rejects unsafe transitions and cannot demote/delete the protected platform owner.

### `/admin/students/[id]`

- [ ] Shared student detail matches the teacher view plus admin access; balance, expiry, onboarding answers, homework, and lessons are accurate.
- [ ] URL editing cannot cross academy boundaries.

### `/admin/teachers/[id]`

- [ ] Contact/WhatsApp, local time, timezone, room, assigned students, balances, next lessons, open hours, reliability, time off, homework review, and recent sessions agree with source pages. Record provisional payable for the cross-surface compensation reconciliation.
- [ ] Availability edits affect this teacher only.
- [ ] Calendar deep link selects the teacher once but still permits manually switching afterward.

### `/admin/staff/[id]`

- [ ] Contact and local clock render.
- [ ] Effective permissions distinguish role defaults from custom overrides.
- [ ] Only the platform owner can edit another admin's access; role checks and direct URLs cannot bypass owner protection.

### `/admin/sessions` and `/admin/sessions/deleted`

- [ ] Past/Upcoming lists show student, teacher, status, time, and the intended review link.
- [ ] `?lesson=` deep link highlights/opens the exact lesson.
- [ ] Soft delete needs confirmation and removes the session from active lists without erasing history.
- [ ] Deleted list restores only the selected disposable session; empty state is clear.

### `/admin/calendar`

- [ ] All-teachers mode and one-teacher mode render correct timezones, availability, lessons, cancellations, and time off.
- [ ] `?teacher=` and `?event=` deep links work across weeks/months.
- [ ] Assigning a student to an open slot previews conflicts/buffer/balance and deducts exactly one lesson only after success.
- [ ] Move/cancel uses the same server policy as student/teacher pages.
- [ ] Pending reschedule count opens the queue; time-off acknowledgement applies to the correct teacher/range.

### `/admin/scheduling/requests`

- [ ] Pending requests show student, teacher, source/destination times, and reason/context.
- [ ] Approve produces one moved lesson; Reject preserves the existing booking; repeated action is safe.
- [ ] Resolved request leaves the pending list and notifications/status reflect the decision.

### `/admin/library` and `/admin/library/works`

- [ ] `/admin/library` redirects to `/admin/library/works`.
- [ ] List separates draft/published status and opens the selected work.
- [ ] New reading requires title/content, supports book/article/story/dialogue metadata, and splits chapter Markdown into ordered units where applicable.
- [ ] Empty/loading states and long titles/tags remain usable.

### `/admin/library/works/[id]`

- [ ] Metadata edits cover title, kind, CEFR, description, topics, source, attribution, reading time, and approved cover behavior where present.
- [ ] Add/remove/reorder/edit units and Save units preserve content after reload.
- [ ] Prepare vocabulary shows bounded loading/provider failure and does not corrupt the work.
- [ ] Publish/unpublish changes student/teacher catalogue visibility.
- [ ] Delete is a **DESTRUCTIVE DELETE BOUNDARY**: test only on a disposable work with explicit approval and verify no unrelated work changes.

### `/admin/billing`

- [ ] The mounted surfaces are exactly **Commercial**, **Overview**, **Payroll**, **Expenses**, and **Money ledger**; each loads with internally consistent dates and currencies.
- [ ] Versioned catalogue supports ordered families/plans, localized labels/descriptions/benefits, draft versions, visibility, publication scope, archive, and restore.
- [ ] Student readback shows only published visible versions in the intended order and locale.
- [ ] Automatic discounts honor kind, scope, eligibility, allowlist, date window, use limit, priority, and immutable snapshot on an order.
- [ ] Pending order displays buyer, exact version snapshot, base/discount/net amounts, currency, lessons, expiry, request time, and status.
- [ ] **Grant** is the sole purchase fulfillment boundary: one click creates one lesson grant, one finance entry, correct notifications, and one terminal order status. Refresh/retry never duplicates any of them.
- [ ] Reject requires a useful reason and changes no lesson balance or income.
- [ ] Reconcile lesson balance and grant provenance using student billing/profile, admin student detail, Commercial order data, and the mounted finance surfaces.
- [ ] Record the same payable lesson IDs and displayed earnings from teacher dashboard, teacher profile, admin teacher detail, and Payroll. POLICY §4 currently defines compensation as 30% of realized per-lesson revenue; if a surface instead uses a flat per-lesson amount, diverges from another surface, or diverges from policy, mark **BUG**. If realized revenue or the approved model/rate cannot be established, mark **BLOCKED**.
- [ ] Do not execute a payroll run until the approved compensation model and rate are confirmed. Once confirmed in an approved run, Payroll must include only payable outcomes, exclude previously paid lesson IDs, write one salary entry, and let Undo reverse only that run.
- [ ] Expenses/reminders validate amount/currency/date; recording, skipping, deleting, or undoing is tested only with disposable entries and exact ledger readback.
- [ ] Mixed currencies are not silently combined without an exchange rate.

### `/admin/settings`

- [ ] Branding name/color/logo preview and Save update the shell. Logo type/size errors are clear; removal is a **DESTRUCTIVE DELETE BOUNDARY** for the current custom asset.
- [ ] Student-sidebar feature toggles that are enforced change navigation; toggles labeled not enforced do not pretend otherwise.
- [ ] Teacher invite link copy/rotation works. Rotation is intentional because it invalidates the prior link.
- [ ] AI model refresh/sample and prompt editor validate model, limits, required placeholders, save/reset, loading, and provider failure without exposing secrets.
- [ ] Achievement create/edit/delete validates fields; delete is tested only on a disposable definition and does not remove unrelated earned records unexpectedly.
- [ ] Scheduling settings that are editable affect real rules; fixed policy values remain read-only.

### `/admin/profile`

- [ ] Account card edits persist; academy counts and quick links are accurate.
- [ ] Access panel shows role, academy, academy timezone, and member-since value.
- [ ] Telegram, Clerk account, and sign-out work.

## 10. Access-control and role-leakage pass

Run these with separate authenticated browser profiles, not repeated sign-in/out in one shared tab.

Routine checks in this section use visible role state and direct URLs only. Request replay or mutation-authorization probing requires a separately approved disposable security test and is outside routine manual QA.

- [ ] Signed-out visits to every `/student`, `/teacher`, and `/admin` page redirect to sign-in without rendering protected data first.
- [ ] Student cannot open teacher/admin pages or invoke controls by typing URLs.
- [ ] Teacher cannot open admin pages, another teacher's lesson, an unassigned student's detail/homework, or academy-wide data.
- [ ] Admin access follows effective permission overrides; hiding a nav item is not sufficient, and direct URLs must enforce the same role boundary.
- [ ] Dynamic IDs from another student/teacher/academy return not-found/forbidden with no names, transcript, balance, contact, or timing leak.
- [ ] Share windows expose only the selected lesson content and no teacher-only controls.
- [ ] After sign-out, Back, cached authenticated tabs, notifications, profile pages, and browser history do not reveal private data. A previously copied opaque ICS bearer-token feed may continue outside Clerk by design; validate it through token secrecy, owner isolation, event/timezone accuracy, and any mounted revocation/rotation control instead.
- [ ] Changing active academy cannot leave stale data from the prior academy on screen.
- [ ] Errors and network responses do not include provider keys, Clerk tokens, internal stack details, or private payloads.

## 11. Localization and RTL pass

Run the complete student critical path in **Russian**, **Kazakh**, and **Arabic**, not just the dashboard.

For each locale:

- [ ] Switch through the real locale control; refresh and sign in again to verify persistence.
- [ ] Check onboarding, nav, dashboard, lessons/detail, homework/detail, study session/completion, vocabulary, library/work/reader/popover, calendar dialogs/policy text, achievements, billing/order states, profile, notifications, and error/empty/loading states.
- [ ] No raw message keys, placeholder English learner UI, wrong-language fragments, or broken ICU counts.
- [ ] Dates, weekdays, countdowns, due labels, number/currency formatting, lesson counts, and status labels use the selected locale while user-authored/lesson English remains unchanged.
- [ ] Learner-language vocabulary translation follows the student's native-language setting, not merely the shell locale.

Arabic-specific:

- [ ] `<html dir="rtl">` takes effect; sidebar/drawer, text alignment, icons, breadcrumbs, dialogs, selects, popovers, tables, cards, and notification panel use logical direction.
- [ ] Calendar remains chronological and usable; previous/next meaning and time columns are not accidentally reversed.
- [ ] Mixed Arabic, English, URLs, phone numbers, KZT values, and lesson times remain readable and isolated.
- [ ] No horizontal overflow at 320, 375, and 412 px widths.

Russian/Kazakh-specific:

- [ ] Both remain LTR.
- [ ] Longer labels wrap without hiding controls.
- [ ] Kazakh characters and month/day names render correctly; Russian and Kazakh copy are not mixed.

## 12. Responsive, accessibility, validation, and state checks

Apply this section to every touched route and at least one representative route per role.

### Responsive

- [ ] 320, 375, 412, 768, 1024, and 1440 px widths: no page-level horizontal scroll unless a clearly scrollable data table requires it.
- [ ] Student phone shell uses the drawer and bottom navigation without content hiding behind either; active destination is clear.
- [ ] Main content, not the whole document, scrolls where intended; sticky topbar/calendar headers do not cover each other.
- [ ] Dialogs/sheets fit the viewport, trap focus, and remain closable with keyboard and touch.
- [ ] Tables provide a usable scroll/wrap strategy; destructive and primary actions do not overlap.

### Accessibility

- [ ] Complete primary flows with keyboard only; focus order follows reading order and focus is visibly styled.
- [ ] Buttons/links have accessible names; icon-only actions have labels/tooltips; form labels bind to controls.
- [ ] Enter/Space behavior is appropriate and does not submit twice.
- [ ] Dialog focus enters, stays inside, and returns to the opener; Escape respects unsaved/recording confirmation.
- [ ] Status is conveyed by text as well as color; contrast is readable in normal, hover, disabled, error, and focus states.
- [ ] Headings are hierarchical; tables have headers; images/cover/QR have useful alternative text.
- [ ] Zoom to 200% and use reduced-motion/large-text settings for touched critical screens.

### Validation and mutation safety

- [ ] Required, malformed, boundary, too-long, past-date, end-before-start, negative amount, zero amount, and invalid file cases show field-level/actionable errors.
- [ ] Primary action disables or becomes idempotent while saving; double click, refresh, and Back do not duplicate booking, order, Grant, publish, payroll, or notifications.
- [ ] Cancel/close preserves or discards edits exactly as explained.
- [ ] Server authorization/validation errors are visible without destroying current input.

### Loading, error, and empty states

- [ ] Initial query loading is visually distinct from an empty result.
- [ ] Slow mutation/generation/upload has progress and prevents conflicting actions.
- [ ] Network offline/500/provider failure produces a recoverable message; retry only when safe.
- [ ] Empty academy, no teacher, no balance, no availability, no lessons, no homework, no due cards, no library works, no notifications, no pending orders, and no finance rows each have honest copy and a valid next action where one exists.
- [ ] Invalid/deleted dynamic IDs show not-found/forbidden, never an endless loader or another user's data.

## 13. Cross-role lifecycle scenarios

These scenarios prove state handoffs. Use one run record and capture the IDs before switching roles.

### L1 — Signup and onboarding

1. Student: sign up, auto-join the intended academy, complete student onboarding once, and land on `/student`; record the configured free-trial lesson grant and its provenance when enabled.
2. Admin: confirm exactly one signup notification with a valid `/admin/people` or `/admin/students/[id]` link, and confirm the student in People with the submitted data.
3. Teacher invite lane: use a valid admin-generated invite with a separate new identity; complete teacher onboarding and verify room/availability/profile.
4. With another disposable identity, an invalid/expired teacher invite must fail visibly and must not auto-join as a student; silent student fallback is a **BUG**.
5. Repeat safe navigation/reload checks; ensure neither successful identity changes role or academy and the trial grant/notification do not duplicate.

Expected invariant: one academy membership, one application user, one role, one onboarding record, exactly one configured first-completion trial grant when enabled (none when disabled), and one signup notification.

### L2 — Versioned catalogue → pending billing order → admin Grant

1. Admin: record the active Standard Tutoring/IELTS version IDs, localized labels, lessons, prices, expiry, benefits, visibility, and any automatic discount.
2. Student: open billing in the target locale, select one offer, verify the snapshot, and confirm once.
3. Student: verify one pending billing order and that a second request is blocked.
4. Admin: locate the exact order, compare every snapshot field, and use **Grant** once.
5. Student: verify granted status, increased lesson balance, and notification.
6. Admin: verify one grant/provenance row and one finance income entry; refresh and ensure Grant cannot repeat.

**REAL-MONEY TRANSFER BOUNDARY:** do not send money in this scenario. If financial settlement itself must be tested, schedule a separately approved reconciliation run.

### L3 — Balance and booking

1. Record balance and expiry on student billing/profile and admin/student detail.
2. Teacher: open a safe future availability range.
3. Student: stage one valid slot; inspect repeat preview but confirm the intended count only.
4. Verify balance preview, confirm, reload, and record event ID.
5. Teacher/admin: confirm the same event, student, title, time in each viewer's timezone, and room link.
6. Student/admin: verify exactly the confirmed number of lessons was deducted and expiry/provenance remain correct.

### L4 — Future booking T-10 versus Start Session now

1. Create/select a future booking outside T-10. Teacher Sessions/Calendar must show it but not permit Start.
2. Observe or intentionally schedule a safe event at the boundary. Record academy current time, event start/end, and control state immediately before and at T-10.
3. At/after T-10, start the scheduled event once; verify it attaches to that event and does not deduct again.
4. Separately use **Start Session now** for a controlled student. Verify it creates a one-time current event and live lesson, distinct from the future booking.
5. Discard the one-time start only if cleanup was planned; confirm the future booking remains untouched.

Expected invariant: the time-gated scheduled path and the immediate one-time path never substitute for or mutate each other.

### L5 — Real recording and transcription

1. Confirm consent and use non-sensitive scripted speech. Prefer mic-only or an approved upload for routine QA.
2. Teacher: start the intended live lesson; choose source; verify permission/connecting/recording states.
3. Speak/read the safe script; pause/resume; confirm timer, waveform, interim/final transcript, and speaker labels where supported.
4. Use Notes and one transcript-dependent live action; end once.
5. Review: verify persisted transcript, duration, audio state, and route transition.

**PROVIDER OUTAGE BOUNDARY:** if Soniox/storage fails, capture status and recovery; do not repeatedly finalize/upload the same recording.

**GOOGLE MEET TWO-SIDED AUDIO BOUNDARY:** test mic + Meet tab only in a separate consented two-person run with shared-tab audio explicitly enabled.

### L6 — AI summary, vocabulary, flashcards, and quiz

1. Teacher review: generate summary and vocabulary from the controlled transcript.
2. Inspect every result; edit a summary error and vocabulary definition/translation/context.
3. Trigger one safe provider failure only if intentionally available; existing content must survive.
4. Approve summary and vocabulary, then Publish once.
5. Student lesson: verify edited summary, vocabulary, pronunciation, flashcards, and quiz.
6. Before submission, record attempt/streak/achievement state. Submit once, record the result, reload the lesson and readbacks, and verify the score, single attempt, streak update, and achievement side effects remain exactly once; any duplicate after reload is a **BUG**.

**PROVIDER OUTAGE BOUNDARY:** an unavailable OpenRouter task blocks generation only; manual editing and unrelated checks continue.

### L7 — Homework assign → submit → grade → feedback

1. Teacher review: generate or manually author mixed homework; edit it; set/clear an override due date; Approve it.
2. Publish the lesson. Student Study/Homework must show the assignment even if lesson notes navigation differs.
3. Student: answer each node type, reload to prove autosave, then submit once.
4. Teacher: follow needs-attention link; verify auto-grading, override where allowed, score open work, add feedback, and publish review.
5. Student: verify read-only reviewed work, score, feedback, and notification.

Expected invariant: answer keys are never present in the student's pre-review view or network data.

### L8 — Library → reader → save word → SRS

1. Admin: create or select a safe published work/unit; record metadata and version state. Do not delete a shared work.
2. Student: browse/filter, open work/unit, save a distinctive word, and verify learner-language translation.
3. Verify the word in My Words and Study; complete a review and confirm due/progress changes.
4. Teacher: select that student in the reader and save a second word; verify it reaches the same learner list, not the teacher or another student.
5. Reopen reader to confirm saved tint and reading-position resume.

### L9 — Notifications

For signup, booking, reschedule decision, one-time start, lesson publication, homework assignment/submission/review, balance expiry where safely available, achievement, billing order/Grant, and payroll:

1. Record expected recipients, kind, source ID, and deep link.
2. Trigger the source action once.
3. Verify one notification for each intended role, none for unintended roles, readable localized copy where learner-facing, and a valid destination.
4. Open one notification and verify it marks read; Mark all read updates count.
5. If Telegram is intentionally connected, verify only notifications created after connection and no private data leakage. Disconnect/reconnect only with account owner approval.

### L10 — Cancel, reschedule, and no-show

1. Student: preview cancel/move outside and inside relevant policy windows without confirming every case. Copy the consequence text.
2. Confirm one approved cancel or move; verify event status/time, balance consequence, notification, and all three role calendars.
3. If a move becomes an admin request, approve or reject in `/admin/scheduling/requests` and verify one outcome.
4. Teacher live: the mounted **student no-show** action stays unavailable until the UI's displayed allowed time; after the threshold, record student no-show once.
5. Verify student no-show charging/refund behavior, payable status, history labels, and no duplicate notification. Verify teacher absence/no-show only through its separate automatic/admin policy path when safely available; it is not a live party selector.

Expected invariant: reschedule is not cancellation; no action can debit, refund, or move twice.

### L11 — Billing and finance invariants

1. Capture starting lesson balance, grant provenance/expiry from student billing/profile and admin student detail, pending order from Commercial, relevant finance totals, teacher unpaid lesson IDs, and currency.
2. Complete L2.
3. Verify order snapshot never changes when catalogue/version/discount configuration later changes.
4. Verify income exists only after Grant and exactly matches the order snapshot.
5. Complete one payable lesson; verify it enters the teacher's unpaid set once, then record its realized revenue and the earnings/payable values shown on teacher dashboard, teacher profile, admin teacher detail, and Payroll.
6. Compare those values with POLICY §4's 30% of realized per-lesson revenue. A flat per-lesson amount, cross-screen divergence, or policy divergence is a **BUG**; an unconfirmed revenue basis or compensation model/rate is **BLOCKED**.
7. Do not execute a payroll run until the approved compensation model and rate are confirmed. If they are confirmed in a separately approved disposable finance run, verify exact lesson IDs, one salary entry, totals, and teacher readback; Undo only if explicitly planned.
8. Verify cancellations, no-shows, one-time starts/discards, expiry, and reschedules preserve ledger/provenance and never produce a negative or duplicated lesson balance.
9. Keep each currency separate unless a configured rate explicitly converts it.

## 14. End-of-run reconciliation

- [ ] Re-open the student's billing/profile/calendar and record final lesson balance, expiry, booking IDs, and order status.
- [ ] Re-open teacher Sessions/Calendar and admin Calendar/Sessions for the same IDs.
- [ ] Reconcile notifications by source action and recipient.
- [ ] Reconcile pending billing order/Grant and finance/payroll entries if touched.
- [ ] Identify every created record and whether it remains as intentional QA history. Do not perform unapproved deletion.
- [ ] Confirm screenshots/logs contain no credentials, tickets, private transcript, or unrelated student data.
- [ ] Count PASS/BUG/BLOCKED/NA from the log; do not estimate.

## 15. Coverage and bug-count summary

Fill this from the completed checklist.

| Area | PASS | BUG | BLOCKED | NA | Bug IDs / notes |
|---|---:|---:|---:|---:|---|
| Public/auth/organization |  |  |  |  |  |
| Student onboarding |  |  |  |  |  |
| Teacher onboarding |  |  |  |  |  |
| Student routes |  |  |  |  |  |
| Teacher routes |  |  |  |  |  |
| Admin routes |  |  |  |  |  |
| Access control/privacy |  |  |  |  |  |
| Russian |  |  |  |  |  |
| Kazakh |  |  |  |  |  |
| Arabic/RTL |  |  |  |  |  |
| Mobile/responsive |  |  |  |  |  |
| Accessibility/keyboard |  |  |  |  |  |
| Validation/error/loading/empty |  |  |  |  |  |
| Signup/onboarding lifecycle |  |  |  |  |  |
| Catalogue/order/Grant |  |  |  |  |  |
| Balance/booking/T-10/start-now |  |  |  |  |  |
| Recording/transcription |  |  |  |  |  |
| AI review/publish |  |  |  |  |  |
| Homework lifecycle |  |  |  |  |  |
| Library/word/SRS |  |  |  |  |  |
| Notifications |  |  |  |  |  |
| Cancel/reschedule/no-show |  |  |  |  |  |
| Billing/finance invariants |  |  |  |  |  |
| **TOTAL** |  |  |  |  |  |

Release note:

```text
Verdict: READY | READY WITH ACCEPTED RISKS | NOT READY
Open S0/S1:
Open S2:
Open S3/S4:
Blocked boundaries:
Intentional data left behind:
Follow-up owner/date:
```

## 16. Reusable blank bug log

| ID | Severity | Category | Role | Device/browser/locale | URL | Short title | Status | Evidence link | Owner |
|---|---|---|---|---|---|---|---|---|---|
| BUG-001 |  |  |  |  |  |  | Open |  |  |
| BUG-002 |  |  |  |  |  |  | Open |  |  |
| BUG-003 |  |  |  |  |  |  | Open |  |  |
| BUG-004 |  |  |  |  |  |  | Open |  |  |
| BUG-005 |  |  |  |  |  |  | Open |  |  |
