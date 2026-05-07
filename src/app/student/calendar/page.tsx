"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function StudentCalendarPage() {
  const [view, setView] = useState("week");
  const events = useQuery(api.schedule.listForStudent, {}) ?? [];

  const now = new Date();
  const upcoming = events
    .filter((e) => e.status === "scheduled" && new Date(`${e.date}T${e.startTime}`) > now)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {upcoming.length} upcoming session{upcoming.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm">Today</button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronLeft" size={14} /></button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronRight" size={14} /></button>
          <div className="h3" style={{ marginLeft: 8 }}>May 2026</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["day", "week", "month"].map((v) => (
            <button key={v} className="chip" onClick={() => setView(v)}
              style={view === v ? { background: "var(--brand-purple)", color: "#FFFFFF", borderColor: "var(--brand-purple)", boxShadow: "0 2px 10px rgba(103,22,164,0.25)" } : {}}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming events */}
      {upcoming.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          {upcoming.map((e) => (
            <div key={e._id} className="lesson-row">
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="calendar" size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{e.title}</div>
                <div className="body-sm" style={{ marginTop: 2 }}>{e.date} · {e.startTime} — {e.endTime}</div>
              </div>
              <span className="pill pill-tenant">{e.type}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--omnic-tenant-primary-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
              <Icon name="calendar" size={44} stroke="var(--omnic-tenant-primary)" />
            </div>
            <h3 className="h3">No upcoming sessions</h3>
            <div className="body" style={{ marginTop: 4 }}>Your teacher will schedule lessons here.</div>
          </div>
        </div>
      )}

      {/* View content */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <Icon name="calendar" size={44} stroke="var(--omnic-tenant-primary)" />
          <h3 className="h3" style={{ marginTop: 12 }}>Week Calendar View</h3>
          <div className="body" style={{ marginTop: 4 }}>
            Full calendar with {view} view and Google-style time grid coming soon.
          </div>
        </div>
      </div>
    </div>
  );
}
