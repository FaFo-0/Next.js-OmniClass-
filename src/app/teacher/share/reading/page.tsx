"use client";

// I.3 — Standalone reading window for screen-share into Google Meet.
// Reads ?lessonId=… (to find the active student), ?workId=… and ?unitId=…
// (the reading to render). No workId → picker; workId without unitId → the
// work's table of contents.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { ReadingView } from "@/components/library/ReadingView";

export default function ReadingSharePage() {
  const params = useSearchParams();
  const lessonId = params.get("lessonId") as Id<"lessons"> | null;
  const workIdParam = params.get("workId");
  const unitIdParam = params.get("unitId");
  const [workId, setWorkId] = useState<Id<"libraryWorks"> | null>(
    workIdParam ? (workIdParam as Id<"libraryWorks">) : null
  );
  const [unitId, setUnitId] = useState<Id<"libraryUnits"> | null>(
    unitIdParam ? (unitIdParam as Id<"libraryUnits">) : null
  );

  const lesson = useQuery(
    api.lessons.get,
    lessonId ? { id: lessonId } : "skip"
  );
  const works = useQuery(api.libraryWorks.listPublished);
  const workData = useQuery(
    api.libraryWorks.getWork,
    workId ? { id: workId } : "skip"
  );
  const unitData = useQuery(
    api.libraryWorks.getUnit,
    unitId ? { id: unitId } : "skip"
  );

  if (lessonId && lesson === undefined) {
    return (
      <div style={fullCenter}>
        <p>Loading lesson…</p>
      </div>
    );
  }

  if (!workId) {
    return (
      <div style={{ minHeight: "100vh", background: "#FFF9E6", padding: 32 }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
            Pick a reading
          </h1>
          <p style={{ color: "#52525B", marginBottom: 24 }}>
            Choose a library reading to display. This window is meant for
            screen-sharing — the student watches you read.
          </p>
          {works === undefined && <p>Loading…</p>}
          {works && works.length === 0 && (
            <p style={{ color: "#52525B" }}>
              No readings yet. Ask the admin to add one.
            </p>
          )}
          {works && works.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {works.map((w) => (
                <button
                  key={w._id}
                  onClick={() => setWorkId(w._id)}
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
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{w.title}</div>
                  {w.description && (
                    <div style={{ fontSize: 13, color: "#52525B" }}>{w.description}</div>
                  )}
                  {w.levelCEFR && (
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
                      CEFR {w.levelCEFR}
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

  if (workData === undefined) {
    return (
      <div style={fullCenter}>
        <p>Loading…</p>
      </div>
    );
  }
  if (workData === null) {
    return (
      <div style={fullCenter}>
        <p>Reading not found.</p>
      </div>
    );
  }
  const { work, units } = workData;

  // No unit chosen yet — show the table of contents.
  if (!unitId) {
    return (
      <div style={{ minHeight: "100vh", background: "#FFF9E6", padding: 32 }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>{work.title}</h1>
            <button
              onClick={() => {
                setUnitId(null);
                setWorkId(null);
              }}
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
          {units.map((u) => (
            <button
              key={u._id}
              onClick={() => setUnitId(u._id)}
              className="card"
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 16px",
                marginBottom: 8,
                cursor: "pointer",
                border: "1px solid rgba(103,22,164,0.1)",
                background: "white",
                borderRadius: 10,
                textAlign: "left",
              }}
            >
              <span style={{ fontWeight: 600 }}>{u.title}</span>
              {u.estimatedReadMinutes && (
                <span style={{ fontSize: 12, color: "#52525B" }}>
                  {u.estimatedReadMinutes} min
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (unitData === undefined) {
    return (
      <div style={fullCenter}>
        <p>Loading…</p>
      </div>
    );
  }
  if (unitData === null) {
    return (
      <div style={fullCenter}>
        <p>Reading not found.</p>
      </div>
    );
  }

  const studentId = lesson?.studentId;

  return (
    <div style={{ minHeight: "100vh", background: "#FFF9E6" }}>
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
        <div style={{ fontWeight: 700 }}>{work.title} — {unitData.unit.title}</div>
        <button
          onClick={() => setUnitId(null)}
          style={{
            padding: "6px 14px",
            border: "1px solid rgba(103,22,164,0.15)",
            background: "white",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Contents
        </button>
      </div>
      <div style={{ padding: 24, maxWidth: 880, margin: "0 auto" }}>
        <ReadingView
          work={unitData.work}
          unit={unitData.unit}
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
