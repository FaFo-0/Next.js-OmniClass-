"use client"

import Link from "next/link"
import { useRole } from "@/components/role-provider"
import { Icon } from "@/components/shared/icons"
import { MOCK } from "@/lib/mock-data"

export default function PortalDashboardPage() {
  const { role } = useRole()
  if (role === "admin") return <AdminDashboard />
  if (role === "teacher") return <TeacherDashboard />
  return <StudentDashboard />
}

function StudentDashboard() {
  const m = MOCK
  const s = m.student
  const up = m.upcomingClass

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
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--omnic-gray-900)" }}>{s.streak}-day streak</div>
            <div className="body-sm">Longest: {s.longestStreak} days</div>
          </div>
        </div>
      </div>

      {/* Next Up + Study Due */}
      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="nextup-card">
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Next Up</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>Join class in {up.minutesUntil} min</div>
          <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>{up.title}</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>with {up.teacher} · {up.duration} min</div>
          <button className="btn btn-secondary" style={{ background: "white", color: "var(--omnic-tenant-primary)", border: "1px solid var(--omnic-gray-200)" }}>
            <Icon name="video" size={16} /> Join on Google Meet
          </button>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 4 }}>Study Due</div>
          <div className="body-sm" style={{ marginBottom: 14 }}>Spaced repetition queue</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--omnic-tenant-primary)", letterSpacing: "-0.02em" }}>{m.dueCards}</div>
          <div className="body-sm" style={{ marginBottom: 16 }}>flashcards ready</div>
          <Link href="/portal/study" className="btn btn-tenant btn-block">
            <Icon name="brain" size={16} /> Start studying
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="book" label="Lessons completed" value={s.lessonsCompleted} />
        <MetricCard icon="bookmark" label="Words learned" value={s.wordsLearned} />
        <MetricCard icon="brain" label="Cards reviewed" value={s.cardsReviewed} />
        <MetricCard icon="flame" label="Day streak" value={s.streak} accent="red" />
      </div>

      {/* Recent lessons */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--omnic-gray-100)" }}>
          <div className="h3">Recent lessons</div>
          <Link href="/portal/lessons" className="btn btn-ghost btn-sm">
            View all <Icon name="chevronRight" size={14} />
          </Link>
        </div>
        {m.lessons.slice(0, 3).map(l => (
          <Link key={l.id} href={`/portal/lessons/${l.id}`} className="lesson-row">
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="book" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{l.title}</div>
              <div className="body-sm" style={{ marginTop: 2 }}>{l.date} · {l.teacher} · {l.duration}</div>
            </div>
            <span className="pill pill-tenant">{l.wordCount} words</span>
            <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
          </Link>
        ))}
      </div>
    </div>
  )
}

// Local MetricCard matching prototype exactly
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
  )
}

function TeacherDashboard() {
  const m = MOCK
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div><h1 className="h1" style={{ margin: 0 }}>Teacher Dashboard</h1></div>
      </div>
      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="card">
          <div style={{ padding: 16, borderBottom: "1px solid var(--omnic-gray-100)" }}>
            <div className="h3" style={{ marginBottom: 12 }}>Today&apos;s classes</div>
            {m.todaysClasses.map((cls) => (
              <div key={cls.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
                <div style={{ minWidth: 48, fontSize: 13, fontWeight: 600, color: "var(--omnic-gray-500)" }}>{cls.time}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{cls.title}</div>
                  <div className="body-sm">{cls.student}</div>
                </div>
                <span className="pill pill-tenant">Upcoming</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 16 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Recent recordings</div>
            {m.recordings.slice(0, 3).map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</div>
                  <div className="body-sm">{r.student} · {r.date}</div>
                </div>
                <span className={`pill ${r.status === "Draft" ? "pill-new" : "pill-active"}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="grid-2">
            <MetricCard icon="users" label="Total students" value={m.teacher.totalStudents} />
            <MetricCard icon="book" label="Published this month" value={m.teacher.publishedThisMonth} />
            <MetricCard icon="clock" label="Hours taught" value={m.teacher.hoursThisMonth} />
            <MetricCard icon="video" label="Pending reviews" value={m.teacher.pendingReviews} />
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Quick actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link href="/portal/transcribe" className="btn btn-tenant btn-block">
                <Icon name="video" size={16} /> Start session
              </Link>
              <Link href="/portal/sessions" className="btn btn-secondary btn-block">
                View all sessions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminDashboard() {
  const m = MOCK.adminMetrics
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div><h1 className="h1" style={{ margin: 0 }}>Admin Dashboard</h1></div>
      </div>
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="users" label="Total Teachers" value={m.teachers} />
        <MetricCard icon="user" label="Total Students" value={m.students} />
        <MetricCard icon="video" label="Sessions This Month" value={m.sessionsThisMonth} />
        <MetricCard icon="sparkle" label="AI Prompts Used" value={m.aiPromptsUsed} />
      </div>
      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 14 }}>Monthly P&amp;L — May 2026</div>
          <div className="grid-2">
            {[["Total Revenue", `$${m.revenue.toLocaleString()}`], ["Ad Spend", `$${m.adSpend.toLocaleString()}`], ["Other Expenses", `$${m.expenses.toLocaleString()}`], ["Teacher Payments", `$${m.teacherPay.toLocaleString()}`]].map(([l, v]) => (
              <div key={l}><div className="body-sm">{l}</div><div style={{ fontSize: 18, fontWeight: 700, color: "var(--omnic-gray-900)" }}>{v}</div></div>
            ))}
            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--omnic-gray-100)", paddingTop: 12, marginTop: 4 }}>
              <div className="body-sm">Net Profit</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#16A34A" }}>${m.netProfit.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 14 }}>Subscriptions</div>
          {[["Active", m.active, "#16A34A"], ["Paused", m.paused, "#D97706"], ["Trial", m.trial, "#2563EB"], ["New this month", m.newThisMonth, "var(--omnic-tenant-primary)"]].map(([l, v, c]) => (
            <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
              <span className="body-sm">{l}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: c as string }}>{v as number}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
