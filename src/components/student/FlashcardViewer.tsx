"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

interface FlashcardViewerProps {
  flashcards: Array<{ front: string; back: string }>;
}

export function FlashcardViewer({ flashcards }: FlashcardViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const t = useTranslations("components.flashcard");

  if (flashcards.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {t("noFlashcards")}
      </p>
    );
  }

  const card = flashcards[currentIndex];

  const goNext = () => {
    setIsFlipped(false);
    setCurrentIndex((i) => Math.min(i + 1, flashcards.length - 1));
  };

  const goPrev = () => {
    setIsFlipped(false);
    setCurrentIndex((i) => Math.max(i - 1, 0));
  };

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Progress */}
      <p className="text-sm text-muted-foreground">
        {t("progress", { current: currentIndex + 1, total: flashcards.length })}
      </p>

      {/* Card */}
      <div
        className="perspective-1000 w-full max-w-sm cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
        style={{ perspective: "1000px" }}
      >
        <div
          className="relative h-52 transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-primary/20 bg-card p-6 shadow-sm"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-3xl font-bold" dir="rtl" lang="ar">
              {card.front}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              {t("tapToFlip")}
            </p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-primary/20 bg-primary/5 p-6 shadow-sm"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <p className="text-xl font-semibold">{card.back}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              {t("tapToFlipBack")}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={goPrev}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsFlipped(false)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={goNext}
          disabled={currentIndex === flashcards.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
