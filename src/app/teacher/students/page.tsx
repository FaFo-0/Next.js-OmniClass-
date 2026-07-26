"use client";

// Students — the roster answers the questions a teacher actually opens this
// page for (how many lessons left, what level, when's the next one, is any
// homework waiting) without making them visit each student in turn.

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import { flagEmoji, LocalClock } from "@/components/shared/studentBits";

function relDate(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (date === today) return "Today";
  const d = new Date(`${date}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7)
    return d.toLocaleDateString("en-US", { weekday: "short" });
  if (diff < 0 && diff > -30) return `${Math.abs(diff)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TeacherStudentsPage() {
  const router = useRouter();
  const students = useQuery(api.users.getStudentRosterForTeacher, {});
  const me = useQuery(api.users.getMe);
  const timeFmt: TimeFormat = me?.timeFormat ?? "24h";
  const rows = students ?? [];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="h1" style={{ margin: 0 }}>Students</h1>
        <div className="body" style={{ marginTop: 4 }}>
          {rows.length} student{rows.length === 1 ? "" : "s"} assigned to you
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ whiteSpace: "nowrap" }}>Level</th>
              <th style={{ whiteSpace: "nowrap" }}>Lessons left</th>
              <th style={{ whiteSpace: "nowrap" }}>Next lesson</th>
              <th style={{ whiteSpace: "nowrap" }}>Last seen</th>
              <th style={{ whiteSpace: "nowrap" }}>Homework</th>
              <th style={{ whiteSpace: "nowrap" }}>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.externalId}
                onClick={() => router.push(`/teacher/students/${s.externalId}`)}
                style={{ cursor: "pointer" }}
              >
                <td style={{ minWidth: 240 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="avatar avatar-sm" style={{ flexShrink: 0 }}>
                      {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {flagEmoji(s.country) && <span>{flagEmoji(s.country)}</span>}
                        {s.name}
                      </div>
                      <div
                        className="body-sm"
                        style={{
                          color: "var(--omnic-gray-500)",
                          display: "flex",
                          gap: 8,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span>{s.email}</span>
                        {s.timezone && <LocalClock tz={s.timezone} fmt={timeFmt} compact />}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{s.level ?? "—"}</td>
                <td>
                  {/* Zero balance is the thing a teacher must not miss — the
                      next lesson simply won't happen. */}
                  <span
                    style={{
                      fontWeight: 700,
                      color: s.balance === 0 ? "var(--omnic-red, #DC2626)" : "inherit",
                    }}
                  >
                    {s.balance}
                  </span>
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {s.nextLesson
                    ? `${relDate(s.nextLesson.date)} · ${formatTime(s.nextLesson.startTime, timeFmt)}`
                    : "—"}
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{s.lastLesson ? relDate(s.lastLesson) : "—"}</td>
                <td>
                  {s.awaitingReview > 0 ? (
                    <span className="pill" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
                      {s.awaitingReview} to review
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td><StatusPill status={s.status} /></td>
                <td style={{ width: 32 }}>
                  <Icon name="chevronRight" size={14} stroke="var(--omnic-gray-400)" />
                </td>
              </tr>
            ))}
            {students !== undefined && rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                  No students assigned yet.
                </td>
              </tr>
            )}
            {students === undefined && (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
