"use client";

// Teacher unit reader — live-teach mode. `?studentId=<externalId>` sets who the
// words go to; without it the text is readable but adding is disabled.

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { useAuth } from "@/lib/auth";
import { ReadingView } from "@/components/library/ReadingView";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";

export default function TeacherUnitReader() {
  const { workId, unitId } = useParams<{ workId: string; unitId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const activeStudentId = params.get("studentId") ?? undefined;

  const data = useQuery(api.libraryWorks.getUnit, { id: unitId as Id<"libraryUnits"> });
  const students = useQuery(api.users.getStudentsForTeacher, { teacherId: user?.externalId ?? "" }) ?? [];
  const activeStudent = students.find((s: any) => s.externalId === activeStudentId);
  const learnerLocale =
    useQuery(api.users.getLearnerLocale, activeStudentId ? { studentId: activeStudentId } : "skip") ?? undefined;

  function pick(studentId: string) {
    const q = new URLSearchParams(params.toString());
    if (studentId) q.set("studentId", studentId);
    else q.delete("studentId");
    router.replace(`?${q.toString()}`);
  }

  if (data === undefined) return <div className="p-6">Loading…</div>;
  if (data === null) return <div className="p-6">Not found.</div>;

  const { unit, work } = data;

  return (
    <div>
      <div className="max-w-3xl mx-auto px-6 pt-6" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href={`/teacher/library/work/${workId}${activeStudentId ? `?studentId=${activeStudentId}` : ""}`} className="link" style={{ color: "var(--brand-purple)" }}>
          ← Contents
        </Link>
        <span className="body-sm" style={{ fontWeight: 600 }}>Reading with:</span>
        <div style={{ minWidth: 220 }}>
          <Select value={activeStudentId ?? ""} onValueChange={(v) => pick(v ?? "")}>
            <SelectTrigger><span>{activeStudent?.name ?? "Pick a student"}</span></SelectTrigger>
            <SelectContent>
              {students.map((s: any) => (
                <SelectItem key={s.externalId} value={s.externalId}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {activeStudentId && !learnerLocale && (
          <Link href={`/teacher/students/${activeStudentId}`} className="pill" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
            No native language on file — set it to get translations
          </Link>
        )}
      </div>

      <ReadingView
        work={work}
        unit={unit}
        mode="live-teach"
        activeStudentId={activeStudentId}
        learnerLocale={learnerLocale}
      />
    </div>
  );
}
