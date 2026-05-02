"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { useTranslations } from "next-intl";
import { FlashcardViewer } from "@/components/student/FlashcardViewer";
import { QuizPlayer } from "@/components/student/QuizPlayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import {
  ArrowLeft,
  BookOpen,
  Layers,
  HelpCircle,
} from "lucide-react";

export default function StudentLessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = use(params);
  const router = useRouter();
  const t = useTranslations("student.lessons");

  const lesson = useQuery(api.lessons.getLesson, { externalId: lessonId });
  const vocabulary = useQuery(
    api.lessonContent.getVocabulary,
    lesson?._id ? { lessonId: lesson._id } : "skip"
  ) ?? [];
  const flashcards = useQuery(
    api.lessonContent.getFlashcards,
    lesson?._id ? { lessonId: lesson._id } : "skip"
  ) ?? [];
  const quiz = useQuery(
    api.lessonContent.getQuizQuestions,
    lesson?._id ? { lessonId: lesson._id } : "skip"
  ) ?? [];

  if (!lesson) {
    return (
      <div className="flex flex-col items-center py-20">
        <p className="text-muted-foreground">{t("notFound")}</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push("/student/lessons")}
        >
          {t("backToLessons")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/student/lessons")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{lesson.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t("lessonInfo", { order: lesson.order, minutes: Math.floor(lesson.durationSeconds / 60) })}
          </p>
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            {t("lessonSummary")}
          </h2>
          {lesson.summary ? (
            <Markdown>{lesson.summary}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("noSummary")}</p>
          )}
        </CardContent>
      </Card>

      {/* Vocabulary */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <Layers className="h-4 w-4 text-primary" />
            {t("vocabularyCount", { count: vocabulary.length })}
          </h2>
          {vocabulary.length > 0 ? (
            <div className="space-y-2">
              {vocabulary.map((v) => (
                <div
                  key={v._id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="text-xl font-bold text-primary"
                      dir="rtl"
                      lang="ar"
                    >
                      {v.arabic}
                    </span>
                    <span className="text-sm italic text-muted-foreground">
                      {v.transliteration}
                    </span>
                  </div>
                  <div className="text-end">
                    <span className="text-sm font-medium">
                      {v.translation}
                    </span>
                    <span className="ms-2 text-xs text-muted-foreground">
                      ({v.partOfSpeech})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("noVocabulary")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Flashcards */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <Layers className="h-4 w-4 text-primary" />
            {t("flashcardsCount", { count: flashcards.length })}
          </h2>
          <FlashcardViewer flashcards={flashcards} />
        </CardContent>
      </Card>

      {/* Quiz */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <HelpCircle className="h-4 w-4 text-primary" />
            {t("quizCount", { count: quiz.length })}
          </h2>
          <QuizPlayer questions={quiz} lessonId={lessonId} />
        </CardContent>
      </Card>
    </div>
  );
}
