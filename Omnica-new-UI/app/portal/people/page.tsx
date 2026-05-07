"use client"

import { useState } from "react"
import { Icon } from "@/components/shared/icons"
import { MOCK } from "@/lib/mock-data"

export default function AdminPeoplePage() {
  const [tab, setTab] = useState("students")
  const m = MOCK

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>People</h1>
        </div>
      </div>

      <div className="tabs">
        {[
          { value: "students", label: "Students", count: m.studentRoster.length },
          { value: "instructors", label: "Instructors", count: m.instructors.length },
          { value: "permissions", label: "Permissions", count: 4 },
        ].map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)} className={`tab ${tab === t.value ? "tab-active" : ""}`}>
            {t.label}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "students" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Lessons</th>
                <th>Last Activity</th>
                <th>Teacher</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {m.studentRoster.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="avatar avatar-sm">{s.name.split(" ").map((n) => n[0]).join("")}</span>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                    </div>
                  </td>
                  <td className="muted">{s.email}</td>
                  <td><span className={`pill ${s.status === "Active" ? "pill-active" : s.status === "Trial" ? "pill-trial" : s.status === "Paused" ? "pill-paused" : s.status === "Overdue" ? "pill-cancelled" : s.status === "Cancelled" ? "pill-cancelled" : "pill-new"}`}>{s.status}</span></td>
                  <td>{s.lessons}</td>
                  <td className="muted">{s.lastActivity}</td>
                  <td className="muted">{s.teacher}</td>
                  <td><button className="btn-ghost" style={{ padding: 6 }}><Icon name="moreHorizontal" size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "instructors" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Students</th>
                <th>Hours</th>
                <th>Sessions</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {m.instructors.map((inst) => (
                <tr key={inst.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="avatar avatar-sm">{inst.name.split(" ").map((n) => n[0]).join("")}</span>
                      <span style={{ fontWeight: 600 }}>{inst.name}</span>
                    </div>
                  </td>
                  <td className="muted">{inst.email}</td>
                  <td>{inst.students}</td>
                  <td>{inst.hours}h</td>
                  <td>{inst.sessions}</td>
                  <td><span className={`pill ${inst.status === "Active" ? "pill-active" : "pill-new"}`}>{inst.status}</span></td>
                  <td className="muted">{inst.joined}</td>
                  <td><button className="btn-ghost" style={{ padding: 6 }}><Icon name="moreHorizontal" size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "permissions" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Super Admin</th>
                <th>Manager</th>
                <th>Sales</th>
                <th>Support</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: "students", label: "Students", desc: "View and edit student records" },
                { key: "instructors", label: "Instructors", desc: "View and edit instructor records, assign students" },
                { key: "billing", label: "Billing", desc: "View invoices, subscriptions, payments" },
                { key: "ai", label: "AI Manager", desc: "Edit prompts, models, parameters" },
                { key: "branding", label: "Branding", desc: "Edit tenant identity and theming" },
                { key: "scheduling", label: "Scheduling", desc: "Edit reschedule/cancel windows" },
                { key: "impersonate", label: "Impersonate", desc: "Sign in as another user" },
                { key: "financials", label: "Financials", desc: "View P&L, revenue, expenses" },
              ].map((p) => (
                <tr key={p.key}>
                  <td style={{ fontWeight: 600 }}>{p.label}</td>
                  <td className="muted">{p.desc}</td>
                  <td><span className="pill pill-active">Full</span></td>
                  <td><span className={["students", "instructors", "billing", "ai", "branding", "scheduling", "impersonate", "financials"].includes(p.key) ? "pill pill-active" : "pill pill-new"}>Granted</span></td>
                  <td><span className={["students", "billing", "financials"].includes(p.key) ? "pill pill-active" : "pill pill-new"}>—</span></td>
                  <td><span className={p.key === "students" ? "pill pill-trial" : p.key === "impersonate" ? "pill pill-active" : "pill pill-new"}>—</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
