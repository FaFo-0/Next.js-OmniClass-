# Ominca English — Academy Policy

> Single source of truth for **business policy**. `MASTER_PLAN.md` says how the software is built; this file says how the academy runs. Backend enforcement lives in `convex/lib/policy.ts` and must mirror this file — when they disagree, this file wins and the code is a bug.
>
> Status tags: **[DECIDED]** locked by FaFo · **[PROPOSED]** Claude's recommendation awaiting FaFo · **[OPEN]** needs a decision or research.
>
> Created 2026-07-19 after the pricing/retention brainstorm. Supersedes the EnglishDom-derived retention design in MASTER_PLAN §13.6–13.7 where they conflict.

---

## 0. Operating context

- **[DECIDED]** Pre-launch: zero students, zero teachers today. Target scale ~**50 students**. Every policy is sized for one admin who can personally know every student — automation is for silent repeated work (expiry, materialization, reminders), never for judgment calls.
- **[DECIDED]** Markets: **Central Asia** (Kazakhstan anchor, KZT) and **Gulf** (Saudi anchor, SAR). Students are Russian- and Arabic-speaking learners of English. Teachers: Egypt, Central Asia, anywhere capable.
- **[DECIDED]** Lessons are 1-on-1, online (Google Meet), 60 minutes default.
- **[DECIDED 2026-09-07]** Launch customer communication is Russian-first. English may appear in learning examples and selected ads, but Russian is the main platform and conversion language for now.

## 1. Pricing & packs

- **[DECIDED]** Model: **monthly prepaid lesson packs**, not auto-renewing subscriptions. A student buys the lessons they intend to use that month; no payment renews automatically. Subscriptions are a later candidate only after a payment gateway is integrated and pricing is validated.
- **[DECIDED]** Pack sizes: **4 / 8 / 12 lessons per month** (≈ 1× / 2× / 3× per week) plus **custom packs** at admin discretion for larger commitments.
- **[DECIDED 2026-09-07]** Central Asia launch pricing deliberately starts below the 2026-07 Almaty-school reference range (4,000–7,000 ₸/hr) to acquire and learn from initial students. Revisit only with real conversion, retention, and capacity data.
- **[DECIDED]** CA price table (KZT; each lesson is 60 minutes):

  | Pack | Per lesson | Price | Discount |
  |---|---|---|---|
  | Lite — 4 lessons/month | 3,750 ₸ | 15,000 ₸ | — |
  | Standard — 8 lessons/month | 3,250 ₸ | 26,000 ₸ | 13.3% |
  | Intensive — 12 lessons/month | 3,000 ₸ | 36,000 ₸ | 20% |

- **[DECIDED]** **Regional tiers, not per-country prices.** The system generalizes to region → currency → price table. Launch region: Central Asia. Gulf tier added when first Gulf students arrive.
- **[DECIDED]** Gulf tier: **50 SAR ≈ $13.30 per lesson** — the floor of the KSA online market (50–150 SAR/hr). Deliberately conservative entry; raising later is safe because existing students keep `lockedPriceTier`. Same pack structure and discount curve as CA.
- **[DECIDED]** Prices live in `pointPackages` (per region) — never hardcoded. FX rates pinned manually in `exchangeRates`; price changes write a new row with `effectiveFrom` (audit trail), existing students keep `lockedPriceTier`.
- **[DECIDED 2026-09-07]** Trial lesson: **1,500 ₸ paid**. There is **one trial per student, ever**, booked by admin only; a trial no-show forfeits the trial and its fee. If the learner later buys any package, the **1,500 ₸ is deducted from that package's price**. This is a price credit, not an additional lesson credit. Manual payment is sufficient at launch; no card-gateway work is required to honour it.

## 2. Credits & expiry

