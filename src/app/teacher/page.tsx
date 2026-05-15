"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";

export default function TeacherDashboard() {
  const { user } = useAuth();

  const lessons = useQuery(api.lessons.listForTeacher, {}) ?? [];
  const students = useQuery(api.users.getStudentsForTeacher, {
    teacherId: user?.externalId ?? "",
  }) ?? [];
  const scheduleEvents = useQuery(api.schedule.listForTeacher, {}) ?? [];
  const allUsers = useQuery(api.users.listAllUsers, {}) ?? [];

  const userNameMap = new Map(allUsers.map((u) => [u.externalId, u.name]));

  // Today's classes
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysClasses = scheduleEvents
    .filter((e) => e.date === todayStr && e.status === "scheduled")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

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
      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="card">
          <div style={{ padding: 16, borderBottom: "1px solid var(--omnic-gray-100)" }}>
            <div className="h3" style={{ marginBottom: 12 }}>Today&apos;s classes</div>
            {todaysClasses.length === 0 ? (
              <div className="body-sm" style={{ padding: "10px 0" }}>No classes scheduled for today.</div>
            ) : (
              todaysClasses.map((c) => (
                <div key={c._id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
                  <div style={{ minWidth: 48, fontSize: 13, fontWeight: 600, color: "var(--omnic-gray-500)" }}>{c.startTime}</div>
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
          <div className="grid-2">
            <MetricCard icon="users" label="Total students" value={stats.totalStudents} />
            <MetricCard icon="book" label="Published this month" value={stats.publishedThisMonth} />
            <MetricCard icon="clock" label="Hours taught" value={stats.hoursTaught.toFixed(1)} />
            <MetricCard icon="video" label="Pending reviews" value={stats.pendingReviews} />
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
