"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";
import { browserTz, convertZoned, zonedToInstant } from "@/lib/tz";
import { formatTime } from "@/lib/timeFormat";
import { formatGap, useTimeUntil } from "@/lib/countdown";

export default function StudentDashboard() {
  const t = useTranslations("app.dashboard");
  const { user } = useAuth();
  const lessons = useQuery(api.lessons.listPublishedForStudent, {}) ?? [];
  // The one list — the same words the flashcards come from.
  const myWords = useQuery(api.srs.listMyWords, {}) ?? [];
  const streak = useQuery(api.streaks.getForStudent, {});
  const scheduleEvents = useQuery(api.schedule.listForStudent, {}) ?? [];
  const dueCount = useQuery(api.srs.countDueCards, {}) ?? 0;
  const cardsReviewed = useQuery(api.srs.countReviewsForStudent, {}) ?? 0;
  const me = useQuery(api.users.getMe);
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const balance = useQuery(api.points.getBalance, {});

  const firstName = user?.name?.split(" ")[0] ?? "Student";
  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;

  // Stored times are academy wall-clock; the student lives somewhere else.
  const orgTz = tenant?.timezone ?? "UTC";
  const viewerTz = me?.timezone ?? browserTz();
  const timeFmt = me?.timeFormat ?? "24h";

  // Next upcoming lesson, compared as real instants — not string dates.
  const now = Date.now();
  const upcoming = scheduleEvents
    .filter((e) => e.status === "scheduled" || e.status === "makeup")
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    .find((e) => zonedToInstant(e.date, e.startTime, orgTz).getTime() > now);

  const s = {
    firstName,
    streaks: currentStreak,
    longestStreak,
    // Lessons that actually happened — not "notes the teacher published".
    lessonsCompleted: scheduleEvents.filter((e) => e.status === "completed").length,
    wordsCollected: myWords.length,
    wordsLearned: myWords.filter((w) => w.state === "learned").length,
    cardsReviewed,
    lessonsLeft: balance?.balance ?? 0,
  };

  // A countdown answers the question; a clock time makes the reader do the
  // arithmetic. The exact local time still sits underneath it.
  const startsAt = upcoming
    ? zonedToInstant(upcoming.date, upcoming.startTime, orgTz)
    : null;
  const untilMs = useTimeUntil(startsAt);
  let nextLabel = "";
  let nextWhen = "";
  if (upcoming) {
    const local = convertZoned(upcoming.date, upcoming.startTime, orgTz, viewerTz);
    const localEnd = convertZoned(upcoming.date, upcoming.endTime, orgTz, viewerTz);
    nextWhen = `${local.date} · ${formatTime(local.time, timeFmt)} — ${formatTime(localEnd.time, timeFmt)} (your time)`;
    nextLabel =
      untilMs !== null && untilMs > 0
        ? `${formatGap(untilMs)} until your lesson`
        : "Your lesson is starting";
  }

  return (
    <div>
      {/* Welcome row + streak */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          {/* Plain interpolation: `t.rich` needs tag markers in the message,
              and a coloured first name isn't worth them in every locale. */}
          <div className="h1">{t("welcome", { name: s.firstName })}</div>
          <div className="body" style={{ marginTop: 4 }}>{t("momentum")}</div>
        </div>
        <div className="card" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--omnic-gray-900)" }}>
              {t("streakDays", { count: s.streaks })}
            </div>
            <div className="body-sm">{t("longest", { count: s.longestStreak })}</div>
          </div>
        </div>
      </div>

      {/* Next Up + Study Due */}
      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="nextup-card">
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{t("nextUp")}</div>
          {upcoming ? (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>{nextLabel}</div>
              <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>{upcoming.title}</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>{nextWhen}</div>
              {upcoming.googleMeetLink ? (
                <a href={upcoming.googleMeetLink} target="_blank" rel="noopener noreferrer"
                  className="btn btn-secondary" style={{ background: "white", color: "var(--omnic-tenant-primary)", border: "1px solid var(--omnic-gray-200)" }}>
                  <Icon name="video" size={16} /> {t("joinMeet")}
                </a>
              ) : (
                <Link href="/student/calendar" className="btn btn-secondary" style={{ background: "white", color: "var(--omnic-tenant-primary)", border: "1px solid var(--omnic-gray-200)" }}>
                  <Icon name="calendar" size={16} /> {t("viewInCalendar")}
                </Link>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>{t("noClass")}</div>
              <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>{t("noClassHint")}</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>{t("noClassSub")}</div>
              <Link href="/student/calendar" className="btn btn-secondary" style={{ background: "white", color: "var(--omnic-tenant-primary)", border: "1px solid var(--omnic-gray-200)" }}>
                <Icon name="calendar" size={16} /> {t("viewCalendar")}
              </Link>
            </>
          )}
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 4 }}>{t("studyDueTitle")}</div>
          <div className="body-sm" style={{ marginBottom: 14 }}>{t("studyDueSub")}</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--omnic-tenant-primary)", letterSpacing: "-0.02em" }}>{dueCount}</div>
          <div className="body-sm" style={{ marginBottom: 16 }}>{t("cardsReady")}</div>
          <Link href="/student/study" className="btn btn-tenant btn-block">
            <Icon name="brain" size={16} /> {t("startStudying")}
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="book" label={t("statLessons")} value={s.lessonsCompleted} />
        <MetricCard
          icon="bookmark"
          label={s.wordsLearned > 0 ? t("wordsLearned") : t("wordsCollected")}
          value={s.wordsLearned > 0 ? s.wordsLearned : s.wordsCollected}
        />
        <MetricCard icon="brain" label={t("statReviews")} value={s.cardsReviewed} />
        <MetricCard
          icon="calendar"
          label={t("statLeft")}
          value={s.lessonsLeft}
          accent={s.lessonsLeft === 0 ? "red" : undefined}
        />
      </div>

      {/* Recent lessons */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--omnic-gray-100)" }}>
          <div className="h3">{t("recentLessons")}</div>
          <Link href="/student/lessons" className="btn btn-ghost btn-sm">
            {t("viewAll")} <Icon name="chevronRight" size={14} />
          </Link>
        </div>
        {lessons.slice(0, 3).map((l: any) => (
          <Link key={l._id} href={`/student/lessons/${l._id}`} className="lesson-row">
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="book" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{l.title}</div>
              <div className="body-sm" style={{ marginTop: 2 }}>{new Date(l.createdAt).toLocaleDateString()} · {Math.round((l.durationSeconds ?? 0) / 60)} min</div>
            </div>
            <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
          </Link>
        ))}
        {lessons.length === 0 && (
          <div style={{ padding: 32, textAlign: "center" }} className="body-sm">
            {t("noLessonsYet")}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, accent }: { icon: string; label: string; value: number | string; accent?: string }) {
  return (
    <div className="card" style={{ padding: "var(--pad-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: accent === "red" ? "var(--omnic-red-tint)" : "var(--omnic-tenant-primary-soft)",
            color: accent === "red" ? "var(--omnic-red)" : "var(--omnic-tenant-primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name={icon} size={18} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 14, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}
