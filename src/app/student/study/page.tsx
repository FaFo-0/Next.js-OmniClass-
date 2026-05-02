"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { reviewCard } from "@/lib/srs/sm2";
import type { Rating, SRSCard } from "@/lib/srs/sm2";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  PartyPopper,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Interval preview helpers
// ---------------------------------------------------------------------------

function formatInterval(days: number): string {
  if (days === 0) return "< 1d";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function previewIntervals(card: SRSCard): Record<Rating, string> {
  const ratings: Rating[] = ["again", "hard", "good", "easy"];
  const result = {} as Record<Rating, string>;
  for (const r of ratings) {
    const preview = reviewCard(card, r);
    result[r] = formatInterval(preview.interval);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rating button config
// ---------------------------------------------------------------------------

const RATING_CONFIG: {
  rating: Rating;
  label: string;
  color: string;
  hoverColor: string;
  bgColor: string;
}[] = [
  {
    rating: "again",
    label: "Again",
    color: "text-red-600 dark:text-red-400",
    hoverColor: "hover:bg-red-100 dark:hover:bg-red-950",
    bgColor: "bg-red-50 dark:bg-red-950/50",
  },
  {
    rating: "hard",
    label: "Hard",
    color: "text-orange-600 dark:text-orange-400",
    hoverColor: "hover:bg-orange-100 dark:hover:bg-orange-950",
    bgColor: "bg-orange-50 dark:bg-orange-950/50",
  },
  {
    rating: "good",
    label: "Good",
    color: "text-green-600 dark:text-green-400",
    hoverColor: "hover:bg-green-100 dark:hover:bg-green-950",
    bgColor: "bg-green-50 dark:bg-green-950/50",
  },
  {
    rating: "easy",
    label: "Easy",
    color: "text-blue-600 dark:text-blue-400",
    hoverColor: "hover:bg-blue-100 dark:hover:bg-blue-950",
    bgColor: "bg-blue-50 dark:bg-blue-950/50",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Phase = "idle" | "reviewing" | "complete";

export default function StudyPage() {
  const router = useRouter();
  const t = useTranslations("student.study");

  // --- Auth -----------------------------------------------------------------
  const { currentUserId } = useAuth();

  // --- Convex queries -------------------------------------------------------
  const publishedLessons = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const lessonFlashcards = useQuery(
    api.lessonContent.getFlashcardsForStudentLessons,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];

  const lessonIds = useMemo(
    () => publishedLessons.map((l) => l.externalId),
    [publishedLessons]
  );

  const srsCards = useQuery(
    api.study.getSRSCardsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];
  const dueCards = useQuery(
    api.study.getDueCards,
    currentUserId ? { ownerId: currentUserId, deckIds: lessonIds } : "skip"
  ) ?? [];
  const reviewLogs = useQuery(
    api.study.getReviewLogsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];
  const quizAttempts = useQuery(
    api.study.getQuizAttemptsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const achievements = useQuery(api.achievements.listAchievements) ?? [];
  const streakData = useQuery(
    api.streaks.getStreak,
    currentUserId ? { studentId: currentUserId } : "skip"
  );

  // --- Convex mutations -----------------------------------------------------
  const syncCardsFromLessonsMut = useMutation(api.study.syncCardsFromLessons);
  const reviewSRSCardMut = useMutation(api.study.reviewSRSCard);
  const recordActivityMut = useMutation(api.streaks.recordActivity);
  const checkAndGrantAchievementsMut = useMutation(
    api.achievements.checkAndGrantAchievements
  );

  // --- Sync flashcards on mount ---------------------------------------------
  const hasSynced = useRef(false);
  useEffect(() => {
    if (hasSynced.current || !currentUserId) return;
    hasSynced.current = true;
    for (const { lessonExternalId, flashcards } of lessonFlashcards) {
      if (flashcards.length > 0) {
        syncCardsFromLessonsMut({
          ownerId: currentUserId,
          deckId: lessonExternalId,
          flashcards,
        });
      }
    }
  }, [currentUserId, lessonFlashcards, syncCardsFromLessonsMut]);

  // --- Local state ----------------------------------------------------------
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionCards, setSessionCards] = useState<SRSCard[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [easeFactors, setEaseFactors] = useState<number[]>([]);

  // The card currently being reviewed
  const currentCard = sessionCards[currentIndex] as SRSCard | undefined;

  // Interval previews for the current card
  const intervals = useMemo(
    () => (currentCard ? previewIntervals(currentCard) : null),
    [currentCard]
  );

  // --- Actions --------------------------------------------------------------
  const handleStartReview = useCallback(() => {
    if (dueCards.length === 0) return;
    setSessionCards([...dueCards] as SRSCard[]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setEaseFactors([]);
    setStartTime(Date.now());
    setPhase("reviewing");
  }, [dueCards]);

  const handleShowAnswer = useCallback(() => {
    setIsFlipped(true);
  }, []);

  const handleRate = useCallback(
    (rating: Rating) => {
      if (!currentCard || !currentUserId) return;

      // Record the review via Convex mutation
      reviewSRSCardMut({
        ownerId: currentUserId,
        cardId: currentCard.cardId,
        rating,
      });

      // Track ease for stats
      const preview = reviewCard(currentCard, rating);
      setEaseFactors((prev) => [...prev, preview.easeFactor]);

      // Advance
      const nextIndex = currentIndex + 1;
      if (nextIndex >= sessionCards.length) {
        // Session complete
        setPhase("complete");
      } else {
        setCurrentIndex(nextIndex);
        setIsFlipped(false);
      }
    },
    [currentCard, currentIndex, sessionCards.length, currentUserId, reviewSRSCardMut]
  );

  // --- Completion side-effects ----------------------------------------------
  useEffect(() => {
    if (phase !== "complete" || !currentUserId) return;

    async function complete() {
      // Record activity for streak
      const streakResult = await recordActivityMut({ studentId: currentUserId! });
      if (streakResult?.incremented) {
        toast.success(`🔥 ${streakResult.newStreak} day streak! Keep it up!`, {
          duration: 4000,
        });
      }

      // Gather stats for achievements
      const completedLessonIds = publishedLessons.map((l) => l.externalId);
      const totalCardsReviewed = reviewLogs.length;
      const perfectQuizzes = quizAttempts.filter(
        (a) => a.score === a.total
      ).length;
      const vocabLearned = srsCards.filter(
        (c) => completedLessonIds.includes(c.deckId) && c.repetitions >= 1
      ).length;

      const newlyUnlocked = await checkAndGrantAchievementsMut({
        studentId: currentUserId!,
        stats: {
          lessonsCompleted: publishedLessons.length,
          totalCardsReviewed,
          perfectQuizzes,
          vocabLearned,
          currentStreak: streakData?.currentStreak ?? 0,
        },
      });

      // Show toast for each unlocked achievement
      if (newlyUnlocked && newlyUnlocked.length > 0) {
        for (const achId of newlyUnlocked) {
          const ach = achievements.find((a) => a.externalId === achId);
          if (ach) {
            toast.success(`Achievement Unlocked: ${ach.name}`, {
              description: ach.description,
            });
          }
        }
      }
    }

    complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // --- Computed stats -------------------------------------------------------
  const elapsedMs = phase === "complete" ? Date.now() - startTime : 0;
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60_000));
  const avgEase =
    easeFactors.length > 0
      ? (easeFactors.reduce((a, b) => a + b, 0) / easeFactors.length).toFixed(
          2
        )
      : "0";

  // --- Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    if (phase !== "reviewing") return;

    function onKeyDown(e: KeyboardEvent) {
      if (!isFlipped) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setIsFlipped(true);
        }
        return;
      }

      switch (e.key) {
        case "1":
          handleRate("again");
          break;
        case "2":
          handleRate("hard");
          break;
        case "3":
          handleRate("good");
          break;
        case "4":
          handleRate("easy");
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, isFlipped, handleRate]);

  // =========================================================================
  // RENDER
  // =========================================================================

  // --- No user ---------------------------------------------------------------
  if (!currentUserId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Please select a student first.</p>
      </div>
    );
  }

  // --- IDLE: show due count or "all caught up" ------------------------------
  if (phase === "idle") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 pt-12">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Brain className="h-10 w-10 text-primary" />
        </div>

        <h1 className="text-2xl font-bold">{t("title")}</h1>

        {dueCards.length > 0 ? (
          <>
            <p className="text-center text-muted-foreground">
              {t("dueCards", { count: dueCards.length })}
            </p>

            <Button
              size="lg"
              className="gap-2"
              onClick={handleStartReview}
            >
              <Zap className="h-5 w-5" />
              {t("startReview")}
            </Button>
          </>
        ) : (
          <>
            <div className="text-center">
              <p className="text-lg font-semibold text-primary">
                {t("allCaughtUp")}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t("noDue")}
              </p>
            </div>

            <Button
              variant="outline"
              className="gap-2"
              onClick={() => router.push("/student/lessons")}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("backToLessons")}
            </Button>
          </>
        )}
      </div>
    );
  }

  // --- REVIEWING: card-by-card ----------------------------------------------
  if (phase === "reviewing" && currentCard) {
    const progress = currentIndex / sessionCards.length;

    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 pt-4">
        {/* Progress bar */}
        <div className="w-full">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {currentIndex} / {sessionCards.length}
            </span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Deck badge */}
        <Badge variant="secondary" className="gap-1">
          <Layers className="h-3 w-3" />
          {t("cardProgress", { index: currentIndex + 1, total: sessionCards.length })}
        </Badge>

        {/* 3D Flip Card */}
        <div
          className="w-full cursor-pointer"
          style={{ perspective: "1000px" }}
          onClick={() => !isFlipped && setIsFlipped(true)}
        >
          <div
            className="relative min-h-[280px] w-full transition-transform duration-500"
            style={{
              transformStyle: "preserve-3d",
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front face */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-primary/20 bg-card p-8 shadow-sm"
              style={{ backfaceVisibility: "hidden" }}
            >
              <p
                className="text-4xl font-bold leading-relaxed"
                dir="rtl"
                lang="ar"
              >
                {currentCard.front}
              </p>
              {!isFlipped && (
                <p className="mt-6 text-xs text-muted-foreground">
                  {t("tapToReveal")}
                </p>
              )}
            </div>

            {/* Back face */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-primary/20 bg-primary/5 p-8 shadow-sm"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <p className="text-2xl font-semibold">{currentCard.back}</p>
            </div>
          </div>
        </div>

        {/* Action area */}
        {!isFlipped ? (
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={handleShowAnswer}
          >
            <RotateCcw className="h-4 w-4" />
            {t("showAnswer")}
          </Button>
        ) : (
          <div className="w-full space-y-3">
            <p className="text-center text-xs text-muted-foreground">
              {t("howWell")}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {RATING_CONFIG.map(
                ({ rating, label, color, hoverColor, bgColor }) => (
                  <button
                    key={rating}
                    onClick={() => handleRate(rating)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${bgColor} ${hoverColor} ${color}`}
                  >
                    <span className="font-semibold">{t(rating)}</span>
                    <span className="text-[10px] opacity-70">
                      {intervals?.[rating]}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- COMPLETE: session summary --------------------------------------------
  if (phase === "complete") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 pt-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <PartyPopper className="h-10 w-10 text-primary" />
        </div>

        <h1 className="text-2xl font-bold">{t("sessionComplete")}</h1>
        <p className="text-muted-foreground">{t("greatWork")}</p>

        {/* Stats grid */}
        <div className="grid w-full grid-cols-3 gap-3">
          <Card>
            <CardContent className="flex flex-col items-center gap-1 p-4">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <p className="text-xl font-bold">{sessionCards.length}</p>
              <p className="text-xs text-muted-foreground">{t("cardsReviewed")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center gap-1 p-4">
              <Clock className="h-5 w-5 text-primary" />
              <p className="text-xl font-bold">
                {elapsedMinutes}
                <span className="text-sm font-normal">m</span>
              </p>
              <p className="text-xs text-muted-foreground">{t("timeTaken")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center gap-1 p-4">
              <Sparkles className="h-5 w-5 text-primary" />
              <p className="text-xl font-bold">{avgEase}</p>
              <p className="text-xs text-muted-foreground">{t("avgEase")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex w-full flex-col gap-2">
          <Button
            className="w-full gap-2"
            onClick={() => {
              setPhase("idle");
              setSessionCards([]);
              setCurrentIndex(0);
              setIsFlipped(false);
            }}
          >
            <Flame className="h-4 w-4" />
            {t("reviewMore")}
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => router.push("/student")}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToDashboard")}
          </Button>
        </div>
      </div>
    );
  }

  // Fallback (should not happen)
  return null;
}
