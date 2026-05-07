"use client"

import { Icon } from "@/components/shared/icons"
import { MOCK } from "@/lib/mock-data"

export default function StudentProfilePage() {
  const m = MOCK.student

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="card" style={{ padding: 28, textAlign: "center", marginBottom: 16 }}>
        <span className="avatar avatar-lg">{m.initials}</span>
        <div className="h2" style={{ marginTop: 14 }}>{m.fullName}</div>
        <div className="body" style={{ marginBottom: 14 }}>{m.email}</div>
        <button className="btn btn-secondary btn-sm"><Icon name="edit" size={14} /> Edit profile</button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Your stats</div>
        <div className="grid-3">
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{m.lessonsCompleted}</div>
            <div className="body-sm">Lessons</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{m.wordsLearned}</div>
            <div className="body-sm">Words</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--omnic-red)" }}>{m.streak}🔥</div>
            <div className="body-sm">Streak</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Subscription</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="body">Sessions remaining</span>
          <span style={{ fontWeight: 600 }}>{m.sessionsRemaining} of {m.sessionsTotal}</span>
        </div>
        <div className="progress" style={{ marginBottom: 16 }}>
          <div className="progress-fill" style={{ width: `${(m.sessionsRemaining / m.sessionsTotal) * 100}%` }} />
        </div>
        <button className="btn btn-secondary btn-block">Contact your provider to purchase more</button>
      </div>

      <button className="btn btn-secondary btn-block"><Icon name="logout" size={14} /> Sign out</button>
    </div>
  )
}
