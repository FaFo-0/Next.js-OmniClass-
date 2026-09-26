# OmniClass Calendar UX Redesign — Research-Backed Product and Implementation Plan

> **Implementation active (authorized 2026-09-26).** Revised after critical review of the preceding plan, the actual application, and official scheduling documentation from comparable teaching platforms. FaFo authorized implementation of the recommended package, including the three section 17 policy recommendations and retirement of obsolete student repeat writing. The worker must preserve tenant isolation, credit/event atomicity, and production safety; no unrelated product or protected production data may be deleted. Track verified changes and blockers in this file and `MASTER_PLAN.md`.

**Goal:** Let a student understand their schedule and arrange one lesson or a month of lessons without learning a custom grid language; let teachers declare working hours and manage lessons; let admins see the academy clearly and act in explicit teacher/student context.

**Architecture:** One scheduling domain, role-specific task flows, shared date/time/event primitives. Preserve the existing Convex event, credit, notification and export model. One student draft contains concrete dated lesson intentions, never placeholder calendar events. Share a small visual header where useful, not one universal interaction component.

**Stack:** Existing Next.js, React, Convex, next-intl, Tailwind and UI primitives. No new calendar provider, OAuth, resource/group calendar, automatic scheduler or calendar library is required.

**Reviewed baseline:** `31b8292e69b1f584c38160353961ab4674a1a065`, `master`. The research findings remain source/documentation evidence, not measured usability evidence. The implementation and release gates below are the current verification record; no competitor booking was performed.

---

## Implementation handoff — read this first

**Disposition: keep this shipped implementation; do not start another redesign or research round.** The prior revision preserved the essential research-backed direction. This release corrected the implementation gaps identified in the audit. The 2026-09-26 authorization, verification status and remaining blockers are explicit.

**Authorized complete release:** finite weekly patterns and flexible dates share one draft; ordinary self-booking extends through the following academy calendar month; legacy repeat privileges are retired prospectively; reserved booked lessons retain their entitlement when unreserved balance expires; and confirmation uses a small durable operation receipt. The three policy recommendations in section 17 are accepted and implemented; the redesigned confirmation UI is bound to the receipt/context contract.

**Owner decision recorded:** accept the recommended package and implement the recommended path below, not the compatibility alternatives. Do not keep two repeat experiences permanently to avoid a decision. No further competitor research is a prerequisite.

**Worker reading order:** this box → section 17 decision record → section 14 slices → section 11 contracts → section 13 files → sections 15–16 verification. Sections 2–4 retain justification/evidence; sections 5–10 define the interaction and domain behavior. Source line numbers are baseline anchors, not patch instructions. Recheck the revision before changing code.

**Release safety boundary:** preserve tenant/credit/atomicity guarantees, do not expand into billing, recurrence infrastructure or unrelated product work, and do not mutate production/test data for QA. The explicit release request authorizes the repository's normal Convex deploy → commit → push sequence after the listed gates and target verification.

### Verified implementation status — 2026-09-26

- **Student:** explicit finite weekly-pattern and individual-date entry feed one canonical academy-date draft; Review checks the concrete list; Confirm uses expected teacher/activity/timezone/policy context, a required request ID and a durable `calendarBookingRequests` receipt. Conflict intentions remain staged for explicit Remove or Replace repair; successful confirmation clears only the resolved draft.
- **Academy calendar boundary:** ordinary student self-booking and batch validation use the exclusive midnight boundary at the start of the month after next in the academy timezone, with notice and daily/weekly caps kept separate.
- **Legacy repeat writer:** `repeat: true` is rejected by the student preview/confirm batch path with an explicit retirement error. Existing recurring rows remain readable for history/maintenance; no deletion, migration, cron revival or automatic repair UI was performed.
- **Availability:** the editor reads the source rows and source-state precondition, offers explicit Save/Reset, validates teacher scope and protects booked lessons; the legacy array-shaped reader remains for compatibility.
- **Admin:** all-teacher mode renders a read-only date-grouped `CalendarAgenda`; selecting a teacher retains the operational calendar and mutation controls.
- **Verification:** `npx convex codegen`; `npm run typecheck`; `npx tsx --test tests/calendarBookingPlan.test.ts tests/calendarRedesignContracts.test.ts tests/pdfFeatureSliceContracts.test.ts`; `npx tsx --test tests/calendar*.test.ts`; `npm test`; `npm run build`; and `git diff --check` were run during this release. Touched-file ESLint found only pre-existing errors/warnings in the legacy admin/teacher calendar files and pre-existing unused-variable warnings in `WeeklyCalendar`; no new lint finding was introduced.
- **Browser QA:** a repository-supported student dev-login session was minted and `/student/calendar` was attempted read-only against dev deployment `quixotic-quail-572`. The route could not settle because `calendar:getStudentCalendar` failed with `unique() query returned more than one result from table users` at `convex/calendar.ts:600`; resolving that duplicate-user data condition would require a separately authorized data cleanup. No tenant/test data was mutated, no E2E walker was used, and no browser pass is claimed.

## 1. Recommendation in plain language

**Keep OmniClass’s select-many/confirm-once model. Make regular planning first-class: choose weekly times → preview the actual month → repair individual exceptions → confirm once. Flexible individual-date selection fills the same draft.**

1. **Student:** keep a prominent next-lesson summary and a familiar month overview of booked lessons. `Book lessons` immediately offers **Weekly schedule** and **Choose individual dates** inside the same contextual panel. Weekly planning is not hidden behind a first date/time selection. Both entry methods feed one explicitly unconfirmed draft and one review/confirmation.
2. **Month planning:** choose a period, including **Next month** with its exact dates, then weekly day/time pairs and an explicit end date. Evaluate the pattern across the whole period, display every intended occurrence alongside existing lessons, and repair individual exceptions. This is a finite authoring method, not an ongoing reservation or automatic renewal service.
3. **Desktop:** use a month plus one contextual side panel for available times, draft summary and explicit review. Do not build a date picker, a separate time column and a permanently fixed third-column checkout rail.
4. **Phone:** compact month date grid, then readable selected-day times. A sticky `Review N lessons` bar appears only when there is a draft. The review sheet opens only on Review—not after every time tap.
5. **Teacher:** Week schedule on desktop; agenda/day on phone. `Manage availability` edits usual weekly hours and changes on specific dates with explicit Save. Keep lesson management separate from working-hours editing.
6. **Admin:** a read-only week agenda grouped by date for all teachers; choose a teacher for their day/week/month operational calendar. Simultaneous lessons with different teachers are normal, not conflicts.
7. **Use a calendar-aligned booking boundary through the end of the following calendar month** to satisfy whole-next-month planning, subject to published teacher availability, eligible balance and existing limits. This boundary was accepted on 2026-09-26 and is implemented in the policy helper and student/batch writers. A truthful partial-month fallback is no longer the release contract.

The first plan over-optimized single appointments. The next revision restored batching but still hid weekly planning after a seed selection and retained a horizon that could not meet the stated goal. This research-backed revision corrects both. Month is the recommended planning overview, not a competitor-proven universal daily default; everyday next-lesson access stays prominent.

### The important distinction

- A **time tap** means “add this lesson to my plan.” No reservation, credit spend or notification occurs.
- **Review** means “show me exactly what will be booked and what it will use.”
- **Confirm** means “attempt to book this exact list atomically.” Only server success means booked.

One confirmation reduces repeated checkout work. It does not eliminate the student's choices of date and time. The earlier explanation blurred these ideas.

### What is decided versus deferred

The two first-class booking entry methods, shared draft, responsive review, teacher/editor direction, admin overview and calendar-month boundary are accepted release decisions. Ordinary multi-date and finite-pattern booking use one explicit batch shape. Repeat writer retirement and reserved-entitlement expiry are reconciled in `POLICY.md` and `convex/lib/policy.ts`; no approval gate remains for this scope.

## 2. Why this is better than both the current UI and the earlier plan

| Decision | Current system / previous proposal | Revised choice and reason | Cost accepted |
|---|---|---|---|
| Student starting point | Current role defaults are week/day. Previous plan over-weighted appointment discovery; the next revision asserted month-first too universally. | Prominent next lesson plus month planning overview; Book lessons stays on the same surface. Retain Day/Week access. | Month is a task-driven product choice for this release, not a measured universal preference. |
| Selecting several lessons | Current grid stages several selections. Previous plan adds Book another and opens phone review on selection. | Selections accumulate automatically. Keep the successful select-many/confirm-once model. | Draft needs an unmistakable Selected—not booked state. |
| Monthly overview | Previous month is mainly a date navigator. | Booked, selected and needs-attention dates remain visible across the month. | Phone cells use compact markers; exact times are listed below, not squeezed into cells. |
| Finding a start | Current open bands require hover/snap interpretation. | Selected date exposes actual candidate start buttons with full lesson duration understood. | Wide availability can produce long lists; group by time of day without hiding valid starts. |
| Summary location | Duplicate top/bottom action cards; previous fixed right rail plus auto-open sheet. | One contextual desktop panel; one phone draft bar and an explicitly opened review sheet. | Desktop review temporarily replaces the time list; Back preserves selections and date. |
| Monthly repetition | Current boolean repeats each seed three times; the last revision hid the pattern behind selecting a first seed. | Weekly schedule is visible on booking entry: period + weekday/time pairs → exact dates and exceptions → same draft/confirm. | Must evaluate the whole period, not imply the first date proves recurring availability. |
| Booking boundary | Last revision kept 28 rolling days and explained exclusions. | Bookability through the end of next academy calendar month, accepted and implemented on 2026-09-26. | More certainty for students requires teachers to publish and commit capacity further ahead; the release keeps published availability and existing limits as gates. |
| Teacher editing | Brush cells, persistent weekly/date scope, inverse-toggle Undo. | Human-readable ranges, date-specific changes, one Save, Reset before save. | Less spatially immediate than painting; affected lesson context remains visible. |
| Admin overview | Multiple teachers' events share grid coordinates; previous plan keeps a labelled read-only grid. | Grouped week agenda: every event gets a readable row. | Less visual free/busy comparison; selected-teacher week grid preserves that use case. |
| Reuse | Previous plan prescribes broad shell extraction and a new range writer first. | Deliver student workflow against existing contracts first; reuse and harden existing weekly range API; extract only real shared responsibility. | Some old component complexity temporarily remains until all consumers migrate. |

