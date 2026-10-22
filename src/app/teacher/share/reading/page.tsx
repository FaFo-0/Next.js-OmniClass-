"use client";

// I.3 — Standalone reading window for screen-share into Google Meet.
// Reads ?lessonId=… (to find the active student), ?workId=… and ?unitId=…
// (the reading to render). No workId → picker; workId without unitId → the
// work's table of contents.

import { LibraryFilters, filterLibrary, initialLibraryFilter } from "@/components/library/LibraryFilters";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { ReadingView } from "@/components/library/ReadingView";
import { readShareWindowState, writeShareWindowState } from "@/lib/shareWindowState";

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

  // Where this window was left, for the scroll position only — the chapter comes
  // in the URL when the live room re-opens the window, so nothing here needs to
  // become React state after mount.
  const scrollRatioRef = useRef(0);
  const scrollRestoredForRef = useRef<string | null>(null);

  // Remember the chapter and how far down it was read, so the live room can bring
  // this window back to the same place after a stopped presentation.
  useEffect(() => {
    if (!lessonId || (!workId && !unitId)) return;
    const persist = () =>
      writeShareWindowState(lessonId, {
        kind: "reading",
        workId: workId ?? undefined,
        unitId: unitId ?? undefined,
        scrollRatio: scrollRatioRef.current,
      });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollRatioRef.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (timer) clearTimeout(timer);
      timer = setTimeout(persist, 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
      if (timer) clearTimeout(timer);
      persist();
    };
  }, [lessonId, workId, unitId]);

  const lesson = useQuery(
    api.lessons.get,
    lessonId ? { id: lessonId } : "skip"
  );
  const works = useQuery(api.libraryWorks.listPublished);
  const [filter, setFilter] = useState(initialLibraryFilter);
  const items = filterLibrary(works ?? [], filter);
  const workData = useQuery(
    api.libraryWorks.getWork,
    workId ? { id: workId } : "skip"
  );
  const unitData = useQuery(
    api.libraryWorks.getUnit,
    unitId ? { id: unitId } : "skip"
  );
  const studentId = lesson?.studentId;
  const learnerLocale = useQuery(
    api.users.getLearnerLocale,
    studentId ? { studentId } : "skip"
  );

  // Put the reader back where it was. Retried because the shared reader keeps
  // growing after first paint (chapter text, then prepared vocabulary). A chapter
  // that was just chosen — or one this window has not seen before — starts at the
  // top, so only a stored ratio for THIS unit is applied.
  useEffect(() => {
    if (!unitId || !unitData || scrollRestoredForRef.current === unitId) return;
    scrollRestoredForRef.current = unitId;
    const saved = lessonId ? readShareWindowState("reading", lessonId) : null;
    const target = saved && saved.unitId === unitId ? saved.scrollRatio ?? 0 : 0;
    scrollRatioRef.current = target;
    if (target <= 0) return;
    const attempt = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      window.scrollTo(0, target * max);
    };
    const frame = requestAnimationFrame(attempt);
    const late = [setTimeout(attempt, 600), setTimeout(attempt, 1500)];
    return () => {
      cancelAnimationFrame(frame);
      late.forEach(clearTimeout);
    };
  }, [unitId, unitData, lessonId]);

  if (lessonId && lesson === undefined) {
    return (
      <div style={fullCenter}>
        <p>Loading lesson…</p>
      </div>
    );
  }

  if (!workId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--app-bg)", padding: "clamp(16px, 4vw, 32px)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
            Pick a reading
          </h1>
          <p style={{ color: "var(--omnic-gray-600)", marginBottom: 24 }}>
            Choose a library reading to display. This window is meant for
            screen-sharing — the student watches you read. If you stop sharing by
            mistake, present this window again in Meet: it comes back where you
            left off.
          </p>
          <LibraryFilters works={works ?? []} value={filter} onChange={setFilter} />
          {works === undefined && <p>Loading…</p>}
          {works && works.length === 0 && (
            <p style={{ color: "var(--omnic-gray-600)" }}>
              No readings yet. Ask the admin to add one.
            </p>
          )}
          {works && works.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
                gap: 16,
              }}
            >
              {items.map((w) => (
                <button
                  key={w._id}
                  onClick={() => setWorkId(w._id)}
                  className="card"
                  style={{
                    padding: 16,
                    textAlign: "left",
                    cursor: "pointer",
                    border: "1px solid rgba(103,22,164,0.1)",
                    background: "var(--card-bg)",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6, overflowWrap: "anywhere" }}>{w.title}</div>
                  {w.description && (
                    <div style={{ fontSize: 13, color: "var(--omnic-gray-600)", overflowWrap: "anywhere" }}>{w.description}</div>
                  )}
                  {w.levelCEFR && (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 10,
                        padding: "2px 10px",
                        borderRadius: 999,
                        background: "rgba(103,22,164,0.08)",
                        color: "var(--brand-purple)",
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
      <div style={{ minHeight: "100vh", background: "var(--app-bg)", padding: "clamp(16px, 4vw, 32px)" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h1 style={{ fontSize: 24, fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" }}>{work.title}</h1>
            <button
              onClick={() => {
                setUnitId(null);
                setWorkId(null);
              }}
              style={{
                padding: "6px 14px",
                border: "1px solid rgba(103,22,164,0.15)",
                background: "var(--card-bg)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Pick another
            </button>
          </div>
          {work.externalUrl && <a className="btn btn-secondary mb-4" href={work.externalUrl} target="_blank" rel="noreferrer">Open external resource</a>}
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
                background: "var(--card-bg)",
                borderRadius: 10,
                textAlign: "left",
              }}
            >
              <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{u.title}</span>
              {u.estimatedReadMinutes && (
                <span style={{ fontSize: 12, color: "var(--omnic-gray-600)" }}>
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


  return (
    <div style={{ minHeight: "100vh", background: "var(--app-bg)" }}>
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid rgba(103,22,164,0.1)",
          background: "var(--card-bg)",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" }}>{work.title} — {unitData.unit.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--omnic-gray-600)", maxWidth: 420 }}>
            Present this window in Meet. Stopped by mistake? Present it again — it
            returns to this exact place.
          </span>
          <button
            onClick={() => setUnitId(null)}
            style={{
              padding: "6px 14px",
              border: "1px solid rgba(103,22,164,0.15)",
              background: "var(--card-bg)",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Contents
          </button>
        </div>
      </div>
      <div style={{ padding: "clamp(16px, 4vw, 24px)", maxWidth: 880, margin: "0 auto" }}>
        <ReadingView
          navigation={false}
          work={unitData.work}
          unit={unitData.unit}
          mode={studentId ? "live-teach" : "self-study"}
          activeStudentId={studentId}
          learnerLocale={learnerLocale}
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
  background: "var(--app-bg)",
  textAlign: "center",
  fontSize: 18,
  color: "var(--omnic-gray-600)",
};
