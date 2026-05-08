"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function AdminCalendarPage() {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const events = useQuery(api.schedule.listForOrg, {}) ?? [];
  const pending = useQuery(api.schedule.listPendingReschedules, {}) ?? [];
  const unaccounted = useQuery(api.schedule.listPendingUnaccounted, {}) ?? [];

  const upcoming = events
    .filter((e: any) => e.status === "scheduled")
    .sort((a: any, b: any) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
    )
    .slice(0, 8);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {events.length} total event{events.length === 1 ? "" : "s"} · {pending.length} pending reschedule{pending.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/settings#scheduling" className="btn btn-tenant">
            <Icon name="settings" size={14} /> Edit scheduling rules
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm">Today</button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronLeft" size={14} /></button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronRight" size={14} /></button>
          <div className="h3" style={{ marginLeft: 8 }}>
            {new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              className="chip"
              onClick={() => setView(v)}
              style={view === v ? { background: "var(--brand-purple)", color: "#FFFFFF", borderColor: "var(--brand-purple)", boxShadow: "0 2px 10px rgba(103,22,164,0.25)" } : {}}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--omnic-gray-100)" }}>
          <div className="h3">Upcoming sessions</div>
        </div>
        {upcoming.length === 0 && (
          <div className="body-sm" style={{ padding: "24px 20px", textAlign: "center" }}>
            No upcoming sessions.
          </div>
        )}
        {upcoming.map((e: any) => (
          <div key={e._id} className="lesson-row">
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="calendar" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{e.title}</div>
              <div className="body-sm" style={{ marginTop: 2 }}>
                {e.date} · {e.startTime} — {e.endTime} · {e.type}
              </div>
            </div>
            <span className="pill pill-tenant">{e.status}</span>
          </div>
        ))}
      </div>

      {unaccounted.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "var(--status-cancelled)" }}>
          <div className="h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="alert" size={16} stroke="var(--omnic-red)" /> Unaccounted-for sessions
          </div>
          <div className="body-sm">
            {unaccounted.length} session{unaccounted.length === 1 ? "" : "s"} ran past start time without status updates. Resolve via the session detail page.
          </div>
        </div>
      )}
    </div>
  );
}