This is a reasoned product recommendation, not proof from measured conversion rates or observed monthly-booking frequency. FaFo's stated month-planning requirement is the evidence for making batching first-class; vendor appointment patterns are not evidence that students only book one lesson at a time.

## 3. Evidence and current-state diagnosis

All source locations below refer to the reviewed baseline. Future workers should locate symbols again if the branch changes.

| Evidence | What it actually establishes | Consequence |
|---|---|---|
| `src/app/student/calendar/page.tsx:66–115,193–258,337–535` | Viewer-local staged starts, live batch preview, a repeat boolean, one confirmation mutation, duplicated action cards. Confirmation conflicts currently remove matching seed selections automatically. | Keep batching; preserve invalid intentions for explicit repair; replace duplicate controls. Store canonical academy values at selection, not after every timezone change. |
| `src/components/calendar/WeeklyCalendar.tsx` and `:861–946` | Shared display, brush, hover, staging and drag concerns; events share horizontal insets. | Narrow responsibilities incrementally. All-teacher overlap cannot be solved by labels/read-only flags alone. |
| `src/components/calendar/MonthCalendar.tsx:116–201` | Event month grid has a 700px minimum width; day container activation is pointer-oriented. | Do not reuse unchanged on phones. Compact date cells and semantic keyboard behavior need deliberate work. |
| `src/components/calendar/calendarShared.tsx:34–75` | `bookableStarts` checks range fit, busy/buffer, granularity and optional notice/horizon; it does not validate all caps, credit allocation or activity configuration. | Call these available candidates, not guaranteed server-valid bookings. Preview selected intentions separately. |
| `calendarShared.tsx:169–211,215–225,296–305` | Cross-midnight ranges lose their next-day continuation; timezone changes persist a profile preference; dualTime displays two clocks without their differing dates. | Generate starts before display conversion; preserve source identity; show dates when zones cross midnight. Treat timezone preference writes as real writes. |
| `convex/calendar.ts:1784–2047` | Explicit batch API, finite expansion, item-specific validation, all-or-nothing mutation, credit reservations and teacher notifications. | Reuse the transaction model; do not replace with repeated book-one mutations or silent partial success. |
| `convex/lib/repeatBookings.ts:19–35`; `tests/repeatBookings.test.ts` | Each seed expands into exactly three occurrences. Seeds need not be in one calendar week. No editable occurrence exclusions. | Three occurrences per seed is not “fill this month.” Display expanded counts/dates; do not infer counts from seed length. |
| `convex/calendar.ts:1682–1683,1824–1848,1863` | Generated repeat occurrences have different horizon treatment and a first-grant expiry projection. | Flattening repeats into ordinary dates is not automatically behavior-preserving. See policy gates and contract corrections. |
| `convex/calendar.ts:1952–1976`; student page `:193–217` | Retry lookup is prefix-based on event IDs, ignores deleted events and does not compare a payload; client key survives mutable selection changes. | Preserve immutable submitted operation during uncertainty and correct retry identity handling. “Idempotency exists” is not sufficient assurance. |
| `convex/vacancies.ts:14–89` | A weekly source reader and range-shaped replace writer already exist. Writer deletes all rows and resets validity; role/target/time checks and lesson protection need hardening. | The previous “new range writer is the only backend gap” assertion is wrong. Reuse/harden before adding a parallel authority. |
| `convex/calendar.ts:1176–1257,1304–1357,1396–1537` | Date paint guards exact starts; weekly branch has no booked-lesson check. Copy-week adds open exceptions while preserving closed exceptions. Time off has broader protection and notification/approval metadata. | Define range replacement, copy, time off and true restoration precisely; they are not interchangeable operations. |
| `src/app/admin/people/page.tsx:525–541`; `src/components/teachers/TeacherDetail.tsx:256–258` | AvailabilityBoard is embedded outside the calendar route. | The replacement must support compact embedded editing, teacher identity, unsaved changes and the same server scope. |
| `convex/onboarding.ts:407–445`; `convex/vacancies.ts:getWeeklyHours`; teacher/profile/detail callers | Onboarding and profile summaries share weekly availability data. | Preserve validity/history and verify these consumers, not only the teacher calendar. |
| `convex/calendar.ts:2694–2805` | Move has different source/target policy checks from booking, excludes the moved event, and returns charge/reliability outcome. | Reuse picker visuals, not booking validation or booking credit assumptions. |
| `src/app/admin/calendar/page.tsx:54–196,245–283`; `convex/calendar.ts:2274–2412,2442–2605` | Admin deep links resolve context; ordinary assignment and one-time lesson differ. Admin assignment is not inherently restricted to green/open hours. | Preserve anywhere assignment and explicit buffer confirmation; adding admin one-time UI is a new entry point over an existing server capability, not an existing-control preservation claim. |

### Original PDF evidence, without over-interpreting it

- **Page 28, BU.016/BU.017:** mint selection, purple dashed proposals, inconsistent/overlapping conflict text and apparent placeholder show state ambiguity. `MASTER_PLAN.md:157–159` records symptom repairs; do not assert those exact bugs still reproduce. The broader usability complaint remains valid.
- **Page 31, BU.018:** familiar day/week/month navigation, integrated full-page use and less wasted padding. It is text, not a mockup mandating a 24-hour grid.
- **Page 33, FE.002:** focused calendar editing/booking, visible open spots, stable notice; expressly not every Google feature. `Book lessons` is clearer than Edit. A focused local booking state supplies this without a new route.
- **FS.003:** live private ICS subscription and snapshot export are already shipped. Preserve; do not re-plan as a new integration.

## 4. Research comparison: borrow conventions, not whole products

### Evidence quality and relevance

Official Englishdom teacher-wiki articles were read in a browser; official Preply, Cambly, Teachworks and TutorCruncher help articles were retrieved and checked. These document product behavior, not independently measured usability or a completed authenticated booking test. The final audit re-read the saved research synthesis and original Englishdom page text, checked its supporting quotes, and re-fetched the three load-bearing Preply booking, Cambly weekly, and Teachworks batch articles; it did not repeat the entire research. The Englishdom wiki describes student actions from teacher-facing documentation; it does not prove a student month-batch interface exists. Calendly’s 2020 redesign article reports customer research/beta feedback, but that is vendor-reported appointment evidence, not a tuition-planning experiment.[6]

No authenticated competitor booking was performed. No visual layout, conversion improvement or universal feature rollout is asserted from help text. The sources support component patterns; their combination below is our reasoned recommendation for FaFo’s task. Source IDs refer to the Sources block at the end of this document.

### Close teaching-platform comparators

| Platform / role | Documented behavior | Borrow for OmniClass | Reject / boundary |
|---|---|---|---|
| Englishdom, teacher guide describing regular tuition and student changes | Reports that the common format is two lessons weekly at consistent times; a one-off student move leaves the regular schedule unchanged.[1][3] Teachers cannot close an occupied slot without moving its lesson first.[2] Cancellation and student-information articles provide additional policy context, not proof of a month-batch picker.[4][5] | Routine plus explicit exceptions; protect booked lessons during availability changes. | Do not infer an observed student month-batch picker; do not import support-mediated frequency changes, closest-lesson restrictions, their cancellation rules or drag-first editing. Their student-frequency statement is not measured OmniClass usage. |
| Preply, student booking | Single and weekly choices are exposed on entry; multiple lessons can be scheduled if balance allows.[8] | Make regular and flexible intentions visible from the start. | Documentation does not prove their exact arbitrary-date staging/confirm-once interaction or establish a finite end-date control. |
| Preply, ongoing weekly reservations | Scheduled lessons consume balance; post-renewal reserved slots hold capacity without consuming balance yet and convert on renewal. Stopping recurrence leaves already scheduled lessons as standalone events.[9][13] | Keep booking, reservation, recurrence and billing meanings distinct. | Do not import cross-renewal holds or automatic materialization to solve a finite month task. Their 28-day billing cycle is not a universal booking horizon. |
| Cambly, student weekly lessons | Choose an available weekly slot and end date; more than one weekly lesson can be established.[10] | First-class finite weekly pattern through an explicit period/month boundary. | No claim of a dedicated Book next month command. Tutor proposal defaults and approval behavior are not automatically student-side behavior. |
| Teachworks, client booking plugin | When the academy enables a multi-lesson booking limit, selected time slots accumulate and the client confirms afterwards. The documented default is one lesson; the enabled flow uses Add & Select Another.[11] | Preserve OmniClass’s multi-date draft and single final submission. | Do not copy the extra per-selection button. This plugin documents explicit-date batching, not student-created recurrence; do not conflate separate request or staff channels. |
| Teachworks, teacher/admin availability | General hours use day/start/end rows; exceptions use separate unavailability.[12][16] | Usual weekly hours separate from date-specific changes. | Unavailability is subtractive; this does not prove a complete additive date-override model. Do not copy any assumed 24/7 fallback. |
| TutorCruncher / Teachworks, staff recurrence | Weekdays plus stop date/count; editing may apply to future lessons, with an explicit option to segregate one lesson from later series changes. TutorCruncher’s relative time shifts can also shift previously adjusted exceptions.[14][15] | Simple finite-period authoring and explicit edit scope if series editing is later introduced. | Staff capability is not student self-service evidence. Do not import full recurrence forms or unintuitive exception shifts. |

### General calendar and design-system references

