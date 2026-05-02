"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { useBrand } from "@/lib/brand/provider";
import { useTranslations } from "next-intl";
import { getDueCount } from "@/lib/srs/sm2";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressRing } from "@/components/student/ProgressRing";
import {
  BookOpen,
  Flame,
  GraduationCap,
  Trophy,
  BarChart3,
  ChevronRight,
  Sparkles,
  Map,
  Languages,
  Layers,
  HelpCircle,
} from "lucide-react";

export default function StudentDashboard() {
  const router = useRouter();
  const { currentUserId } = useAuth();
  const t = useTranslations("student.dashboard");
  const { t: term } = useBrand();
  const currentUser = useQuery(
    api.users.getUser,
    currentUserId ? { externalId: currentUserId } : "skip"
  );
  const lessons = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const contentStats = useQuery(
    api.lessons.getStudentContentStats,
    currentUserId ? { studentId: currentUserId } : "skip"
  );
  const srsCards = useQuery(
    api.study.getSRSCardsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];
  const streak = useQuery(
    api.streaks.getStreak,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? { currentStreak: 0, longestStreak: 0 };

  const dueCount = useMemo(() => {
    const lessonIds = lessons.map((l) => l.externalId);
    const studentCards = srsCards.filter((c) => lessonIds.includes(c.deckId));
    return getDueCount(studentCards);
  }, [srsCards, lessons]);

  const firstName = currentUser?.name?.split(" ")[0] ?? term("student");

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      {/* Greeting + Streak */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <h1 className="text-2xl font-bold">
            {t("welcome", { name: firstName })}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 dark:bg-orange-500/20">
          <Flame className="h-5 w-5 text-orange-500" />
          <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
            {streak.currentStreak}
          </span>
        </div>
      </div>

      {/* Hero Cards: Lessons + Study */}
      <div className="grid gap-3">
        {/* Continue Learning — goes to lesson path */}
        <button
          onClick={() => router.push("/student/lessons")}
          className="group relative overflow-hidden rounded-2xl bg-primary p-5 text-start text-primary-foreground shadow-[0_6px_0_hsl(var(--primary)/0.6)] transition-all duration-100 hover:translate-y-[2px] hover:shadow-[0_4px_0_hsl(var(--primary)/0.6)] active:translate-y-[4px] active:shadow-[0_2px_0_hsl(var(--primary)/0.6)]"
        >
          <div className="absolute -end-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
          <div className="absolute -end-2 bottom-0 h-16 w-16 rounded-full bg-white/5" />
          <div className="relative">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
              <Map className="h-5 w-5" />
            </div>
            <p className="text-lg font-bold">{t("myLessons")}</p>
            <p className="mt-0.5 text-sm text-primary-foreground/70">
              {t("lessonsCount", { count: lessons.length })}
            </p>
          </div>
          <ChevronRight className="absolute end-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-foreground/50 transition-transform group-hover:translate-x-1" />
        </button>

        {/* Study Flashcards */}
        <button
          onClick={() => router.push("/student/study")}
          className={`group relative overflow-hidden rounded-2xl p-5 text-start shadow-[0_6px_0_hsl(var(--border))] transition-all duration-100 hover:translate-y-[2px] hover:shadow-[0_4px_0_hsl(var(--border))] active:translate-y-[4px] active:shadow-[0_2px_0_hsl(var(--border))] ${
            dueCount > 0
              ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_6px_0_hsl(270_60%_35%)] hover:shadow-[0_4px_0_hsl(270_60%_35%)] active:shadow-[0_2px_0_hsl(270_60%_35%)]"
              : "bg-card text-foreground border border-border"
          }`}
        >
          <div className="absolute -end-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              dueCount > 0 ? "bg-white/20" : "bg-primary/10"
            }`}>
              <GraduationCap className={`h-6 w-6 ${dueCount > 0 ? "text-white" : "text-primary"}`} />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold">{t("studyFlashcards")}</p>
              {dueCount > 0 ? (
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-sm font-medium opacity-80">
                    {t("due", { count: dueCount })}
                  </span>
                </div>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("allCaughtUp")}
                </p>
              )}
            </div>
            <ChevronRight className={`h-5 w-5 transition-transform group-hover:translate-x-1 ${
              dueCount > 0 ? "text-white/50" : "text-muted-foreground"
            }`} />
          </div>
        </button>
      </div>

      {/* Stats Ring Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-3 p-4">
            <ProgressRing
              progress={lessons.length > 0 ? 100 : 0}
              size={48}
              strokeWidth={4}
            >
              <BookOpen className="h-4 w-4 text-primary" />
            </ProgressRing>
            <div>
              <p className="text-2xl font-bold leading-none">{lessons.length}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("lessons")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-3 p-4">
            <ProgressRing
              progress={Math.min((contentStats?.totalVocab ?? 0) * 2, 100)}
              size={48}
              strokeWidth={4}
            >
              <Languages className="h-4 w-4 text-primary" />
            </ProgressRing>
            <div>
              <p className="text-2xl font-bold leading-none">{contentStats?.totalVocab ?? 0}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("words")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-3 p-4">
            <ProgressRing
              progress={Math.min((contentStats?.totalFlashcards ?? 0) * 2, 100)}
              size={48}
              strokeWidth={4}
            >
              <Layers className="h-4 w-4 text-primary" />
            </ProgressRing>
            <div>
              <p className="text-2xl font-bold leading-none">{contentStats?.totalFlashcards ?? 0}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("flashcards")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-3 p-4">
            <ProgressRing
              progress={Math.min((contentStats?.totalQuiz ?? 0) * 5, 100)}
              size={48}
              strokeWidth={4}
            >
              <HelpCircle className="h-4 w-4 text-primary" />
            </ProgressRing>
            <div>
              <p className="text-2xl font-bold leading-none">{contentStats?.totalQuiz ?? 0}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("quizQs")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => router.push("/student/stats")}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-start transition-colors hover:bg-accent"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20">
            <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-sm font-medium">{t("statistics")}</span>
        </button>

        <button
          onClick={() => router.push("/student/achievements")}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-start transition-colors hover:bg-accent"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
            <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-sm font-medium">{t("achievements")}</span>
        </button>
      </div>
    </div>
  );
}
