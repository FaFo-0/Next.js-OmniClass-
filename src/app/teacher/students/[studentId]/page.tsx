"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { LessonPath } from "@/components/student/LessonPath";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  BookOpen,
  Layers,
  HelpCircle,
  Flame,
  Trophy,
} from "lucide-react";

export default function StudentLessonsPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  const router = useRouter();
  const t = useTranslations("teacher.studentDetail");

  const student = useQuery(
    api.users.getUser,
    studentId ? { externalId: studentId } : "skip"
  );
  const allLessons = useQuery(
    api.lessons.getLessonsForStudent,
    studentId ? { studentId } : "skip"
  ) ?? [];
  const quizAttempts = useQuery(
    api.study.getQuizAttemptsForStudent,
    studentId ? { studentId } : "skip"
  ) ?? [];
  const reviewLogs = useQuery(
    api.study.getReviewLogsForOwner,
    studentId ? { ownerId: studentId } : "skip"
  ) ?? [];
  const srsCards = useQuery(
    api.study.getSRSCardsForOwner,
    studentId ? { ownerId: studentId } : "skip"
  ) ?? [];
  const achievements = useQuery(api.achievements.listAchievements) ?? [];
  const studentAchievements = useQuery(
    api.achievements.getStudentAchievements,
    studentId ? { studentId } : "skip"
  ) ?? [];
  const streakData = useQuery(
    api.streaks.getStreak,
    studentId ? { studentId } : "skip"
  );

  const lessons = useMemo(
    () => [...allLessons].sort((a, b) => a.order - b.order),
    [allLessons]
  );

  const publishedLessons = useMemo(
    () => lessons.filter((l) => l.status === "published"),
    [lessons]
  );

  // Quiz stats per lesson
  const quizStats = useMemo(() => {
    const stats: Record<
      string,
      { attempts: number; bestScore: number; total: number }
    > = {};
    for (const attempt of quizAttempts) {
      if (!stats[attempt.lessonId]) {
        stats[attempt.lessonId] = {
          attempts: 0,
          bestScore: 0,
          total: attempt.total,
        };
      }
      stats[attempt.lessonId].attempts++;
      stats[attempt.lessonId].bestScore = Math.max(
        stats[attempt.lessonId].bestScore,
        attempt.score
      );
    }
    return stats;
  }, [quizAttempts]);

  // Flashcard stats
  const cardStats = useMemo(() => {
    const lessonIds = new Set(lessons.map((l) => l.externalId));
    const studentCards = srsCards.filter((c) => lessonIds.has(c.deckId));
    const totalCards = studentCards.length;
    const reviewedCards = studentCards.filter(
      (c) => c.lastReviewDate !== null
    ).length;
    const totalReviews = reviewLogs.filter((r) =>
      studentCards.some((c) => c.cardId === r.cardId)
    ).length;
    return { totalCards, reviewedCards, totalReviews };
  }, [srsCards, reviewLogs, lessons]);

  // Streak
  const streak = streakData ?? { currentStreak: 0, longestStreak: 0 };

  // Achievements
  const earnedAchievements = useMemo(() => {
    const earned = studentAchievements.map((sa) => sa.achievementId);
    return achievements.filter((a) => earned.includes(a.externalId));
  }, [studentAchievements, achievements]);

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">{t("notFound")}</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push("/teacher")}
        >
          <ArrowLeft className="me-2 h-4 w-4" />
          {t("backToDashboard")}
        </Button>
      </div>
    );
  }

  const handleNewLesson = () => {
    router.push(`/teacher/lessons/new?studentId=${studentId}`);
  };

  const handleLessonClick = (lessonId: string) => {
    router.push(`/teacher/lessons/${lessonId}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/teacher")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{student.name}</h1>
            <p className="text-sm text-muted-foreground">
              {t("lessonStats", { lessons: lessons.length, published: publishedLessons.length })}
            </p>
          </div>
        </div>
        <Button onClick={handleNewLesson}>
          <Plus className="me-2 h-4 w-4" />
          {t("newLesson")}
        </Button>
      </div>

      {/* Progress Overview */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{publishedLessons.length}</p>
              <p className="text-[10px] text-muted-foreground">{t("lessons")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {cardStats.reviewedCards}/{cardStats.totalCards}
              </p>
              <p className="text-[10px] text-muted-foreground">{t("cardsStudied")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
              <Flame className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-lg font-bold">{streak.currentStreak}</p>
              <p className="text-[10px] text-muted-foreground">{t("dayStreak")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-100">
              <Trophy className="h-4 w-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{earnedAchievements.length}</p>
              <p className="text-[10px] text-muted-foreground">{t("achievements")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quiz Scores per Lesson */}
      {Object.keys(quizStats).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <HelpCircle className="h-4 w-4 text-primary" />
              {t("quizPerformance")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {publishedLessons.map((lesson) => {
              const stat = quizStats[lesson.externalId];
              if (!stat) return null;
              const pct = Math.round((stat.bestScore / stat.total) * 100);
              return (
                <div
                  key={lesson.externalId}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="text-sm font-medium">{lesson.title}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <Badge
                      variant="secondary"
                      className={
                        pct === 100
                          ? "bg-green-100 text-green-700"
                          : pct >= 70
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                      }
                    >
                      {stat.bestScore}/{stat.total}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ({stat.attempts} attempt{stat.attempts !== 1 ? "s" : ""})
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Achievements earned */}
      {earnedAchievements.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-primary" />
              {t("achievementsEarned")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {earnedAchievements.map((ach) => (
                <Badge
                  key={ach.externalId}
                  variant="secondary"
                  className="gap-1.5 px-3 py-1.5"
                >
                  <span>{ach.icon}</span>
                  {ach.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lesson Path */}
      <LessonPath
        lessons={lessons}
        onLessonClick={handleLessonClick}
        showAll
      />
    </div>
  );
}