| Reference | Useful evidence / intended convention | Borrow | Reject / limitation |
|---|---|---|---|
| Google Calendar views[17] | Familiar day/week/month/schedule choices. | Today, previous/next, period label, appropriate views, readable agenda. | A 24-hour grid or month view as every role’s compulsory default. |
| Google appointment schedules | Separates duration, weekly hours, date adjustments, booking window, lead time, buffers and conflict checks.[7] | Separate teacher hours from lesson events and student candidate starts. | OAuth/guest/title/conference complexity; student-editable policy controls. |
| Microsoft Scheduling Assistant[18] | Design reference for availability/workable-time signals, not a newly verified tutoring flow. | Usable dates and next-available navigation. | Multi-attendee free/busy matrix for a student with one assigned teacher. |
| Calendly scheduling page | Month and selected-day times on one page; reported feedback/beta research in the 2020 article.[6] | Readable date/time discovery without unnecessary backtracking. | Single-appointment checkout as the tuition model; no claim this proves monthly usability. |
| Apple HIG pickers[19], Material date pickers[20] | Design anchors for compact/inline date controls; not newly tested here. | Compact phone date control, accessible selection, semantic staff inputs. | Date selection as booking confirmation; copying platform visuals wholesale. |
| GOV.UK dates[21] | Task-specific near-future selection versus memorable-date entry. | Keyboard-operable date controls and labelled date jump. | Claiming a native input makes the authenticated Convex app work without JavaScript. |
| FullCalendar docs[22] | Implementation reference for familiar calendar primitives. | Staff event hierarchy and availability context. | Installing a calendar framework before a demonstrated need. |

Every reference above is registered in the Sources block at the end of this document. Englishdom, Preply, Cambly, Teachworks, TutorCruncher, Google appointment schedules and Calendly were retrieved as documentation during this research; Microsoft, Apple, Material, GOV.UK and FullCalendar remain design anchors that were not newly verified here. No competitor source proves the proposed month default, the combined workflow or any adoption outcome.

### What the research changes

1. Weekly schedule must be visible before any individual-date selection; flexible dates remain equally available inside the same draft system.
2. Use a finite period and exact dated occurrences, not a fixed three-occurrence repeat and not an ongoing reservation promise.
3. Preserve batch confirmation; no review sheet on each time tap.
4. A whole-next-month promise requires a compatible booking boundary. The accepted academy-calendar boundary is implemented; do not call an excluded or unavailable occurrence booked.
5. Keep routine exceptions independent. A month-level booking operation does not introduce series-level edit/cancel rights.

## 5. Month booking: weekly-first planning, precise meaning and accepted policy

### Three different requests must not be conflated

| Student intention | Support under current shape | Recommended UX |
|---|---|---|
| Choose several different dates | Explicit `bookings` array with `repeat:false` already supports this. | One additive draft across dates/month navigation, one preview, one confirm. |
| Use the same weekday/time pattern for a finite period | Current repeat only provides three occurrences per seed. | First-class weekly entry at booking start: period plus weekday/time pairs expanded to explicit dated intentions. No reservation template, materialization or cron. |
| Book every desired date in the whole next calendar month today | The accepted ordinary booking boundary is the following academy calendar month; availability, notice, balance and caps can still exclude individual occurrences. | Use the implemented calendar-month boundary and show every excluded intention honestly; never imply a reservation or automatic renewal. |

The release policy in `POLICY.md §5` / `convex/lib/policy.ts` now uses the academy calendar-month boundary for ordinary student self-booking. The UI receives the server-computed boundary metadata rather than maintaining a second policy catalogue.

Boundary behavior is server-computed: the exclusive upper instant is academy-time midnight on the first day of the month after next. Boundary days can still be partially bookable because minimum notice and availability remain separate checks; date-only disabling is insufficient.

### Exact booking-period contract

The accepted calendar-month rule replaces the fixed-day ceiling for ordinary self-booking with a **server-computed exclusive upper instant: midnight on the first day of the month after next, in the academy zone**. A start must be before that instant and meet minimum notice; the boundary governs start eligibility, not credit expiry. The implementation uses zoned calendar-month arithmetic, never a fixed 60-day duration or the browser/server machine zone.

Expose the lower/upper bounds, their inclusivity, academy zone and policy version from the student calendar/preview contract. Client candidate generation, next-available search, `bookLesson`, batch preview and batch commit use the same definition. `bookingHorizonDays` alone is insufficient for the proposed rule. Recalculate server-side at confirmation; re-fetch on focus and academy month rollover. Do not extend the separate move/cancel action horizon, teacher time-off rules or admin powers as a side effect.

The **Next month** preset means the next **academy calendar month**, with that zone and exact dates displayed. Weekly times default to the viewer's zone; generate pattern-zone occurrences, convert them, and include those whose academy dates fall within the chosen period. The calendar still displays viewer dates, including adjacent displayed dates when necessary. Review shows both dates when they differ. Never silently truncate a viewer-defined month and call it complete. Daily/weekly booking caps remain academy-date/week based, not viewer-date based.

### Weekly-first planning entry

Both methods are offered immediately inside `Book lessons`; neither is hidden behind the other.

- **Weekly schedule:** choose a period (including **Next month**, showing its exact dates), one or more weekday/start pairs, the pattern timezone and an explicit end date. Available before any individual date is selected.
- **Choose individual dates:** the existing flexible path. A student may also add one irregular lesson on top of a generated pattern.

Weekly-time discovery uses weekday rows and start-time choices derived from the union of candidate times across that weekday's occurrences in the period. Annotate each choice with coverage (for example, available on some dates / needs attention), counting matching existing bookings separately. Do not show only the first occurrence or only the intersection, which would hide a useful routine with one repairable exception. Read the bounded period once, derive candidate coverage locally, and server-preview the **chosen** concrete list; do not issue one query per time button or validate all alternative patterns as a single batch. Coverage describes time fit, not a balance/cap guarantee. Show the default pattern timezone without forcing a timezone-selection step; advanced changes are explicit.

Expansion rules:

- Evaluate the pattern across the **whole chosen period**, not from the first date only. A time that works on the first Tuesday but conflicts later must be shown as needing attention, never presented as a reliable weekly choice.
- Expand intended dates in memory. List each occurrence with status: Selected, Already booked, Needs another time, or Not yet bookable. A pattern preview is not a booking.
- `Generate dates` materializes **all** intended occurrences into the one draft, including unresolved rows. It is not a reservation or a second hidden cart. There is no additional Add eligible dates checkout step. Explain unavailable/out-of-window rows; they remain blocking intentions until individually replaced or explicitly removed. Confirm submits only a draft with no unresolved intentions.
- Once expanded, entries are independent. Removing or replacing one Thursday affects that Thursday only; adding an irregular Monday does not change the other dates. Returning to pattern controls preserves the draft; regenerating is an explicit replacement of that generated group, with confirmation before discarding its manual repairs. Preserve unrelated individually added rows and deduplicate the result. The pattern is an authoring convenience, not a persistent series object, and it creates no series-level edit or cancel rights.
- Deduplicate exact canonical starts within the draft. An existing lesson satisfies an intention only when it belongs to this student and intended teacher, has the matching start/duration, is not deleted, and has an active scheduled/makeup status. Cancelled, missed or unrelated-teacher events do not satisfy it. Matching booked rows are reference-only and incur no new cost; if every occurrence is already booked, show that result without an empty confirmation mutation. A different lesson on that date is not automatically treated as satisfying the intention.
- Do not silently pick an alternative time, truncate to balance, spend every remaining lesson, or repeat forever. No separate single/batch/monthly booking modes.
- Preview/confirm the resulting ordinary dates with `repeat:false`. This does not widen eligibility: it automates the same choices the student could make manually within the approved boundary.

### Gate P1 — existing repeat behavior versus authoritative policy

The previous handoff mixed historical weekly slot holding/materialization language with the already-retired producer and a special finite-repeat horizon exemption. The release reconciles that split: new student plans are explicit dated events, the retired materializer is not revived, and legacy rows remain readable only for history/maintenance.

**Resolved P1:** finite, explicit dated plans with no hidden ongoing reservation use the accepted calendar-month boundary. The student preview/confirm writers reject `repeat:true`, the redesigned UI never creates legacy repeat rows, and the old materializer remains retired. Existing recurring rows stay readable for history/maintenance; no deletion or migration is part of this release. Legacy generated conflicts are not silently converted: new plans preserve each concrete intention for explicit replacement or removal.

### Gate P2 — credit expiry interpretation

`projectRepeatBoundary` currently applies the first usable grant's projected cutoff to the whole repeat batch; ordinary batches do not use the same future-date cutoff. `points.ts` reserves at booking and starts the expiry clock only when a paid lesson actually starts. These are not a sound basis for promising “your whole monthly pack is covered through this date.”

**Resolved P2:** expiry limits unreserved balance, not the entitlement of a successfully booked lesson. The accepted rule reserves one eligible credit per lesson at confirmation using the existing earliest-expiry/purchase ordering; the expiry clock starts only on actual lesson use. Once paid and booked, an event is not automatically cancelled, marked unpaid or charged again just because its grant later expires. Free moves retain that reservation; a charged late move remains cancel plus a fresh eligible booking. A refund after grant expiry follows existing expiry/refund rules; it does not revive expired balance or reset the clock.

This resolved rule follows the ordinary reservation/spend and remaining-balance expiry mechanisms inspected in `points.ts` and is now recorded in `POLICY.md §2`. Credits valid today may pay for lessons beyond their balance-expiry date, but only inside the accepted booking window. This is not a guarantee to attend within the pack's original expiry date.

The implemented finite-plan path does not apply the retired first-grant future-date cutoff. Preview and commit use the same chronological concrete list, eligible-grant ordering and unit cost; expired unreserved credits remain unusable. Actual-start activation, refund and pause behavior remain intact. No generic ledger rewrite is part of this plan.

## 6. Information architecture and views

| Role | Desktop default | Phone default | Primary action | Secondary views and progressive disclosure |
|---|---|---|---|---|
| Student | Next-lesson summary plus current-month overview of own lessons | Compact month plus selected-day/upcoming list | Book lessons | Day agenda; existing desktop Week schedule remains available under view switcher. Book lessons immediately offers **Weekly schedule** and **Choose individual dates**; both feed one draft and one review, not a second booking engine. Event details expose move/cancel/Meet. |
| Teacher | Current Week schedule | Agenda/day | Manage availability, alongside existing lesson operations | Month overview; Day detail; one-time lesson and time off; Meet setup/start/resume/rename via existing eligibility. |
| Admin, all teachers | Current-week agenda grouped by date | Same agenda | Choose teacher / Assign lesson with teacher required | Date range/status/teacher filtering; Month summary. Counts are lesson counts, not invented utilization percentages. |
| Admin, selected teacher | Week operational schedule | Agenda/day | Assign lesson | Day/Month, event detail, availability editor, explicit one-time exception. |

