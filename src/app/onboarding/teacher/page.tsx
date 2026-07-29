"use client";

// Teacher onboarding — new. A teacher arriving from an invite link used to
// land on the calendar with nothing set: no timezone, so every time they read
// was a guess; no meeting room, so lessons had nowhere to happen; no
// availability, so nobody could book them. Those three are asked once, here.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { browserTz, isValidTz } from "@/lib/tz";
import { Wizard, ChipGroup, type WizardStep } from "@/components/onboarding/Wizard";

const WEEKDAYS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

/** A Meet link is the only room shape the academy uses today. */
const MEET_HINT = "https://meet.google.com/abc-defg-hij";

export default function TeacherOnboardingPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const setup = useQuery(api.onboarding.getMyTeacherSetup, user ? {} : "skip");
  const submit = useMutation(api.onboarding.completeTeacherOnboarding);

  const [step, setStep] = useState(0);
  const [tz, setTz] = useState("");
  const [phone, setPhone] = useState("");
  const [meet, setMeet] = useState("");
  const [days, setDays] = useState<string[]>(["1", "2", "3", "4", "5"]);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("21:00");
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!tz) setTz(browserTz());
  }, [tz]);

  useEffect(() => {
    if (hydrated || !setup) return;
    if (setup.timezone) setTz(setup.timezone);
    if (setup.meetLink) setMeet(setup.meetLink);
    if (setup.phoneWhatsapp) setPhone(setup.phoneWhatsapp);
    setHydrated(true);
  }, [setup, hydrated]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    if (user.role !== "teacher") router.replace(`/${user.role}`);
  }, [isLoaded, user, router]);

  const academyTz = setup?.academyTimezone ?? "UTC";

  const steps: WizardStep[] = useMemo(
    () => [
      {
        key: "you",
        title: "Your details",
        blurb:
          "Times across the app are stored in the academy's clock and shown in yours — so this is the setting everything else reads.",
        canAdvance: isValidTz(tz),
        incompleteHint: "That timezone isn't one we recognise.",
        body: (
          <>
            <div>
              <label className="text-sm font-medium" htmlFor="tz">Your timezone</label>
              <Input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                Detected from your device. The academy runs on{" "}
                <strong>{academyTz}</strong>; you&apos;ll always see your own.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="phone">
                Phone (WhatsApp, optional)
              </label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 …"
              />
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                Only the academy sees this — for when a lesson goes wrong.
              </p>
            </div>
          </>
        ),
      },
      {
        key: "room",
        title: "Your meeting room",
        blurb:
          "One permanent Google Meet link. Every lesson you're booked for gets it automatically, so a student always knows where to go.",
        canAdvance: /^https?:\/\/\S+\.\S+/.test(meet.trim()),
        incompleteHint: "Paste the full link, starting with https://",
        body: (
          <>
            <div>
              <label className="text-sm font-medium" htmlFor="meet">Meet link</label>
              <Input
                id="meet"
                value={meet}
                onChange={(e) => setMeet(e.target.value)}
                placeholder={MEET_HINT}
              />
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                In Google Meet, create a meeting and copy the link. The same room
                is reused for every lesson — you can change it later in your
                profile.
              </p>
            </div>
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: "var(--omnic-gray-50)",
                border: "1px solid var(--omnic-gray-200)",
              }}
            >
              <p className="body-sm" style={{ margin: 0 }}>
                Recording captures <strong>both sides</strong> of the call, so
                join from a browser tab rather than the phone app when you can.
              </p>
            </div>
          </>
        ),
      },
      {
        key: "hours",
        title: "When do you teach?",
        blurb:
          "A starting pattern, in academy time. Students can only book inside it — and you can repaint any of it on the calendar afterwards.",
        canAdvance: days.length === 0 || start < end,
        incompleteHint: "The finish time needs to be after the start time.",
        body: (
          <>
            <div>
              <span className="text-sm font-medium">Working days</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={WEEKDAYS}
                  selected={days}
                  onToggle={(v) =>
                    setDays((cur) =>
                      cur.includes(v) ? cur.filter((d) => d !== v) : [...cur, v]
                    )
                  }
                  columns={4}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="text-sm font-medium" htmlFor="start">From</label>
                <Input
                  id="start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="end">Until</label>
                <Input
                  id="end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
              These hours are in the academy&apos;s clock ({academyTz}). Leave the
              days empty to skip this and paint your calendar by hand instead.
            </p>
          </>
        ),
      },
    ],
    [tz, phone, meet, days, start, end, academyTz]
  );

  if (!isLoaded || !user || user.role !== "teacher") return null;

  async function handleFinish() {
    setSubmitting(true);
    try {
      const res = await submit({
        timezone: tz,
        meetLink: meet.trim(),
        phoneWhatsapp: phone.trim() || undefined,
        weekly:
          days.length > 0
            ? { days: days.map(Number), startTime: start, endTime: end }
            : undefined,
      });
      toast.success(
        res.slotsCreated > 0
          ? `You're set up — ${res.slotsCreated} weekly slot${res.slotsCreated === 1 ? "" : "s"} opened.`
          : "You're set up."
      );
      router.replace("/teacher");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Wizard
      heading={`Welcome, ${user.name?.split(" ")[0] ?? "there"}`}
      subheading={`Three steps and ${setup?.academyName ?? "the academy"} can start booking you.`}
      steps={steps}
      index={step}
      onIndexChange={setStep}
      onFinish={handleFinish}
      finishing={submitting}
      finishLabel="Finish setup"
    />
  );
}
