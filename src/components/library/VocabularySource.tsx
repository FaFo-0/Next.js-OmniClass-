"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export function VocabularySource({ card }: { card: { sourceWorkId?: string; sourceUnitId?: string; sourceLessonId?: string } }) {
  const t = useTranslations("app.library");
  const href = card.sourceWorkId ? `/student/library/work/${card.sourceWorkId}${card.sourceUnitId ? `/${card.sourceUnitId}` : ""}` : card.sourceLessonId ? `/student/lessons/${card.sourceLessonId}` : null;
  return href ? <Link href={href} className="link text-xs" onClick={e => e.stopPropagation()}>{t(card.sourceWorkId ? "originalReading" : "originalLesson")}</Link> : null;
}