Shared header: period label, Today, previous/next, date jump, appropriate view control, timezone and clock preference. Use one page scroll; retain the existing app navigation. No floating calendar card wasting most of the viewport and no permanent second scroll trap. A staff week grid can scroll to working hours on entry, but must not hide early/late or cross-day events; Show all hours remains available. Do not infer “no lessons” from a cropped display.

Day shows readable lessons and, only during selection, relevant candidates. Week shows temporal relationships for a single teacher/student. Month shows dates and concise event/draft markers, never minute cells or every policy explanation. Detailed reasons, Meet links, charges and editing forms live in selected-day/detail/review panels.

“Shared shell” means presentation reuse, not mandatory CalendarShell component work before the first useful slice. Keep existing `/student/calendar`, `/teacher/calendar`, `/admin/calendar` routes. Do not add an Edit route or duplicate `/student/lessons` history.

## 7. Student interaction contract

### A. Calendar home and one lesson

1. Display booked lessons first, with status text, viewer timezone, assigned teacher and an unobtrusive lessons-left summary. No teacher or zero balance must not hide existing lessons or eligible move/cancel actions.
2. Book lessons opens the contextual panel in place, preserving visible month and selected date, and immediately offers **Weekly schedule** and **Choose individual dates** (section 5). If entered with an explicit booking intent and no selected date, propose the nearest candidate date; do not unexpectedly jump a month the user deliberately selected.
3. Selecting a date keeps the month visible. Show the selected day's own lessons and available start buttons grouped by time of day. Duration is visible once, not repeated as a long notice on every button.
4. Selecting a start adds it to the draft. Label Selected—not booked in the panel and month. Selecting it again removes it; keyboard/accessibility state reflects this. An alternative on a date already selected is an explicit Replace interaction, not silent replacement.
5. The student may choose another date immediately. There is no repeated Book another gate, auto-next-date jump, auto-checkout or per-tap sheet.
6. Review opens the chronological list of concrete dates/times, teacher, duration, server-checked cost/balance, any conflicts, relevant action consequences and policy help. Desktop review replaces panel contents while the month remains; phone opens one sheet.
7. Confirm N lessons submits the immutable reviewed list. Only success changes Selected to Booked. Show actual returned dates/count and balance. No phantom/placeholder blocks survive success.

### B. A whole month's intentions

1. Choose the period, for example **Next month**, with its exact date range and the currently bookable boundary both visible.
2. Choose weekly times (for example Tuesday and Thursday evenings) or pick individual dates; both write into the same draft.
3. Preview every intended occurrence against the month and the existing lessons.
4. Repair exceptions individually — change one unavailable Thursday, remove a holiday, or keep an already-booked matching lesson without duplicating it.
5. Review once, then confirm once.

The same draft persists across month navigation. Review groups by week for scanning and always shows any dates outside the visible month.

Acceptance example, using hypothetical data: a student intends Tuesday and Thursday lessons across a month, already has one matching lesson booked, and one Thursday is unavailable. The interface shows the existing lesson without charging again; shows each new intended lesson; marks that Thursday for repair; permits replacing only that date; then confirms the explicit remaining new dates once. If the period extends beyond the approved booking boundary, it says so and cannot report the month as completely booked.

The plan is not a cart that automatically empties the student's balance. “All my lessons” may mean all intended sessions, not all purchased credits. Review shows what is selected and what remains; no hardcoded monthly target is inferred from a pack.

### C. Draft and submission state

- Keep academy date/start plus tenant/teacher identity as the canonical selection. Derive viewer labels. Never persist placeholders to `scheduleEvents`.
- One draft survives date/view changes, review dismissal, event detail inspection and responsive layout changes within the calendar. Opening an existing lesson does not clear it.
- Leaving the page with a nonempty draft warns before discard where navigation can be intercepted. Cross-device saved plans and indefinite local draft storage are out of scope. If request recovery requires session-local persistence, scope it to tenant/user and clear on resolved completion/sign-out; it is an operation receipt, not a draft feature.
- Changing assigned teacher or tenant invalidates the relevant draft context. Do not silently book the same times against a different teacher. Client subscription updates are insufficient: preview/confirm must receive the expected teacher and reviewed context, and the server must reject a changed assignment/configuration before a new operation writes anything. Keep the old intention visible until the user discards or replans, but block confirmation.
- Draft edits invalidate prior preview. Confirm requires the latest completed result for the exact payload/context; empty/loading/error is not “zero conflicts.” Refresh on review entry and temporal boundary/focus changes, since clock passage alone need not invalidate a reactive query.
- Freeze payload and request identity during submission and any unknown network outcome. Resolve/retry that exact operation before starting an edited operation. An optimistic success toast is not a receipt.

### D. Desktop and phone layout

**Desktop:** two columns when actual content width permits: main month, contextual panel. The panel can be sticky within the page; not viewport-fixed over content. It contains date heading, candidate times and compact draft count; explicit Review displays the complete draft. At narrower tablet/content widths use the phone-like stacked arrangement rather than compressing three columns.

**Phone:** a compact seven-column date grid is acceptable; a seven-column hourly timetable is not. Date cells contain number plus accessible booked/selected/error markers, not tiny full lesson cards. Below are readable day details and times. The sticky review bar accounts for bottom navigation, safe area and content padding; it must not cover the last button. No draft means no disabled permanent checkout bar. Sheet opens on Review only, traps focus correctly, and restores focus/date/scroll on close. Long monthly review scrolls inside a full-height sheet with a visible Confirm action and no nested dialog stack.

### E. No availability and next available

“No times on this date” is different from “outside booking window,” “no lessons left,” “not assigned,” “still loading” and “request failed.” Do not collapse them into a blank calendar.

Next available searches the whole currently allowed booking window — after an approved boundary change, that window — not only the currently fetched week/month. Fetch enough padded academy dates to cover that window; check candidate results in order, bounded by policy. Do not call `previewBookingBatch` on all alternative starts as one batch: that applies cumulative caps and budget to alternatives. If a new independent-candidate server read is warranted, it must reuse validation without cumulatively spending an imaginary batch. Initial implementation may use honest candidate labels and preview upon selection; it may not label all candidates guaranteed bookings.

No result after searching the complete eligible window: retain teacher context and the existing academy contact path. A fetch error is retryable, not “teacher unavailable.” No waiting list, auto-book reminder or new notification subsystem.

### F. Move, cancel, export

- **Move:** event details → actionPreview → explicit Moving [original lesson] state → replacement date/start → consequence review → rescheduleEvent. It is not another draft booking. Exclude original event from conflict discovery. Use move-specific source/target boundaries, not ordinary booking notice/horizon/balance filters. A free move can remain possible with no unused credit. Preserve any unrelated booking draft and re-preview it after the move.
- **Cancel:** show the server consequence in the student's locale and require explicit cancellation confirmation. Reflect the actual charged/refunded result. No promise of Undo; cancel-and-book-again can have real cost/policy consequences.
- **Monthly commitment warning:** a month-level booking UI does not create month-level edit rights. Current teacher/student move and cancel actions are restricted to lessons within the next seven days. Review must say this plainly before a student commits next month, not bury it behind generic policy help. Preserve the existing academy contact path for earlier changes; an admin can act under existing permissions. This plan does not widen that action window or promise Cancel series.
- **Export:** link to existing Profile calendar export where helpful. Preserve private live feed versus downloadable snapshot, token handling and setup help. Unconfirmed draft selections never appear in ICS. No provider OAuth.

## 8. Teacher availability and lesson journeys

### Schedule

Preserve student names/statuses, event detail, Start/Resume eligibility, Meet-room configuration, rename synchronization, time off and needs-attention destinations. On desktop use the readable single-teacher week; phones use a date navigator and agenda. Explicit Move is the supported path; drag is optional later and must share the same consequence/keyboard path.

### Usual hours and date-specific changes

`Manage availability` has two clearly labelled sections:

- **Usual weekly hours:** weekday rows; Closed or one/more ranges; Add/remove range; Copy these weekday hours to other named weekdays; visible effective-from scope. Explicit Save changes and Reset unsaved changes.
- **Changes on specific dates:** select date; use usual hours, custom hours, or unavailable all day; show exact effective hours and booked lessons affected. Reset to usual hours removes only editable date overrides, not a time-off approval record.

Persist weekly patterns in academy wall-clock as today. Show the academy zone prominently and a local-time preview for a representative dated week when teacher zone differs. Never pretend a fixed academy weekly pattern is a teacher-local recurring pattern across DST. Date-specific input can be viewer-local only with explicit conversion/splitting to academy dates. A teacher-local forever-recurring availability model would be a separate approved domain change, not a silent convenience.

### Reuse and narrow additions

