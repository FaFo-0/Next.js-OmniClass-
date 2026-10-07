"use client";

// Teacher onboarding. A teacher arriving from an invite link used to land on
// the calendar with nothing set: no timezone, so every time they read was a
// guess; no meeting room, so lessons had nowhere to happen; no availability,
// so nobody could book them. Those are asked once, here — along with the
// recording consent the student has always signed and the teacher never did,
// and the short introduction their students read before lesson one.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useTranslations } from "next-intl";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { SlotCalendar } from "@/components/calendar/SlotCalendar";
import {
  calendarSlotMinutes,
  calendarSlotTime,
  projectCalendarSlots,
  type CalendarSlot,
} from "@/lib/calendarSlots";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { browserTz, instantToZoned, isValidTz } from "@/lib/tz";
import { TimezoneSelect } from "@/components/shared/TimezoneSelect";
import { useLocale } from "@/i18n/provider";
import { locales, localeNames, type Locale } from "@/i18n/config";
import {
  Wizard,
  ChipGroup,
  ChoiceCard,
  type WizardStep,
} from "@/components/onboarding/Wizard";

type AvailabilitySlot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

function weekdayForDate(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function nextMonday(timezone: string): Date {
  const today = parseISO(instantToZoned(new Date(), timezone).date);
  return addDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
}

function weeklyCells(slots: AvailabilitySlot[]): Map<string, AvailabilitySlot> {
  const map = new Map<string, AvailabilitySlot>();
  for (const slot of slots) {
    for (
      let minute = calendarSlotMinutes(slot.startTime);
      minute + 30 <= calendarSlotMinutes(slot.endTime);
      minute += 30
    ) {
      const startTime = calendarSlotTime(minute);
      map.set(`${slot.dayOfWeek}|${startTime}`, {
        dayOfWeek: slot.dayOfWeek,
        startTime,
        endTime: calendarSlotTime(minute + 30),
      });
    }
  }
  return map;
}

const MEET_HINT = "https://meet.google.com/abc-defg-hij";
const BIO_MAX = 400;

/** Loose on purpose — an international phone has no single shape. This only
 *  rejects things that clearly aren't a number at all. */
const isPhoneish = (s: string) =>
  s === "" ||
  (/^\+?[\d\s()./-]{6,20}$/.test(s) && (s.match(/\d/g)?.length ?? 0) >= 6);

const isMeetLink = (s: string) => /^https?:\/\/\S+\.\S+/i.test(s.trim());

export default function TeacherOnboardingPage() {
  const router = useRouter();
  const t = useTranslations("onboarding.teacher");
  const { user, isLoaded } = useAuth();
  const { locale, setLocale } = useLocale();
  const setup = useQuery(api.onboarding.getMyTeacherSetup, user ? {} : "skip");
  const submit = useMutation(api.onboarding.completeTeacherOnboarding);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [tz, setTz] = useState("");
  const [clock, setClock] = useState<"12h" | "24h">("24h");
  const [phone, setPhone] = useState("");
  const [meet, setMeet] = useState("");
  const [consent, setConsent] = useState(false);
  const [bio, setBio] = useState("");
  const [ielts, setIelts] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [previewDate, setPreviewDate] = useState(() =>
    nextMonday("Asia/Almaty"),
  );
  const [previewMode, setPreviewMode] = useState<"day" | "week">("week");
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!tz) setTz(browserTz());
  }, [tz]);

  // Prefill from whatever is already on the account. Runs once: after that the
  // fields belong to whoever is typing in them.
  useEffect(() => {
    if (hydrated || !setup) return;
    setName(setup.name ?? "");
    if (setup.timezone) setTz(setup.timezone);
    if (setup.timeFormat) setClock(setup.timeFormat);
    if (setup.meetLink) setMeet(setup.meetLink);
    if (setup.phoneWhatsapp) setPhone(setup.phoneWhatsapp);
    if (setup.bio) setBio(setup.bio);
    setIelts(setup.ieltsCertified);
    setConsent(setup.consentGiven);
    // Show the schedule they actually have rather than a Mon–Fri default that
    // would then be skipped as "already open".
    setSlots(setup.slots);
    setPreviewDate(nextMonday(setup.academyTimezone ?? "Asia/Almaty"));
    if (window.innerWidth < 768) setPreviewMode("day");
    setHydrated(true);
  }, [setup, hydrated]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    if (user.role !== "teacher") router.replace(`/${user.role}`);
    // Already done — the invite flow now routes everyone here, including
    // teachers signing in again on a second device.
    else if (user.onboardingComplete === true) router.replace("/teacher");
  }, [isLoaded, user, router]);

  const academyTz = setup?.academyTimezone ?? "Asia/Almaty";
  const calendarT = useTranslations("components.calendar");
  const previewCells = useMemo(() => {
    const published = weeklyCells(slots);
    const start = startOfWeek(previewDate, { weekStartsOn: 1 });
    const cells: CalendarSlot[] = [];
    for (let day = 0; day < 7; day++) {
      const date = format(addDays(start, day), "yyyy-MM-dd");
      const dayOfWeek = weekdayForDate(date);
      for (let minute = 0; minute < 1440; minute += 30) {
        const startTime = calendarSlotTime(minute);
        cells.push({
          date,
          startTime,
          open: published.has(`${dayOfWeek}|${startTime}`),
          editable: true,
        });
      }
    }
    return projectCalendarSlots(cells, academyTz, academyTz);
  }, [slots, previewDate, academyTz]);

  function paintWeekly(cells: CalendarSlot[], open: boolean) {
    setSlots((current) => {
      const draft = weeklyCells(current);
      for (const cell of cells) {
        const dayOfWeek = weekdayForDate(cell.date);
        const key = `${dayOfWeek}|${cell.startTime}`;
        if (open)
          draft.set(key, {
            dayOfWeek,
            startTime: cell.startTime,
            endTime: calendarSlotTime(calendarSlotMinutes(cell.startTime) + 30),
          });
        else draft.delete(key);
      }
      return [...draft.values()].sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
      );
    });
  }

  const steps: WizardStep[] = useMemo(
    () => [
      {
        key: "you",
        title: t("youTitle"),
        blurb: t("youBlurb"),
        canAdvance: !!name.trim() && isValidTz(tz) && isPhoneish(phone.trim()),
        incompleteHint: !name.trim()
          ? t("nameMissing")
          : !isPhoneish(phone.trim())
            ? t("phoneInvalid")
            : undefined,
        body: (
          <>
            <div>
              <label className="text-sm font-medium" htmlFor="tname">
                {t("name")}
              </label>
              <Input
                id="tname"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p
                className="text-xs mt-1"
                style={{ color: "var(--omnic-gray-500)" }}
              >
                {t("nameHint")}
              </p>
            </div>
            <div>
              <span className="text-sm font-medium">{t("language")}</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={locales.map((l) => ({
                    value: l,
                    label: localeNames[l],
                  }))}
                  selected={[locale]}
                  // Applied immediately: the rest of the wizard should already
                  // be in the language they just picked.
                  onToggle={(v) => setLocale(v as Locale)}
                  columns={3}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="tz">
                {t("timezone")}
              </label>
              <div style={{ marginTop: 4 }}>
                <TimezoneSelect id="tz" value={tz} onChange={setTz} />
              </div>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--omnic-gray-500)" }}
              >
                {t("timezoneHint", { academyTz })}
              </p>
            </div>
            <div>
              <span className="text-sm font-medium">{t("clock")}</span>
              <div style={{ marginTop: 6 }}>
                <ChipGroup
                  options={[
                    { value: "24h", label: t("clock24") },
                    { value: "12h", label: t("clock12") },
                  ]}
                  selected={[clock]}
                  onToggle={(v) => setClock(v as "12h" | "24h")}
                  columns={2}
                />
              </div>
            </div>
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
              <p
                className="text-xs mt-1"
                style={{ color: "var(--omnic-gray-500)" }}
              >
                {t("phoneHint")}
              </p>
            </div>
          </>
        ),
      },
      {
        key: "room",
        title: t("roomTitle"),
        blurb: t("roomBlurb"),
        canAdvance: isMeetLink(meet) && consent,
        incompleteHint: !isMeetLink(meet)
          ? t("meetLinkInvalid")
          : t("consentMissing"),
        body: (
          <>
            <div>
              <label className="text-sm font-medium" htmlFor="meet">
                {t("meetLink")}
              </label>
              <Input
                id="meet"
                value={meet}
                onChange={(e) => setMeet(e.target.value)}
                placeholder={MEET_HINT}
              />
              <p
                className="text-xs mt-1"
                style={{ color: "var(--omnic-gray-500)" }}
              >
                {t("meetLinkHint")}
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
                {t.rich("recordingNote", { b: (c) => <strong>{c}</strong> })}
              </p>
            </div>

            {/* POLICY §8 — the teacher is on the recording too. Stored as a
                timestamp on their user row, same as the student's. */}
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
                {t.rich("consent", { b: (c) => <strong>{c}</strong> })}
              </span>
            </label>
            {setup?.consentGiven && (
              <p className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
                {t("consentGiven")}
              </p>
            )}
          </>
        ),
      },
      {
        key: "teaching",
        title: t("teachingTitle"),
        blurb: t("teachingBlurb"),
        canAdvance: bio.trim().length <= BIO_MAX,
        incompleteHint: t("bioTooLong", { max: BIO_MAX }),
        body: (
          <>
            <div>
              <label className="text-sm font-medium" htmlFor="bio">
                {t("bio")}
              </label>
              <Textarea
                id="bio"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("bioPlaceholder")}
              />
              <p
                className="text-xs mt-1"
                style={{
                  color:
                    bio.trim().length > BIO_MAX
                      ? "#92400E"
                      : "var(--omnic-gray-500)",
                }}
              >
                {t("bioHint", { count: bio.trim().length, max: BIO_MAX })}
              </p>
            </div>
            <ChoiceCard
              label={t("ielts")}
              hint={t("ieltsHint")}
              selected={ielts}
              onClick={() => setIelts((v) => !v)}
            />
          </>
        ),
      },
      {
        key: "hours",
        title: t("hoursTitle"),
        blurb: t("hoursBlurb"),
        canAdvance: true,
        incompleteHint: t("hoursInvalid"),
        body: (
          <>
            <p className="text-sm text-muted-foreground">
              {t("slotHint", { timezone: academyTz })}
            </p>
            <p className="text-sm font-medium">
              {t.has("usualWeekHint")
                ? t("usualWeekHint")
                : "Usual weekly hours · these selections repeat every week. They publish when you finish setup."}
            </p>
            <SlotCalendar
              cells={previewCells}
              events={[]}
              users={[]}
              currentDate={previewDate}
              mode={previewMode}
              viewerTz={academyTz}
              preferenceKey={user?.externalId ?? "teacher-onboarding"}
              timeFormat={clock}
              staffPaint
              disabled={submitting}
              onPaint={paintWeekly}
              onPrevWeek={() =>
                setPreviewDate((date) =>
                  addDays(date, previewMode === "day" ? -1 : -7),
                )
              }
              onNextWeek={() =>
                setPreviewDate((date) =>
                  addDays(date, previewMode === "day" ? 1 : 7),
                )
              }
              onToday={() =>
                setPreviewDate(
                  parseISO(instantToZoned(new Date(), academyTz).date),
                )
              }
              onJumpToDate={setPreviewDate}
              headerExtra={
                <div className="flex gap-1">
                  {(["day", "week"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`chip ${previewMode === mode ? "bg-primary text-primary-foreground" : ""}`}
                      aria-pressed={previewMode === mode}
                      onClick={() => setPreviewMode(mode)}
                    >
                      {calendarT(mode)}
                    </button>
                  ))}
                </div>
              }
            />
          </>
        ),
      },
    ],
    [
      t,
      name,
      tz,
      clock,
      phone,
      meet,
      consent,
      bio,
      ielts,
      academyTz,
      locale,
      setLocale,
      previewCells,
      previewDate,
      previewMode,
      calendarT,
      submitting,
      user?.externalId,
      setup?.consentGiven,
    ],
  );

  // Wait for the prefill too: the heading names the academy, and the fields
  // are hydrated from this — showing empty inputs first makes the wizard look
  // like it has forgotten what the teacher already told it.
  if (!isLoaded || !user || user.role !== "teacher" || !setup) return null;

  async function handleFinish() {
    setSubmitting(true);
    try {
      const res = await submit({
        name: name.trim(),
        timezone: tz,
        timeFormat: clock,
        locale,
        meetLink: meet.trim(),
        phoneWhatsapp: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        ieltsCertified: ielts,
        consent,
        slots,
      });
      if (res.slotsCreated > 1) {
        toast.success(t("doneWithSlots", { count: res.slotsCreated }));
      } else if (res.slotsCreated === 1) {
        toast.success(t("doneWithSlot"));
      } else if (res.slotsAlreadyOpen > 0) {
        // Not a silent success: say why nothing was added.
        toast.success(t("doneAlreadyOpen"));
      } else {
        toast.success(t("done"));
      }
      router.replace("/teacher");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Wizard
      heading={t("heading", {
        name: (name || user.name || "").split(" ")[0],
      })}
      subheading={t("subheading", { academy: setup.academyName })}
      steps={steps}
      index={step}
      onIndexChange={setStep}
      onFinish={handleFinish}
      finishing={submitting}
      finishLabel={t("finish")}
    />
  );
}
