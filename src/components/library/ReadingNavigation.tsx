"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@convex";
import type { Doc } from "@convex/dataModel";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
export function ReadingNavigation({ unit, mode, studentId }: { unit: Doc<"libraryUnits">; mode: string; studentId?: string }) {
  const t = useTranslations("app.library");
  const { user } = useAuth();
  const data = useQuery(api.libraryWorks.getWork, { id: unit.workId });
  const progress = useQuery(api.libraryWorks.getProgress, mode === "self-study" ? { workId: unit.workId } : "skip");
  const save = useMutation(api.libraryWorks.saveProgress);
  const [saving, setSaving] = useState(false);
  const units = data?.units ?? [];
  const index = units.findIndex(u => u._id === unit._id);
  const base = mode === "live-teach" ? "/teacher/library/work" : "/student/library/work";
  const suffix = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  return <nav aria-label={t("chapters")} className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
    <Link className="btn btn-secondary" href={`${base}/${unit.workId}${suffix}`}>{t("contents")}</Link>
    {index > 0 && <Link className="btn btn-secondary" href={`${base}/${unit.workId}/${units[index - 1]._id}${suffix}`}>{t("previousChapter")}</Link>}
    {index >= 0 && index < units.length - 1 && <Link className="btn btn-tenant" href={`${base}/${unit.workId}/${units[index + 1]._id}${suffix}`}>{t("nextChapter")}</Link>}
    {user?.role === "student" && index >= 0 && index === units.length - 1 && <button className="btn btn-tenant" disabled={saving || !!progress?.completedAt} onClick={async () => {
      setSaving(true);
      try { await save({ workId: unit.workId, unitId: unit._id, lastUnitPosition: unit.position, completed: true }); }
      catch { toast.error(t("saveFailed")); } finally { setSaving(false); }
    }}>{t(progress?.completedAt ? "completedReading" : "completeReading")}</button>}
  </nav>;
}