1. Reuse/harden `vacancies.listForTeacher` and `vacancies.replaceForTeacher`; do not add a competing weekly source of truth.
2. The editor needs a scoped source-model read with raw weekly ranges, validity bounds, dated exceptions and time-off provenance. Do not reconstruct them from today-trimmed effective `openRanges`. Add a narrow reader in `convex/calendar.ts` if existing reads cannot provide that complete model.
3. Harden weekly save: require teacher/admin role, resolve an actual in-tenant teacher, validate real dates/times and range order, normalize overlaps/adjacency, preserve unrelated validity/history, and check source-state precondition to prevent stale editor overwrite. Compute that precondition from canonical source rows/validity/exception provenance and compare it transactionally; do not use a client timestamp as authority. Teachers target themselves; admins must explicitly choose the teacher.
4. Define weekly replacement effective from the selected academy date; default to today in the academy zone and do not offer retroactive changes. Replace the applicable pattern only until the next pre-existing future pattern boundary, preserving that later pattern; show the effective interval before Save. Retain pre-effective history and surface scheduled future patterns rather than flattening validity bounds. Update `getWeeklyHours` and profile summaries to filter by the effective date—retaining history without that change would overcount weekly hours. No loss of dated closures through incidental weekday/time matching.
5. A narrow date-hours writer is warranted: current slot mutation cannot atomically express exact replacement hours with precedence/provenance preserved. For an ordinary date override, calculate open additions and closed complements needed to make that date's effective hours exactly the requested intervals; remove only prior ordinary editable overrides for that scope. Never assume a narrower open exception shortens weekly hours. Closed time-off rows remain authoritative. For ordinary custom hours, write open intervals for the requested union and closed intervals for its entire same-date complement within `[00:00, 24:00)`; this preserves exact dated hours even if usual hours later change. Use weekly removes ordinary open/closed rows for that date only. Reject a custom request that overlaps a time-off block rather than reporting saved hours that cannot become effective.
6. Validate proposed effective availability before write against full intervals of affected scheduled/makeup lessons. Reject removal that strands a previously covered lesson; keep read-only references so staff can move/cancel first. Do not block an unrelated change merely because a legitimate existing one-time lesson was already outside hours.
7. Save must be atomic for its declared scope, not a browser loop of cell mutations. Read back the saved source/effective model before showing success.

### Copy and Undo

- `Copy weekday hours` copies form values in an unsaved weekly edit; Save persists them.
- Existing `copyWeekAvailability` means **add this week's open hours to selected future weeks while retaining closures**, not replace their exact hours. Retain as a secondary action with that meaning. Show target dates, preserve time-off and do not call it a full replacement.
- Initial redesign uses Reset before Save and explicit edit-again after Save. Remove misleading inverse-toggle Undo. If post-save Undo is required later, it must restore the exact before-state only while the saved after-state still matches; a opposite open/closed write is not an inverse.
- Unblock time off is “remove this time-off block,” not “restore every overwritten earlier exception.” Existing blockTimeOff overwrites date exceptions; do not claim exact restoration.

### Time off, one-time lesson and live start

Time off retains booked-lesson protection, notification and long-absence acknowledgement using existing mutations. Do not route multi-day absence through ordinary closed overrides to bypass that policy. Generic date closure remains availability editing; the UI must direct an absence to the existing time-off flow and preserve its provenance.

One-time lesson: choose authorized student, date/time and duration; show zone and outcome; use `createOneTimeLesson`. May be outside published hours; overlap is a hard block and staff buffer is an explicit confirm-through warning. Unpaid is a truthful administrative state, not hidden success. Distinguish Add to calendar from Start now: Start now uses `lessons.startOneTime` and its actual current-time behavior, not the entered future date. Do not accidentally create both an event and a separate start event. Preserve stable retry identity where supported; non-idempotent operations must be reconciled before retry after an unknown outcome.

## 9. Admin operations

- All teachers: current-week agenda grouped by date, with time, student, teacher and status. Simultaneous rows remain individually selectable and readable. Lesson counts are useful; utilization percentages would require availability denominators not in the all-teachers query and are deferred.
- Clicking an event may inspect details; `Manage this lesson` transitions to its selected teacher/date before exposing mutation controls. Read-only overview does not mean an extra manual selector hunt.
- Selecting a teacher retains period and timezone. Event deep links resolve teacher/date before loading/opening event details; preserve `?teacher=` and `?event=` behavior.
- Assign lesson: explicit teacher → student → date/start → review credit/Meet/conflict outcome → assignLesson. Available-time suggestions are useful, but retain explicit permitted time entry outside open hours. Do not incorrectly impose student notice/horizon or hard student buffers on admin assignment.
- Ordinary assignment requires credit. One-time exception may record an unpaid lesson. These actions must not silently substitute for each other. Admin one-time form is a new UI entry point over an existing API, and must pass the selected teacher explicitly, never default to the admin's own ID.
- Hard overlap blocks; staff buffer override requires an explicit acknowledged retry where that operation supports it. rescheduleEvent does not currently offer that override—do not invent one by copying assignment UI.
- Preserve move/cancel actionPreview, teacher-context availability editing, time-off acknowledgement, pending requests, unpaid/Billing links and existing attention entries. No new generic anomaly detector or automatic repair operation.

## 10. State/error matrix

| State | Meaning to the user | Required behavior |
|---|---|---|
| Loading | We do not know yet. | Stable skeleton and accessible status, not empty/no availability. |
| Empty schedule | Nothing booked in this period. | Keep navigation and role action; student can book, teacher can open hours. |
| No assigned teacher | Self-booking is not set up. | Existing lessons still visible; explain/contact academy. |
| No balance | Cannot add paid self-bookings now. | Keep schedule and eligible move/cancel; existing top-up path; do not erase draft. |
| Candidate time | Looks available; not reserved. | Selectable button and explicit selected-state feedback; server checks after selection. |
| No fitting lesson | Hours exist but no complete eligible interval fits. | No false-green start; selected-date message and next available. |
| Outside window | This date/time cannot be booked today. | Distinct label/boundary, not “teacher busy.” Never silently count it as booked. |
| Selected | In your unconfirmed plan. | Month marker plus exact row, reversible without a mutation. |
| Already booked | This exact lesson exists. | Separate Booked state; do not duplicate/charge again. |
| Preview pending/stale | The current plan has not finished checking. | Disable Confirm, preserve everything, latest-payload result only. |
| Conflicting occurrence | This specific intended lesson needs action. | Keep row/reason, Replace or Remove; other selections remain. |
| Partial batch conflicts | Some choices fail, but nothing has been booked. | Resolve all or explicitly remove failed choices and re-preview; no silent partial commit. |
| Insufficient batch balance/cap | Entire selected plan cannot be confirmed. | Count exact selections/cost, explain applicable server rule, user chooses what to remove. |
| Submitted, outcome unknown | The request may have succeeded. | Freeze exact operation; reconnect/reconcile/retry same identity. Do not offer edit-and-resubmit as a new booking. |
| Confirm success | Exact returned events were booked. | Receipt with dates/count/remaining balance; remove only committed draft; live schedule update, no ghosts. |
| Teacher/tenant changed | Draft's booking context is no longer valid. | Block confirmation, explain and require deliberate replanning. |
| Move blocked | This lesson/target is outside permitted move rules. | Show actionPreview/target reason, retain original unchanged. |
| Cancellation consequence changed | Cost or permission changed since inspection. | Refresh review and require acknowledgement before retry; no auto-confirm. |
| Save availability stale | Another editor changed the source. | Preserve unsaved entries, load latest for comparison; no silent overwrite. |
| Closure strands lessons | Proposed hours remove coverage of scheduled lessons. | Reject atomically, link to affected lessons; no implicit cancellation. |
| Buffer warning, staff | Adjacent lesson leaves less break time. | Explicit confirm-through only where the server supports it. |
| One-time unpaid | Real lesson recorded without available credit. | Truthful label and existing admin settlement route. |
| Timezone changed | Dates/times may display differently. | Same underlying intentions/events; no regeneration or shift of selected instants. |
| Network/read failure | Data could not be checked. | Retry read, retain inputs; never label unavailable. |
| Export | Only committed lessons leave the app. | Existing private subscription/snapshot flow; draft excluded. |

All states need text and semantic selected/disabled/error/status cues, not color alone. Policy reason keys/values are localized via the existing policy text path; don't turn raw keys or stack traces into student copy.

## 11. Domain and backend corrections justified by this review

### Exact API mapping for the implementation worker

| Interaction | Current API / narrowly proposed contract |
|---|---|
| Student schedule and candidate inputs | `api.calendar.getStudentCalendar({ fromDate, toDate })`; `api.points.getBalance`; existing tenant/timezone data. |
| Check the selected ordinary plan | `api.calendar.previewBookingBatch({ bookings, repeat: false })`; bookings are concrete academy-date/start pairs, not every alternative time. |
| Commit the reviewed ordinary plan | Current `api.calendar.confirmBookingBatch({ bookings, repeat: false, requestId })`; extend with expected teacher/review context and the durable receipt contract below. Use returned committed data, not a client-predicted success count. |
| Current finite-repeat compatibility | The same preview/confirm APIs with `repeat: true` only for the existing seed semantics; transition subject to P1. Never send a flattened expanded list with `repeat: true`. |
| Event consequence and action | `api.calendar.actionPreview({ eventId })`; `api.calendar.rescheduleEvent({ eventId, toDate, toStartTime })`; `api.calendar.cancelEvent({ eventId })`. |
| Staff schedule | `api.calendar.getTeacherCalendar`, `api.calendar.getAdminCalendar`, `api.calendar.getAllTeachersCalendar`; preserve `api.calendar.getAdminEventLink` resolution. |
| Admin assignment / ad-hoc lesson | `api.calendar.assignLesson`; `api.calendar.createOneTimeLesson`; teacher immediate live start uses `api.lessons.startOneTime`. |
| Weekly source/read and save | `api.vacancies.listForTeacher` and `api.vacancies.replaceForTeacher`, hardened rather than duplicated. |
| Complete editable availability source | Proposed `api.calendar.getAvailabilityEditor({ teacherId?, fromDate, toDate })`: weekly source/validity, ordinary exceptions, time-off metadata and source-state precondition. Scope reads to the authorized teacher. |
| Exact date-hours replacement | Proposed `api.calendar.replaceDateAvailability({ teacherId?, date, mode, ranges, expectedSourceState })`: explicit use-weekly/custom-hours scope, atomic effective-hours validation and preserved time-off metadata. Full-day absence routes through existing time-off behavior instead of bypassing it. |
| Existing availability secondary operations | `api.calendar.copyWeekAvailability`, `blockTimeOff`, `unblockTimeOff`, `approveTimeOff`; preserve their distinct scope/meaning. |

The expected-teacher/review-context, receipt, calendar-boundary and source-precondition contracts below are the accepted implementation boundaries. A separate independent-candidate availability query remains unnecessary because candidate labels are honest and the selected concrete list is previewed server-side.

### A. Canonical time and candidate discovery

