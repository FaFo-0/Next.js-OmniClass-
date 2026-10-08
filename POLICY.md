# Omnica English — Academy Policy

> Single source of truth for **business policy**. `MASTER_PLAN.md` says how the software is built; this file says how the academy runs. Backend enforcement lives in `convex/lib/policy.ts` and must mirror this file — when they disagree, this file wins and the code is a bug.
>
> Status tags: **[DECIDED]** locked by FaFo · **[PROPOSED]** recommendation awaiting FaFo · **[OPEN]** needs a decision or research.
>
> Created 2026-07-19 after the pricing/retention brainstorm. Supersedes the EnglishDom-derived retention design in MASTER_PLAN §13.6–13.7 where they conflict.

---

## 0. Operating context

- **[DECIDED]** Pre-launch: zero students, zero teachers today. Target scale ~**50 students**. Every policy is sized for one admin who can personally know every student — automation is for silent repeated work (expiry, materialization, reminders), never for judgment calls.
- **[DECIDED]** Markets: **Central Asia** (Kazakhstan anchor, KZT) and **Gulf** (Saudi anchor, SAR). Students are Russian- and Arabic-speaking learners of English. Teachers: Egypt, Central Asia, anywhere capable.
- **[DECIDED]** Lessons are 1-on-1, online (Google Meet): a 60-minute calendar reservation contains 55 minutes of teaching and a soft five-minute break. Teachers may finish teaching after 55 minutes whether or not another lesson follows; sessions are not automatically ended.
- **[DECIDED 2026-09-07]** Launch customer communication is Russian-first. English may appear in learning examples and selected ads, but Russian is the main platform and conversion language for now.

## 1. Pricing & packs

- **[DECIDED 2026-09-29]** Commercial access is a **flat published catalogue**: one row per pack, grouped by family. It is not subscriptions, package rows, or a versioned catalogue. The only initial families, in student order, are **Standard Tutoring** then **IELTS**. An administrator may create, edit, hide, show, archive, restore, and explicitly order additional families and packs without a code change, and every offered family appears on the public website without a code change.
- **[DECIDED 2026-09-29]** **There is no price lock.** A pack carries exactly one price. Editing it changes what every student is offered, including existing students, on their next page load. Any one-off arrangement with a single student is handled by hand — lessons given directly and the agreed amount recorded in the ledger — never by a per-student price in the catalogue.
- **[OPEN 2026-10-08]** Pack prices are not finalized. Previously published Standard Tutoring and IELTS prices are provisional catalogue data, not approved launch prices. Pack structure, benefits and expiry remain separately configured; confirm final prices before launch.
- **[DECIDED 2026-09-12]** Family, pack, and benefit ordering are explicit data. Every student-visible pack must show family, pack name, price/currency, lesson count, expiry, and every configured benefit. Nothing may hide those mandatory commercial fields.
- **[DECIDED 2026-09-12]** Benefits are commercial descriptions only. All students retain full platform access; no family, pack, or benefit gates learning, library, reader, vocabulary, flashcards, or other platform features.
- **[DECIDED 2026-09-29]** A discount is a **sale price typed on one pack**, optionally with an end date. Both the student page and the public website show the normal price crossed out beside it, and the sale switches itself off after its end date. There is no discount engine: no percentage/fixed rules, no scope or priority, no allowlists, no redemption limits, no stacking, no academy-wide sale, and no vouchers, coupons, promo codes, or student code-entry fields.
- **[DECIDED 2026-09-29]** A price change is a single save. There is no draft, version, publish step, or publication scope. Existing orders and grants retain immutable plan and price snapshots; this is ordinary order provenance, not a grandfathering or compatibility layer.
- **[DECIDED 2026-09-29]** A hand-made deal with one student is a first-class admin action, not a catalogue exception: give that student lessons directly (with an optional validity window) and record the agreed amount in the ledger. It creates no pack, receipt, or per-student price.
- **[DECIDED 2026-09-12]** The initial development/test reset intentionally removed legacy package/catalogue, locked-price, compatibility, migration, review, and gateway data/models. `pointPackages`, price migration, payment-event, and package-claim rails are not policy or product surfaces.
- **[DECIDED 2026-09-29]** The **versioned catalogue and the automatic-discount engine are retired**; `billingPlans`, `billingPlanVersions`, `billingPlanBenefits`, `billingDiscounts`, and the discount allowlist/redemption tables exist only as readable history until a verified readback empties and removes them. The pack model is `packFamilies` + `packs`.
- **[DECIDED 2026-10-08]** Trials are paid, not free.
- **[OPEN 2026-10-08]** Trial price, duration, teacher compensation and payment/credit fulfillment must be decided. Automatic free trial credit on onboarding is obsolete behavior and must be replaced before paid trials launch; this policy update alone does not change that behavior.

