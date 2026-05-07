"use client"

import Link from "next/link"
import { PageHeader } from "@/components/shared/page-header"
import { StatusPill } from "@/components/shared/status-pill"
import { Icon } from "@/components/shared/icons"
import { Button } from "@/components/ui/button"

const sessions = [
  { id: "1", title: "Business English: Meetings", student: "Alex Johnson", date: "May 5, 2026", duration: "60 min", status: "draft", workflow: "Review" },
  { id: "2", title: "Travel Vocabulary", student: "Maria Santos", date: "May 3, 2026", duration: "45 min", status: "finalized", workflow: "Approved" },
  { id: "3", title: "Grammar: Present Perfect", student: "John Doe", date: "Apr 29, 2026", duration: "60 min", status: "draft", workflow: "Generating" },
]

export default function SessionsPage() {
  return (
    <div>
      <PageHeader title="Sessions" subtitle="Manage lesson recordings and AI content"
        right={[<Button key="start" className="text-white" style={{ backgroundColor: "var(--omnic-red)" }}><Icon name="video" size={14} /> Start Session</Button>]} />
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-[var(--omnic-gray-100)]">
            {["Title", "Student", "Date", "Duration", "Status", "Workflow"].map((h) => (
              <th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]">
                <td className="px-5 py-3"><Link href={`/portal/sessions/${s.id}`} className="font-medium text-[var(--omnic-tenant-primary)] hover:underline">{s.title}</Link></td>
                <td className="px-5 py-3 text-sm">{s.student}</td>
                <td className="px-5 py-3 text-sm text-[var(--omnic-gray-400)]">{s.date}</td>
                <td className="px-5 py-3 text-sm text-[var(--omnic-gray-400)]">{s.duration}</td>
                <td className="px-5 py-3"><StatusPill status={s.status} /></td>
                <td className="px-5 py-3"><StatusPill status={s.workflow.toLowerCase()} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