Generate starts from complete academy intervals on the academy granularity grid, subtract busy intervals and relevant own events, then convert each candidate to a viewer date/time. Include adjacent-day intervals where a buffer can cross midnight. Range display splits cross-midnight intervals instead of truncating them. Distinguish date-only calendar math from instant arithmetic. Correct viewer-day splitting without silently introducing overnight academy bookings: the existing single-date/start/end model must reject student lesson intervals that cannot be represented within one academy date. The wall-clock payload cannot distinguish an ambiguous academy DST fold; reject unsupported ambiguous/nonexistent academy starts explicitly rather than pretend an offset was stored. Viewer DST conversion remains supported. Broader overnight/fold storage is separate scope.

Fetch range padding must cover the selected viewer dates under actual tenant/viewer zones; retain existing padding and test edge offsets rather than assuming the buffer alone fixes conversion. Labels include both dates when academy/viewer dates differ. Month grouping belongs to the viewer zone. A weekly helper captures its chosen pattern zone; each intended local occurrence is converted separately. On DST gaps/ambiguous local times, require a valid identifiable occurrence; do not silently choose a different time. After generation, a timezone switch reformats explicit occurrences and never regenerates them. Legacy academy-anchored repeat must remain labelled as such until transition is agreed.

### B. Honest previews and consumption units

Resolve an **active**, valid one-to-one activity configuration in the same validation context used by preview and confirm; do not silently fall back to an inactive type. For this redesign enforce POLICY’s one lesson = one credit: reject non-unit costs for student self-booking with an actionable configuration error, rather than introduce fractional lesson accounting. Current preview decrements one per item while commit spends `activity.pointCost`; those must agree. Missing activity configuration must be visible before confirm. Do not assert a live tenant is misconfigured; the source permits the discrepancy.

Apply chronological, deterministic allocation after resolving P2; under the recommended reserved-entitlement rule no future-expiry projection is needed. Verify more than one grant across a batch. Unit-cost, whole-credit lessons normally do not require split-grant debits; if non-unit/fractional credits remain a supported case, first trace allocation provenance, activation, discard and refund coherently. Do not launch a speculative ledger rewrite from that conditional finding. `points.ts:555–584,615–695` shows why a single stored grant ID cannot describe arbitrary split debit semantics.

### C. Atomicity, previews and retry identity

Keep one Convex confirmation transaction: all eligibility checks before events, credit reservations and notifications; any rejection leaves no subset booked. Revalidate on commit because preview is not a hold.

**Use a minimal durable receipt for the redesigned batch path.** The existing `scheduleEvents.externalId` prefix lookup is not an immutable operation record: events can be moved/deleted and the submitted payload is not bound to the key. A client freeze plus a delimiter fix alone cannot satisfy the stated reload/unknown-outcome contract. This is a proven narrow persistence need, not a general job system.

Future implementation adds one `calendarBookingRequests` table in `convex/schema.ts`, indexed by tenant + student + request ID. Store the normalized immutable input (dated starts, expected teacher, repeat semantics, reviewed lesson/activity/duration/unit-cost/academy-zone context), original committed event IDs and date/time snapshots, original receipt balance and creation time. Store concrete normalized input for equality; a separate hash service is unnecessary. Keep the receipt when events move or are soft-deleted. No reservation hold, pending-job worker or background receipt creation is needed.

- Require a request ID on the new UI path. Authorize tenant/student first, then look up the exact receipt. Same key plus same normalized input returns the original receipt without spending/notifying again; same key plus different input rejects. A completed prior request may be recovered even if the assigned teacher has since changed; it must not be revalidated as a new booking.
- For a new request, compare expected teacher and reviewed material context with current server state; verify an actual in-tenant teacher. If teacher, timezone, activity, duration or cost changed, return Review changed and require a fresh preview/acknowledgement. Never accept a client field as permission or price authority. Balance/availability/policy are revalidated normally and can reject the whole request.
- Normalize, deduplicate and sort starts before comparison/allocation. Validate real dates, supported time representations and a bounded input list **before** expensive queries. Derive a conservative ordinary-batch size bound from days in the permitted window and the existing daily cap; reject absurd arrays rather than silently truncating. Legacy repeat callers remain separately bounded during transition.
- Insert the receipt in the **same Convex transaction** as all events, credit reservations and notification records. Concurrent identical requests must observe one operation through indexed read/write transaction conflict handling; test this rather than assuming a database unique index exists.
- Add a narrow authorized `getBookingRequest({ requestId })` read for recovery. Persist the unresolved request ID and frozen payload only in tenant/user-scoped session storage; clear on confirmed resolution/sign-out. Reload may query or retry the **same** operation. A temporary missing receipt is not evidence that an in-flight transaction failed and is not permission to issue a fresh key.
- Display the original booking receipt separately from current event state and current balance. Recovery after a move/cancellation must not claim the old slot is currently booked or resurrect the event.

During transition, keep any narrowly labelled legacy lookup for old requests separate from the new receipt path; do not promise reconstructed immutable payloads for pre-receipt operations. The new UI uses the durable receipt contract and freezes the exact operation on unknown outcomes.

### D. Authorization and privacy

Tenant, role, teacher target and event ownership are server boundaries, not UI flags. Preserve student self-only events and opaque other-student busy intervals. Do not expose a full teacher/student directory to a learner to render candidates. Harden newly reused availability APIs so students cannot write their own vacancy rows and admins cannot target a nonexistent/cross-tenant non-teacher ID.

Keep live Google Meet behavior and event/notification destinations; Telegram remains notification/read-only, not a booking action surface. Calendar export retains private token ownership, no-store response behavior and student/org scoping.

### E. Do not preserve stale recurrence claims

`getStudentCalendar.recurring` and the student balance-horizon text still read legacy recurring rows after materialization retirement. Do not use those rows to promise a future schedule or pack coverage in the new planner. Display actual committed events plus the explicit draft. No deletion/migration of legacy records and no automatic recurring repair UI.

## 12. Keep / rebuild / remove / defer

| Keep | Rebuild / correct | Remove from primary UX | Defer / out of scope |
|---|---|---|---|
| Select-many/confirm-once; ordinary explicit batch API; per-item server reasons; atomic credit/event write; actionPreview; role routes; real events; Meet/session operations; tenant privacy; private ICS; student desktop schedule views; flexible individual-date selection. | First-class weekly-pattern entry sharing one draft with flexible dates; month overview + draft + date/start panel; phone review timing; canonical selection/time projection; retry freeze/exact matching; preview/config/allocation corrections; range source read and safe saves; all-teacher agenda; responsive/keyboard controls. | Hover-snap as compulsory booking; duplicate top/bottom cards; Book another gate; weekly planning hidden behind a first selection; auto-open per-selection sheets; universal Edit label; brush-only availability; misleading inverse Undo; stale legacy balance horizon. | Open-ended reservation/renewal semantics; resource lanes/group lessons; analytics utilization; permanent draft persistence; cross-device templates; drag-first UX; cancellation undo; series-level edit rights; generic ledger rewrite; separate date-hours override editor; full populated browser QA against safe non-duplicate data. |

## 13. Exact implementation surface

These are the implementation surface and current disposition for the authorized release. Remaining items are explicitly marked deferred; they are not hidden approval gates.

| Existing file | Intended responsibility/change |
|---|---|
| `src/app/student/calendar/page.tsx` | Next-lesson summary plus month overview, weekly and individual-date booking entry, one additive canonical draft, query/preview/confirm wiring, explicit Review, move/cancel and teacher-change handling. Legacy repeat UI is retired from the new student path. |
| `src/components/calendar/MonthCalendar.tsx` | Responsive event overview, semantic date selection, booked/draft/status markers or shared date-cell primitives; no phone min-width dependency. |
| `src/components/calendar/calendarShared.tsx` | Time projection, interval splitting, role-specific defaults and shared header helpers; extract pure logic only when needed for focused tests. |
| `src/components/calendar/WeeklyCalendar.tsx` | Preserve staff/single-user display during student slice; later remove unused staging/brush API only after all callers migrate. Do not force all-role rewrite first. |
| `src/app/teacher/calendar/page.tsx` | Schedule/availability actions, safe explicit move, day/agenda phone, preserve session/Meet/one-time/time-off/rename/attention. |
| `src/app/admin/calendar/page.tsx` | All-teacher agenda, selected-teacher schedule/operations, context/deep links, explicit permitted time assignment and one-time entry. |
| `src/components/calendar/AvailabilityBoard.tsx` | Reuse as compact wrapper around range editor, or retire only after embedded callers migrate. |
| `src/app/admin/people/page.tsx` | Embedded availability dialog: selected teacher, form sizing, save/discard close handling. |
| `src/components/teachers/TeacherDetail.tsx` | Embedded editor and weekly-hour summary parity. |
| `src/app/globals.css` | Scoped calendar layout, inline logical alignment, sticky review safe areas and existing app-scroll preservation. |
| `convex/calendar.ts` | Implemented batch correctness, receipt/context binding, calendar boundary and repeat-writer retirement; availability source/date-override work is limited to the shipped source-backed weekly editor. No general scheduler rewrite. |
| `convex/vacancies.ts` | Reuse/harden weekly read/replace, validity/normalization/source-precondition/role/lesson protection; no parallel weekly authority. |
| `convex/lib/repeatBookings.ts` | Legacy expansion remains for historical/compatibility callers only; student preview/confirm writers reject `repeat:true` and do not create new recurring rows. |
| `convex/points.ts` | Reuse deterministic allocation with existing spend; retain actual-start activation and expiry of unreserved balance. No unrelated billing logic was changed. |
| `convex/schema.ts` | Implemented `calendarBookingRequests` receipt table/index; no booking-series or new credit ledger schema. |
| `convex/lib/policy.ts`, `POLICY.md` | Implemented the accepted calendar boundary and reserved-entitlement rule; legacy repeat/materialization wording is reconciled while unrelated policy remains unchanged. |
| `src/lib/tz.ts`, `convex/lib/time.ts` | Reuse; modify only demonstrated conversion/ambiguity defects and protect both boundaries. |
| `messages/en.json`, `messages/ru.json`, `messages/ar.json`, `messages/kk.json` | Student selection/review/policy and accessible labels with exact parity; existing staff localization scope remains. |
| `tests/calendarUiContracts.test.ts`, `tests/pdfFeatureSliceContracts.test.ts` | Replace obsolete duplicate-card/ghost location assertions with draft/commit distinction, preserve export contracts. |
| `tests/repeatBookings.test.ts`, `tests/creditExpiry.test.ts` | Retain finite-repeat and actual-start expiry invariants; only approved changes update expected behavior. |

