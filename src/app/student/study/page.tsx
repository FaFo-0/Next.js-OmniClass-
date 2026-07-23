"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function StudentStudyPage() {
  const dueCards = useQuery(api.srs.listDueCards, {}) ?? [];
  const homework = useQuery(api.homework.listForStudent, {}) ?? [];
  const readings = useQuery(api.library.listPublished, {}) ?? [];
  const recordReview = useMutation(api.srs.recordReview);
  const recordSession = useMutation(api.study.recordSession);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  // Session queue — a snapshot of the due cards taken at Start, so cards
  // rated "Again" can be re-appended and drilled again in the same sitting
  // instead of vanishing until tomorrow.
  const [queue, setQueue] = useState<any[]>([]);
  const startedAtRef = useRef<string | null>(null);

  const cards = dueCards;

  if (!started) {
    const total = cards.length;

    // One place for everything the student should work on (the learning
    // loop was fragmented: homework hid behind published lessons only).
    const openHomework = homework.filter(
      (h: any) => h.status === "assigned" || h.status === "in_progress"
    );
    const awaitingReview = homework.filter((h: any) => h.status === "submitted");
    const recentlyReviewed = homework
      .filter((h: any) => h.status === "reviewed")
      .slice(0, 2);
    const recommendedReading = [...readings]
      .sort((a: any, b: any) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 3);

    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="h1" style={{ margin: 0 }}>Study</h1>
          <div className="body" style={{ marginTop: 4 }}>
            Homework from your teacher, words to review, and something to read.
          </div>
        </div>

        {/* ── Homework ─────────────────────────────────────────── */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="edit" size={16} stroke="var(--omnic-tenant-primary)" /> Homework
            {openHomework.length > 0 && (
              <span className="pill pill-tenant">{openHomework.length} to do</span>
            )}
          </div>
          {openHomework.length === 0 && awaitingReview.length === 0 && recentlyReviewed.length === 0 && (
            <div className="body-sm">
              Nothing assigned right now — your teacher sends homework here after lessons.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {openHomework.slice(0, 3).map((h: any) => (
              <Link
                key={h._id}
                href={`/student/homework/${h._id}`}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--omnic-gray-200)", borderRadius: 8, textDecoration: "none", color: "inherit" }}
              >
                <div style={{ width: 6, height: 36, borderRadius: 3, background: "var(--omnic-tenant-primary)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</div>
                  <div className="body-sm">
                    {h.status === "in_progress" ? "Continue where you left off" : "New — not started"}
                  </div>
                </div>
                <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
              </Link>
            ))}
            {awaitingReview.slice(0, 2).map((h: any) => (
              <div key={h._id} className="body-sm" style={{ padding: "4px 2px" }}>
                ✓ <b>{h.title}</b> — submitted, waiting for review
              </div>
            ))}
            {recentlyReviewed.map((h: any) => (
              <Link key={h._id} href={`/student/homework/${h._id}`} className="body-sm" style={{ padding: "4px 2px", color: "inherit" }}>
                ★ <b>{h.title}</b> — reviewed{h.teacherComment ? " with feedback" : ""}
              </Link>
            ))}
            {(homework.length > 0) && (
              <Link href="/student/homework" className="body-sm" style={{ marginTop: 4 }}>
                See all homework{openHomework.length > 3 ? ` (${openHomework.length} to do)` : ""} →
              </Link>
            )}
          </div>
        </div>

        {/* ── Flashcards ───────────────────────────────────────── */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="brain" size={16} stroke="var(--omnic-tenant-primary)" /> Flashcards
            {total > 0 && <span className="pill pill-tenant">{total} due</span>}
          </div>
          <div className="body-sm" style={{ marginBottom: 12 }}>
            {total === 0
              ? "Nothing due — new words from lessons and reading land here."
              : "Spaced repetition keeps your hardest words coming back until they stick."}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              className="btn btn-tenant"
              style={{ flex: 1 }}
              disabled={total === 0}
              onClick={() => {
                startedAtRef.current = new Date().toISOString();
                setQueue([...cards]);
                setIdx(0);
                setStarted(true);
              }}
            >
              <Icon name="play" size={16} /> {total === 0 ? "Nothing due" : `Start — ${total} cards`}
            </button>
            <Link href="/student/vocabulary" className="btn btn-secondary">My words</Link>
          </div>
        </div>

        {/* ── Reading ──────────────────────────────────────────── */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="book" size={16} stroke="var(--omnic-tenant-primary)" /> Reading
          </div>
          {recommendedReading.length === 0 ? (
            <div className="body-sm">The library is empty for now — check back soon.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recommendedReading.map((r: any) => (
                <Link
                  key={r._id}
                  href={`/student/library/${r._id}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--omnic-gray-200)", borderRadius: 8, textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div className="body-sm">
                      {r.kind}{r.levelCEFR ? ` · ${r.levelCEFR}` : ""} — tap words while reading to save them
                    </div>
                  </div>
                  <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
                </Link>
              ))}
              <Link href="/student/library" className="body-sm" style={{ marginTop: 4 }}>
                Browse the whole library →
              </Link>
            </div>
          )}
        </div>

        <div className="body-sm" style={{ textAlign: "center", marginTop: 4 }}>
          🔥 Studying today extends your streak
        </div>
      </div>
    );
  }

  const rate = async (key: "again" | "hard" | "good" | "easy") => {
    const card = queue[idx];
    if (card?._id) {
      try {
        await recordReview({ cardDocId: card._id as any, rating: key });
      } catch (e) {
        console.error("Failed to record review", e);
      }
    }
    setStats((s) => ({ ...s, [key]: s[key as keyof typeof s] + 1 }));
    setFlipped(false);
    // "Again" → drill the card again later this session (re-append). Other
    // ratings retire it. The queue can therefore grow while a session runs.
    const nextQueue = key === "again" ? [...queue, card] : queue;
    if (key === "again") setQueue(nextQueue);
    if (idx + 1 >= nextQueue.length) {
      const reviewed = stats.again + stats.hard + stats.good + stats.easy + 1;
      const startedAt = startedAtRef.current ?? new Date().toISOString();
      const endedAt = new Date().toISOString();
      const durationMinutes = Math.max(
        1,
        Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000)
      );
      try {
        await recordSession({
          type: "flashcard",
          cardsReviewed: reviewed,
          startedAt,
          endedAt,
          durationMinutes,
        });
      } catch (e) {
        console.error("Failed to record session", e);
      }
      setDone(true);
    } else {
      setIdx(idx + 1);
    }
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

  const card: any = queue[idx] ?? { front: "No cards", back: "No cards yet", exampleSentence: "", front_pos: "" };
  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div className="h2">Study Flashcards</div>
          <div className="body-sm" style={{ marginTop: 2 }}>{queue.length - idx} cards remaining</div>
        </div>
        <select className="select" style={{ width: "auto" }}>
          <option>All Due</option>
        </select>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="body-sm">Card {idx + 1} of {queue.length}</span>
          <span className="body-sm">🔥 0-day streak</span>
        </div>
        <div className="progress"><div className="progress-fill" style={{ width: `${queue.length > 0 ? ((idx + 1) / queue.length) * 100 : 0}%` }} /></div>
      </div>

      <div className="flashcard-container" style={{ marginBottom: 24 }}>
        <div className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
          <div className="flashcard-face">
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{card.front}</div>
            <div className="body-sm" style={{ marginTop: 16 }}>Tap to reveal definition</div>
          </div>
          <div className="flashcard-face flashcard-back">
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--omnic-gray-900)", marginBottom: 8 }}>{card.back}</div>
            {card.exampleSentence && (
              <div style={{ fontSize: 14, fontStyle: "italic", color: "var(--omnic-gray-600)", marginBottom: 12, textAlign: "center" as const }}>
                &ldquo;{card.exampleSentence}&rdquo;
              </div>
            )}
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
