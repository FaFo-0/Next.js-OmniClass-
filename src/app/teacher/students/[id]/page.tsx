"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatTime } from "@/lib/timeFormat";

const STATUS_LABEL: Record<string, string> = {
  completed: "Done",
  scheduled: "Upcoming",
  makeup: "Make-up",
  no_show_student: "No-show",
  no_show_teacher: "Teacher no-show",
  cancelled: "Cancelled",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value ?? "—"}</span>
    </div>
  );
}

function StatCard({ n, label }: { n: number; label: string }) {
  return (
    <div className="card" style={{ padding: 16, flex: "1 1 120px", minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{n}</div>
      <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>{label}</div>
    </div>
  );
}

export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const data = useQuery(api.users.getStudentDetailForTeacher, { studentId: id });

  return (
    <div style={{ maxWidth: 900 }}>
      <Link href="/teacher/students" className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16, color: "var(--brand-purple)" }}>
        <Icon name="chevronLeft" size={14} /> All students
      </Link>

      {data === undefined ? (
        <div className="card body-sm" style={{ padding: 40, textAlign: "center" }}>Loading…</div>
      ) : data === null ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>Student not found.</div>
      ) : (
        <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
              {data.student.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="h1" style={{ margin: 0 }}>{data.student.name}</h1>
              <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>{data.student.email}</div>
            </div>
            <StatusPill status={data.student.status} />
          </div>

          {/* Balance + stats */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <div className="card" style={{ padding: 16, flex: "1 1 180px", minWidth: 160, background: "var(--brand-purple)", color: "#fff" }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.balance}</div>
              <div className="body-sm" style={{ opacity: 0.9 }}>
                lesson{data.balance === 1 ? "" : "s"} left
                {data.nextExpiresAt ? ` · expires ${data.nextExpiresAt}` : ""}
              </div>
            </div>
            <StatCard n={data.stats.completed} label="completed" />
            <StatCard n={data.stats.upcoming} label="upcoming" />
            <StatCard n={data.stats.noShow} label="no-shows" />
          </div>

          {/* Profile / contact */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div className="h3" style={{ marginBottom: 16 }}>Profile</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              <Field label="Phone / WhatsApp" value={data.student.phone} />
              <Field label="English level" value={data.profile.englishLevel} />
              <Field label="Native language" value={data.profile.l1} />
              <Field label="Country" value={data.profile.country} />
              <Field label="Age" value={data.profile.age} />
              <Field label="Timezone" value={data.student.timezone} />
              <Field label="Goal" value={data.profile.goal} />
              <Field label="Preferred times" value={data.profile.preferredTimes} />
            </div>
          </div>

          {/* Homework */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Homework</div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Field label="Assigned / in progress" value={data.homework.assigned} />
              <Field label="Awaiting review" value={data.homework.submitted} />
              <Field label="Reviewed" value={data.homework.reviewed} />
            </div>
          </div>

          {/* Recent lessons */}
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Recent lessons</div>
            {data.recentLessons.length === 0 ? (
              <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>No lessons yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {data.recentLessons.map((l) => (
                  <div key={l._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{l.title}</div>
                      <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
                        {l.date} · {formatTime(l.startTime, "24h")}–{formatTime(l.endTime, "24h")}
                      </div>
                    </div>
                    <span className="body-sm" style={{ fontWeight: 600 }}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
