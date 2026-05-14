"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { Icon } from "@/components/shared/icons";
import { HomeworkEditor } from "@/components/homework/HomeworkEditor";

export default function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const lessonId = id as Id<"lessons">;
  const lesson = useQuery(api.lessons.get, { id: lessonId });
  const vocab = useQuery(api.lessonContent.listVocab, { lessonId }) ?? [];
  const flashcards = useQuery(api.lessonContent.listFlashcards, { lessonId }) ?? [];
  const quizItems = useQuery(api.lessonContent.listQuiz, { lessonId }) ?? [];
  const recordQuizAttempt = useMutation(api.study.recordQuizAttempt);
  const [flippedIdx, setFlippedIdx] = useState<number | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  if (lesson === undefined) return <div style={{ padding: 24 }} className="body">Loading…</div>;
  if (lesson === null) return <div style={{ padding: 24 }} className="body">Lesson not found.</div>;

  const summary = lesson.summary || "No summary available yet for this lesson.";

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div>
      <Link href="/student/lessons" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        <Icon name="chevronLeft" size={14} /> Back to lessons
      </Link>

      {/* Header */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h1 className="h1" style={{ margin: 0 }}>{lesson.title}</h1>
            <div className="body" style={{ marginTop: 6 }}>
              {new Date(lesson.createdAt).toLocaleDateString()} · {Math.round((lesson.durationSeconds ?? 0) / 60)} min
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkle" size={16} stroke="var(--omnic-tenant-primary)" /> Summary
        </div>
        <p className="body" style={{ margin: 0, color: "var(--omnic-gray-700)" }}>
          {summaryExpanded ? summary : summary.slice(0, 220) + (summary.length > 220 ? "..." : "")}
        </p>
        {summary.length > 220 && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setSummaryExpanded(!summaryExpanded)}>
            {summaryExpanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      {/* Vocabulary */}
      {vocab.length > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="bookmark" size={16} stroke="var(--omnic-tenant-primary)" /> Vocabulary <span className="muted body-sm">({vocab.length} words)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {vocab.map((v: any, i: number) => (
              <div key={v._id ?? i} style={{ padding: 12, background: "var(--omnic-gray-50)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => speak(v.word)} className="btn-ghost" style={{ padding: 4, borderRadius: 6 }}>
                  <Icon name="speaker" size={14} />
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{v.word}</div>
                  <div className="body-sm">{v.translation} ({v.translationLocale})</div>
                </div>
                <span className="pill pill-new" style={{ fontSize: 10 }}>{v.partOfSpeech}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flashcards preview */}
      {flashcards.length > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="brain" size={16} stroke="var(--omnic-tenant-primary)" /> Flashcards
            </div>
            <Link href="/student/study" className="btn btn-ghost btn-sm">Study all <Icon name="chevronRight" size={14} /></Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {flashcards.slice(0, 3).map((f: any, i: number) => (
              <div key={f._id ?? i} onClick={() => setFlippedIdx(flippedIdx === i ? null : i)}
                style={{
                  height: 130, padding: 16, borderRadius: 8, border: "1px solid var(--omnic-gray-200)",
                  background: flippedIdx === i ? "var(--omnic-tenant-primary-soft)" : "white",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  textAlign: "center", transition: "all 0.2s",
                }}>
                {flippedIdx === i ? (
                  <div className="body-sm" style={{ color: "var(--omnic-gray-700)" }}>{f.back}</div>
                ) : (
                  <div style={{ fontSize: 18, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{f.front}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz */}
      {quizItems.length > 0 && (
        <div className="card" style={{ padding: 24 }}>
          <div className="h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="target" size={16} stroke="var(--omnic-tenant-primary)" /> Comprehension Quiz
          </div>
          {quizItems.map((q: any, qi: number) => (
            <div key={q._id ?? qi} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)", marginBottom: 8 }}>{qi + 1}. {q.question}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(q.options as string[]).map((opt: string, oi: number) => {
                  let cls = "quiz-option";
                  if (quizSubmitted) {
                    if (oi === q.correctIndex) cls += " quiz-option-correct";
                    else if (quizAnswers[qi] === oi) cls += " quiz-option-wrong";
                  } else if (quizAnswers[qi] === oi) cls += " quiz-option-selected";
                  return (
                    <div key={oi} className={cls} onClick={() => !quizSubmitted && setQuizAnswers({ ...quizAnswers, [qi]: oi })}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--omnic-gray-500)" }}>{String.fromCharCode(65 + oi)}</span>
                      {opt}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!quizSubmitted ? (
            <button
              className="btn btn-tenant"
              onClick={() => {
                const score = Object.entries(quizAnswers).filter(
                  ([qi, oi]) => quizItems[Number(qi)]?.correctIndex === oi
                ).length;
                recordQuizAttempt({
                  lessonId: lessonId as unknown as string,
                  score,
                  total: quizItems.length,
                }).catch((e) => console.error("recordQuizAttempt failed", e));
                setQuizSubmitted(true);
              }}
            >
              Submit answers
            </button>
          ) : (
            <div style={{ padding: 14, background: "var(--omnic-tenant-primary-soft)", borderRadius: 8, color: "var(--omnic-tenant-primary)", fontWeight: 600 }}>
              <Icon name="check" size={14} /> You scored {Object.entries(quizAnswers).filter(([qi, oi]) => quizItems[Number(qi)]?.correctIndex === oi).length}/{quizItems.length}
            </div>
          )}
        </div>
      )}

      {/* Phase J — Homework */}
      <StudentHomeworkSection lessonId={lessonId} />
    </div>
  );
}

function StudentHomeworkSection({ lessonId }: { lessonId: Id<"lessons"> }) {
  const list = useQuery(api.homework.listForLesson, { lessonId }) ?? [];
  const updateContent = useMutation(api.homework.updateContent);
  const submit = useMutation(api.homework.submit);
  const current = list[0];

  if (!current) return null;

  return (
    <div className="card" style={{ padding: 24, marginTop: 16 }}>
      <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="edit" size={16} stroke="var(--omnic-tenant-primary)" /> Homework
        <span className="pill pill-tenant" style={{ fontSize: 10 }}>{current.status}</span>
      </div>
      <HomeworkEditor
        contentJson={current.contentJson}
        mode={
          current.status === "draft"
            ? "readonly"
            : current.status === "reviewed"
              ? "readonly"
              : "student"
        }
        onChange={(json) => {
          if (current.status === "reviewed") return;
          updateContent({ id: current._id, contentJson: json }).catch((e) =>
            console.error(e)
          );
        }}
      />
      {current.status === "in_progress" || current.status === "assigned" ? (
        <button
          className="btn btn-tenant"
          style={{ marginTop: 12 }}
          onClick={async () => {
            try {
              await submit({ id: current._id });
            } catch (e) {
              console.error(e);
            }
          }}
        >
          Submit homework
        </button>
      ) : null}
      {current.status === "reviewed" && current.teacherComment && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: "var(--status-active-bg)",
            color: "var(--status-active)",
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <strong>Teacher feedback:</strong> {current.teacherComment}
        </div>
      )}
    </div>
  );
}
