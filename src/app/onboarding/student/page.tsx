"use client";

// Student onboarding.
//
// Three steps instead of one long form, and — 2026-09-07 rebuild — EACH STEP
// SAVES as the student advances, so progress survives a refresh or a closed
// tab. Every question here is one the rest of the platform actually reads:
// the native language decides what appears on every flashcard, the timezone
// decides what time a lesson claims to be, and the availability is what a
// teacher opens slots against. POLICY §8 consent is asked once, in plain
// language, stored with its timestamp, and only the finish mutation flips
// onboardingComplete + emits the single "student joined" notification.
// Under-18s are asked for a parent/guardian name + phone before they can
// move past step one.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { browserTz, isValidTz } from "@/lib/tz";
import { Wizard, ChipGroup, ChoiceCard, type WizardStep } from "@/components/onboarding/Wizard";

const CEFR = [
  ["A1", "a1Label", "a1Hint"], ["A2", "a2Label", "a2Hint"],
  ["B1", "b1Label", "b1Hint"], ["B2", "b2Label", "b2Hint"],
  ["C1", "c1Label", "c1Hint"], ["Unsure", "unsureLabel", "unsureHint"],
] as const;
const L1 = ["ru", "ar", "kk", "en"] as const;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIMES = ["morning", "afternoon", "evening", "late"] as const;
const INTERESTS = ["business", "travel", "exams", "tech", "culture", "news", "movies", "sport", "science"] as const;
const REFERRALS = ["friend", "instagram", "google", "telegram", "other"] as const;

