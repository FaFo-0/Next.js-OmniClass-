"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Icon } from "@/components/shared/icons";

export default function TeacherReportsPage() {
  const [tab, setTab] = useState("engagement");
  const { user } = useAuth();
  const lessons = useQuery(api.lessons.listForTeacher, {}) ?? [];
  const students = useQuery(api.users.getStudentsForTeacher, {
    teacherId: user?.externalId ?? "",
  }) ?? [];

  // Pipeline stats
  const finalized = lessons.filter((l) => l.status === "published").length;
  const draft = lessons.filter((l) => ["review", "transcribed"].includes(l.status)).length;
  const recording = lessons.filter((l) => l.status === "recording").length;

  return (
    <div>
      <PageHeader title="Reports" />
      <div className="flex gap-1 mb-4 border-b border-[var(--omnic-gray-200)]">
        {["engagement", "pipeline"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px"
            style={{ color: tab === t ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-400)", borderColor: tab === t ? "var(--omnic-tenant-primary)" : "transparent" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "engagement" && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--omnic-gray-100)]">
                {["Student", "Status", "Locale"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s._id ?? i} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]">
                  <td className="px-5 py-3 text-sm font-medium">{s.name}</td>
                  <td className="px-5 py-3"><StatusPill status={s.studentStatus ?? "active"} /></td>
                  <td className="px-5 py-3 text-sm">{s.locale ?? "en"}</td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-sm text-[var(--omnic-gray-400)]">No students assigned.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "pipeline" && (
        <div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div className="card" style={{ padding: "var(--pad-card)", textAlign: "center" }}>
              <div className="text-2xl font-bold" style={{ color: "var(--omnic-gray-800)" }}>{lessons.length}</div>
              <div className="body-sm">Total</div>
            </div>
            <div className="card" style={{ padding: "var(--pad-card)", textAlign: "center" }}>
              <div className="text-2xl font-bold" style={{ color: "#16A34A" }}>{finalized}</div>
              <div className="body-sm">Published</div>
            </div>
            <div className="card" style={{ padding: "var(--pad-card)", textAlign: "center" }}>
              <div className="text-2xl font-bold" style={{ color: "#D97706" }}>{draft}</div>
              <div className="body-sm">In Review</div>
            </div>
            <div className="card" style={{ padding: "var(--pad-card)", textAlign: "center" }}>
              <div className="text-2xl font-bold" style={{ color: "#DC2626" }}>{recording}</div>
              <div className="body-sm">Recording</div>
            </div>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--omnic-gray-100)]">
                  {["Title", "Date", "Status"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lessons.slice(0, 20).map((r) => (
                  <tr key={r._id} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]">
                    <td className="px-5 py-3 text-sm font-medium">{r.title}</td>
                    <td className="px-5 py-3 text-sm">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3"><StatusPill status={r.status} /></td>
                  </tr>
                ))}
                {lessons.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-6 text-center text-sm text-[var(--omnic-gray-400)]">No lessons yet.</td>
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
