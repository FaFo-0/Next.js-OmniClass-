"use client"

import { use } from "react"
import { PageHeader } from "@/components/shared/page-header"
import { StatusPill } from "@/components/shared/status-pill"
import { Icon } from "@/components/shared/icons"
import { useState } from "react"

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tab, setTab] = useState("transcript")
  const tabs = ["transcript", "summary", "vocabulary", "flashcards", "quiz"]

  return (
    <div>
      <PageHeader title="Business English: Meetings" subtitle="Alex Johnson · May 5, 2026 · 60 min" right={[<StatusPill key="s" status="draft" />]} />
      <div className="flex gap-1 mb-4 border-b border-[var(--omnic-gray-200)]">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px"
            style={{ color: tab === t ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-400)", borderColor: tab === t ? "var(--omnic-tenant-primary)" : "transparent" }}>{t}</button>
        ))}
      </div>

      {tab === "transcript" && (
        <div className="card p-6 space-y-4">
          {[{ speaker: "Teacher", text: "Good morning, Alex! Let's talk about business meeting vocabulary." }, { speaker: "Alex", text: "That sounds great, I have a meeting next week." }].map((line, i) => (
            <div key={i} className="flex gap-3"><span className="text-xs font-semibold min-w-[60px] pt-0.5 text-[var(--omnic-tenant-primary)]">{line.speaker}</span><p className="text-sm text-[var(--omnic-gray-600)]">{line.text}</p></div>
          ))}
        </div>
      )}

      {tab === "summary" && (
        <div className="card p-6">
          <h3 className="h3 mb-3">AI-Generated Summary</h3>
          <textarea className="w-full min-h-[200px] p-4 rounded-lg border border-[var(--omnic-gray-200)] text-sm text-[var(--omnic-gray-600)] resize-y" defaultValue="In this lesson, the student practiced business English vocabulary and phrases for formal meetings. Topics covered: opening a meeting, presenting agenda items, handling interruptions, and closing with action items." />
        </div>
      )}

      <div className="flex items-center justify-between mt-6 p-4 card rounded-lg sticky bottom-4">
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--omnic-gray-200)] hover:bg-[var(--omnic-gray-50)]"><Icon name="edit" size={14} className="inline mr-1" /> Save</button>
          <button className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--omnic-gray-200)] hover:bg-[var(--omnic-gray-50)]"><Icon name="sparkle" size={14} className="inline mr-1" /> Generate All</button>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 rounded-md text-sm font-medium text-white" style={{ backgroundColor: "var(--omnic-tenant-primary)" }}>Publish to Student</button>
          <button className="px-4 py-2 rounded-md text-sm font-medium text-[var(--omnic-red)] hover:bg-red-50"><Icon name="trash" size={14} className="inline mr-1" /> Delete</button>
        </div>
      </div>
    </div>
  )
}
