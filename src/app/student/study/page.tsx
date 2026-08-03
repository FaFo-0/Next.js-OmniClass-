"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";
import { dueColors, dueState } from "@/lib/homeworkDue";

export default function StudentStudyPage() {
  const t = useTranslations("app.study");
  const tKinds = useTranslations("app.library.kinds");
  // Unknown kinds print themselves rather than a key path.
  const tKind = (kind: string) => {
    const value = tKinds(kind);
    return value.endsWith(`.${kind}`) ? kind : value;
  };
  const dueCards = useQuery(api.srs.listDueCards, {}) ?? [];
  const homework = useQuery(api.homework.listForStudent, {}) ?? [];
  const readings = useQuery(api.library.listPublished, {}) ?? [];
  const recordReview = useMutation(api.srs.recordReview);
  const recordSession = useMutation(api.study.recordSession);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const streak = useQuery(api.streaks.getForStudent, {});
  // A card's FIRST rating is the honest one — "Again" re-drills later in the
  // session must not inflate the reviewed count or sink the accuracy.
  const [firstRatings, setFirstRatings] = useState<Record<string, string>>({});
  // Session queue — a snapshot of the due cards taken at Start, so cards
  // rated "Again" can be re-appended and drilled again in the same sitting
  // instead of vanishing until tomorrow.
  const [queue, setQueue] = useState<any[]>([]);
  const startedAtRef = useRef<string | null>(null);
  // Refs let the key handler read live state without re-binding every render.
  const flippedRef = useRef(false);
  flippedRef.current = flipped;
  const rateRef = useRef<(k: "again" | "hard" | "good" | "easy") => Promise<void>>(
    async () => {}
  );

  const cards = dueCards;

  // The keycaps on the buttons are a promise — keep it. Space/Enter flips,
  // 1–4 rate once the answer is showing.
  useEffect(() => {
    if (!started || done) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flippedRef.current) return;
      const map: Record<string, "again" | "hard" | "good" | "easy"> = {
        "1": "again",
        "2": "hard",
        "3": "good",
        "4": "easy",
      };
      const r = map[e.key];
      if (r) {
        e.preventDefault();
        void rateRef.current(r);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, done]);


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
          <h1 className="h1" style={{ margin: 0 }}>{t("title")}</h1>
          <div className="body" style={{ marginTop: 4 }}>{t("subtitleHub")}</div>
        </div>

        {/* ── Homework ─────────────────────────────────────────── */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="edit" size={16} stroke="var(--omnic-tenant-primary)" /> {t("homeworkHeading")}
            {openHomework.length > 0 && (
              <span className="pill pill-tenant">{t("toDoPill", { count: openHomework.length })}</span>
            )}
          </div>
          {openHomework.length === 0 && awaitingReview.length === 0 && recentlyReviewed.length === 0 && (
            <div className="body-sm">{t("nothingAssignedHub")}</div>
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
                    {h.status === "in_progress" ? t("continueWhere") : t("newNotStarted")}
                  </div>
                </div>
                {(() => {
                  const d = dueState(h.dueAt);
                  if (!d.label) return null;
                  const c = dueColors(d.tone);
                  return (
                    <span className="pill" style={{ background: c.bg, color: c.fg, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {d.label}
                    </span>
                  );
                })()}
                <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
              </Link>
            ))}
            {awaitingReview.slice(0, 2).map((h: any) => (
              <div key={h._id} className="body-sm" style={{ padding: "4px 2px" }}>
                ✓ <b>{h.title}</b> — {t("submittedWaiting")}
              </div>
            ))}
            {recentlyReviewed.map((h: any) => (
              <Link key={h._id} href={`/student/homework/${h._id}`} className="body-sm" style={{ padding: "4px 2px", color: "inherit" }}>
                ★ <b>{h.title}</b> — {t("reviewedWord")}{h.teacherComment ? t("withFeedback") : ""}
              </Link>
            ))}
            {(homework.length > 0) && (
              <Link href="/student/homework" className="body-sm" style={{ marginTop: 4 }}>
                {openHomework.length > 3 ? t("seeAllHomeworkCount", { count: openHomework.length }) : t("seeAllHomework")} →
              </Link>
            )}
          </div>
        </div>

        {/* ── Flashcards ───────────────────────────────────────── */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="brain" size={16} stroke="var(--omnic-tenant-primary)" /> {t("flashcardsHeading")}
            {total > 0 && <span className="pill pill-tenant">{t("duePill", { count: total })}</span>}
          </div>
          <div className="body-sm" style={{ marginBottom: 12 }}>
            {total === 0
              ? t("nothingDueHint")
              : t("srsHint")}
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
              <Icon name="play" size={16} /> {total === 0 ? t("nothingDueBtn") : t("startCards", { count: total })}
            </button>
            <Link href="/student/vocabulary" className="btn btn-secondary">{t("myWords")}</Link>
          </div>
        </div>

        {/* ── Reading ──────────────────────────────────────────── */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="book" size={16} stroke="var(--omnic-tenant-primary)" /> {t("readingHeading")}
          </div>
          {recommendedReading.length === 0 ? (
            <div className="body-sm">{t("libraryEmpty")}</div>
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
                      {tKind(r.kind)}{r.levelCEFR ? ` · ${r.levelCEFR}` : ""} — {t("tapWordsHint")}
                    </div>
                  </div>
                  <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
                </Link>
              ))}
              <Link href="/student/library" className="body-sm" style={{ marginTop: 4 }}>
                {t("browseLibrary")}
              </Link>
            </div>
          )}
        </div>

        <div className="body-sm" style={{ textAlign: "center", marginTop: 4 }}>
          {t("streakHint")}
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
    const ratings = firstRatings[card?._id]
      ? firstRatings
      : { ...firstRatings, [card._id]: key };
    setFirstRatings(ratings);
    setFlipped(false);
    // "Again" → drill the card again later this session (re-append). Other
    // ratings retire it. The queue can therefore grow while a session runs.
    const nextQueue = key === "again" ? [...queue, card] : queue;
    if (key === "again") setQueue(nextQueue);
    if (idx + 1 >= nextQueue.length) {
      const startedAt = startedAtRef.current ?? new Date().toISOString();
      const endedAt = new Date().toISOString();
      const durationMinutes = Math.max(
        1,
        Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000)
      );
      try {
        await recordSession({
          type: "flashcard",
          // Unique cards, not button presses.
          cardsReviewed: Object.keys(ratings).length,
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
  rateRef.current = rate;

  if (done) {
    const ratings = Object.values(firstRatings);
    const reviewed = ratings.length;
    const accuracy = Math.round(
      (ratings.filter((r) => r === "good" || r === "easy").length /
        Math.max(reviewed, 1)) *
        100
    );
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
        <div style={{ fontSize: 80, marginBottom: 12 }}>🎉</div>
        <h1 className="h1">{t("sessionCompleteBang")}</h1>
        <div className="body" style={{ marginBottom: 24 }}>{t("greatWork")}</div>
        <div className="grid-3" style={{ marginBottom: 24, textAlign: "start" as const }}>
          <LocalMetricCard label={t("cardsReviewedLabel")} value={reviewed} icon="brain" />
          <LocalMetricCard label={t("accuracy")} value={accuracy + "%"} icon="target" />
          <LocalMetricCard label={t("streakLabel")} value={t("daysUnit", { count: streak?.currentStreak ?? 0 })} icon="flame" accent="red" />
        </div>
        <Link href="/student" className="btn btn-tenant btn-lg">{t("backToDashboard")}</Link>
      </div>
    );
  }

  const card: any = queue[idx] ?? { front: t("noCards"), back: t("noCardsYet"), exampleSentence: "", front_pos: "" };
  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div className="h2">{t("studyFlashcards")}</div>
          <div className="body-sm" style={{ marginTop: 2 }}>{t("cardsRemaining", { count: queue.length - idx })}</div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="body-sm">{t("cardOf", { index: idx + 1, total: queue.length })}</span>
          <span className="body-sm">🔥 {t("streakChip", { count: streak?.currentStreak ?? 0 })}</span>
        </div>
        <div className="progress"><div className="progress-fill" style={{ width: `${queue.length > 0 ? ((idx + 1) / queue.length) * 100 : 0}%` }} /></div>
      </div>

      <div className="flashcard-container" style={{ marginBottom: 24 }}>
        <div className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
          <div className="flashcard-face">
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{card.front}</div>
            <div className="body-sm" style={{ marginTop: 16 }}>{t("tapReveal")}</div>
          </div>
          <div className="flashcard-face flashcard-back">
            {/* The answer is the word in the learner's own language; the
                English definition is supporting detail, so it reads smaller.
                Older cards have no `translation` field — their `back` already
                holds "translation — definition", so show it as-is. */}
            {card.translation ? (
              <>
                <div dir="auto" style={{ fontSize: 24, fontWeight: 700, color: "var(--omnic-gray-900)", marginBottom: 6, textAlign: "center" as const }}>
                  {card.translation}
                </div>
                {card.back && card.back !== card.translation && (
                  <div style={{ fontSize: 14, color: "var(--omnic-gray-600)", marginBottom: 10, textAlign: "center" as const }}>
                    {card.back.startsWith(`${card.translation} — `)
                      ? card.back.slice(card.translation.length + 3)
                      : card.back}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--omnic-gray-900)", marginBottom: 8 }}>{card.back}</div>
            )}
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
          <button className="rating-btn" style={{ background: "#DC2626" }} onClick={() => rate("again")}><span>{t("again")}</span><span className="key">1</span></button>
          <button className="rating-btn" style={{ background: "#EA580C" }} onClick={() => rate("hard")}><span>{t("hard")}</span><span className="key">2</span></button>
          <button className="rating-btn" style={{ background: "#16A34A" }} onClick={() => rate("good")}><span>{t("good")}</span><span className="key">3</span></button>
          <button className="rating-btn" style={{ background: "#2563EB" }} onClick={() => rate("easy")}><span>{t("easy")}</span><span className="key">4</span></button>
        </div>
      ) : (
        <button className="btn btn-secondary btn-block btn-lg" onClick={() => setFlipped(true)}>
          {t("revealAnswer")} <span className="key" style={{ marginInlineStart: 8 }}>Space</span>
        </button>
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
