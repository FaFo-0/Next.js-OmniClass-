"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { useBrand } from "@/lib/brand/provider";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Languages,
  Flame,
  Trophy,
  Layers,
  HelpCircle,
  BarChart3,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function StudentProfilePage() {
  const { currentUserId } = useAuth();
  const t = useTranslations("student.profile");
  const { t: term } = useBrand();
  const currentUser = useQuery(
    api.users.getUser,
    currentUserId ? { externalId: currentUserId } : "skip"
  );
  const publishedLessons = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const reviewLogs = useQuery(
    api.study.getReviewLogsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];
  const streakData = useQuery(
    api.streaks.getStreak,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? { currentStreak: 0, longestStreak: 0, lastActivityDate: null, activityDates: [] };
  const billing = useQuery(api.billing.getMyBilling);
  const router = useRouter();

  const vocabLearned = useMemo(() => {
    const learned = new Set<string>();
    for (const log of reviewLogs) {
      if (log.rating === "good" || log.rating === "easy") {
        learned.add(log.cardId);
      }
    }
    return learned.size;
  }, [reviewLogs]);

  const memberSince = useMemo(() => {
    if (!currentUser?.createdAt) return "Unknown";
    return new Date(currentUser.createdAt).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [currentUser?.createdAt]);

  const firstInitial = useMemo(
    () => currentUser?.name?.charAt(0).toUpperCase() ?? "?",
    [currentUser?.name]
  );

  const renewalFormatted = useMemo(() => {
    if (!billing?.renewalDate) return null;
    return new Date(billing.renewalDate).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [billing?.renewalDate]);

  const isOverdue = useMemo(() => {
    if (!billing || billing.status === "paid") return false;
    return new Date(billing.renewalDate) < new Date();
  }, [billing]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Avatar + identity */}
      <div className="flex flex-col items-center text-center">
        {currentUser?.avatarUrl ? (
          <img
            src={currentUser.avatarUrl}
            alt={currentUser.name}
            className="h-24 w-24 rounded-full object-cover ring-4 ring-primary/20"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-4xl font-bold text-primary ring-4 ring-primary/20">
            {firstInitial}
          </div>
        )}
        <h1 className="mt-4 text-2xl font-bold">
          {currentUser?.name ?? term("student")}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {currentUser?.email}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("memberSince", { date: memberSince })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col items-center p-4 text-center">
            <BookOpen className="mb-1.5 h-5 w-5 text-primary" />
            <p className="text-xl font-bold">{publishedLessons.length}</p>
            <p className="text-xs text-muted-foreground">{t("lessons")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center p-4 text-center">
            <Languages className="mb-1.5 h-5 w-5 text-primary" />
            <p className="text-xl font-bold">{vocabLearned}</p>
            <p className="text-xs text-muted-foreground">{t("vocabLearned")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center p-4 text-center">
            <Flame className="mb-1.5 h-5 w-5 text-orange-500" />
            <p className="text-xl font-bold">{streakData.currentStreak}</p>
            <p className="text-xs text-muted-foreground">{t("currentStreak")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center p-4 text-center">
            <Trophy className="mb-1.5 h-5 w-5 text-amber-500" />
            <p className="text-xl font-bold">{streakData.longestStreak}</p>
            <p className="text-xs text-muted-foreground">{t("longestStreak")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription info */}
      {billing && (
        <Card className={cn(isOverdue && "border-destructive/50")}>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold">{t("subscription")}</h2>
              <Badge
                className={cn(
                  "ms-auto text-[10px]",
                  billing.status === "paid"
                    ? "bg-green-100 text-green-700"
                    : isOverdue
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                )}
              >
                {billing.status === "paid" ? t("paid") : isOverdue ? t("overdue") : t("unpaid")}
              </Badge>
            </div>
            <div className="grid gap-2 text-sm">
              {billing.lessonsPerMonth && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("lessonsPerMonth")}</span>
                  <span className="font-medium">{billing.lessonsPerMonth}</span>
                </div>
              )}
              {renewalFormatted && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("renewalDate")}</span>
                  <span className={cn("font-medium", isOverdue && "text-destructive")}>
                    {renewalFormatted}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="text-sm font-semibold">{t("quickLinks")}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="outline" className="w-full gap-2" onClick={() => router.push("/student/study")}>
              <Layers className="h-4 w-4" />
              {t("studyFlashcards")}
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={() => router.push("/student/lessons")}>
              <HelpCircle className="h-4 w-4" />
              {t("takeQuiz")}
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={() => router.push("/student/stats")}>
              <BarChart3 className="h-4 w-4" />
              {t("viewStats")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
