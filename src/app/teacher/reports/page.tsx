"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { StatusPill } from "@/components/shared/StatusPill";

export default function TeacherReportsPage() {
  const [tab, setTab] = useState<"engagement" | "pipeline">("engagement");
  const { user } = useAuth();
  const lessons = useQuery(api.lessons.listForTeacher, {}) ?? [];
  const students = useQuery(api.users.getStudentsForTeacher, {
    teacherId: user?.externalId ?? "",
  }) ?? [];

  const finalized = lessons.filter((l) => l.status === "published").length;
  const draft = lessons.filter((l) => ["review", "transcribed"].includes(l.status)).length;
  const recording = lessons.filter((l) => l.status === "recording").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Reports</h1>
          <div className="body" style={{ marginTop: 4 }}>Engagement and lesson pipeline overview</div>
        </div>
      </div>

      <div className="tabs">
        {(["engagement", "pipeline"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tab ${tab === t ? "tab-active" : ""}`}
            style={{ textTransform: "capitalize" }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "engagement" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Locale</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s: any, i: number) => (
                <tr key={s._id ?? i}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td><StatusPill status={s.studentStatus ?? "active"} /></td>
                  <td className="muted">{s.locale ?? "en"}</td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                    No students assigned.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "pipeline" && (
        <div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <StatBox value={lessons.length} label="Total" color="var(--omnic-gray-800)" />
            <StatBox value={finalized} label="Published" color="#16A34A" />
            <StatBox value={draft} label="In review" color="#D97706" />
            <StatBox value={recording} label="Recording" color="#DC2626" />
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lessons.slice(0, 20).map((r: any) => (
                  <tr key={r._id}>
                    <td style={{ fontWeight: 600 }}>{r.title}</td>
                    <td className="muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td><StatusPill status={r.status} /></td>
                  </tr>
                ))}
                {lessons.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                      No lessons yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="card" style={{ padding: "var(--pad-card)", textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}
