"use client";

// Unit reader — renders one unit of a work in the shared ReadingView, so
// word-tap → lookup → save works exactly as it does for legacy materials.

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { ReadingView } from "@/components/library/ReadingView";

export default function UnitReaderPage() {
  const { workId, unitId } = useParams<{ workId: string; unitId: string }>();
  const data = useQuery(api.libraryWorks.getUnit, { id: unitId as Id<"libraryUnits"> });
  const saveProgress = useMutation(api.libraryWorks.saveProgress);

  const unit = data?.unit;
  const work = data?.work;

  useEffect(() => {
    if (unit) {
      saveProgress({
        workId: unit.workId,
        lastUnitPosition: unit.position,
      }).catch(() => {});
    }
  }, [unit, saveProgress]);

  if (data === undefined) return <div className="p-6">Loading…</div>;
  if (data === null) return <div className="p-6">Not found.</div>;

  return <ReadingView work={work} unit={unit} mode="self-study" />;
}