**Additional read/verification consumers:** `convex/schedule.ts`, `convex/tenantSettings.ts`, `convex/onboarding.ts`, `convex/lessons.ts`, `convex/crons.ts`, `convex/users.ts`, teacher profile/session routes, student lessons/profile and ICS handlers. Inspect these when changing shared behavior; do not edit them merely to tidy the redesign.

### Likely new files, only with these concrete responsibilities

- `src/components/calendar/StudentBookingPanel.tsx`: weekly-pattern entry (period, weekday/time pairs), selected-day candidates, draft count; controlled task surface, not another backend client.
- `src/components/calendar/BookingReview.tsx`: one review content model, desktop contextual presentation and phone sheet; exact occurrence rows and conflicts.
- `src/components/calendar/AvailabilityRangeEditor.tsx`: reusable full/embedded form with explicit scope and safe save callback.
- `src/components/calendar/CalendarAgenda.tsx`: date-grouped event list shared by staff phone and admin overview where props genuinely match.
- `src/lib/calendarBookingPlan.ts`: pure canonical selection/deduplication/date-generation logic if it warrants extraction; no policy authority.
- `tests/calendarBookingPlan.test.ts`, `tests/calendarBatchContracts.test.ts`, `tests/calendarAvailabilityRanges.test.ts`, `tests/calendarTime.test.ts`: focused behavior tests below. Avoid one file per small helper.

Do not create CalendarShell, StaffScheduleGrid, a new state framework and several responsive-contract files just to follow an architecture diagram. Extract a shared header/shell only when implementation demonstrates real duplicated presentation. No calendar package installation is planned.

`MASTER_PLAN.md` and `POLICY.md` are part of this authorized release record; `AGENTS.md`, unrelated plans, reports and untracked notes remain untouched.

## 14. Smallest coherent implementation order and rollback boundaries

| Slice | Work | Acceptance and rollback boundary |
|---|---|---|
| 1. Freeze contract decisions | **Complete.** The 2026-09-26 authorization accepts the three section 17 recommendations and the receipt scope. Focused source-backed contracts cover canonical selection, teacher/context races, retry identity, conflict repair and availability source preconditions. | No data changes were used to verify the release. |
| 2. Student one-and-many vertical slice | **Complete for the shipped scope.** Month/day views, weekly and individual-date entry, canonical draft, explicit Review, expected-context confirmation and durable receipt use the existing atomic batch transaction. | Browser route verification remains blocked by the duplicate-user dev data condition recorded above; no browser pass is claimed. |
| 3. Weekly-pattern planning and repeat transition | **Complete for the shipped scope.** Weekly patterns expand to explicit dated intentions, preserve exceptions for repair, use the accepted boundary and reject new `repeat:true` student writes. | Date-specific pattern edge cases beyond the focused pure contracts remain manual QA work; legacy rows are retained, not migrated. |
| 4. Teacher/editor slice across consumers | **Complete for the shipped weekly source editor.** Source read, preconditioned Save/Reset, teacher scope, validity handling and booked-lesson protection are implemented; existing consumers remain compatible. | A separate date-hours override editor and full embedded People/TeacherDetail browser pass remain deferred. |
| 5. Admin clarity and staff display | **Complete for the shipped overview.** All-teacher agenda is grouped and read-only; selected-teacher operations remain available. | Manual browser verification of populated staff states remains blocked by safe-data constraints. |
| 6. Final relevant gates | **Complete locally except known pre-existing touched-file ESLint debt and the browser blocker.** Exact commands and results are recorded in the verified status above. | No E2E walker, fixture seed, live mutation probe or fabricated user-verification claim. |

Do not start with a global shared-grid rewrite: it multiplies risk before validating the main product improvement. Retain existing API signatures where callers still depend on them; no long-lived compatibility framework. New backend fields are consumed only after codegen and the matching backend release. Deployment is part of this authorized release and follows the repository's backend-first procedure.

Rollback does not mean deleting successfully booked lessons, refunding them en masse, restoring old data snapshots or rolling back credit history. No data migration or backfill fabricating old receipts is required. The minimal receipt schema is implemented additively; existing recurring rows remain intact and readable.

## 15. Focused verification that earns its place

### Pure/date/plan invariants

- One and many selections use one draft; add/remove/replace/deduplicate exact starts; month/view/review changes retain it; success removes only confirmed operation.
- Weekly entry is available before any individual date selection and shares one draft with flexible date selection; switching between the two methods never loses or duplicates an intention.
- The weekly pattern emits explicit dated occurrences through the chosen period; handles uneven months, a partial first/last week, already-booked dates, one skipped/replaced date and daylight changes. A conflict on a later weekday is detected even when the first occurrence is valid. Outside-boundary intentions stay explained, not falsely confirmed.
- Canonical selection survives viewer timezone and 12/24-hour changes. Academy-aligned granularity remains valid in fractional-offset viewer zones.
- Cross-midnight range/busy display retains continuation; candidate duration/buffers operate on complete intervals; date boundaries and the padded query range include relevant events.
- Legacy finite repeat retains exactly its approved expansion semantics. Do not silently rewrite its existing test into month semantics.

### Mutation/authorization/preview contracts

- Preview and confirm resolve the same activity/credit units/configuration; multi-date plan can consume consecutive grants consistently; actual-start expiry remains actual-start.
- One invalid item rejects the entire commit with no subset event/credit/notification effects; structured conflicts map to concrete occurrences.
- Stale/absent preview disables UI commit; server still revalidates concurrent bookings and temporal limits.
- Exact request identity does not match a prefix-colliding ID. Same key/different payload rejects; same key/same payload (including concurrent/reloaded requests) produces one receipt and no duplicate credit/event/notification effects. Recover after event move/soft deletion without recreating it. Unknown outcome never becomes an edited request under the same identity.
- Reassign the student or change duration/activity/academy zone between preview and confirmation: new submission must reject for fresh review; retry of a previously completed operation must return its original receipt.
- Accepted calendar boundary is shared by old single-booking and batch writers plus candidate/read metadata; check year rollover, leap February, academy/viewer month mismatch and the exact exclusive boundary. Minimum notice and move/cancel rules remain separate.
- Under the accepted P2 rule, grant expiry removes unused balance but does not cancel/recharge paid future events; activation still occurs on actual start; refund after expiry does not revive balance.
- Student cannot select another teacher/tenant or impersonate another student's plan. Teacher range save is self-only; admin target must be a real in-tenant teacher. Cross-tenant/event ownership remains enforced.
- Weekly/date save source precondition rejects lost updates; normalized proposed hours preserve overrides/time-off provenance; partial overlap with a booked lesson is detected, not only matching start strings.
- Move uses its own target boundaries, excludes original lesson and preserves charge behavior. Staff assignment/one-time outside-hours behavior and permitted buffer overrides do not leak into student booking.

Use existing node:test/tsx conventions and narrowly extend handler test contexts already demonstrated in `tests/noShowSecurity.test.ts`. An in-memory fake that does not implement transaction rollback cannot prove Convex rollback; separate handler-order/unit evidence from safe integration verification. Do not build a generic test framework or call production to prove atomicity.

### Source/layout tests and commands for this implementation

Keep only useful contracts: no auto-open sheet on time selection; one draft source; no required phone timetable/min-width; no hover-only critical action; logical CSS and accessible controls; export privacy and locale parity remain. Source assertions are not browser layout proof.

The release ran `npx tsx --test tests/calendarBookingPlan.test.ts tests/calendarRedesignContracts.test.ts tests/pdfFeatureSliceContracts.test.ts`, the calendar-focused `npx tsx --test tests/calendar*.test.ts`, `npm run typecheck`, touched-file ESLint, `npm test`, `npm run build`, `npx convex codegen`, and `git diff --check`. Existing `npm test` expands `tests/*.test.ts`; appending paths is the focused invocation used above. Touched-file ESLint is non-zero only for pre-existing legacy `no-explicit-any` findings in admin/teacher calendar files and pre-existing unused-variable warnings in `WeeklyCalendar`; no new lint finding was introduced.

## 16. Manual browser verification matrix — FaFo's final pass

Use authorized non-production accounts/data only. The supported student dev-login flow was attempted read-only. No seed, financial mutation, data wipe or E2E walker was used. The route was blocked by the exact duplicate-user Convex error recorded in the verified status above, so no browser pass is claimed.

| Role / scenario | 320px | 390px | 430px | 1280px | Required result |
|---|---|---|---|---|---|
| Student, calendar home | Compact month/list | Same | Same | Month + contextual panel | Booked commitments and Book lessons clear; no horizontal page overflow. |
| Student, one lesson | Select → Review sheet | Same | Same | Select → panel review | No selection-time popup, one explicit confirm, truthful receipt. |
| Student, booking entry | Weekly + individual choices visible | Same | Same | Both choices in the panel | Weekly schedule is not hidden behind a first selection; both methods feed one draft. |
| Student, whole-month intentions | Navigate and accumulate | Same | Same | Calendar stays visible | No Book another gate; selected vs booked distinct; count includes offscreen dates. |
| Student, weekly pattern with exception | Replace/remove one date | Same | Same | Same | Other occurrences unchanged; outside horizon labelled; existing booking not duplicated. |
| Student, conflicts/network | Text and recoverable draft | Same | Same | Same | Partial conflict never claims partial commit; unknown outcome freezes exact submission. |
| Student, move/cancel/zero balance | Readable consequence flow | Same | Same | Same | Free move not hidden by zero balance; target limits and cancellation result truthful. |
| Teacher, lessons | Agenda/day | Same | Same | Week schedule | Start/Resume, Meet, rename, move, cancel, history and attention work. |
| Teacher, availability | Vertical ranges/date changes | Same | Same | Editor beside context | Scope clear; save/reset; stale save; booked-interval protection; time-off provenance. |
| Admin, all teachers | Grouped agenda | Same | Same | Week agenda | Simultaneous lessons readable individually; no write from overview; context drill-in. |
| Admin, selected teacher | Agenda/forms | Same | Same | Week + explicit actions | Assign outside hours when permitted, buffer confirmation, insufficient credit vs unpaid exception. |
| Embedded availability | People dialog/TeacherDetail | Same | Same | Same consumers | Teacher identity, no clipped forms, unsaved close handling, shared safe semantics. |
| Export/navigation | Profile link and deep links | Same | Same | Same | Existing live/snapshot flow; committed events only; ?event and ?teacher resolve context. |

