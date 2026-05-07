"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function StudentAchievementsPage() {
  const achievements = useQuery(api.achievements.listForStudent, {}) ?? [];
  const streak = useQuery(api.streaks.getForStudent, {});
  const studyMinutes = useQuery(api.study.totalStudyMinutes, {}) ?? 0;

  const unlocked = achievements.filter((a: any) => a.unlocked).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Achievements</h1>
          <div className="body" style={{ marginTop: 4 }}>{unlocked} of {achievements.length} unlocked</div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <LocalStat label="Unlocked" value={`${unlocked}/${achievements.length}`} icon="award" />
        <LocalStat label="Current streak" value={`${streak?.currentStreak ?? 0} days`} icon="flame" accent="red" />
        <LocalStat label="Longest streak" value={`${streak?.longestStreak ?? 0} days`} icon="zap" />
        <LocalStat label="Study time" value={`${(studyMinutes / 60).toFixed(1)}h`} icon="clock" />
      </div>

      <div className="grid-3">
        {achievements.map((a: any) => (
          <div key={a._id} className={`card achv-card ${a.unlocked ? "achv-unlocked" : "achv-locked"}`}>
            <div className="achv-icon">{a.unlocked ? (a.icon || "🎯") : "🔒"}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--omnic-gray-900)", marginBottom: 4 }}>{a.name}</div>
            <div className="body-sm" style={{ marginBottom: 10 }}>{a.description}</div>
            {a.unlocked && a.unlockedAt ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--omnic-tenant-primary)" }}>
                Unlocked {new Date(a.unlockedAt).toLocaleDateString()}
              </div>
            ) : (
              <>
                <div className="progress" style={{ marginBottom: 6 }}>
                  <div className="progress-fill" style={{ width: "0%" }} />
                </div>
                <div className="body-sm">0 / {a.conditionThreshold ?? 10}</div>
              </>
            )}
          </div>
        ))}
        {achievements.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center", gridColumn: "1 / -1" }}>
            <Icon name="award" size={48} stroke="var(--omnic-gray-300)" />
            <div className="body" style={{ marginTop: 12 }}>Achievements will appear here once your academy creates them.</div>
          </div>
        )}
      </div>
    </div>
  );
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
  );
}
