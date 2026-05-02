"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Check, Lock, ChevronDown, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useMutation } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Id } from "@convex/dataModel";

interface LessonPathLesson {
  _id: Id<"lessons">;
  externalId: string;
  title: string;
  status: string;
  order: number;
}

interface LessonPathProps {
  lessons: LessonPathLesson[];
  onLessonClick: (lessonId: string) => void;
  showAll?: boolean;
  currentLessonIndex?: number;
}

// Gentle zigzag: right, left, right, left
const ZIGZAG = 35; // px from center — subtle, not extreme
const BUTTON_SIZE = 70;
const BOTTOM_EDGE = 7; // thickness of the "coin edge" under the button
const ROW_HEIGHT = 130;
const PATH_WIDTH = 260;
const LABEL_WIDTH = 140; // wider than button so text isn't clipped

export function LessonPath({
  lessons,
  onLessonClick,
  showAll = false,
  currentLessonIndex,
}: LessonPathProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations("components.lessonPath");
  const { currentPortal } = useAuth();
  const canManage = showAll || currentPortal === "admin";
  const deleteLesson = useMutation(api.lessons.deleteLesson);
  const [deletingLesson, setDeletingLesson] = useState<LessonPathLesson | null>(null);

  const displayLessons = showAll
    ? lessons
    : lessons.filter((l) => l.status === "published");

  const activeIndex = currentLessonIndex ?? displayLessons.length - 1;

  useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [displayLessons.length]);

  const getNodeCenter = useCallback((index: number) => {
    const side = index % 2 === 0 ? 1 : -1;
    const cx = PATH_WIDTH / 2 + side * ZIGZAG;
    const cy = 40 + index * ROW_HEIGHT + BUTTON_SIZE / 2;
    return { cx, cy };
  }, []);

  const totalNodes = displayLessons.length + (showAll ? 0 : 1);
  const svgHeight = 40 + totalNodes * ROW_HEIGHT + 30; // extra room for last label

  if (displayLessons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div
          className="mb-4 flex items-center justify-center rounded-full bg-muted"
          style={{
            width: 80,
            height: 80,
            boxShadow: `0 ${BOTTOM_EDGE}px 0 0 hsl(var(--border))`,
          }}
        >
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-muted-foreground">
          {t("noLessons")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {showAll ? t("recordFirst") : t("teacherNotPublished")}
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="py-4">
      <div
        className="relative mx-auto"
        style={{ width: PATH_WIDTH, minHeight: svgHeight }}
      >
        {/* SVG connecting paths */}
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={PATH_WIDTH}
          height={svgHeight}
        >
          {Array.from({ length: totalNodes }).map((_, i) => {
            if (i === 0) return null;
            const prev = getNodeCenter(i - 1);
            const curr = getNodeCenter(i);
            const isCompleted = i <= activeIndex;
            const isPlaceholder = !showAll && i === displayLessons.length;

            const midY = (prev.cy + curr.cy) / 2;

            return (
              <path
                key={i}
                d={`M ${prev.cx} ${prev.cy + BUTTON_SIZE / 2 + BOTTOM_EDGE}
                    C ${prev.cx} ${midY},
                      ${curr.cx} ${midY},
                      ${curr.cx} ${curr.cy - BUTTON_SIZE / 2}`}
                fill="none"
                stroke={
                  isPlaceholder
                    ? "hsl(var(--border))"
                    : isCompleted
                      ? "hsl(var(--primary) / 0.35)"
                      : "hsl(var(--border))"
                }
                strokeWidth={isPlaceholder ? 3 : 4}
                strokeDasharray={isPlaceholder ? "8 6" : "none"}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Lesson nodes */}
        {displayLessons.map((lesson, index) => {
          const isPublished = lesson.status === "published";
          const isDraft = canManage && !isPublished;
          const isDone = index < activeIndex;
          const isCurrent = index === activeIndex;
          const isLocked = !showAll && index > activeIndex;
          const side = index % 2 === 0 ? 1 : -1;
          const nodeX = PATH_WIDTH / 2 + side * ZIGZAG;
          const top = 40 + index * ROW_HEIGHT;

          return (
            <div
              key={lesson.externalId}
              className={cn(
                "absolute flex flex-col items-center",
                isDraft && "opacity-40"
              )}
              style={{
                top,
                left: nodeX - LABEL_WIDTH / 2,
                width: LABEL_WIDTH,
              }}
            >
              {/* Bouncing arrow for current lesson */}
              {isCurrent && !isDraft && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 animate-bounce">
                  <ChevronDown className="h-6 w-6 text-primary" />
                </div>
              )}

              {/* Duolingo-style puck button */}
              <div className="group relative">
                <button
                  ref={isCurrent && !isDraft ? currentRef : undefined}
                  onClick={() => !isLocked && onLessonClick(lesson.externalId)}
                  disabled={isLocked}
                  style={{
                    width: BUTTON_SIZE,
                    height: BUTTON_SIZE,
                  }}
                  className={cn(
                    "relative flex items-center justify-center rounded-full font-extrabold",
                    "select-none transition-all duration-75 ease-in-out",

                    // ── Draft ──
                    isDraft && [
                      "border-[3px] border-dashed border-muted-foreground/30 bg-muted/60 text-muted-foreground",
                      "shadow-[0_7px_0_0_hsl(var(--border))]",
                      "active:translate-y-[7px] active:shadow-none",
                    ],

                    // ── Completed: green face, darker green bottom edge ──
                    !isDraft && isDone && [
                      "bg-primary text-primary-foreground",
                      "shadow-[0_7px_0_0_hsl(var(--primary)/0.55)]",
                      "hover:brightness-110",
                      "active:translate-y-[7px] active:shadow-none",
                    ],

                    // ── Current: same as completed + ring ──
                    !isDraft && isCurrent && [
                      "bg-primary text-primary-foreground",
                      "shadow-[0_7px_0_0_hsl(var(--primary)/0.55)]",
                      "ring-[6px] ring-primary/15 ring-offset-[3px] ring-offset-background",
                      "hover:brightness-110",
                      "active:translate-y-[7px] active:shadow-none",
                    ],

                    // ── Locked: gray face, darker gray bottom edge ──
                    !isDraft && isLocked && [
                      "cursor-not-allowed bg-muted text-muted-foreground/50",
                      "shadow-[0_7px_0_0_hsl(var(--border))]",
                    ],

                    // ── Available (not started) ──
                    !isDraft && !isDone && !isCurrent && !isLocked && [
                      "border-[3px] border-primary/40 bg-card text-primary",
                      "shadow-[0_7px_0_0_hsl(var(--border))]",
                      "hover:border-primary hover:brightness-105",
                      "active:translate-y-[7px] active:shadow-none",
                    ]
                  )}
                >
                  {isDone && !isDraft ? (
                    <Check className="h-8 w-8" strokeWidth={3.5} />
                  ) : isLocked ? (
                    <Lock className="h-6 w-6" />
                  ) : isCurrent ? (
                    <Star className="h-8 w-8" fill="currentColor" />
                  ) : (
                    <span className="text-xl">{index + 1}</span>
                  )}
                </button>

                {/* Delete button for drafts (teacher view) */}
                {isDraft && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingLesson(lesson);
                    }}
                    className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "mt-3 w-full text-center text-xs font-semibold leading-snug",
                  isDraft && "text-muted-foreground italic",
                  !isDraft && isDone && "text-primary/80",
                  !isDraft && isCurrent && "text-foreground",
                  isLocked && "text-muted-foreground/50",
                  !isDraft && !isDone && !isCurrent && !isLocked && "text-foreground/70"
                )}
              >
                {lesson.title}
                {isDraft && (
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {t("draft")}
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {/* Placeholder node (student view) */}
        {!showAll && (() => {
          const pi = displayLessons.length;
          const side = pi % 2 === 0 ? 1 : -1;
          const nodeX = PATH_WIDTH / 2 + side * ZIGZAG;
          const top = 40 + pi * ROW_HEIGHT;
          return (
            <div
              className="absolute flex flex-col items-center"
              style={{
                top,
                left: nodeX - LABEL_WIDTH / 2,
                width: LABEL_WIDTH,
              }}
            >
              <div
                className="flex items-center justify-center rounded-full border-[3px] border-dashed border-border/40 bg-muted/10"
                style={{
                  width: BUTTON_SIZE - 4,
                  height: BUTTON_SIZE - 4,
                  boxShadow: `0 ${BOTTOM_EDGE}px 0 0 hsl(var(--border) / 0.25)`,
                }}
              >
                <Lock className="h-6 w-6 text-muted-foreground/25" />
              </div>
              <span className="mt-3 text-xs font-medium text-muted-foreground/35">
                {t("nextLesson")}
              </span>
            </div>
          );
        })()}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deletingLesson} onOpenChange={(open) => !open && setDeletingLesson(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { title: deletingLesson?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deletingLesson) {
                  await deleteLesson({ id: deletingLesson._id });
                  setDeletingLesson(null);
                }
              }}
            >
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
