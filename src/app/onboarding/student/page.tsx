"use client";

// Student onboarding.
//
// Three steps instead of one long form. Every question here is one the rest
// of the platform actually reads: the native language decides what appears on
// every flashcard, the timezone decides what time a lesson claims to be, and
// the availability is what a teacher opens slots against. POLICY §8 consent
// is asked once, in plain language, and stored with its timestamp.

import { useEffect, useMemo, useState } from "react";
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
  { value: "A1", label: "A1 — Beginner", hint: "A few words and set phrases." },
  { value: "A2", label: "A2 — Elementary", hint: "Simple everyday exchanges." },
  { value: "B1", label: "B1 — Intermediate", hint: "I manage familiar topics, slowly." },
  { value: "B2", label: "B2 — Upper intermediate", hint: "I hold a conversation fairly comfortably." },
  { value: "C1", label: "C1 — Advanced", hint: "Fluent; I want precision and nuance." },
  { value: "Unsure", label: "I'm not sure", hint: "Your teacher will work it out in the first lesson." },
];

const L1 = [
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "en", label: "English" },
];

const DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "late", label: "Late night" },
];

const INTERESTS = [
  { value: "business", label: "Business" },
  { value: "travel", label: "Travel" },
  { value: "exams", label: "IELTS / exams" },
  { value: "tech", label: "Tech" },
  { value: "culture", label: "Culture" },
  { value: "news", label: "News" },
  { value: "movies", label: "Films & TV" },
  { value: "sport", label: "Sport" },
  { value: "science", label: "Science" },
];

const REFERRALS = [
  { value: "friend", label: "A friend" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "telegram", label: "Telegram" },
  { value: "other", label: "Somewhere else" },
];

export default function StudentOnboardingPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const trial = useQuery(api.onboarding.getTrialPolicy, user ? {} : "skip");
  const existing = useQuery(api.onboarding.getMyOnboarding, user ? {} : "skip");
  const submit = useMutation(api.onboarding.completeStudentOnboarding);

  const [step, setStep] = useState(0);
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
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
  const [hydrated, setHydrated] = useState(false);

  // Detected, not assumed — shown back so it can be corrected.
  useEffect(() => {
    if (!tz) setTz(browserTz());
  }, [tz]);

  useEffect(() => {
    if (hydrated || !existing) return;
    setAge(existing.age ? String(existing.age) : "");
    setPhone(existing.phoneWhatsapp ?? "");
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

  const steps: WizardStep[] = useMemo(
    () => [
      {
        key: "you",
        title: "About you",
        blurb: "So your teacher can reach you, and so every lesson time we show you is your own.",
        canAdvance: phone.trim().length > 3 && isValidTz(tz),
        incompleteHint: "A WhatsApp number and a valid timezone are needed to continue.",
        body: (
          <>
            <div>
              <label className="text-sm font-medium" htmlFor="phone">
                Phone (WhatsApp)
              </label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+963 …"
              />
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                Lesson reminders and anything urgent go here.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="tz">Timezone</label>
              <Input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                Detected from your device. Every lesson time in the app is shown
                in this zone — change it if you&apos;re somewhere else.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="age">Age (optional)</label>
              <Input
                id="age"
                type="number"
                min={5}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Helps your teacher pitch the material"
              />
            </div>
          </>
        ),
      },
      {
        key: "english",
        title: "Your English",
        blurb: "Rough is fine — your teacher confirms it in the first lesson.",
        canAdvance: !!cefr && !!l1 && goal.trim().length > 2,
        incompleteHint: "Pick a level, your native language, and tell us your goal.",
        body: (
          <>
            <div>
              <span className="text-sm font-medium">Where are you now?</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {CEFR.map((c) => (
                  <ChoiceCard
                    key={c.value}
                    label={c.label}
                    hint={c.hint}
                    selected={cefr === c.value}
                    onClick={() => setCefr(c.value)}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm font-medium">Your native language</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={L1}
                  selected={l1 ? [l1] : []}
                  onToggle={(v) => setL1(v)}
                  columns={3}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                Every new word you collect gets translated into this language on
                your flashcards.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="goal">What do you want out of this?</label>
              <Textarea
                id="goal"
                rows={3}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. IELTS 7.0 by spring · speak confidently in meetings · stop freezing on calls"
              />
            </div>
            <div>
              <span className="text-sm font-medium">Topics you enjoy (optional)</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={INTERESTS}
                  selected={interests}
                  onToggle={toggle(setInterests)}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                Used to pick reading you&apos;d actually want to finish.
              </p>
            </div>
          </>
        ),
      },
      {
        key: "when",
        title: "When can you study?",
        blurb: "Your teacher opens lesson slots against this, so the more honest the better.",
        canAdvance: consent,
        incompleteHint: "We need your agreement on recording before you can start.",
        body: (
          <>
            <div>
              <span className="text-sm font-medium">Days that usually work</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={DAYS}
                  selected={days}
                  onToggle={toggle(setDays)}
                  columns={4}
                />
              </div>
            </div>
            <div>
              <span className="text-sm font-medium">Times of day</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={TIMES}
                  selected={times}
                  onToggle={toggle(setTimes)}
                  columns={4}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="notes">
                Anything else about your schedule (optional)
              </label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. not during Ramadan evenings · Fridays only after 8pm"
              />
            </div>
            <div>
              <span className="text-sm font-medium">How did you find us? (optional)</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={REFERRALS}
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
                I understand my lessons are <strong>recorded and transcribed</strong>,
                and that AI turns them into my summary, vocabulary and homework.
                Recordings are private to me and my academy.
              </span>
            </label>
          </>
        ),
      },
    ],
    [phone, tz, age, cefr, l1, goal, interests, days, times, notes, referral, consent]
  );

  if (!isLoaded || !user || user.role !== "student") return null;

  async function handleFinish() {
    setSubmitting(true);
    try {
      const result = await submit({
        age: age ? Number(age) : undefined,
        phoneWhatsapp: phone,
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
      if (result.trialLessonsGranted > 0) {
        toast.success(
          `Welcome! ${result.trialLessonsGranted} free trial lesson${result.trialLessonsGranted === 1 ? "" : "s"} added.`
        );
      } else {
        toast.success("Profile saved.");
      }
      router.replace("/student");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Wizard
      heading={`Welcome, ${user.name?.split(" ")[0] ?? "there"}`}
      subheading={
        trial?.enabled && !trial.requiresPayment && trial.points > 0 ? (
          <>
            Three quick steps, then{" "}
            <strong>
              {trial.points} free trial lesson{trial.points === 1 ? "" : "s"}
            </strong>{" "}
            are yours.
          </>
        ) : (
          "Three quick steps and you're in."
        )
      }
      steps={steps}
      index={step}
      onIndexChange={setStep}
      onFinish={handleFinish}
      finishing={submitting}
      finishLabel="Start learning"
    />
  );
}
