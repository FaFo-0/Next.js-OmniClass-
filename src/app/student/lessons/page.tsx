"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function StudentLessonsPage() {
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const lessons = useQuery(api.lessons.listPublishedForStudent, {}) ?? [];

  const filtered = lessons.filter((l) =>
    l.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>My Lessons</h1>
          <div className="body" style={{ marginTop: 4 }}>{filtered.length} lessons published by your teachers</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div className="search-wrap">
          <Icon name="search" size={15} stroke="var(--omnic-gray-400)" />
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lessons..."
          />
        </div>
      </div>

      <div className="tabs">
        {[
          { value: "all", label: "All", count: lessons.length },
          { value: "past", label: "Past", count: lessons.filter((l) => l.status === "published").length },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`tab ${tab === t.value ? "tab-active" : ""}`}
          >
            {t.label}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.map((l) => (
          <Link key={l._id} href={`/student/lessons/${l._id}`} className="lesson-row">
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="book" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{l.title}</div>
              <div className="body-sm" style={{ marginTop: 2 }}>
                {new Date(l.createdAt).toLocaleDateString()} · {Math.round((l.durationSeconds ?? 0) / 60)} min
              </div>
            </div>
            <span className="pill pill-tenant">{l.status}</span>
            <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
          </Link>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: "center" }} className="body-sm">
            {search ? "No lessons match your search." : "No lessons yet."}
          </div>
        )}
      </div>
    </div>
  );
}
