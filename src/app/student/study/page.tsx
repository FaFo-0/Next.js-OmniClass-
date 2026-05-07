"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function StudentStudyPage() {
  const lessons = useQuery(api.lessons.listPublishedForStudent, {}) ?? [];
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  // Collect flashcards from lessons as study cards
  const cards: any[] = lessons.flatMap((l: any) => []); // TODO: wire to lessonContent.listFlashcards per lesson

  if (!started) {
    const total = 0; // TODO: count due cards from SRS
    const dueByDeck = lessons.slice(0, 3).map((l: any, i: number) => ({
      name: l.title,
      count: 0, // TODO: count flashcards per lesson
      color: i === 0 ? "#7C3AED" : i === 1 ? "#0891B2" : "#F59E0B",
    }));

    return (
      <div style={{ maxWidth: 600, margin: "40px auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--omnic-tenant-primary-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Icon name="brain" size={44} stroke="var(--omnic-tenant-primary)" />
          </div>
          <h1 className="h1" style={{ marginBottom: 6 }}>Ready to study?</h1>
          <div className="body">{total} cards are due across {dueByDeck.length} decks. Spaced-repetition keeps your hardest words coming back until they stick.</div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Decks with cards due</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dueByDeck.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--omnic-gray-200)", borderRadius: 8 }}>
                <div style={{ width: 6, height: 36, borderRadius: 3, background: d.color }} />
                <div style={{ flex: 1, fontWeight: 500, color: "var(--omnic-gray-900)" }}>{d.name}</div>
                <span className="pill pill-tenant">{d.count} due</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start", background: "var(--omnic-gray-50)" }}>
          <Icon name="info" size={18} stroke="var(--omnic-gray-600)" />
          <div className="body-sm">
            <b>How it works:</b> Tap a card to reveal the answer, then rate how well you knew it. Cards you find easy come back less often; cards you struggle with come back sooner.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn btn-tenant btn-lg" style={{ flex: 1 }} onClick={() => setStarted(true)}>
            <Icon name="play" size={16} /> Start studying — {total} cards
          </button>
          <Link href="/student/vocabulary" className="btn btn-secondary btn-lg">Browse words</Link>
        </div>
        <div className="body-sm" style={{ textAlign: "center", marginTop: 14 }}>
          🔥 Studying today extends your streak
        </div>
      </div>
    );
  }

  const rate = (key: string) => {
    setStats((s) => ({ ...s, [key]: s[key as keyof typeof s] + 1 }));
    setFlipped(false);
    if (idx + 1 >= cards.length) setDone(true);
    else setIdx(idx + 1);
  };

  if (done) {
    const reviewed = stats.again + stats.hard + stats.good + stats.easy;
    const accuracy = Math.round(((stats.good + stats.easy) / Math.max(reviewed, 1)) * 100);
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
        <div style={{ fontSize: 80, marginBottom: 12 }}>🎉</div>
        <h1 className="h1">Session complete!</h1>
        <div className="body" style={{ marginBottom: 24 }}>Great work today.</div>
        <div className="grid-3" style={{ marginBottom: 24, textAlign: "left" as const }}>
          <LocalMetricCard label="Cards reviewed" value={reviewed} icon="brain" />
          <LocalMetricCard label="Accuracy" value={accuracy + "%"} icon="target" />
          <LocalMetricCard label="Streak" value={0} icon="flame" accent="red" />
        </div>
        <Link href="/student" className="btn btn-tenant btn-lg">Back to dashboard</Link>
      </div>
    );
  }

  const card = cards[idx] || { front: "No cards", back: "No cards yet", pos: "", example: "", lesson: "" };
  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div className="h2">Study Flashcards</div>
          <div className="body-sm" style={{ marginTop: 2 }}>{cards.length - idx} cards remaining</div>
        </div>
        <select className="select" style={{ width: "auto" }}>
          <option>All Due</option>
        </select>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="body-sm">Card {idx + 1} of {cards.length}</span>
          <span className="body-sm">🔥 0-day streak</span>
        </div>
        <div className="progress"><div className="progress-fill" style={{ width: `${cards.length > 0 ? ((idx + 1) / cards.length) * 100 : 0}%` }} /></div>
      </div>

      <div className="flashcard-container" style={{ marginBottom: 24 }}>
        <div className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
          <div className="flashcard-face">
            <div className="label" style={{ marginBottom: 8 }}>{card.pos}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{card.front}</div>
            <div className="body-sm" style={{ marginTop: 16 }}>Tap to reveal definition</div>
          </div>
          <div className="flashcard-face flashcard-back">
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--omnic-gray-900)", marginBottom: 8 }}>{card.back}</div>
            <div style={{ fontSize: 14, fontStyle: "italic", color: "var(--omnic-gray-600)", marginBottom: 12, textAlign: "center" as const }}>
              &ldquo;{card.example}&rdquo;
            </div>
            <div className="body-sm" style={{ color: "var(--omnic-gray-400)" }}>From: {card.lesson}</div>
          </div>
        </div>
      </div>

      {flipped ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="rating-btn" style={{ background: "#DC2626" }} onClick={() => rate("again")}><span>Again</span><span className="key">1 · 1m</span></button>
          <button className="rating-btn" style={{ background: "#EA580C" }} onClick={() => rate("hard")}><span>Hard</span><span className="key">2 · 6m</span></button>
          <button className="rating-btn" style={{ background: "#16A34A" }} onClick={() => rate("good")}><span>Good</span><span className="key">3 · 10m</span></button>
          <button className="rating-btn" style={{ background: "#2563EB" }} onClick={() => rate("easy")}><span>Easy</span><span className="key">4 · 4d</span></button>
        </div>
      ) : (
        <button className="btn btn-secondary btn-block btn-lg" onClick={() => setFlipped(true)}>Reveal answer</button>
      )}
    </div>
  );
}

function LocalMetricCard({ icon, label, value, accent }: { icon: string; label: string; value: number | string; accent?: string }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: accent === "red" ? "var(--omnic-red-tint)" : "var(--omnic-tenant-primary-soft)", color: accent === "red" ? "var(--omnic-red)" : "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 14, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}
