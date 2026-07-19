# Omnica English — Academy Policy

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

## 1. Pricing & packs

- **[DECIDED]** Model: **lesson packs** (prepaid credits), not subscriptions. Subscriptions are a v1.1 candidate once a payment gateway is integrated and pricing is validated (EnglishDom's own path: packages → subscriptions).
- **[DECIDED]** Pack sizes: **4 / 8 / 12** lessons (≈ 1× / 2× / 3× per week for a month) plus **custom packs** at admin discretion for larger commitments.
- **[DECIDED]** Anchor price, Central Asia: **4,000 KZT ≈ $8 per lesson**. Market check 2026-07: Almaty schools 4,000–7,000₸/hr, Preply avg ~$13, Skyeng packs ~$9–20/lesson — we sit at the low end, deliberately, with room to raise.
- **[PROPOSED]** CA price table (round numbers in KZT; modest volume discount so big packs don't create a cheap-lesson liability):

  | Pack | Per lesson | Price | Discount |
  |---|---|---|---|
  | 4 | 4,000 ₸ | 16,000 ₸ | — |
  | 8 | 3,750 ₸ | 30,000 ₸ | 6% |
  | 12 | 3,500 ₸ | 42,000 ₸ | 12.5% |

- **[DECIDED]** **Regional tiers, not per-country prices.** The system generalizes to region → currency → price table. Launch region: Central Asia. Gulf tier added when first Gulf students arrive.
- **[DECIDED]** Gulf tier: **50 SAR ≈ $13.30 per lesson** — the floor of the KSA online market (50–150 SAR/hr). Deliberately conservative entry; raising later is safe because existing students keep `lockedPriceTier`. Same pack structure and discount curve as CA.
- **[DECIDED]** Prices live in `pointPackages` (per region) — never hardcoded. FX rates pinned manually in `exchangeRates`; price changes write a new row with `effectiveFrom` (audit trail), existing students keep `lockedPriceTier`.
- **[DECIDED]** Trial lesson: **free**. Rationale: a paid trial (2,000₸) would force one-time-payment handling in Lemon Squeezy at launch — not worth the build. The no-show risk of free trials is accepted and mitigated procedurally: **one trial per student, ever**, booked by admin only, and a trial no-show forfeits the trial.

## 2. Credits & expiry

- **[DECIDED]** 1 lesson = 1 credit. Students see "N lessons left" — never points.
- **[DECIDED]** Expiry: **60 days**, clock starts **at first lesson used**, not at purchase. Buying early costs nothing; only going quiet does. One sentence to students: *"Your lessons are valid for two months from your first lesson."*
- **[DECIDED]** All standard packs share the same 60-day window (they're all ~1 month of intended use at different intensities). Custom packs get explicit admin-set expiry.
- **[DECIDED]** Existing `NO_EXPIRY` grants are **grandfathered** — no retroactive expiry on promises already made.
- **[PROPOSED]** Expiry warnings: notification at 14 days and 3 days before credits lapse. Expired credits are gone (that's the point), but admin may re-grant as goodwill — deliberate human decision, never automatic.
- **Why expiry instead of a retention status machine:** an expiring balance is a stronger nudge than any "On Break" notification, bounds deferred-revenue liability, and self-resolves dormant students without a cron. At 50 students, a human plus a good list replaces the whole EnglishDom On Break/On Hold apparatus.

## 3. Payments

- **[DECIDED]** v1 (now): **manual**. Student pays by bank transfer / Kaspi / payment link; admin grants the pack in Billing. Minutes of admin work per month at launch scale; validates pricing before any integration is built.
- **[DECIDED]** v1.1: **Lemon Squeezy** (Merchant of Record — handles VAT/tax across student countries; worth its ~5%+50¢ fee at our size). Webhook → `convex/http.ts` → `grantPointsInternal`. Schema is already prepared (`pointPackages.lemonSqueezyVariantId`).
- **[DECIDED]** Later, at scale: **Stripe** (2.9%+30¢) when volume justifies handling tax ourselves (`stripePriceId` field already exists).
- **[DECIDED]** Kazakhstan/Central Asia + Gulf cards — no Russian-card sanctions exposure.
- **[OPEN]** Verify Lemon Squeezy handles KZT pricing/display (or price CA packs in USD with local-price shown as reference). Research before v1.1 build.
- **[DECIDED]** Refunds: **no refunds** is the public policy. The free trial (§1) is the evaluation window — after that, purchases are final.
- **[DECIDED]** Two quiet operational carve-outs (not advertised, they make no-refunds survivable once Lemon Squeezy is live):
  1. **Duplicate or mistaken purchases** refunded immediately — ops hygiene, not generosity.
  2. **Admin discretion** for exceptional cases. Rationale: a refused refund becomes a bank chargeback — the money is lost anyway *plus* a dispute fee *plus* MoR dispute strikes that can get the store dropped. Chargebacks are strictly worse than refunds; discretion is the pressure valve.
- Teacher-fault cases (teacher no-show) auto-refund the credit per §5 — that's not a "refund," the lesson never happened.

## 4. Teacher compensation

- **[DECIDED]** Revenue share: teacher earns **30% of the lesson price** at the student's regional tier. CA: ~$2.40/lesson. Gulf: ~$6/lesson. (Egypt private-tutor market equivalent: competitive.)
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

## 9. Unit economics (CA tier, reference)

| Item | Per lesson |
|---|---|
| Revenue | $8.00 (4,000 ₸) |
| Teacher (30%) | −$2.40 |
| Gateway (~6%, when integrated) | −$0.50 |
| AI (STT + LLM) | −$0.16 |
| **Gross margin** | **≈ $4.94 (62%)** |

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

---

*Changelog*
| Date | Change |
|---|---|
| 2026-07-19 | [Claude] Initial version from FaFo brainstorm: packs over subscriptions, 4/8/12+custom, 60-day expiry from first use, regional tiers (CA anchor 4,000₸/$8, Gulf ~2.5×), teacher 30%, Lemon Squeezy→Stripe, pause kept, On Break/On Hold + holidays dropped. Market + AI-cost research embedded. |
| 2026-07-19 | [Claude] FaFo round 2: trial → **free** (avoids one-time LS payment handling; one-trial-per-student + forfeit-on-no-show as mitigation). Added §10 Homework obligations (teachers) and §11 Code of conduct & dispute escalation. Referral, certificates, teacher-onboarding sections deliberately skipped. |
| 2026-07-19 | [Claude] FaFo round 3: Gulf → **50 SAR**; refunds → **none** (public policy; Claude carve-outs for duplicate purchases + admin discretion, chargeback rationale, tagged PROPOSED); pause rules locked; teacher paid on student no-show, unpaid on moves; **late-move rule** proposed (<6h move = charged cancel — closes no-show laundering); recordings kept **forever, manual**; payout **per-teacher** via existing `payoutRateOverride`. Unit economics updated for 50 SAR (~60% margin). |
