"use client";

import { useState } from "react";
import { Icon } from "@/components/shared/icons";

export default function StudentCalendarPage() {
  const [view, setView] = useState("week");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>Apr 26 — May 2, 2026</div>
        </div>
        <button className="btn btn-secondary"><Icon name="external" size={14} /> Sync (.ics)</button>
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

      {/* View content */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--omnic-tenant-primary-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Icon name="calendar" size={44} stroke="var(--omnic-tenant-primary)" />
          </div>
          <h3 className="h3">Week Calendar View</h3>
          <div className="body" style={{ marginTop: 4 }}>
            Full calendar with {view} view and Google-style time grid. Events appear as colored blocks across the time grid.
          </div>
        </div>
      </div>
    </div>
  );
}