Cross-cutting checks:

- Keyboard-only: month/day jump, time buttons, selection state, Review, remove/replace, Escape, focus trap and return; no hover-only reasons.
- Screen reader: full date/time/state names, selected count announcements without announcing every rerender, field errors and conflict summary reachable.
- Student en/ru/ar/kk; long Russian text at 320; Arabic RTL at phone/desktop. Logical panel placement and chronological meaning must remain correct; no raw message keys.
- Academy plus viewer zones across midnight, a fractional offset and a DST transition; same selected source values after changing zone/clock. Differing dates shown in decisive review.
- Existing bottom navigation and sticky review bar do not cover each other or final content; browser keyboard, zoom/text enlargement and safe-area behavior; no nested page scroll trap.
- Dense simultaneous academy day and empty week/month; historical/cancelled visibility; no inference of utilization/conflict from normal simultaneity.
- Task comprehension: student can explain what is booked versus merely selected, correct one monthly exception without starting over, and understands when dates are not yet bookable. Record actual hesitation/failure; do not fabricate timing improvements or a pass.

## 17. Final decisions, remaining risks and handoff criteria

### Accepted product decisions — authorization recorded 2026-09-26

**Authorization status: FaFo accepted all three recommendations on 2026-09-26.** This release records and implements the accepted package; no recommendation below remains awaiting approval.

1. **Full next-month advance promise — accepted and implemented.** Ordinary student self-booking ends at the exclusive academy-time midnight starting the month after next, subject to published availability, eligible balance, notice and existing caps. `POLICY.md §5` and `convex/lib/policy.ts` are the sources of truth.
2. **Special finite-repeat transition — accepted and implemented.** New student plans are finite explicit dated intentions; `repeat:true` student preview/confirm writes are rejected. Already booked events and recurring rows are preserved for history/maintenance; no migration, deletion or retired-cron revival occurred.
3. **Expiry on reserved future lessons — accepted and implemented.** Eligibility of unreserved credits is checked when reserving; a paid booked lesson remains paid after later balance expiry. Expiry starts on real use and refund does not revive expired balance. This applies inside the accepted booking boundary.

**Technical implementation scope to retain:** the minimal batch receipt and expected-context guard in section 11. These address demonstrated source gaps. They do not authorize a larger schema/billing rewrite.

Other design choices are settled in this plan: next-lesson summary plus month planning overview, weekly and individual-date entry sharing one additive draft, automatic additive selection, review only when requested, teacher source-backed ranges with Save/Reset, no unreliable post-save Undo, all-teacher agenda, no full Google clone.

### Risks accepted and bounded

- The month planning overview adds a booking-entry action but restores schedule awareness; explicit booking entry links can bypass it without creating a second home.
- Weekly-first planning increases teacher-capacity commitment under the accepted calendar-month boundary; published availability, notice, balance and caps remain explicit constraints, and the product must not claim unavailable occurrences are booked.
- Date/time lists are weaker than a week grid for broad temporal comparison; retain schedule views and show the entire draft on the month. Do not reintroduce grid staging as a second mandatory interaction.
- No guarantee can reserve a candidate before confirm; explain selection versus booking and recover conflicts without losing intent.
- Shared helper corrections can affect every role and exports indirectly; verify the consumer matrix, not only the reporting page.
- Exact range semantics and credit/retry corrections are more important than cosmetic shell cleanup. Backend restriction becomes “only proven contract corrections,” not the previous unsupported “only one new range writer.”
- Broad ledger/schema/recurrence work can swallow a UX redesign. Keep the implemented receipt and policy corrections narrow; defer unrelated ledger, resource and open-ended recurrence work.

### Handoff is complete when

The release record is complete when it names the authoritative server calls, distinguishes month display from eligibility, keeps source time stable, applies the accepted repeat/expiry rules, edits source availability safely, retains staff/admin powers, and records every verification boundary. Local code gates passed except pre-existing touched-file lint debt; authenticated browser verification remains blocked by the duplicate-user dev data condition, so manual browser acceptance is not claimed.

### Final audit record

- Re-read this whole plan and the saved research synthesis; verified the Englishdom core claims against stored original page text and re-fetched Preply single/weekly entry, Cambly end-date and Teachworks enabled multi-booking documentation.
- Rechecked baseline policy, student/batch APIs, activity-cost mismatch, allocation/expiry code, availability writer/source precedence, schema and package scripts. The baseline 28-day conflict and missing expected-context/receipt guarantees are resolved by the accepted calendar boundary, context binding and durable receipt.
- Verified the implemented explicit calendar-boundary metadata and writers, single-draft pattern generation, booked-match identity, assignment/configuration races, durable recovery and availability source precondition. Exact date-hours override editing remains deferred; no speculative expiry projector or broad ledger rewrite was added.
- The supported student browser route was attempted read-only through `scripts/dev-login.mjs` against dev `quixotic-quail-572`, but `calendar:getStudentCalendar` failed because `users.unique()` returned multiple rows at `convex/calendar.ts:600`. Citation integrity and repository write scope are checked separately from product correctness. No production/test data mutation was performed.

### Implementation findings and dispositions

- The handoff formerly described the three policy recommendations as awaiting approval. **Disposition:** the 2026-09-26 authorization is authoritative; `POLICY.md`/`convex/lib/policy.ts` now record the calendar-month boundary and reserved-entitlement rule, and the student repeat writer is retired rather than preserved as a second experience.
- The baseline batch retry lookup was prefix-based on mutable `scheduleEvents` and the old UI removed conflict rows after a failed confirm. **Disposition:** the implemented tenant/student/request receipt binds normalized input, freezes unknown outcomes, and preserves conflict intentions for repair.
- The baseline availability replacement deleted all teacher rows without a source precondition or booked-lesson guard. **Disposition:** the implemented weekly source reader/writer adds source preconditions, validity preservation and booked-lesson protection; a separate date-hours override writer remains deferred.

**Bottom line:** a familiar month overview, first-class weekly planning, clear available times and one editable lesson plan is the shipped direction. The existing batch concept now has canonical draft/review/receipt boundaries, the accepted calendar-month policy is enforced server-side, legacy repeat writing is retired, availability editing is source-backed, and admin all-teacher display is grouped. The remaining release boundary is honest browser verification against safe non-duplicate dev data; no data cleanup or browser pass is fabricated.

## Sources

[1] https://englishdom-wiki.notion.site/33cc7fc8f5328075b839e6f5a033f10d — Englishdom — Schedule: General Info
[2] https://englishdom-wiki.notion.site/33cc7fc8f532805fa95ae296ddeeae3f — Englishdom — Managing Lessons
[3] https://englishdom-wiki.notion.site/33cc7fc8f53280de82a9e0e77880e5a9 — Englishdom — Rescheduling Lessons
[4] https://englishdom-wiki.notion.site/33cc7fc8f532805c959bd3bae3604a21 — Englishdom — Cancelling Lessons
[5] https://englishdom-wiki.notion.site/336c7fc8f53280cdae42d89b82e1f567 — Englishdom — Student General Information
[6] https://calendly.com/blog/new-scheduling-page-ui — Calendly — Scheduling-page redesign (2020)
[7] https://support.google.com/calendar/answer/10729749 — Google Calendar — Appointment schedules
[8] https://help.preply.com/en/articles/13924649-how-to-schedule-a-lesson — Preply — How to schedule a lesson
[9] https://help.preply.com/en/articles/13927432-how-weekly-lessons-work — Preply — How weekly lessons work
[10] https://studentsupport.cambly.com/hc/en-us/articles/17886992301197-Weekly-lessons — Cambly — Weekly lessons
[11] https://intercom.help/teachworks-e2d272c6e669/en/articles/15564076-website-booking-plugin-booking-multiple-lessons — Teachworks — Booking multiple lessons
[12] https://intercom.help/teachworks-e2d272c6e669/en/articles/14856284-employee-availability — Teachworks — Employee availability
[13] https://help.preply.com/en/articles/13926856-how-to-change-or-stop-weekly-lessons — Preply — Change or stop weekly lessons
[14] https://help.tutorcruncher.com/en/articles/14183039-creating-managing-a-series-of-repeating-lessons — TutorCruncher — Repeating lesson series
[15] https://intercom.help/teachworks-e2d272c6e669/en/articles/15362050-adding-a-repeating-lesson — Teachworks — Adding a repeating lesson
[16] https://intercom.help/teachworks-e2d272c6e669/en/articles/11472109-adding-unavailability — Teachworks — Adding unavailability
[17] https://support.google.com/calendar/answer/6110849 — Google Calendar — View your calendar
[18] https://support.microsoft.com/en-us/office/how-do-i-use-the-the-scheduling-assistant-to-find-meeting-times-bdd6c165-4186-45f1-ad9e-5af067ac69a3 — Microsoft — Scheduling Assistant
[19] https://developer.apple.com/design/human-interface-guidelines/pickers — Apple HIG — Pickers
[20] https://m3.material.io/components/date-pickers — Material 3 — Date pickers
[21] https://design-system.service.gov.uk/patterns/dates — GOV.UK — Dates pattern
[22] https://fullcalendar.io/docs — FullCalendar — Documentation
