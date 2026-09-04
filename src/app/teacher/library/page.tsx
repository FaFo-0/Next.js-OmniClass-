"use client";

// Teacher library — mirrors the student library (Readings grid) plus a student
// picker. When a student is selected, opening a reading enters live-teach mode
// (`?studentId=...`) and tapped words go to that student's deck.

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";
import { WorkCard } from "@/components/library/WorkCard";

const LEVELS = [
  { value: "all", label: "All" },
  { value: "A1", label: "A1 — Beginner" },
  { value: "A2", label: "A2 — Elementary" },
  { value: "B1", label: "B1 — Intermediate" },
  { value: "B2", label: "B2 — Upper Int." },
  { value: "C1", label: "C1 — Advanced" },
  { value: "C2", label: "C2 — Proficient" },
];

export default function TeacherLibraryPage() {
  const { user } = useAuth();
  const works = useQuery(api.libraryWorks.listPublished);
  const students = useQuery(api.users.getStudentsForTeacher, {
    teacherId: user?.externalId ?? "",
  }) ?? [];

  const [filter, setFilter] = useState("all");
  const [activeStudentId, setActiveStudentId] = useState<string | "">("");

  const isLoading = works === undefined;
  const items = (works ?? []).filter(
    (w) => filter === "all" || w.levelCEFR === filter
  );
  const linkSuffix = activeStudentId ? `?studentId=${activeStudentId}` : "";
  const activeStudent = students.find((s: any) => s.externalId === activeStudentId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Library</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {activeStudent
              ? `Words you tap go to ${activeStudent.name}'s flashcards.`
              : "Pick a student to save words to their flashcards — you can read without one."}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Icon name="user" size={16} stroke="var(--omnic-tenant-primary)" />
        <span className="body" style={{ fontWeight: 600 }}>Read with:</span>
        <select
          className="select"
          style={{ width: "auto", minWidth: 220 }}
          value={activeStudentId}
          onChange={(e) => setActiveStudentId(e.target.value)}
        >
          <option value="">— No student (read only) —</option>
          {students.map((s: any) => (
            <option key={s.externalId} value={s.externalId}>
              {s.name}
            </option>
          ))}
        </select>
        {activeStudent && (
          <span className="pill pill-tenant">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-purple)", display: "inline-block", marginRight: 4 }} />
            Live-teach: {activeStudent.name}
          </span>
        )}
      </div>

      <div style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {LEVELS.map((c) => (
          <button
            key={c.value}
            className="chip"
            onClick={() => setFilter(c.value)}
            style={filter === c.value ? { background: "var(--brand-purple)", color: "#FFFFFF", borderColor: "var(--brand-purple)", boxShadow: "0 2px 10px rgba(103,22,164,0.25)" } : {}}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ overflow: "hidden" }}>
            <div className="skel" style={{ height: 140, borderRadius: 0 }} />
            <div style={{ padding: 14 }}>
              <div className="skel" style={{ height: 14, width: "70%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 12, width: "40%" }} />
            </div>
          </div>
        ))}
        {!isLoading && items.map((w) => (
          <WorkCard key={w._id} work={w} href={`/teacher/library/work/${w._id}${linkSuffix}`} />
        ))}
        {!isLoading && items.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center", gridColumn: "1 / -1" }}>
            <Icon name="layers" size={48} stroke="var(--omnic-gray-300)" />
            <div className="body" style={{ marginTop: 12 }}>No readings yet.</div>
          </div>
        )}
      </div>
    </div>
  );
}
