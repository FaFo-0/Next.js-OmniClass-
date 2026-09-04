"use client";

// Teacher work detail — table of contents, with a student picker so opening a
// unit enters live-teach mode and tapped words go to that student's deck.

import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { useAuth } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const KIND_LABELS: Record<string, string> = {
  book: "Book",
  article: "Article",
  story: "Story",
  dialog: "Dialogue",
  transcript: "Transcript",
};

export default function TeacherWorkDetail() {
  const { workId } = useParams<{ workId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const activeStudentId = params.get("studentId") ?? undefined;

  const data = useQuery(api.libraryWorks.getWork, { id: workId as Id<"libraryWorks"> });
  const students = useQuery(api.users.getStudentsForTeacher, { teacherId: user?.externalId ?? "" }) ?? [];
  const activeStudent = students.find((s: any) => s.externalId === activeStudentId);

  function pick(studentId: string) {
    const q = new URLSearchParams(params.toString());
    if (studentId) q.set("studentId", studentId);
    else q.delete("studentId");
    router.replace(`?${q.toString()}`);
  }

  if (data === undefined) return <div className="p-6">Loading…</div>;
  if (data === null) return <div className="p-6">Not found.</div>;

  const { work, units } = data;
  const suffix = activeStudentId ? `?studentId=${activeStudentId}` : "";

  return (
    <div className="max-w-3xl mx-auto py-6 px-6">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
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
        {!activeStudentId && (
          <span className="pill" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
            Pick a student to save words
          </span>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold" style={{ color: "var(--omnic-gray-900)" }}>{work.title}</h1>
          <span className="pill pill-tenant">{KIND_LABELS[work.kind] ?? work.kind}</span>
          {work.levelCEFR && <span className="pill pill-new">{work.levelCEFR}</span>}
        </div>
        {work.author && <p className="mt-1 text-sm" style={{ color: "var(--omnic-gray-600)" }}>{work.author}</p>}
        {work.description && <p className="mt-2 text-sm" style={{ color: "var(--omnic-gray-600)" }}>{work.description}</p>}
      </div>

      <div className="mt-6 rounded-lg border bg-white overflow-hidden" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--omnic-gray-500)", borderBottom: "1px solid var(--omnic-gray-100)" }}>
          Contents
        </div>
        {units.map((u) => (
          <Link
            key={u._id}
            href={`/teacher/library/work/${work._id}/${u._id}${suffix}`}
            className="flex items-center justify-between px-5 py-3 border-b last:border-0 hover:bg-zinc-50"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <span className="text-sm font-medium" style={{ color: "var(--omnic-gray-800)" }}>{u.title}</span>
            {u.estimatedReadMinutes && (
              <span className="text-xs" style={{ color: "var(--omnic-gray-400)" }}>{u.estimatedReadMinutes} min</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
