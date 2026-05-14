"use client";

// I.3 — Standalone reading window for screen-share into Google Meet.
// Reads ?lessonId=… (to find the active student) and ?materialId=…
// (the library item to render). If no materialId yet, shows a picker.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { ReadingView } from "@/components/library/ReadingView";

export default function ReadingSharePage() {
  const params = useSearchParams();
  const lessonId = params.get("lessonId") as Id<"lessons"> | null;
  const materialIdParam = params.get("materialId");
  const [materialId, setMaterialId] = useState<Id<"libraryMaterials"> | null>(
    materialIdParam ? (materialIdParam as Id<"libraryMaterials">) : null
  );

  const lesson = useQuery(
    api.lessons.get,
    lessonId ? { id: lessonId } : "skip"
  );
  const materials = useQuery(api.library.listPublished);
  const material = useQuery(
    api.library.get,
    materialId ? { id: materialId } : "skip"
  );

  if (lessonId && lesson === undefined) {
    return (
      <div style={fullCenter}>
        <p>Loading lesson…</p>
      </div>
    );
  }

  if (!materialId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#FFF9E6",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
            Pick a reading
          </h1>
          <p style={{ color: "#52525B", marginBottom: 24 }}>
            Choose a library material to display. This window is meant for
            screen-sharing — the student watches you read.
          </p>
          {materials === undefined && <p>Loading…</p>}
          {materials && materials.length === 0 && (
            <p style={{ color: "#52525B" }}>
              No library materials yet. Ask the admin to upload one.
            </p>
          )}
          {materials && materials.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {materials.map((m: any) => (
                <button
                  key={m._id}
                  onClick={() =>
                    setMaterialId(m._id as Id<"libraryMaterials">)
                  }
                  className="card"
                  style={{
                    padding: 16,
                    textAlign: "left",
                    cursor: "pointer",
                    border: "1px solid rgba(103,22,164,0.1)",
                    background: "white",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {m.title}
                  </div>
                  {m.description && (
                    <div style={{ fontSize: 13, color: "#52525B" }}>
                      {m.description}
                    </div>
                  )}
                  {m.levelCEFR && (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 10,
                        padding: "2px 10px",
                        borderRadius: 999,
                        background: "rgba(103,22,164,0.08)",
                        color: "#6716A4",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      CEFR {m.levelCEFR}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (material === undefined) {
    return (
      <div style={fullCenter}>
        <p>Loading material…</p>
      </div>
    );
  }
  if (material === null) {
    return (
      <div style={fullCenter}>
        <p>Material not found.</p>
      </div>
    );
  }

  const studentId = lesson?.studentId;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FFF9E6",
      }}
    >
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid rgba(103,22,164,0.1)",
          background: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 700 }}>{material.title}</div>
        <button
          onClick={() => setMaterialId(null)}
          style={{
            padding: "6px 14px",
            border: "1px solid rgba(103,22,164,0.15)",
            background: "white",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Pick another
        </button>
      </div>
      <div style={{ padding: 24, maxWidth: 880, margin: "0 auto" }}>
        <ReadingView
          material={material}
          mode={studentId ? "live-teach" : "self-study"}
          activeStudentId={studentId}
        />
      </div>
    </div>
  );
}

const fullCenter: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#FFF9E6",
  textAlign: "center",
  fontSize: 18,
  color: "#52525B",
};
