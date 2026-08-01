"use client";

// Library index. Opening a material routes to /student/library/[id], which
// renders the SAME ReadingView the teacher uses — one reading surface, so a
// text read alone behaves exactly like one read in a lesson.

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { MaterialCard } from "@/components/library/MaterialCard";

export default function LibraryPage() {
  const [filter, setFilter] = useState("all");
  const materials = useQuery(api.library.listPublished);
  const isLoading = materials === undefined;
  const items = (materials ?? []).filter((b: any) => filter === "all" || b.levelCEFR === filter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Library</h1>
          <div className="body" style={{ marginTop: 4 }}>Read assigned books and articles. Tap any word to look it up and save to flashcards.</div>
        </div>
      </div>

      <div style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { value: "all", label: "All" },
          { value: "A2", label: "A2 — Elementary" },
          { value: "B1", label: "B1 — Intermediate" },
          { value: "B2", label: "B2 — Upper Int." },
          { value: "C1", label: "C1 — Advanced" },
        ].map((c) => (
          <button key={c.value} className="chip" onClick={() => setFilter(c.value)}
            style={filter === c.value ? { background: "var(--brand-purple)", color: "#FFFFFF", borderColor: "var(--brand-purple)", boxShadow: "0 2px 10px rgba(103,22,164,0.25)" } : {}}>
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ overflow: "hidden" }}>
            <div className="skel" style={{ height: 160, borderRadius: 0 }} />
            <div style={{ padding: 14 }}>
              <div className="skel" style={{ height: 14, width: "70%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 12, width: "40%" }} />
            </div>
          </div>
        ))}
        {!isLoading && items.map((b: any) => (
          <MaterialCard key={b._id} material={b} href={`/student/library/${b._id}`} />
        ))}
        {!isLoading && items.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center", gridColumn: "1 / -1" }}>
            <Icon name="layers" size={48} stroke="var(--omnic-gray-300)" />
            <div className="body" style={{ marginTop: 12 }}>No library materials yet. An admin can add them.</div>
          </div>
        )}
      </div>
    </div>
  );
}
