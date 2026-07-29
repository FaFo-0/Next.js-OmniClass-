"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import { formatGap, useTimeUntil } from "@/lib/countdown";
import { zonedToInstant } from "@/lib/tz";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";

export default function TeacherDashboard() {
  const { user } = useAuth();

  const lessons = useQuery(api.lessons.listForTeacher, {}) ?? [];
  const students = useQuery(api.users.getStudentsForTeacher, {
    teacherId: user?.externalId ?? "",
  }) ?? [];
  const scheduleEvents = useQuery(api.schedule.listForTeacher, {}) ?? [];
  const earnings = useQuery(api.reports.teacherEarnings, {});
  const checklist = useQuery(api.onboarding.teacherChecklist, {});
  const allUsers = useQuery(api.users.listAllUsers, {}) ?? [];
  // Clock preference follows the teacher everywhere, not just the calendar.
  const me = useQuery(api.users.getMe);
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const timeFmt: TimeFormat = me?.timeFormat ?? "24h";

  const userNameMap = new Map(allUsers.map((u) => [u.externalId, u.name]));

  // Today's classes
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysClasses = scheduleEvents
    .filter((e) => e.date === todayStr && e.status === "scheduled")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Next lesson, wherever it falls — compared as real instants, since stored
  // times are academy wall-clock.
  const orgTz = tenant?.timezone ?? "UTC";
  const nowMs = Date.now();
  const nextClass = [...scheduleEvents]
    .filter((e) => !e.isDeleted && (e.status === "scheduled" || e.status === "makeup"))
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    .find((e) => zonedToInstant(e.date, e.startTime, orgTz).getTime() > nowMs);
  const untilNext = useTimeUntil(
    nextClass ? zonedToInstant(nextClass.date, nextClass.startTime, orgTz) : null
  );

  // Recent recordings (non-deleted, not scheduled)
  const recordings = lessons
    .filter((l) => !["scheduled"].includes(l.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Stats
  const stats = {
    fullName: user?.name ?? "Teacher",
    totalStudents: students.length,
    publishedThisMonth: lessons.filter((l) => l.status === "published").length,
    hoursTaught: lessons
      .filter((l) => ["published", "review", "transcribed"].includes(l.status))
      .reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0) / 3600,
    pendingReviews: lessons.filter((l) => l.status === "review").length,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Teacher Dashboard</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {todaysClasses.length} class{todaysClasses.length !== 1 ? "es" : ""} today · {stats.pendingReviews} pending review{stats.pendingReviews !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {checklist &&
        !(
          checklist.hasStudents &&
          checklist.hasAvailability &&
          checklist.hasMeetLink &&
          checklist.hasSession &&
          checklist.hasPublished &&
          checklist.hasHomework
        ) && (
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div className="h3" style={{ margin: 0 }}>Get started</div>
              <Link href="/teacher/guide" className="link body-sm">
                Read the teacher guide →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
              <ChecklistItem done={checklist.hasAvailability} label="Open your availability" href="/teacher/calendar" />
              <ChecklistItem done={checklist.hasMeetLink} label="Add your meeting room" href="/teacher/calendar" />
              <ChecklistItem done={checklist.hasStudents} label="Get a student assigned" href="/teacher/students" />
              <ChecklistItem done={checklist.hasSession} label="Run your first session" href="/teacher/sessions" />
              <ChecklistItem done={checklist.hasPublished} label="Publish lesson materials" href="/teacher/sessions" />
              <ChecklistItem done={checklist.hasHomework} label="Assign homework" href="/teacher/guide" />
            </div>
          </div>
        )}

      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="card">
          <div style={{ padding: 16, borderBottom: "1px solid var(--omnic-gray-100)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div className="h3" style={{ margin: 0 }}>Today&apos;s classes</div>
              {nextClass && untilNext !== null && (
                <span className="body-sm" style={{ color: "var(--brand-purple)", fontWeight: 600 }}>
                  {untilNext > 0
                    ? `${formatGap(untilNext)} until your next lesson`
                    : "Your next lesson is starting"}
                  {" · "}
                  <span style={{ color: "var(--omnic-gray-500)", fontWeight: 400 }}>
                    {userNameMap.get(nextClass.studentId ?? "") ?? "—"}
                  </span>
                </span>
              )}
            </div>
            {todaysClasses.length === 0 ? (
              <div className="body-sm" style={{ padding: "10px 0" }}>No classes scheduled for today.</div>
            ) : (
              todaysClasses.map((c) => (
                <div key={c._id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
                  <div style={{ minWidth: 48, fontSize: 13, fontWeight: 600, color: "var(--omnic-gray-500)" }}>{formatTime(c.startTime, timeFmt)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{c.title}</div>
                    <div className="body-sm">
                      {userNameMap.get(c.studentId ?? "") ?? c.studentId ?? "—"}
                    </div>
                  </div>
                  <span className="pill pill-tenant">Upcoming</span>
                </div>
              ))
            )}
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div className="h3">Recent recordings</div>
              <Link href="/teacher/sessions" className="btn btn-ghost btn-sm">
                View all <Icon name="chevronRight" size={14} />
              </Link>
            </div>
            {recordings.slice(0, 3).map((r) => (
              <Link key={r._id} href={`/teacher/sessions/${r._id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--omnic-gray-100)", textDecoration: "none", color: "inherit" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</div>
                  <div className="body-sm">{new Date(r.createdAt).toLocaleDateString()} · {Math.round((r.durationSeconds ?? 0) / 60)} min</div>
                </div>
                <span className={`pill ${r.status === "published" ? "pill-active" : "pill-new"}`}>{r.status}</span>
              </Link>
            ))}
            {recordings.length === 0 && (
              <div className="body-sm" style={{ padding: "8px 0" }}>No recordings yet.</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* POLICY §4 — what the teacher actually earns this month. Only shown
              as money when pack pricing exists; otherwise the payable count. */}
          <div
            className="card"
            style={{
              padding: "var(--pad-card)",
              background: "var(--brand-purple, #6716A4)",
              color: "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.9 }}>
              <Icon name="dollar" size={16} stroke="#fff" />
              <span className="body-sm" style={{ color: "#fff", opacity: 0.9 }}>
                This month
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, marginTop: 10, letterSpacing: "-0.02em" }}>
              {earnings?.monthEarningsUSD != null
                ? `$${earnings.monthEarningsUSD.toFixed(2)}`
                : `${earnings?.monthLessons ?? 0} lesson${earnings?.monthLessons === 1 ? "" : "s"}`}
            </div>
            <div className="body-sm" style={{ color: "#fff", opacity: 0.85, marginTop: 2 }}>
              {earnings?.monthEarningsUSD != null
                ? `${earnings.monthLessons} payable lesson${earnings.monthLessons === 1 ? "" : "s"} · ${Math.round((earnings.rate ?? 0.3) * 100)}% share`
                : "Set pack prices in Billing to see earnings"}
            </div>
          </div>

          <div className="grid-2">
            <MetricCard icon="users" label="Students" value={stats.totalStudents} />
            <MetricCard icon="calendar" label="Upcoming lessons" value={earnings?.upcoming ?? 0} />
            <MetricCard icon="clock" label="Hours taught" value={stats.hoursTaught.toFixed(1)} />
            <MetricCard icon="video" label="Needs review" value={stats.pendingReviews} />
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Quick actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link href="/teacher/sessions" className="btn btn-tenant btn-block">
                <Icon name="video" size={16} /> Start session
              </Link>
              <Link href="/teacher/students" className="btn btn-secondary btn-block">
                <Icon name="users" size={16} /> View all students
              </Link>
              <Link href="/teacher/calendar" className="btn btn-secondary btn-block">
                <Icon name="calendar" size={16} /> Set availability
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 8,
        background: done ? "rgba(22,163,74,0.08)" : "var(--omnic-gray-50, #FAF9FB)",
        border: "1px solid var(--omnic-gray-100)",
        textDecoration: "none",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: done ? "#15803D" : "transparent",
          border: done ? "none" : "2px solid var(--omnic-gray-300)",
          color: "#fff",
        }}
      >
        {done && <Icon name="check" size={11} stroke="#fff" />}
      </span>
      <span
        className="body-sm"
        style={{
          color: done ? "var(--omnic-gray-500)" : "var(--omnic-gray-800)",
          textDecoration: done ? "line-through" : "none",
        }}
      >
        {label}
      </span>
    </Link>
  );
}

function MetricCard({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="card" style={{ padding: "var(--pad-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 14, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}
