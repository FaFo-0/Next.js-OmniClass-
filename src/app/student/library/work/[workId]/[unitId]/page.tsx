"use client";

// Unit reader — renders one unit of a work in the shared ReadingView, so
// word-tap → lookup → save works exactly as it does for legacy materials.

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { useTranslations } from "next-intl";
import { ReadingView } from "@/components/library/ReadingView";

export default function UnitReaderPage() {
  const { unitId } = useParams<{ workId: string; unitId: string }>();
  const data = useQuery(api.libraryWorks.getUnit, { id: unitId as Id<"libraryUnits"> });
  const learnerLocale = useQuery(api.users.getLearnerLocale, {});
  const saveProgress = useMutation(api.libraryWorks.saveProgress);
  const t = useTranslations("app.library");

  const unit = data?.unit;
  const savedUnitId = unit?._id;
  const savedWorkId = unit?.workId;
  const savedPosition = unit?.position;

  useEffect(() => {
    if (savedUnitId && savedWorkId && savedPosition !== undefined) {
      saveProgress({
        workId: savedWorkId,
        lastUnitPosition: savedPosition,
        unitId: savedUnitId,
      }).catch(() => {});
    }
  }, [savedUnitId, savedPosition, savedWorkId, saveProgress]);

  if (data === undefined) return <div className="p-6">{t("loading")}</div>;
  if (data === null) return <div className="p-6">{t("notFound")}</div>;

  return (
    <ReadingView
      work={data.work}
      unit={data.unit}
      mode="self-study"
      learnerLocale={learnerLocale}
    />
  );
}
