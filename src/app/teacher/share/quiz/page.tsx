"use client";

// I.3 — Standalone "Quiz" window opened by the live lesson page for
// screen-share into Google Meet. Pure presentation; no transcript or
// teacher controls visible. Renders the most recent quiz draft for
// the given lesson with one large question at a time.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { writeShareWindowState } from "@/lib/shareWindowState";

export default function QuizSharePage() {
  const params = useSearchParams();
  const lessonId = params.get("lessonId") as Id<"lessons"> | null;
  const drafts = useQuery(
    api.inLessonQuiz.listDraftsForLesson,
    lessonId ? { lessonId } : "skip"
  );
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
  // The live room passes the question the teacher was on (?q=N) when it opens
  // this window again, so a stopped presentation comes back to the same place.
  const [idx, setIdx] = useState(() => {
    const question = Number(params.get("q"));
    return Number.isFinite(question) && question > 0 ? Math.floor(question) : 0;
  });

  useEffect(() => {
    if (!lessonId) return;
    writeShareWindowState(lessonId, { kind: "quiz", questionIndex: idx });
  }, [lessonId, idx]);

  // Keyboard nav: space toggles reveal, arrows navigate.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIdx((i) => i + 1);
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setRevealedSet((prev) => {
          const next = new Set(prev);
          if (next.has(idx)) next.delete(idx);
          else next.add(idx);
          return next;
        });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [idx]);

  if (!lessonId) {
    return (
      <div style={fullCenter}>
        <p>Missing lessonId.</p>
      </div>
    );
  }
  if (!drafts) {
    return (
      <div style={fullCenter}>
        <p>Loading…</p>
      </div>
    );
  }
  if (drafts.length === 0) {
    return (
      <div style={fullCenter}>
        <p style={{ fontSize: 22, color: "var(--omnic-gray-600)" }}>
          No quizzes generated yet.
        </p>
      </div>
    );
  }

  const latest = drafts[0];
  const total = latest.questions.length;
  const safeIdx = Math.min(idx, total - 1);
  const q = latest.questions[safeIdx];
  const revealed = revealedSet.has(safeIdx);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--app-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 32px",
          borderBottom: "1px solid rgba(103,22,164,0.1)",
          background: "var(--card-bg)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-600)" }}>
          Live quiz · Question {safeIdx + 1} of {total}
        </div>
        <div style={{ fontSize: 12, color: "var(--omnic-gray-400)" }}>
          ← → to navigate · Space to reveal answer
        </div>
        <div style={{ fontSize: 12, color: "var(--omnic-gray-600)", maxWidth: 360 }}>
          Stopped presenting by mistake? Present this window again — it comes back
          to this question.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px 64px",
          maxWidth: 1100,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: "var(--omnic-gray-900)",
            lineHeight: 1.25,
            marginBottom: 40,
          }}
        >
          {q.question}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {q.options.map((opt: string, oi: number) => {
            const isCorrect = oi === q.correctIndex;
            return (
              <div
                key={oi}
                style={{
                  padding: "20px 28px",
                  borderRadius: 14,
                  fontSize: 24,
                  background:
                    revealed && isCorrect ? "var(--status-active-bg)" : "var(--card-bg)",
                  border:
                    revealed && isCorrect
                      ? "2px solid var(--status-active)"
                      : "1px solid rgba(103,22,164,0.1)",
                  color: revealed && isCorrect ? "var(--feedback-success)" : "var(--omnic-gray-900)",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--omnic-gray-500)",
                    minWidth: 24,
                  }}
                >
                  {String.fromCharCode(65 + oi)}
                </span>
                <span>{opt}</span>
                {revealed && isCorrect && (
                  <span style={{ marginInlineStart: "auto", fontSize: 18 }}>
                    ✓ Correct
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          padding: "16px 32px",
          borderTop: "1px solid rgba(103,22,164,0.1)",
          background: "var(--card-bg)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={safeIdx === 0}
          style={navBtn(safeIdx === 0)}
        >
          ← Previous
        </button>
        <button
          onClick={() =>
            setRevealedSet((prev) => {
              const next = new Set(prev);
              if (next.has(safeIdx)) next.delete(safeIdx);
              else next.add(safeIdx);
              return next;
            })
          }
          style={revealBtn}
        >
          {revealed ? "Hide answer" : "Reveal answer"}
        </button>
        <button
          onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
          disabled={safeIdx >= total - 1}
          style={navBtn(safeIdx >= total - 1)}
        >
          Next →
        </button>
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

const navBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "10px 18px",
  borderRadius: 8,
  background: disabled ? "var(--omnic-gray-100)" : "var(--card-bg)",
  border: "1px solid rgba(103,22,164,0.15)",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 15,
  fontWeight: 500,
  color: disabled ? "var(--omnic-gray-400)" : "var(--omnic-gray-700)",
});

const revealBtn: React.CSSProperties = {
  padding: "10px 22px",
  borderRadius: 8,
  background: "var(--primary)",
  color: "white",
  border: "none",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 600,
};
