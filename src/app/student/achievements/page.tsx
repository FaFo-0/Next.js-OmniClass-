"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Lock } from "lucide-react";

export default function AchievementsPage() {
  const { currentUserId } = useAuth();
  const t = useTranslations("student.achievements");
  const publishedLessonsRaw = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  );
  const achievements = useQuery(api.achievements.listAchievements) ?? [];
  const studentAchievements = useQuery(
    api.achievements.getStudentAchievements,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const reviewLogs = useQuery(
    api.study.getReviewLogsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];
  const quizAttempts = useQuery(
    api.study.getQuizAttemptsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const streakData = useQuery(
    api.streaks.getStreak,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? { currentStreak: 0, longestStreak: 0 };

  const earnedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const sa of studentAchievements) {
      map.set(sa.achievementId, sa.unlockedAt);
    }
    return map;
  }, [studentAchievements]);

  const publishedLessonCount = publishedLessonsRaw?.length ?? 0;

  const totalCardsReviewed = reviewLogs.length;

  const perfectQuizCount = useMemo(
    () => quizAttempts.filter((q) => q.score === q.total).length,
    [quizAttempts]
  );

  const vocabLearned = useMemo(() => {
    const learned = new Set<string>();
    for (const log of reviewLogs) {
      if (log.rating === "good" || log.rating === "easy") {
        learned.add(log.cardId);
      }
    }
    return learned.size;
  }, [reviewLogs]);

  const getProgress = useMemo(() => {
    return (achievement: (typeof achievements)[number]): { current: number; threshold: number } => {
      const threshold = achievement.conditionThreshold;
      switch (achievement.conditionType) {
        case "lessons_completed":
          return { current: publishedLessonCount, threshold };
        case "cards_reviewed":
          return { current: totalCardsReviewed, threshold };
        case "quiz_perfect":
          return { current: perfectQuizCount, threshold };
        case "streak_days":
          return { current: streakData.currentStreak, threshold };
        case "vocab_learned":
          return { current: vocabLearned, threshold };
        default:
          return { current: 0, threshold };
      }
    };
  }, [
    publishedLessonCount,
    totalCardsReviewed,
    perfectQuizCount,
    streakData.currentStreak,
    vocabLearned,
  ]);

  const earnedCount = earnedMap.size;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Summary stats */}
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">
              {earnedCount}{" "}
              <span className="text-base font-normal text-muted-foreground">
                of {achievements.length}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("unlocked")}
            </p>
          </div>
          {earnedCount === achievements.length && achievements.length > 0 && (
            <Badge variant="default" className="ms-auto">
              {t("allComplete")}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Achievement grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {achievements.map((achievement) => {
          const unlockedAt = earnedMap.get(achievement.externalId);
          const isEarned = !!unlockedAt;
          const { current, threshold } = getProgress(achievement);
          const progressPercent = Math.min(
            100,
            Math.round((current / threshold) * 100)
          );

          return (
            <Card
              key={achievement.externalId}
              className={
                isEarned
                  ? "relative ring-2 ring-primary/40 shadow-[0_0_16px_rgba(34,197,94,0.15)]"
                  : "opacity-70"
              }
            >
              <CardContent className="flex flex-col items-center p-5 text-center">
                {/* Icon */}
                <div
                  className={
                    isEarned
                      ? "mb-3 text-5xl"
                      : "mb-3 text-5xl grayscale opacity-50"
                  }
                  role="img"
                  aria-label={achievement.name}
                >
                  {achievement.icon}
                </div>

                {/* Name */}
                <h3 className="text-sm font-semibold">{achievement.name}</h3>

                {/* Description */}
                <p className="mt-1 text-xs text-muted-foreground">
                  {achievement.description}
                </p>

                {/* Reward badge */}
                {achievement.reward && (
                  <Badge variant="secondary" className="mt-2">
                    {achievement.reward}
                  </Badge>
                )}

                {/* Earned date or progress bar */}
                {isEarned ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("earned", { date: new Date(unlockedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }) })}
                  </p>
                ) : (
                  <div className="mt-3 w-full">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        {t("locked")}
                      </span>
                      <span>
                        {current} / {threshold}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/40 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
