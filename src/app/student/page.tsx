"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";

export default function StudentDashboard() {
  const { user } = useAuth();
  const lessons = useQuery(api.lessons.listPublishedForStudent, {}) ?? [];
  const vocab = useQuery(api.lessonContent.listAllVocab, {}) ?? [];
  const streak = useQuery(api.streaks.getForStudent, {});
  const scheduleEvents = useQuery(api.schedule.listForStudent, {}) ?? [];

  const firstName = user?.name?.split(" ")[0] ?? "Student";
  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;

  // Find the next upcoming scheduled event that's not past
  const now = new Date();
  const upcoming = scheduleEvents
    .filter((e) => e.status === "scheduled")
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    .find((e) => new Date(`${e.date}T${e.startTime}`) > now);

  const s = {
    firstName,
    streaks: currentStreak,
    longestStreak,
    lessonsCompleted: lessons.filter((l) => l.status === "published").length,
    wordsLearned: vocab.length,
    cardsReviewed: 0, // needs reviewLogs table queries (Phase Z)
  };

  return (
    <div>
      {/* Welcome row + streak */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div className="h1">Welcome back, <span style={{ color: "var(--omnic-tenant-primary)" }}>{s.firstName}</span></div>
          <div className="body" style={{ marginTop: 4 }}>You&apos;re on a roll — keep the momentum going.</div>
        </div>
        <div className="card" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--omnic-gray-900)" }}>{s.streaks}-day streak</div>
            <div className="body-sm">Longest: {s.longestStreak} days</div>
          </div>
        </div>
      </div>

      {/* Next Up + Study Due */}
      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="nextup-card">
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Next Up</div>
          {upcoming ? (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>Join class in {getMinutesUntil(upcoming)} min</div>
              <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>{upcoming.title}</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>
                {upcoming.date} · {upcoming.startTime} — {upcoming.endTime}
              </div>
              <a href={upcoming.googleMeetLink ?? "#"} target="_blank" rel="noopener noreferrer"
                className="btn btn-secondary" style={{ background: "white", color: "var(--omnic-tenant-primary)", border: "1px solid var(--omnic-gray-200)" }}>
                <Icon name="video" size={16} /> Join on Google Meet
              </a>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>No upcoming class</div>
              <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>Check your calendar for scheduled sessions</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>Your teacher will schedule your next lesson</div>
              <Link href="/student/calendar" className="btn btn-secondary" style={{ background: "white", color: "var(--omnic-tenant-primary)", border: "1px solid var(--omnic-gray-200)" }}>
                <Icon name="calendar" size={16} /> View calendar
              </Link>
            </>
          )}
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 4 }}>Study Due</div>
          <div className="body-sm" style={{ marginBottom: 14 }}>Spaced repetition queue</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--omnic-tenant-primary)", letterSpacing: "-0.02em" }}>0</div>
          <div className="body-sm" style={{ marginBottom: 16 }}>flashcards ready</div>
          <Link href="/student/study" className="btn btn-tenant btn-block">
            <Icon name="brain" size={16} /> Start studying
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="book" label="Lessons completed" value={s.lessonsCompleted} />
        <MetricCard icon="bookmark" label="Words learned" value={s.wordsLearned} />
        <MetricCard icon="brain" label="Cards reviewed" value={s.cardsReviewed} />
        <MetricCard icon="flame" label="Day streak" value={s.streaks} accent="red" />
      </div>

      {/* Recent lessons */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--omnic-gray-100)" }}>
          <div className="h3">Recent lessons</div>
          <Link href="/student/lessons" className="btn btn-ghost btn-sm">
            View all <Icon name="chevronRight" size={14} />
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
            <span className="pill pill-tenant">{l.status}</span>
            <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
          </Link>
        ))}
        {lessons.length === 0 && (
          <div style={{ padding: 32, textAlign: "center" }} className="body-sm">
            No lessons yet. They will appear here after your teacher publishes them.
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

function getMinutesUntil(event: any): number {
  const dt = new Date(`${event.date}T${event.startTime}`);
  return Math.max(0, Math.round((dt.getTime() - Date.now()) / 60000));
}
