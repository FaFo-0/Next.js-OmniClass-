"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  GraduationCap,
  Users as UsersIcon,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "convex/react";
import { api } from "@convex";

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");
  const users = useQuery(api.users.listUsers) ?? [];
  const lessons = useQuery(api.lessons.listAllLessons) ?? [];
  const quizAttempts = useQuery(api.study.getAllQuizAttempts) ?? [];
  const reviewLogs = useQuery(api.study.getAllReviewLogs) ?? [];
  const promptConfigs = useQuery(api.settings.listPromptConfigs) ?? [];

  const teacherCount = useMemo(
    () => users.filter((u) => u.role === "teacher").length,
    [users]
  );

  const studentCount = useMemo(
    () => users.filter((u) => u.role === "student").length,
    [users]
  );

  const totalLessons = lessons.length;

  const publishedLessons = useMemo(
    () => lessons.filter((l) => l.status === "published").length,
    [lessons]
  );

  const aiPromptCount = promptConfigs.length;
  const totalReviews = reviewLogs.length;

  const recentAttempts = useMemo(() => {
    const sorted = [...quizAttempts].sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    return sorted.slice(0, 5).map((attempt) => {
      const student = users.find((u: any) => u.externalId === attempt.studentId);
      const lesson = lessons.find((l) => l.externalId === attempt.lessonId);
      return { ...attempt, studentName: student?.name ?? "Unknown", lessonTitle: lesson?.title ?? "Unknown" };
    });
  }, [quizAttempts, users, lessons]);

  const statCards = [
    {
      label: t("totalTeachers"),
      value: teacherCount,
      icon: GraduationCap,
    },
    {
      label: t("totalStudents"),
      value: studentCount,
      icon: UsersIcon,
    },
    {
      label: t("totalLessons"),
      value: totalLessons,
      icon: BookOpen,
    },
    {
      label: t("publishedLessons"),
      value: publishedLessons,
      icon: CheckCircle2,
    },
    {
      label: t("aiPrompts"),
      value: aiPromptCount,
      icon: Sparkles,
    },
    {
      label: t("totalFlashcardsReviewed"),
      value: totalReviews,
      icon: Layers,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recentActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAttempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noQuizAttempts")}
            </p>
          ) : (
            <div className="space-y-4">
              {recentAttempts.map((attempt) => {
                const pct = Math.round((attempt.score / attempt.total) * 100);
                return (
                  <div
                    key={attempt._id}
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {attempt.studentName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {attempt.lessonTitle}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={pct === 100 ? "default" : "secondary"}
                      >
                        {attempt.score}/{attempt.total} ({pct}%)
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(attempt.completedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
