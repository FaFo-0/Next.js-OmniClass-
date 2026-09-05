"use client";

// Student library index — the unified works/units catalogue with a level
// filter. Opening a work routes to /student/library/work/[workId] (table of
// contents), then a unit renders in the shared ReadingView.

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";
import { WorkCard } from "@/components/library/WorkCard";

const LEVELS = [
  { value: "all", label: "All" },
  { value: "A1", label: "A1 — Beginner" },
  { value: "A2", label: "A2 — Elementary" },
  { value: "B1", label: "B1 — Intermediate" },
  { value: "B2", label: "B2 — Upper Int." },
  { value: "C1", label: "C1 — Advanced" },
  { value: "C2", label: "C2 — Proficient" },
];

export default function LibraryPage() {
  const t = useTranslations("app.library");
  const [filter, setFilter] = useState("all");
  const works = useQuery(api.libraryWorks.listPublished);
  const isLoading = works === undefined;
  const items = (works ?? []).filter(
    (w) => filter === "all" || w.levelCEFR === filter
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>{t("title")}</h1>
          <div className="body" style={{ marginTop: 4 }}>{t("subtitleStudent")}</div>
        </div>
      </div>

      <div style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {LEVELS.map((c) => (
          <button key={c.value} className="chip" onClick={() => setFilter(c.value)}
            style={filter === c.value ? { background: "var(--brand-purple)", color: "#FFFFFF", borderColor: "var(--brand-purple)", boxShadow: "0 2px 10px rgba(103,22,164,0.25)" } : {}}>
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ overflow: "hidden" }}>
            <div className="skel" style={{ height: 140, borderRadius: 0 }} />
            <div style={{ padding: 14 }}>
              <div className="skel" style={{ height: 14, width: "70%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 12, width: "40%" }} />
            </div>
          </div>
        ))}
        {!isLoading && items.map((w) => (
          <WorkCard key={w._id} work={w} href={`/student/library/work/${w._id}`} />
        ))}
        {!isLoading && items.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center", gridColumn: "1 / -1" }}>
            <Icon name="layers" size={48} stroke="var(--omnic-gray-300)" />
            <div className="body" style={{ marginTop: 12 }}>{t("emptyStudent")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
