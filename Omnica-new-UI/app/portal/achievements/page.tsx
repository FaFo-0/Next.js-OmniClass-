"use client"

import { Icon } from "@/components/shared/icons"
import { MOCK } from "@/lib/mock-data"

export default function StudentAchievementsPage() {
  const m = MOCK.student
  const unlocked = MOCK.achievements.filter((a) => a.unlocked).length

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Achievements</h1>
          <div className="body" style={{ marginTop: 4 }}>{unlocked} of {MOCK.achievements.length} unlocked</div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <LocalStat label="Unlocked" value={`${unlocked}/${MOCK.achievements.length}`} icon="award" />
        <LocalStat label="Current streak" value={`${m.streak} days`} icon="flame" accent="red" />
        <LocalStat label="Longest streak" value={`${m.longestStreak} days`} icon="zap" />
        <LocalStat label="Study time" value={`${m.studyTimeHours}h`} icon="clock" />
      </div>

      <div className="grid-3">
        {MOCK.achievements.map((a) => (
          <div key={a.id} className={`card achv-card ${a.unlocked ? "achv-unlocked" : "achv-locked"}`}>
            <div className="achv-icon">{a.unlocked ? a.icon : "🔒"}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--omnic-gray-900)", marginBottom: 4 }}>{a.name}</div>
            <div className="body-sm" style={{ marginBottom: 10 }}>{a.description}</div>
            {a.unlocked ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--omnic-tenant-primary)" }}>Unlocked {a.date}</div>
            ) : (
              <>
                <div className="progress" style={{ marginBottom: 6 }}>
                  <div className="progress-fill" style={{ width: `${((a.progress || 0) / (a.total || 100)) * 100}%` }} />
                </div>
                <div className="body-sm">{a.progress} / {a.total}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function LocalStat({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: string }) {
  return (
    <div className="card" style={{ padding: "var(--pad-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: accent === "red" ? "var(--omnic-red-tint)" : "var(--omnic-tenant-primary-soft)", color: accent === "red" ? "var(--omnic-red)" : "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 14, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  )
}
