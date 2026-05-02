"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { LessonPath } from "@/components/student/LessonPath";

export default function StudentLessonsPage() {
  const router = useRouter();
  const { currentUserId } = useAuth();
  const t = useTranslations("student.lessons");
  const allLessons = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];

  const lessons = useMemo(
    () => [...allLessons].sort((a, b) => a.order - b.order),
    [allLessons]
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <LessonPath
        lessons={lessons}
        onLessonClick={(id) => router.push(`/student/lessons/${id}`)}
      />
    </div>
  );
}