## 2. Credits & expiry

- **[DECIDED]** 1 lesson = 1 credit. Students see "N lessons left" — never points.
- **[DECIDED 2026-09-26]** Expiry limits unreserved balance, not a successfully reserved lesson. Booking reserves the eligible credit; a paid booked lesson remains paid if its grant later expires. Expiry starts only on real use, and a refund after expiry does not revive expired balance. Advance booking remains limited by the calendar boundary and ordinary caps.
- **[DECIDED]** All standard packs share the same 60-day window (they're all ~1 month of intended use at different intensities). Custom packs get explicit admin-set expiry.
- **[DECIDED]** Existing `NO_EXPIRY` grants are **grandfathered** — no retroactive expiry on promises already made.
- **[PROPOSED]** Expiry warnings: notification at 14 days and 3 days before credits lapse. Expired credits are gone (that's the point), but admin may re-grant as goodwill — deliberate human decision, never automatic.
- **Why expiry instead of a retention status machine:** an expiring balance is a stronger nudge than any "On Break" notification, bounds deferred-revenue liability, and self-resolves dormant students without a cron. At 50 students, a human plus a good list replaces the whole EnglishDom On Break/On Hold apparatus.

## 3. Billing orders and payment operations

- **[DECIDED 2026-09-29]** The canonical commercial flow is: offered pack in the published catalogue → pending billing order carrying an immutable price receipt → admin payment verification → `Admin Grant` exactly once → grant, finance, and lesson-ledger provenance, plus notifications at both ends. A student request never grants lessons directly.
- **[DECIDED 2026-10-08]** The academy contacts students on WhatsApp to arrange payment; student billing also offers the academy WhatsApp link. Students are not instructed to transfer independently. Admin verifies payment and fulfills the billing order exactly once.
- **[DECIDED 2026-09-12]** The system has no payment gateway/webhook integration, payment-event ledger, package fulfillment adapter, or future-provider compatibility code. A future provider requires a separately approved design that preserves the canonical billing-order idempotency boundary rather than reviving a package path.
- **[DECIDED]** Refund decisions remain an administrator responsibility and must be recorded through ordinary finance and order operations; the catalogue never invents a refund or creates a replacement purchase grant.

## 4. Teacher compensation

- **[DECIDED 2026-10-08]** Teachers receive an individually agreed fixed amount per payable lesson, independent of student pack prices. Percentage revenue sharing is retired. Egyptian teachers are paid in USD; Kazakh teacher agreements may be in KZT.
- **[OPEN 2026-10-08]** Exact teacher rates remain to be agreed. FaFo identified at least 2,500 KZT as the expected level for Kazakh teachers teaching beginners; this is not an automatic platform-wide rate. Paid-trial teacher rates remain undecided.
- **[DECIDED]** What counts as payable for standard lessons (paid-trial exceptions remain open above):
  | Event | Teacher paid? | Rationale |
  |---|---|---|
  | Lesson completed | ✅ full | — |
  | Student no-show (credit charged per §5) | ✅ full | Teacher reserved the hour |
  | Student **moves** lesson (≥6h notice) | ❌ (paid when the moved lesson happens) | No double pay; lesson still occurs |
  | Student cancels ≥6h before (credit refunded) | ❌ | Slot returns to pool |
  | Teacher cancels / teacher no-show | ❌ | And counts against reliability |
  | Unpaid ad-hoc lesson (zero-balance one-time) | ⏸ paid once admin settles it | Prevents gaming |
- **[DECIDED]** **Late-move rule** (closes the no-show laundering loophole): a move with **<6h notice is treated as a charged cancel** — credit burned, teacher paid — and the student books the new slot with a fresh credit. Without this, "Move" one hour before start beats "no-show" every time: teacher eats the dead hour unpaid while the student keeps the credit.
- **[DECIDED 2026-10-08]** Payout terms are per teacher: fixed lesson amount, agreement currency and payment channel. KZT is the current accounting base; USD amounts convert using the configured rate, with original amounts and booking rates retained in payment records.
- **[PROPOSED]** Payout cycle: **monthly**, computed from `scheduleEvents` audit fields (completed / no_show_student with charge). No new schema — reports derive from the ledger.
- **[OPEN]** Minimum availability requirement for teachers (e.g. ≥10 open hours/week to stay listed)? FaFo to decide at first teacher onboarding.

## 5. Calendar & scheduling

> Enforced in `convex/lib/policy.ts`; consequences are shown before scheduling actions.

- **[DECIDED 2026-10-06]** One calendar per role. Teachers open 30-minute cells in their usual weekly schedule or on specific dates. A standard lesson reserves two consecutive open cells and uses one lesson credit. Students book only available cells; staff may schedule outside published availability. Overlapping reservations are blocked for both teacher and student. Back-to-back reservations are allowed: there is no required gap, buffer warning, or break override.
- **[DECIDED 2026-10-06]** All scheduled bookings and moves use the academy half-hour grid. Each reservation is 60 minutes; teaching is 55 minutes with a soft five-minute break inside the reservation. Changing availability never cancels a booking: move or cancel booked lessons before closing their cells.
- **[DECIDED 2026-09-26]** Student self-booking: **≥12h notice, through the end of the following academy calendar month**, 1 lesson/day, 5/week caps. The exclusive upper boundary is academy-time midnight on the first day of the month after next; minimum notice and caps remain separate checks.
- **[DECIDED]** Student cancel: **2 free per rolling 30 days** with ≥6h notice → credit refunded. Beyond quota or <6h → credit charged. Both cancellation and rescheduling currently have a 7-day action window; consequences are previewed. **[OPEN 2026-10-08]** Confirm whether to retain this restriction now that students can book through the following month.
- **[DECIDED]** Student move requires **≥6h notice** (same bar as free cancel); a <6h "move" is a charged cancel + fresh booking — see §4 late-move rule.
- **[DECIDED]** Teacher cancel: allowed, tracked as reliability metric; <12h notice flagged. First-ever lesson with a student: teacher cancellation hard-blocked.
- **[DECIDED] Teacher time off (2026-07-26).** A teacher blocks their own dates — no waiting for permission, because sick days can't queue. Three rules make that safe: (1) **booked lessons block the block** — the range can't be closed while lessons sit inside it, so the teacher must move or cancel them first and the student is told through the normal cancellation path; (2) **the academy always hears about it** — every block notifies admins; (3) **over 3 consecutive days needs sign-off** — the block still applies immediately, but it lands in the admin needs-attention list until approved, so a two-week disappearance can't pass unnoticed. Rationale: at ≤5 teachers the risk isn't abuse, it's *surprise* — this trades approval friction for visibility.
- **[DECIDED]** No-show ladder (cron): reminders → 20 min after start with teacher absent → auto-refund + admin alert. `teacherStartedAt` disarms it.
- **[DECIDED 2026-09-26]** Weekly student plans are finite explicit dated plans. New student writers do not create or extend ongoing held slots or legacy generated-repeat privileges; already booked historical recurring events remain intact and readable. The retired materializer is not revived.
- **[DECIDED 2026-10-06]** **Add lesson** schedules a 60-minute reservation on a half-hour start, including outside published availability. Zero-balance staff-created lessons are flagged `unpaid` for admin settlement rather than blocked. An immediate unscheduled live start reserves the half-hour containing its actual start; the teaching start is recorded separately and overlaps remain blocked.
- **[DECIDED]** Every live session must resolve to a real dated calendar event — no placeholder events.
- **[DECIDED]** Times stored in academy anchor tz (**Asia/Almaty**); every user views/acts in their own tz; 12h/24h per user preference.

## 6. Pause (the humane side of expiry)

- **[DECIDED]** Students can pause: **freezes the expiry clock**. Weekly plans are finite dated bookings (§5); pauses do not generate, hold, cancel, or move lessons automatically. Existing bookings must be moved or cancelled under §5. This is what makes 60-day expiry fair — illness/travel/exams have a legitimate outlet.
- **[DECIDED]** Rules: max **14 days per pause**, max **2 pauses per 6 months**, no ongoing weekly slot is held during pause. Longer absence → admin may freeze credits until return as manual goodwill.
- **[DECIDED]** Auto-resume at pause end + notification; no statuses beyond existing `paused`.

## 7. Student lifecycle (simplified — no status machine)

- **[DECIDED]** Statuses stay as-is: `trial / active / paused / cancelled`. **On Break / On Hold auto-statuses are dropped** — EnglishDom needs them at thousands of students; we have an admin who can read a list.
- **[PROPOSED]** Replacement: an admin **attention list** (extend existing needs-attention inbox): students with no lesson in 14+ days, expiring credits, unpaid ad-hoc lessons, students unable to book because their balance is zero. Human decides; system never auto-transitions a student.
- **[DECIDED]** **Academy holidays table dropped** — at ≤5 teachers, "everyone blocks Eid" is the existing time-off feature used five times.

## 8. Recording, AI & data

- **[DECIDED]** Lessons are recorded and transcribed (Soniox) and AI-processed (summaries, vocab, flashcards, quizzes via OpenRouter). This is the product.
- **[PROPOSED]** Consent: recording/AI-processing consent is part of student onboarding — checkbox + one plain-language sentence, stored with timestamp. Minors: parent consent (CA market will have teens).
- **[DECIDED]** Recording retention: **keep everything indefinitely**; FaFo manages storage manually. Ballpark to watch: a 60-min lesson ≈ 30–60 MB of audio → 50 students × 8 lessons/month ≈ **~300 GB/year** accumulating in Convex storage. Revisit when the storage line item becomes visible on the bill (see §12).
- **[FACT — FaFo, 2026-10-08]** Current platform operating costs are almost zero after switching providers away from paid features. AI costs are low and the domain is already paid for. Previous per-lesson provider estimates are obsolete; actual charges must be distinguished from estimates.

## 9. Unit economics

- **[OPEN 2026-10-08]** Final margins cannot be stated until student prices, teacher agreements and paid-trial terms are decided. The old percentage-pay margin table is retired.
- Calculate lesson contribution from the actual student price per lesson minus the teacher's fixed lesson payment and actual variable costs, expressed in KZT. Record domain and other fixed expenses when incurred; do not invent gateway fees or provider charges for free services.
- **Implementation mismatch:** automatic transcription accrual still uses a configured/default paid-provider estimate. It must be reconciled with the current free-provider setup before treating reported costs as actual expenses.

## 10. Homework obligations (teachers)

> The platform auto-generates post-lesson content (summary, vocabulary, flashcards, quiz) from the transcript. The teacher's job is judgment, not authoring.

- **[DECIDED]** Homework is part of the product — every completed lesson produces reviewable material for the student.
- **[PROPOSED]** Teacher obligations per completed lesson:
  1. **Review and publish** the AI-generated content within **24 hours** of lesson end (fix AI mistakes, cut irrelevant vocab — publish, don't rewrite).
  2. **Check the student's submitted homework before the next lesson** with that student; unreviewed submissions surface in the teacher's needs-attention view.
  3. Persistent lateness (>48h publishing, unreviewed homework at lesson start) counts against reliability alongside late cancels.
- **[PROPOSED]** No homework obligations on the student — homework completion is tracked and visible to teacher/admin (retention signal), never punished.

## 11. Code of conduct & dispute escalation

**Teachers — [PROPOSED]:**
- Camera on, punctual (the no-show ladder in §5 is the enforcement), professional conduct; sessions happen **on the academy's Meet room and on the record** — that recording is also the teacher's protection.
- **No off-platform solicitation.** Taking academy students private (direct payment, "let's do this outside") is the one immediately-terminating offense. All lesson payment flows through the academy.
- No sharing of student data (contacts, recordings, transcripts) outside the platform.

**Students — [PROPOSED]:**
- Harassment or abuse of a teacher: one written warning from admin; repeat → removal. Remaining **unused** credits refunded on removal (we take the loss to end it cleanly); used credits are not.
- Chronic no-show behavior is handled economically (§5 charges), not morally — no lectures, the quota system is the policy.

**Escalation path — [PROPOSED]:**
1. Anything teacher↔student that isn't policy-automatic goes to **admin within 48h** via the platform (later: WhatsApp).
2. Admin decides refunds/credits per §3; recordings and transcripts are the evidence record — this is why §8 consent matters.
3. FaFo is the final word. At 50 students there is no committee; the policy just names the referee.

## 12. Deliberately not doing (with revisit triggers)

| Not doing | Revisit when |
|---|---|
| Subscriptions | Gateway integrated AND pricing validated by ≥20 paying students |
| On Break / On Hold auto-statuses | ≥200 students or admin demonstrably missing dormant students |
| Academy holidays table | ≥10 teachers |
| Slot-release automation | Teacher hours actually contended (waitlists exist) |
| Stripe | Volume where 2.6% fee delta > MoR tax-handling value |
| Recording storage lifecycle | Storage line item visible on the Convex bill (~300 GB/yr accumulation at target scale) |
| Group lessons | v1 stable; `activityTypes` machinery already anticipates them. IELTS and Standard Tutoring catalogue families are approved for this release; they never gate platform access. |

## 13. Company, money & partners (Kazakhstan)

> Decided 2026-08-07 after researching Kazakh tax and corporate law. Everything
> here is **operating reality, not legal advice** — the ⚠️ items need a Kazakh
> lawyer or accountant before money moves.

### Who can hold what

- **[FACT]** FaFo is a Syrian citizen on a Kazakh **student visa**, holds an **ИИН**, and leaves Kazakhstan permanently in ~1 year (from Aug 2026).
- **[FACT]** A foreigner **cannot register an ИП** without a вид на жительство. A student visa is not one. So the launch entity must be partner-held.
- **[FACT]** A foreigner **can** be a **ТОО participant**, and does **not** need to live in Kazakhstan to stay one. Shares are property; leaving doesn't touch ownership.
- **[FACT]** Founding a ТОО *while in Kazakhstan* wants migration status suited to it (visa **C5**, бизнес-иммигрант). Founding **from abroad** is a normal serviced route (ИИН + notarised power of attorney + local representative).
- **[FACT]** A **foreign director** requires a разрешение на привлечение иностранной рабочей силы. A Kazakh-citizen director avoids it entirely.
- **[DECIDED]** Target structure: **FaFo 100% participant (non-resident), Kazakh citizen as director** on an employment contract, with the charter capping the director's authority above a threshold and preserving the participant's right to dismiss at will.
- **⚠️ [OPEN]** Which Kazakh banks onboard **Syrian-national founders**. This is bank risk appetite, not law, and it is the failure mode that kills the ТОО plan. Ask before paying for registration.
- **⚠️ [OPEN]** Withholding tax on **dividends to a non-resident** — the mechanism by which money reaches FaFo after he leaves. Get a rate and a holding-period answer.

### Launch entity — partner-held ИП

- **[DECIDED]** Sally (Kazakh citizen, 20) registers an **ИП** on the **упрощённая декларация** regime, **ОКЭД 85.59.9** (прочие виды образования — confirmed *not* on the 2026 prohibited list of 180 codes), connected to **Kaspi Pay**. Registration is notification-based, ~15 minutes via the Kaspi app or egov.kz.
- **[FACT]** Sally as of 2026-08: no АСП in the family, **no existing ИП**, not employed, university **deferred**. So no disqualifier — and no student ВОСМС exemption yet.
- **[DECIDED]** FaFo covers **all** ИП costs — contributions, tax, accountant. Sally pays nothing from her own pocket.
- **[DECIDED]** This is a **bridge of months, not years**. The ИП closes when the ТОО is registered.

### The numbers (2026)

| Item | Value |
|---|---|
| 1 МРП | **4,325 ₸** |
| 1 МЗП | **85,000 ₸** |
| ИП contributions for self | **21,675 ₸/mo** (ОПВ 8,500 · ОПВР 2,975 · СО 4,250 · ВОСМС 5,950) |
| — if enrolled full-time | **15,725 ₸/mo** (state pays ОСМС for students) |
| — if born before 1975 | −2,975 ₸ (no ОПВР) |
| Упрощёнка tax | **3% of turnover** |
| VAT registration threshold | **43,250,000 ₸/yr** (10,000 МРП) |
| Упрощёнка turnover cap | **2,595,000,000 ₸/yr** (600,000 МРП) |

- **[FACT]** Of the 21,675 ₸, **11,475 ₸ accrues to Sally's own pension**; ВОСМС largely replaces the 4,250 ₸/mo a non-working adult should self-pay anyway. Marginal true cost to her is small — this matters when explaining the deal.
- **[FACT]** Thresholds belong to the **person**, not the business. One person, one ИП; any other turnover aggregates.

### Crossing the VAT line

- **[FACT]** From 2026 **упрощёнка and VAT cannot coexist**. Crossing 43.25M ₸ forces ОУР: tax base moves from turnover to profit, and VAT is **16%**.
- **[FACT]** Deadline is **5 working days** from crossing; a single transaction that would cross it must be declared *before* completing. Penalties: **50 МРП** for late registration, **15% of turnover** transacted while unregistered.
- **[DECIDED]** Watch cumulative turnover monthly, alert at ~35M ₸. Students are individuals and cannot reclaim VAT, so 16% is a price rise or a margin hit — **price packs so the margin survives the jump**.

### Foreign SaaS

- **[RESOLVED]** **Reverse-charge VAT does not apply** to a non-VAT-registered ИП. Nothing owed on Convex, Vercel, Clerk, OpenRouter or Soniox while on упрощёнка under the threshold.
- **⚠️ [OPEN]** **КПН у источника** (withholding) is a *separate* obligation and ИПs **are** tax agents for it. Services performed wholly outside Kazakhstan aren't taxable; a **right to use software is a royalty taxed at 15%**. Which vendors fall on which side is a contracts question — ask the accountant, and ask about treaty relief (needs a residency certificate from the vendor).
- **[FACT]** **Astana Hub residents are exempt** from withholding on royalties paid to foreign providers for qualifying IT activity — which would erase this line entirely.

### Astana Hub

- **[DECIDED]** Target for the ТОО: **0% CIT and 0% VAT until 1 Jan 2029**, plus the royalty-withholding exemption above. This is an incentive programme built for this kind of company — use it rather than structuring around the tax code.
- **⚠️** Splitting one business across entities purely to stay under thresholds (**дробление бизнеса**) is actively challenged. Only viable if the products are genuinely separate.

### Gulf / international

- **[DECIDED]** Deferred to the **Stripe phase**, reached via a **US LLC**, not a Kazakh entity. Kaspi stays the Central Asia rail.
- **[FACT]** US Syria sanctions: EO 14312 (30 Jun 2025) terminated the programme, 31 CFR 542 removed 26 Aug 2025, **Caesar Act repealed** by NDAA 2026 §6211 (18 Dec 2025). Targeted designations remain and Syria is still an **SST** — so the barrier is bank risk appetite, not law.
- **[FACT]** A foreign-owned single-member US LLC must file **Form 5472 + pro-forma 1120 annually — $25,000 penalty** for failure, even with zero US income. Non-optional.
- **[FACT]** Formation is ~$150–200 direct (NM/WY + registered agent). Stripe Atlas's $500 is convenience, not a requirement.

### Partner terms (any partner holding an entity for us)

1. Funds are received **on the company's behalf**, not as personal income. Fixed transfer schedule.
2. FaFo covers **all** entity costs — contributions, tax, accountant — paid directly, not reimbursed.
3. **Platform, domain, student data and IP are FaFo's**, listed explicitly.
4. **Named migration date** to the ТОО, after which the bridge entity closes.
5. FaFo **indemnifies** the partner for tax and fines arising from business he directs — written, in the partner's language.
6. Exit terms: notice period, handover of funds, no student solicitation.
7. **Every infrastructure account in FaFo's name with his 2FA** — Convex, Clerk, Vercel, domain, Google Workspace, OpenRouter. The partner gets application-level admin only. This is what makes point 3 enforceable.
8. Whoever operates payments gets **scoped permissions** (`billing.view`, `billing.edit`, `users.create`, `users.edit`) — never blanket admin.

---

---

*Changelog*
| Date | Change |
|---|---|
| 2026-07-19 | [Claude] FaFo round 2: trial → **free** (avoids one-time LS payment handling; one-trial-per-student + forfeit-on-no-show as mitigation). Added §10 Homework obligations (teachers) and §11 Code of conduct & dispute escalation. Referral, certificates, teacher-onboarding sections deliberately skipped. |
| 2026-07-19 | [Claude] FaFo round 3: Gulf → **50 SAR**; refunds → **none** (public policy; Claude carve-outs for duplicate purchases + admin discretion, chargeback rationale, tagged PROPOSED); pause rules locked; teacher paid on student no-show, unpaid on moves; **late-move rule** proposed (<6h move = charged cancel — closes no-show laundering); recordings kept **forever, manual**; payout **per-teacher** via existing `payoutRateOverride`. Unit economics updated for 50 SAR (~60% margin). |

| 2026-10-06 | [Codex] FaFo approved half-hour scheduling, 60-minute reservations with 55 minutes teaching, adjacent bookings without buffers, protected availability edits, and finite-plan pause wording. |

| 2026-10-08 | [Codex] Recorded FaFo’s paid-trial decision, undecided student prices, fixed per-teacher pay with Egyptian agreements in USD, KZT accounting and current low operating costs. Retired superseded percentage-pay/pricing/margin assumptions; identified trial-credit, cost-accrual and calendar action-window items requiring follow-up. |
