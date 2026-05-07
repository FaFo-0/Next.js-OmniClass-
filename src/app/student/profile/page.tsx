"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";

export default function StudentProfilePage() {
  const { user } = useAuth();
  const pkg = useQuery(api.schedule.getPackage) ?? null;
  const lessons = useQuery(api.lessons.listPublishedForStudent, {}) ?? [];
  const vocab = useQuery(api.lessonContent.listAllVocab, {}) ?? [];
  const streak = useQuery(api.streaks.getForStudent, {});

  const initials = user?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("") ?? "?";

  const sessionsRemaining = pkg ? (pkg.totalSessions - (pkg.usedSessions ?? 0)) : 0;
  const sessionsTotal = pkg?.totalSessions ?? 0;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="card" style={{ padding: 28, textAlign: "center", marginBottom: 16 }}>
        <span className="avatar avatar-lg">{initials}</span>
        <div className="h2" style={{ marginTop: 14 }}>{user?.name ?? "Student"}</div>
        <div className="body" style={{ marginBottom: 14 }}>{user?.email}</div>
        <button className="btn btn-secondary btn-sm"><Icon name="edit" size={14} /> Edit profile</button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Your stats</div>
        <div className="grid-3">
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{lessons.length}</div>
            <div className="body-sm">Lessons</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{vocab.length}</div>
            <div className="body-sm">Words</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--omnic-red)" }}>{streak?.currentStreak ?? 0}🔥</div>
            <div className="body-sm">Streak</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Subscription</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="body">Sessions remaining</span>
          <span style={{ fontWeight: 600 }}>{sessionsRemaining} of {sessionsTotal}</span>
        </div>
        <div className="progress" style={{ marginBottom: 16 }}>
          <div className="progress-fill" style={{ width: sessionsTotal > 0 ? `${(sessionsRemaining / sessionsTotal) * 100}%` : "0%" }} />
        </div>
        <button className="btn btn-secondary btn-block">Contact your provider to purchase more</button>
      </div>

      <button className="btn btn-secondary btn-block"><Icon name="logout" size={14} /> Sign out</button>
    </div>
  );
}
