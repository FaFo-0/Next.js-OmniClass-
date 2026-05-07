"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "@/components/shared/icons"
import { MOCK } from "@/lib/mock-data"

export default function StudentLessonsPage() {
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const m = MOCK
  const filtered = m.lessons.filter((l) =>
    l.title.toLowerCase().includes(search.toLowerCase())
  )

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
          { value: "all", label: "All", count: m.lessons.length },
          { value: "upcoming", label: "Upcoming", count: 4 },
          { value: "past", label: "Past", count: m.lessons.length },
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
          <Link key={l.id} href={`/portal/lessons/${l.id}`} className="lesson-row">
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="book" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{l.title}</div>
              <div className="body-sm" style={{ marginTop: 2 }}>{l.date} · {l.teacher} · {l.duration}</div>
            </div>
            <span className="pill pill-tenant">{l.wordCount} words</span>
            <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
          </Link>
        ))}
      </div>
    </div>
  )
}