export default function StudentOnboardingPage() {
  const t = useTranslations("onboarding.student");
  const tLanguages = useTranslations("app.languages");
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const existing = useQuery(api.onboarding.getMyOnboarding, user ? {} : "skip");
  const submit = useMutation(api.onboarding.completeStudentOnboarding);
  const saveStep = useMutation(api.onboarding.saveStudentOnboardingStep);

  const [step, setStep] = useState(0);
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [tz, setTz] = useState("");
  const [cefr, setCefr] = useState("");
  const [l1, setL1] = useState("");
  const [goal, setGoal] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [referral, setReferral] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Detected, not assumed — shown back so it can be corrected.
  useEffect(() => {
    if (!tz) setTz(browserTz());
  }, [tz]);

  useEffect(() => {
    if (hydrated || !existing) return;
    setAge(existing.age ? String(existing.age) : "");
    setPhone(existing.phoneWhatsapp ?? "");
    setGuardianName(existing.guardianName ?? "");
    setGuardianPhone(existing.guardianPhone ?? "");
    setCefr(existing.cefrSelfAssessed ?? "");
    setL1(existing.l1 ?? "");
    setGoal(existing.goal ?? "");
    setNotes(existing.preferredDaysTimes ?? "");
    setInterests(existing.interests ?? []);
    setDays(existing.preferredDays ?? []);
    setTimes(existing.preferredTimeOfDay ?? []);
    setReferral(existing.referralSource ?? "");
    if (existing.consentAcceptedAt) setConsent(true);
    setHydrated(true);
  }, [existing, hydrated]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    if (user.role !== "student") router.replace(`/${user.role}`);
  }, [isLoaded, user, router]);

  // Functional updates — clicking three chips quickly used to collapse into
  // one, because each handler closed over the same stale array.
  const toggle =
    (set: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) =>
      set((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const ageNum = age ? Number(age) : NaN;
  const isMinor = Number.isFinite(ageNum) && ageNum > 0 && ageNum < 18;

  // 2026-09-07 rebuild — save the current step's answers before moving on,
  // so a refresh or a closed tab never loses progress. Idempotent upsert on
  // the server; per-step saves never notify and never grant anything.
  async function handleIndexChange(next: number) {
    if (savingStep) return;
    setSavingStep(true);
    try {
      await saveStep({
        age: Number.isFinite(ageNum) ? ageNum : undefined,
        phoneWhatsapp: phone || undefined,
        guardianName: guardianName || undefined,
        guardianPhone: guardianPhone || undefined,
        timezone: tz || undefined,
        cefrSelfAssessed: cefr || undefined,
        l1: l1 || undefined,
        goal: goal || undefined,
        interests: interests.length > 0 ? interests : undefined,
        preferredDays: days.length > 0 ? days : undefined,
        preferredTimeOfDay: times.length > 0 ? times : undefined,
        preferredDaysTimes: notes || undefined,
        referralSource: referral || undefined,
      });
    } catch {
      // The upsert is idempotent — a failed save is retried on the next
      // step, and the finish mutation sends everything again anyway.
    } finally {
      setSavingStep(false);
      setStep(next);
    }
  }

  const steps: WizardStep[] = useMemo(
    () => [
      {
        key: "you",
        title: t("youTitle"),
        blurb: t("youBlurb"),
        canAdvance:
          phone.trim().length > 3 &&
          isValidTz(tz) &&
          (!isMinor ||
            (guardianName.trim().length > 1 && guardianPhone.trim().length > 5)),
        incompleteHint:
          isMinor
            ? t("incompleteMinor")
            : t("incompleteAdult"),
        body: (
          <>
            <div>
              <label className="text-sm font-medium" htmlFor="phone">
                {t("phone")}
              </label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 …"
              />
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                {t("phoneHint")}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="tz">{t("timezone")}</label>
              <Input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                {t("timezoneHint")}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="age">{t("age")}</label>
              <Input
                id="age"
                type="number"
                min={5}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder={t("agePlaceholder")}
              />
            </div>
            {isMinor && (
              <>
                <div
                  className="rounded-lg border p-3 space-y-3"
                  style={{ borderColor: "var(--omnic-gray-200)", background: "var(--omnic-gray-50)" }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--omnic-gray-800)" }}>
                    {t("guardianTitle")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
                    {t("guardianHint")}
                  </p>
                  <div>
                    <label className="text-sm font-medium" htmlFor="guardianName">
                      {t("guardianName")}
                    </label>
                    <Input
                      id="guardianName"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder={t("guardianNamePlaceholder")}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium" htmlFor="guardianPhone">
                      {t("guardianPhone")}
                    </label>
                    <Input
                      id="guardianPhone"
                      type="tel"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value)}
                      placeholder="+7 …"
                    />
                  </div>
                </div>
              </>
            )}
          </>
        ),
      },
      {
        key: "english",
        title: t("englishTitle"),
        blurb: t("englishBlurb"),
        canAdvance: !!cefr && !!l1 && goal.trim().length > 2,
        incompleteHint: t("incompleteEnglish"),
        body: (
          <>
            <div>
              <span className="text-sm font-medium">{t("levelQuestion")}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {CEFR.map(([value, labelKey, hintKey]) => (
                  <ChoiceCard
                    key={value}
                    label={t(`cefr.${labelKey}`)}
                    hint={t(`cefr.${hintKey}`)}
                    selected={cefr === value}
                    onClick={() => setCefr(value)}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm font-medium">{t("nativeLanguage")}</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={L1.map((value) => ({ value, label: tLanguages(value) }))}
                  selected={l1 ? [l1] : []}
                  onToggle={(v) => setL1(v)}
                  columns={3}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                {t("nativeHint")}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="goal">{t("goal")}</label>
              <Textarea
                id="goal"
                rows={3}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t("goalPlaceholder")}
              />
            </div>
            <div>
              <span className="text-sm font-medium">{t("interests")}</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={INTERESTS.map((value) => ({ value, label: t(`interestsOptions.${value}`) }))}
                  selected={interests}
                  onToggle={toggle(setInterests)}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                {t("interestsHint")}
              </p>
            </div>
          </>
        ),
      },
      {
        key: "when",
        title: t("whenTitle"),
        blurb: t("whenBlurb"),
        canAdvance: consent,
        incompleteHint: t("consentMissing"),
        body: (
          <>
            <div>
              <span className="text-sm font-medium">{t("days")}</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={DAYS.map((value) => ({ value, label: t(`daysOptions.${value}`) }))}
                  selected={days}
                  onToggle={toggle(setDays)}
                  columns={4}
                />
              </div>
            </div>
            <div>
              <span className="text-sm font-medium">{t("times")}</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={TIMES.map((value) => ({ value, label: t(`timesOptions.${value}`) }))}
                  selected={times}
                  onToggle={toggle(setTimes)}
                  columns={4}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="notes">
                {t("notes")}
              </label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
              />
            </div>
            <div>
              <span className="text-sm font-medium">{t("referral")}</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={REFERRALS.map((value) => ({ value, label: t(`referralOptions.${value}`) }))}
                  selected={referral ? [referral] : []}
                  onToggle={(v) => setReferral(referral === v ? "" : v)}
                />
              </div>
            </div>

            {/* POLICY §8 — plain language, one sentence, stored with a timestamp. */}
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--omnic-gray-200)",
                background: "var(--omnic-gray-50)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span className="body-sm">
                {t.rich("consent", { b: (chunks) => <strong>{chunks}</strong> })}
              </span>
            </label>
          </>
        ),
      },
    ],
    [t, tLanguages, phone, tz, age, isMinor, guardianName, guardianPhone, cefr, l1, goal, interests, days, times, notes, referral, consent]
  );

  if (!isLoaded || !user || user.role !== "student") return null;

  async function handleFinish() {
    if (savingStep) return;
    setSubmitting(true);
    try {
      await submit({
        age: Number.isFinite(ageNum) ? ageNum : undefined,
        phoneWhatsapp: phone,
        guardianName: guardianName || undefined,
        guardianPhone: guardianPhone || undefined,
        cefrSelfAssessed: cefr,
        l1,
        goal,
        preferredDaysTimes: notes,
        preferredDays: days,
        preferredTimeOfDay: times,
        interests,
        referralSource: referral || undefined,
        timezone: tz,
        consent,
      });
      // No "free trial added" copy — what happens next depends on the
      // academy's payment policy, not a number we promised on the way in.
      toast.success(t("welcomeToast"));
      router.replace("/student");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Wizard
      heading={t("heading", { name: user.name?.split(" ")[0] ?? "" })}
      subheading={t("subheading")}
      steps={steps}
      index={step}
      onIndexChange={(i) => void handleIndexChange(i)}
      onFinish={handleFinish}
      finishing={submitting || savingStep}
      finishLabel={t("finish")}
    />
  );
}