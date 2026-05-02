"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, ArrowRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface QuizPlayerProps {
  questions: QuizQuestion[];
  lessonId: string;
}

export function QuizPlayer({ questions, lessonId }: QuizPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const t = useTranslations("components.quiz");

  const { currentUserId } = useAuth();
  const publishedLessons = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  );
  const quizAttempts = useQuery(
    api.study.getQuizAttemptsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const reviewLogs = useQuery(
    api.study.getReviewLogsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];
  const achievements = useQuery(api.achievements.listAchievements) ?? [];
  const streakData = useQuery(
    api.streaks.getStreak,
    currentUserId ? { studentId: currentUserId } : "skip"
  );

  const addQuizAttemptMut = useMutation(api.study.addQuizAttempt);
  const recordActivityMut = useMutation(api.streaks.recordActivity);
  const checkAndGrantAchievementsMut = useMutation(
    api.achievements.checkAndGrantAchievements
  );

  const handleFinish = useCallback(
    async (finalScore: number) => {
      if (!currentUserId) return;

      // Record quiz attempt
      await addQuizAttemptMut({
        lessonId,
        studentId: currentUserId,
        score: finalScore,
        total: questions.length,
        completedAt: new Date().toISOString(),
      });

      // Record activity for streak
      const streakResult = await recordActivityMut({ studentId: currentUserId });
      if (streakResult?.incremented) {
        toast.success(`🔥 ${streakResult.newStreak} day streak! Keep it up!`, {
          duration: 4000,
        });
      }

      // Check achievements
      const publishedCount = publishedLessons?.length ?? 0;
      const allAttempts = [
        ...quizAttempts,
        { score: finalScore, total: questions.length },
      ];
      const perfectCount = allAttempts.filter(
        (a) => a.score === a.total
      ).length;

      const newAchievements = await checkAndGrantAchievementsMut({
        studentId: currentUserId,
        stats: {
          lessonsCompleted: publishedCount,
          totalCardsReviewed: reviewLogs.length,
          perfectQuizzes: perfectCount,
          vocabLearned: 0,
          currentStreak: streakData?.currentStreak ?? 0,
        },
      });

      if (newAchievements && newAchievements.length > 0) {
        for (const achId of newAchievements) {
          const ach = achievements.find((a) => a.externalId === achId);
          if (ach) {
            toast.success(t("achievementUnlocked", { icon: ach.icon, name: ach.name }));
          }
        }
      }
    },
    [
      currentUserId,
      lessonId,
      questions.length,
      publishedLessons,
      quizAttempts,
      reviewLogs,
      achievements,
      streakData,
      addQuizAttemptMut,
      recordActivityMut,
      checkAndGrantAchievementsMut,
    ]
  );

  if (questions.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {t("noQuiz")}
      </p>
    );
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle className="h-10 w-10 text-primary" />
        </div>
        <h3 className="text-2xl font-bold">{t("complete")}</h3>
        <p className="text-lg">
          {t("youScored", { score, total: questions.length })}
        </p>
        <p className="text-sm text-muted-foreground">
          {score === questions.length
            ? t("perfectScore")
            : score >= questions.length / 2
              ? t("goodWork")
              : t("keepStudying")}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setCurrentIndex(0);
            setSelectedAnswer(null);
            setScore(0);
            setFinished(false);
          }}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          {t("retry")}
        </Button>
      </div>
    );
  }

  const question = questions[currentIndex];
  const isAnswered = selectedAnswer !== null;
  const isCorrect = selectedAnswer === question.correctIndex;

  const handleSelect = (index: number) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
    if (index === question.correctIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex === questions.length - 1) {
      const finalScore = score + (selectedAnswer === question.correctIndex ? 0 : 0);
      // score already updated in handleSelect
      setFinished(true);
      handleFinish(score);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
    }
  };

  return (
    <div className="space-y-6 py-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {t("questionOf", { index: currentIndex + 1, total: questions.length })}
        </span>
        <span className="font-medium text-primary">
          {t("score", { score, answered: currentIndex + (isAnswered ? 1 : 0) })}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${((currentIndex + (isAnswered ? 1 : 0)) / questions.length) * 100}%`,
          }}
        />
      </div>

      {/* Question */}
      <h3 className="text-lg font-semibold">{question.question}</h3>

      {/* Options */}
      <div className="grid gap-2">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer === i;
          const isRight = i === question.correctIndex;

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={isAnswered}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-start text-sm font-medium transition-all",
                !isAnswered &&
                  "hover:border-primary hover:bg-primary/5 cursor-pointer",
                isAnswered && isRight && "border-green-500 bg-green-50",
                isAnswered &&
                  isSelected &&
                  !isRight &&
                  "border-red-500 bg-red-50",
                isAnswered &&
                  !isSelected &&
                  !isRight &&
                  "border-border opacity-50"
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{option}</span>
              {isAnswered && isRight && (
                <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
              )}
              {isAnswered && isSelected && !isRight && (
                <XCircle className="h-5 w-5 shrink-0 text-red-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {isAnswered && (
        <div
          className={cn(
            "rounded-lg p-3 text-sm",
            isCorrect
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          )}
        >
          {question.explanation}
        </div>
      )}

      {/* Next */}
      {isAnswered && (
        <div className="flex justify-end">
          <Button onClick={handleNext} className="gap-2">
            {currentIndex === questions.length - 1
              ? t("seeResults")
              : t("nextQuestion")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
