"use client";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useTranslations } from "next-intl";
import { api } from "@convex";
export function ReadingActivity({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("app.library");
  const activity = useQuery(api.libraryWorks.myReadingActivity);
  const words = useQuery(api.srs.listMyWords, {}) ?? [];
  const reviewed = useQuery(api.srs.countReviewsForStudent, {}) ?? 0;
  return <section className="card mb-5 p-4">
    {!compact && <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600">
      <span>{t("readingsCompleted", { count: activity?.completed ?? 0 })}</span>
      <span>{t("wordsCollected", { count: words.length })}</span>
      <span>{t("wordsReviewed", { count: reviewed })}</span>
    </div>}
    {(activity?.continueReading ?? []).map(item => <Link key={item.workId} className="mb-2 block link" href={`/student/library/work/${item.workId}/${item.unitId}`}><span className="font-semibold">{t("continueReading")}</span> · {item.title}</Link>)}
    <Link href="/student/calendar" className="btn btn-secondary">{t("bookTeacher")}</Link>
  </section>;
}
