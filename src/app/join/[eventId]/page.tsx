"use client";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
export default function JoinLessonPage() {
  const t = useTranslations("app.meet");
  const { eventId } = useParams<{ eventId: string }>();
  const info = useQuery(api.schedule.getJoinInfo, { eventId: eventId as Id<"scheduleEvents"> });
  const safeUrl = info?.url && /^https:\/\/meet\.google\.com\//i.test(info.url) ? info.url : null;
  useEffect(() => { if (safeUrl) window.location.replace(safeUrl); }, [safeUrl]);
  return <main className="mx-auto max-w-md p-8 text-center">
    {info === undefined || safeUrl ? t("opening") : t("unavailable")}
  </main>;
}
