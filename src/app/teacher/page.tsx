"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { useBrand } from "@/lib/brand/provider";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BookOpen, ChevronRight } from "lucide-react";

export default function TeacherDashboard() {
  const router = useRouter();
  const t = useTranslations("teacher.dashboard");
  const { t: term } = useBrand();
  const { currentUserId } = useAuth();
  const currentUser = useQuery(
    api.users.getUser,
    currentUserId ? { externalId: currentUserId } : "skip"
  );
  const students = useQuery(
    api.users.getStudentsForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  );
  const lessons = useQuery(
    api.lessons.getLessonsForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  ) ?? [];

  const publishedCount = useMemo(
    () => lessons.filter((l) => l.status === "published").length,
    [lessons]
  );
  const inProgressCount = useMemo(
    () => lessons.filter((l) => l.status === "recording" || l.status === "review").length,
    [lessons]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          {t("welcome", { name: currentUser?.name?.split(" ")[0] ?? term("teacher") })}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{students?.length ?? 0}</p>
              <p className="text-sm text-muted-foreground">{t("students")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{publishedCount}</p>
              <p className="text-sm text-muted-foreground">
                {t("publishedLessons")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{inProgressCount}</p>
              <p className="text-sm text-muted-foreground">{t("inProgress")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Student List */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">{t("yourStudents")}</h2>
        <div className="space-y-2">
          {(students ?? []).map((student) => {
            const studentLessons = lessons.filter(
              (l) => l.studentId === student.externalId
            );
            const published = studentLessons.filter(
              (l) => l.status === "published"
            );
            const initials = student.name
              .split(" ")
              .map((n) => n[0])
              .join("");

            return (
              <Card
                key={student.externalId}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() =>
                  router.push(`/teacher/students/${student.externalId}`)
                }
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{student.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("lessonsCompleted", { count: published.length })}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
