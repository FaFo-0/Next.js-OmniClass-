"use client"

import { PageHeader } from "@/components/shared/page-header"
import { StatusPill } from "@/components/shared/status-pill"
import { useState } from "react"

export default function TeacherReportsPage() {
  const [tab, setTab] = useState("engagement")
  return (
    <div>
      <PageHeader title="Reports" />
      <div className="flex gap-1 mb-4 border-b border-[var(--omnic-gray-200)]">
        {["engagement", "pipeline"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px"
            style={{ color: tab === t ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-400)", borderColor: tab === t ? "var(--omnic-tenant-primary)" : "transparent" }}>{t}</button>
        ))}
      </div>
      {tab === "engagement" && (
        <div className="card overflow-hidden"><table className="w-full">
          <thead><tr className="border-b border-[var(--omnic-gray-100)]">{["Student", "Lessons", "Flashcards", "Streak", "Last Activity"].map((h) => (<th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>))}</tr></thead>
          <tbody>{[["Alex Johnson", 12, 243, "7 days", "May 5, 2026"], ["Maria Santos", 8, 156, "4 days", "May 3, 2026"]].map((r, i) => (<tr key={i} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]">{r.map((c, j) => (<td key={j} className="px-5 py-3 text-sm">{c}</td>))}</tr>))}</tbody>
        </table></div>
      )}
      {tab === "pipeline" && (
        <div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[{ label: "Total", value: 47, color: "var(--omnic-gray-800)" }, { label: "Finalized", value: 32, color: "#16A34A" }, { label: "Draft", value: 12, color: "#D97706" }, { label: "Failed", value: 3, color: "#DC2626" }].map((s, i) => (
              <div key={i} className="card p-4 text-center"><div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div><div className="body-sm">{s.label}</div></div>
            ))}
          </div>
          <div className="card overflow-hidden"><table className="w-full">
            <thead><tr className="border-b border-[var(--omnic-gray-100)]">{["Title", "Date", "Status", "AI Status"].map((h) => (<th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>))}</tr></thead>
            <tbody>{[["Business English", "May 5", "draft", "Review"], ["Travel Vocab", "May 3", "finalized", "Approved"]].map((r, i) => (<tr key={i} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]">
              <td className="px-5 py-3 text-sm font-medium">{r[0]}</td><td className="px-5 py-3 text-sm">{r[1]}</td><td className="px-5 py-3"><StatusPill status={r[2]} /></td><td className="px-5 py-3"><StatusPill status={r[3].toLowerCase()} /></td></tr>))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}