- **[DECIDED]** 1 lesson = 1 credit. Students see "N lessons left" — never points.
- **[DECIDED]** Expiry: **60 days**, clock starts **at first lesson used**, not at purchase. Buying early costs nothing; only going quiet does. One sentence to students: *"Your lessons are valid for two months from your first lesson."*
- **[DECIDED]** All standard packs share the same 60-day window (they're all ~1 month of intended use at different intensities). Custom packs get explicit admin-set expiry.
- **[DECIDED]** Existing `NO_EXPIRY` grants are **grandfathered** — no retroactive expiry on promises already made.
- **[PROPOSED]** Expiry warnings: notification at 14 days and 3 days before credits lapse. Expired credits are gone (that's the point), but admin may re-grant as goodwill — deliberate human decision, never automatic.
- **Why expiry instead of a retention status machine:** an expiring balance is a stronger nudge than any "On Break" notification, bounds deferred-revenue liability, and self-resolves dormant students without a cron. At 50 students, a human plus a good list replaces the whole EnglishDom On Break/On Hold apparatus.

## 3. Payments

- **[DECIDED]** v1 (now): **manual**. Student pays by bank transfer / Kaspi / payment link; admin grants the pack in Billing. The paid 1,500 ₸ trial is handled through the same manual receipt check. Minutes of admin work per month at launch scale; validates pricing before any integration is built.
- **[DECIDED 2026-08-07]** **Lemon Squeezy is off the table.** Its terms don't cover 1-on-1 tutoring — it sells digital products and courses, not scheduled human services. The integration is built and stays in the tree (`convex/payments.ts`, webhook wired) because the *shape* is right and it's what a future MoR would reuse, but it isn't the launch rail.
- **[DECIDED 2026-08-07]** v1.1, Central Asia: **Kaspi**. An ИП registered in Kazakhstan (partner-held at launch, see §13) connected to **Kaspi Pay**. Manual first — the student sees Kaspi details on the billing page and the academy grants the pack on sight of payment — then Kaspi's merchant API automates it through the same `paymentEvents` → `fulfillOrder` path the Lemon Squeezy webhook already uses.
- **[OPEN]** Kaspi internet-acquiring accepts cards by country of origin with restrictions. Whether Saudi-issued cards work is unconfirmed — ask Kaspi Bank in writing once the ИП exists. Assume **no** until answered.
- **[DECIDED]** Later, at scale: **Stripe** (2.9%+30¢), reached via a US LLC rather than a Kazakh entity. This is the Gulf and rest-of-world rail; Kaspi stays the Central Asia one. Two adapters, one ledger (`stripePriceId` field already exists).
- **[DECIDED]** Gulf students are a **later phase**, deferred until Stripe. Do not design the launch around them.
- **[DECIDED]** Kazakhstan/Central Asia + Gulf cards — no Russian-card sanctions exposure.
- **[RESOLVED 2026-08-07]** The KZT display question is moot: Kaspi charges in KZT natively, so CA packs are priced and charged in the student's own currency with no FX gymnastics.
- **[DECIDED]** Refunds: **no refunds** is the public policy. The paid trial (§1) is the evaluation window and is credited against a later package purchase; after a package purchase, it is final.
- **[DECIDED]** Two quiet operational carve-outs (not advertised, they make no-refunds survivable once any gateway is live):
  1. **Duplicate or mistaken purchases** refunded immediately — ops hygiene, not generosity.
  2. **Admin discretion** for exceptional cases. Rationale: a refused refund becomes a bank chargeback — the money is lost anyway *plus* a dispute fee *plus* MoR dispute strikes that can get the store dropped. Chargebacks are strictly worse than refunds; discretion is the pressure valve.
- Teacher-fault cases (teacher no-show) auto-refund the credit per §5 — that's not a "refund," the lesson never happened.

## 4. Teacher compensation

- **[DECIDED]** Revenue share: teacher earns **30% of the realised per-lesson price** in the student's purchased regional pack. At the CA launch table this is 1,125 ₸ for Lite, 975 ₸ for Standard, and 900 ₸ for Intensive. Gulf prices retain the same 30% rule. (Egypt private-tutor market equivalent: competitive.)
- **[DECIDED]** What counts as payable:
  | Event | Teacher paid? | Rationale |
  |---|---|---|
  | Lesson completed | ✅ full | — |
  | Student no-show (credit charged per §5) | ✅ full | Teacher reserved the hour |
  | Student **moves** lesson (≥6h notice) | ❌ (paid when the moved lesson happens) | No double pay; lesson still occurs |
  | Student cancels ≥6h before (credit refunded) | ❌ | Slot returns to pool |
  | Teacher cancels / teacher no-show | ❌ | And counts against reliability |
  | Unpaid ad-hoc lesson (zero-balance one-time) | ⏸ paid once admin settles it | Prevents gaming |
- **[DECIDED]** **Late-move rule** (closes the no-show laundering loophole): a move with **<6h notice is treated as a charged cancel** — credit burned, teacher paid — and the student books the new slot with a fresh credit. Without this, "Move" one hour before start beats "no-show" every time: teacher eats the dead hour unpaid while the student keeps the credit.
- **[DECIDED]** Payout terms are **per-teacher** — rate defaults to 30% with `users.payoutRateOverride` for individual deals (already in schema); channel and currency agreed per teacher at onboarding.
- **[PROPOSED]** Payout cycle: **monthly**, computed from `scheduleEvents` audit fields (completed / no_show_student with charge). No new schema — reports derive from the ledger.
- **[OPEN]** Minimum availability requirement for teachers (e.g. ≥10 open hours/week to stay listed)? FaFo to decide at first teacher onboarding.

## 5. Calendar & scheduling

> Enforced in `convex/lib/policy.ts`; labels shown to users before every action. Existing implementation (MASTER_PLAN §13.10/§14) stays as built. Restated here as business policy:

- **[DECIDED]** One unified calendar per role. Teacher paints Open/Busy; students book only open slots; admin assigns anywhere, uncapped.
- **[DECIDED]** Student self-booking: **≥12h notice, ≤28-day horizon**, 1 lesson/day, 5/week caps.
- **[DECIDED]** Student cancel: **2 free per rolling 30 days** with ≥6h notice → credit refunded. Beyond quota or <6h → credit charged. Move (reschedule) within 7-day action window, consequences always previewed.
- **[DECIDED]** Student move requires **≥6h notice** (same bar as free cancel); a <6h "move" is a charged cancel + fresh booking — see §4 late-move rule.
- **[DECIDED]** Teacher cancel: allowed, tracked as reliability metric; <12h notice flagged. First-ever lesson with a student: teacher cancellation hard-blocked.
- **[DECIDED] Teacher time off (2026-07-26).** A teacher blocks their own dates — no waiting for permission, because sick days can't queue. Three rules make that safe: (1) **booked lessons block the block** — the range can't be closed while lessons sit inside it, so the teacher must move or cancel them first and the student is told through the normal cancellation path; (2) **the academy always hears about it** — every block notifies admins; (3) **over 3 consecutive days needs sign-off** — the block still applies immediately, but it lands in the admin needs-attention list until approved, so a two-week disappearance can't pass unnoticed. Rationale: at ≤5 teachers the risk isn't abuse, it's *surprise* — this trades approval friction for visibility.
- **[DECIDED]** No-show ladder (cron): reminders → 20 min after start with teacher absent → auto-refund + admin alert. `teacherStartedAt` disarms it.
- **[DECIDED]** Weekly recurring schedules: student holds a slot; materializer books 7 days ahead, deducts per occurrence; zero balance → occurrence skipped + reminder (slot survives); same-day cap respected.
- **[DECIDED]** **One-time lessons** at any clock time (16:15, 10:30 — 15-min grid) may sit outside published hours; interval-overlap conflict checks both sides. Zero-balance one-time lessons are created and flagged `unpaid` for admin settlement rather than blocked.
- **[DECIDED]** Every live session must resolve to a real dated calendar event — no placeholder events.
- **[DECIDED]** Times stored in academy anchor tz (**Asia/Almaty**); every user views/acts in their own tz; 12h/24h per user preference.

## 6. Pause (the humane side of expiry)

- **[DECIDED]** Students can pause: **freezes the expiry clock** and suspends weekly-schedule materialization. This is what makes 60-day expiry fair — illness/travel/exams have a legitimate outlet.
- **[DECIDED]** Rules: max **14 days per pause**, max **2 pauses per 6 months**, weekly slot **held** during pause. Longer absence → admin converts to: slot released, credits frozen until return (goodwill, manual).
- **[DECIDED]** Auto-resume at pause end + notification; no statuses beyond existing `paused`.

## 7. Student lifecycle (simplified — no status machine)

- **[DECIDED]** Statuses stay as-is: `trial / active / paused / cancelled`. **On Break / On Hold auto-statuses are dropped** — EnglishDom needs them at thousands of students; we have an admin who can read a list.
- **[PROPOSED]** Replacement: an admin **attention list** (extend existing needs-attention inbox): students with no lesson in 14+ days, expiring credits, unpaid ad-hoc lessons, weekly schedules skipping on zero balance. Human decides; system never auto-transitions a student.
- **[DECIDED]** **Academy holidays table dropped** — at ≤5 teachers, "everyone blocks Eid" is the existing time-off feature used five times.

## 8. Recording, AI & data

- **[DECIDED]** Lessons are recorded and transcribed (Soniox) and AI-processed (summaries, vocab, flashcards, quizzes via OpenRouter). This is the product.
- **[PROPOSED]** Consent: recording/AI-processing consent is part of student onboarding — checkbox + one plain-language sentence, stored with timestamp. Minors: parent consent (CA market will have teens).
- **[DECIDED]** Recording retention: **keep everything indefinitely**; FaFo manages storage manually. Ballpark to watch: a 60-min lesson ≈ 30–60 MB of audio → 50 students × 8 lessons/month ≈ **~300 GB/year** accumulating in Convex storage. Revisit when the storage line item becomes visible on the bill (see §12).
- **Cost note (2026-07 research):** AI cost ≈ **$0.16/lesson** (Soniox real-time $0.12/hr + ~$0.04 LLM at Gemini Flash prices) ≈ 2% of CA revenue. Negligible; re-check only if models change.

## 9. Unit economics (CA launch tier, reference)

At the July-2026 reference rate of roughly 500 ₸ per USD and the existing $0.16 AI-cost estimate per lesson:

| Pack | Revenue / lesson | Teacher (30%) | Gateway (~6%, when integrated) | AI (STT + LLM) | **Gross margin** |
|---|---:|---:|---:|---:|---:|
| Lite | $7.50 (3,750 ₸) | −$2.25 | −$0.45 | −$0.16 | **≈ $4.64 (61.9%)** |
| Standard | $6.50 (3,250 ₸) | −$1.95 | −$0.39 | −$0.16 | **≈ $4.00 (61.5%)** |
| Intensive | $6.00 (3,000 ₸) | −$1.80 | −$0.36 | −$0.16 | **≈ $3.68 (61.3%)** |

Gulf tier at 50 SAR ≈ $13.30: teacher −$4.00, gateway −$1.17, AI −$0.16 → **≈ $7.97 (60%)**.

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
| Group lessons / IELTS tiers | v1 stable; `activityTypes` machinery already anticipates them |

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
| 2026-09-07 | [Hermes] FaFo confirmed the launch offer: monthly 60-minute Lite/Standard/Intensive packs at 15,000 ₸ / 26,000 ₸ / 36,000 ₸; a 1,500 ₸ paid trial credited against a later package purchase; Russian-first launch communication with selective English ads/examples; and manual payment/lead handling at launch. §1, §3, §4, and §9 now use the resulting prices and unit economics. |
| 2026-07-19 | [Claude] Initial version from FaFo brainstorm: packs over subscriptions, 4/8/12+custom, 60-day expiry from first use, regional tiers (CA anchor 4,000₸/$8, Gulf ~2.5×), teacher 30%, Lemon Squeezy→Stripe, pause kept, On Break/On Hold + holidays dropped. Market + AI-cost research embedded. |
| 2026-07-19 | [Claude] FaFo round 2: trial → **free** (avoids one-time LS payment handling; one-trial-per-student + forfeit-on-no-show as mitigation). Added §10 Homework obligations (teachers) and §11 Code of conduct & dispute escalation. Referral, certificates, teacher-onboarding sections deliberately skipped. |
| 2026-07-19 | [Claude] FaFo round 3: Gulf → **50 SAR**; refunds → **none** (public policy; Claude carve-outs for duplicate purchases + admin discretion, chargeback rationale, tagged PROPOSED); pause rules locked; teacher paid on student no-show, unpaid on moves; **late-move rule** proposed (<6h move = charged cancel — closes no-show laundering); recordings kept **forever, manual**; payout **per-teacher** via existing `payoutRateOverride`. Unit economics updated for 50 SAR (~60% margin). |
| 2026-08-07 | [Claude] **Lemon Squeezy dropped** — its terms cover digital products and courses, not scheduled 1-on-1 services. §3 rewritten: **Kaspi** for Central Asia (partner-held ИП + Kaspi Pay, manual first then merchant API), **Stripe via a US LLC** for Gulf and rest-of-world, deferred. New **§13 Company, money & partners** records the Kazakh entity picture: who can hold what, the ИП bridge and its real cost, the 2026 tax numbers (МРП 4,325 ₸, VAT threshold 43.25M ₸), what crossing the VAT line does, the resolved foreign-SaaS VAT question and the still-open withholding one, Astana Hub, US-LLC/sanctions status, and standing partner terms. ⚠️ items there need a Kazakh lawyer before money moves. |
