"use client";

// Library index. Opening a material routes to /student/library/[id], which
// renders the SAME ReadingView the teacher uses — one reading surface, so a
// text read alone behaves exactly like one read in a lesson.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function LibraryPage() {
  const router = useRouter();
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
          <div key={b._id} className="card" style={{ overflow: "hidden", cursor: "pointer", transition: "transform 0.12s, box-shadow 0.12s" }}
            onClick={() => router.push(`/student/library/${b._id}`)}
            onMouseEnter={(e: any) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"; }}
            onMouseLeave={(e: any) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
            <div style={{ height: 160, background: "linear-gradient(135deg, var(--brand-purple), var(--brand-purple-hover))", display: "flex", alignItems: "flex-end", padding: 14, color: "white", position: "relative" }}>
              <div style={{ position: "absolute", top: 12, right: 12 }}>
                {b.levelCEFR && <span className="pill" style={{ background: "rgba(255,255,255,0.25)", color: "white", fontSize: 10, fontWeight: 700 }}>{b.levelCEFR}</span>}
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{b.kind ?? "Article"}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>{b.title}</div>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              {b.description && <div className="body-sm" style={{ marginBottom: 8 }}>{b.description}</div>}
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--omnic-gray-500)" }}>
                {b.estimatedReadMinutes && <span><Icon name="clock" size={11} /> {b.estimatedReadMinutes} min</span>}
                {b.topicTags && <span><Icon name="file" size={11} /> {b.topicTags.join(", ")}</span>}
              </div>
            </div>
          </div>
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
