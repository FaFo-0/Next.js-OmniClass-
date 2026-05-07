"use client"

import { PageHeader } from "@/components/shared/page-header"
import { StatusPill } from "@/components/shared/status-pill"
import { useState } from "react"

export default function AdminBillingPage() {
  const [tab, setTab] = useState("invoices")
  return (
    <div>
      <PageHeader title="Billing" subtitle="Invoices, subscriptions, and payments" />
      <div className="flex gap-1 mb-4 border-b border-[var(--omnic-gray-200)]">
        {["invoices", "subscriptions", "payments"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px"
            style={{ color: tab === t ? "var(--omnic-tenant-primary)" : "var(--omnic-gray-400)", borderColor: tab === t ? "var(--omnic-tenant-primary)" : "transparent" }}>{t}</button>
        ))}
      </div>
      {tab === "invoices" && (
        <div className="card overflow-hidden"><table className="w-full">
          <thead><tr className="border-b border-[var(--omnic-gray-100)]">{["Invoice #", "Student", "Amount", "Status", "Date"].map((h) => (<th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>))}</tr></thead>
          <tbody>{[["INV-001", "Alex Johnson", "$300", "paid", "May 1, 2026"], ["INV-002", "Maria Santos", "$300", "paid", "May 1, 2026"], ["INV-003", "John Doe", "$300", "unpaid", "Apr 15, 2026"]].map((r, i) => (<tr key={i} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]"><td className="px-5 py-3 text-sm font-medium">{r[0]}</td><td className="px-5 py-3 text-sm">{r[1]}</td><td className="px-5 py-3 text-sm font-medium">{r[2]}</td><td className="px-5 py-3"><StatusPill status={r[3]} /></td><td className="px-5 py-3 text-sm text-[var(--omnic-gray-400)]">{r[4]}</td></tr>))}</tbody>
        </table></div>
      )}
      {tab === "subscriptions" && (
        <div className="card overflow-hidden"><table className="w-full">
          <thead><tr className="border-b border-[var(--omnic-gray-100)]">{["Student", "Plan", "Remaining", "Status"].map((h) => (<th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>))}</tr></thead>
          <tbody>{[["Alex Johnson", "24 sessions", "8", "active"], ["Maria Santos", "12 sessions", "4", "active"], ["John Doe", "12 sessions", "12", "paused"]].map((r, i) => (<tr key={i} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]"><td className="px-5 py-3 text-sm font-medium">{r[0]}</td><td className="px-5 py-3 text-sm">{r[1]}</td><td className="px-5 py-3 text-sm">{r[2]}</td><td className="px-5 py-3"><StatusPill status={r[3]} /></td></tr>))}</tbody>
        </table></div>
      )}
    </div>
  )
}
