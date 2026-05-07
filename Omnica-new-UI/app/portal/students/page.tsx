"use client"

import { PageHeader } from "@/components/shared/page-header"
import { StatusPill } from "@/components/shared/status-pill"

const students = [
  { name: "Alex Johnson", email: "alex@example.com", status: "active", lessons: 12, lastActive: "May 5, 2026" },
  { name: "Maria Santos", email: "maria@example.com", status: "active", lessons: 8, lastActive: "May 3, 2026" },
  { name: "John Doe", email: "john@example.com", status: "paused", lessons: 4, lastActive: "Apr 15, 2026" },
  { name: "Sara Miller", email: "sara@example.com", status: "trial", lessons: 1, lastActive: "May 1, 2026" },
]

export default function TeacherStudentsPage() {
  return (
    <div>
      <PageHeader title="Students" subtitle={`${students.length} students`} />
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-[var(--omnic-gray-100)]">
            {["Name", "Email", "Status", "Lessons", "Last Active"].map((h) => (<th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>))}
          </tr></thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={i} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]">
                <td className="px-5 py-3"><div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ backgroundColor: "var(--omnic-tenant-primary-light)", color: "var(--omnic-tenant-primary)" }}>{s.name.split(" ").map((n) => n[0]).join("")}</div>
                  <span className="font-medium text-sm">{s.name}</span></div></td>
                <td className="px-5 py-3 text-sm text-[var(--omnic-gray-400)]">{s.email}</td>
                <td className="px-5 py-3"><StatusPill status={s.status} /></td>
                <td className="px-5 py-3 text-sm">{s.lessons}</td>
                <td className="px-5 py-3 text-sm text-[var(--omnic-gray-400)]">{s.lastActive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
