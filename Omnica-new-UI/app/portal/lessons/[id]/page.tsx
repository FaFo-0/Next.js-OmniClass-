"use client"

import { useState, use } from "react"
import Link from "next/link"
import { Icon } from "@/components/shared/icons"
import { MOCK } from "@/lib/mock-data"

export default function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const lesson = MOCK.lessons.find((l) => l.id === Number(id)) || MOCK.lessons[0]
  const vocab = MOCK.vocabulary.filter((v) => v.lessonId === lesson.id)
  const flashcards = MOCK.flashcards.slice(0, 3)
  const [flippedIdx, setFlippedIdx] = useState<number | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)

  const summary =
    "In this lesson we explored the language of business negotiation, focusing on the verb 'leverage' and the noun 'concession'. We practiced softening phrases like 'Would you consider...' and discussed the difference between a compromise — the agreement itself — and concessions, which are the things each side gives up. We also covered stakeholder dynamics and how to frame counter-offers diplomatically."

  const quiz = [
    { q: "What does 'leverage' mean?", options: ["To negotiate harshly", "To use something to maximum advantage", "To compromise", "To refuse an offer"], correct: 1 },
    { q: "A concession is...", options: ["The final agreement", "Something given up to reach an agreement", "A type of negotiation", "A formal contract"], correct: 1 },
    { q: "Which is a softening phrase?", options: ["'You must agree'", "'Would you consider...'", "'I demand'", "'No way'"], correct: 1 },
  ]

  const speak = (text: string) => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = "en-US"
      window.speechSynthesis.speak(u)
    }
  }

  return (
    <div>
      <Link href="/portal/lessons" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        <Icon name="chevronLeft" size={14} /> Back to lessons
      </Link>

      {/* Header */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h1 className="h1" style={{ margin: 0 }}>{lesson.title}</h1>
            <div className="body" style={{ marginTop: 6 }}>{lesson.date} · {lesson.teacher} · {lesson.duration}</div>
          </div>
          <button className="btn btn-secondary"><Icon name="play" size={14} /> Play audio</button>
        </div>
      </div>

      {/* Summary */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkle" size={16} stroke="var(--omnic-tenant-primary)" /> Summary
        </div>
        <p className="body" style={{ margin: 0, color: "var(--omnic-gray-700)" }}>
          {summaryExpanded ? summary : summary.slice(0, 220) + "..."}
        </p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setSummaryExpanded(!summaryExpanded)}>
          {summaryExpanded ? "Show less" : "Read more"}
        </button>
      </div>

      {/* Vocabulary */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="bookmark" size={16} stroke="var(--omnic-tenant-primary)" /> Vocabulary <span className="muted body-sm">({vocab.length} words)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {vocab.map((v, i) => (
            <div key={i} style={{ padding: 12, background: "var(--omnic-gray-50)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => speak(v.word)} className="btn-ghost" style={{ padding: 4, borderRadius: 6 }}>
                <Icon name="speaker" size={14} />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{v.word}</div>
                <div className="body-sm">{v.translation}</div>
              </div>
              <span className="pill pill-new" style={{ fontSize: 10 }}>{v.pos}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flashcards preview */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="brain" size={16} stroke="var(--omnic-tenant-primary)" /> Flashcards
          </div>
          <Link href="/portal/study" className="btn btn-ghost btn-sm">Study all <Icon name="chevronRight" size={14} /></Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {flashcards.map((f, i) => (
            <div key={f.id} onClick={() => setFlippedIdx(flippedIdx === i ? null : i)}
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

      {/* Quiz */}
      <div className="card" style={{ padding: 24 }}>
        <div className="h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="target" size={16} stroke="var(--omnic-tenant-primary)" /> Comprehension Quiz
        </div>
        {quiz.map((q, qi) => (
          <div key={qi} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)", marginBottom: 8 }}>{qi + 1}. {q.q}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {q.options.map((opt, oi) => {
                let cls = "quiz-option"
                if (quizSubmitted) {
                  if (oi === q.correct) cls += " quiz-option-correct"
                  else if (quizAnswers[qi] === oi) cls += " quiz-option-wrong"
                } else if (quizAnswers[qi] === oi) cls += " quiz-option-selected"
                return (
                  <div key={oi} className={cls} onClick={() => !quizSubmitted && setQuizAnswers({ ...quizAnswers, [qi]: oi })}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--omnic-gray-500)" }}>{String.fromCharCode(65 + oi)}</span>
                    {opt}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {!quizSubmitted ? (
          <button className="btn btn-tenant" onClick={() => setQuizSubmitted(true)}>Submit answers</button>
        ) : (
          <div style={{ padding: 14, background: "var(--omnic-tenant-primary-soft)", borderRadius: 8, color: "var(--omnic-tenant-primary)", fontWeight: 600 }}>
            <Icon name="check" size={14} /> You scored {Object.entries(quizAnswers).filter(([qi, oi]) => quiz[Number(qi)]?.correct === oi).length}/{quiz.length}
          </div>
        )}
      </div>
    </div>
  )
}
