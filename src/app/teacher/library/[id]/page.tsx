"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
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

/**
 * Teachers read *for* a student — they have no flashcard deck of their own.
 * `?studentId=<externalId>` sets who the words go to; without it the text is
 * still readable but word-adding is disabled until a student is picked.
 */
export default function TeacherLibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const activeStudentId = params.get("studentId") ?? undefined;

  const material = useQuery(api.library.get, {
    id: id as Id<"libraryMaterials">,
  });
  const students =
    useQuery(api.users.getStudentsForTeacher, {
      teacherId: user?.externalId ?? "",
    }) ?? [];

  const activeStudent = students.find(
    (s: any) => s.externalId === activeStudentId
  );
  // Translate into the student's NATIVE language, not the language they happen
  // to read the app in — a Russian speaker using the English UI still needs
  // Russian on the back of the card.
  const detail = useQuery(
    api.users.getStudentDetailForTeacher,
    activeStudentId ? { studentId: activeStudentId } : "skip"
  );
  const learnerLocale =
    detail?.profile.l1 ?? (activeStudent as any)?.locale ?? undefined;

  function pick(studentId: string) {
    const q = new URLSearchParams(params.toString());
    if (studentId) q.set("studentId", studentId);
    else q.delete("studentId");
    router.replace(`?${q.toString()}`);
  }

  if (material === undefined) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-6" aria-busy="true">
        <div className="skel" style={{ height: 28, width: "60%", borderRadius: 6 }} />
        <div className="skel" style={{ height: 14, width: "40%", borderRadius: 6, marginTop: 10 }} />
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="skel"
              style={{ height: 14, borderRadius: 6, width: i % 4 === 3 ? "70%" : "100%" }}
            />
          ))}
        </div>
      </div>
    );
  }
  if (material === null) return <div className="p-6">Not found.</div>;

  return (
    <div>
      {/* Who am I reading with? Words go to this student's flashcards. */}
      <div
        className="max-w-3xl mx-auto px-6 pt-6"
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
      >
        <span className="body-sm" style={{ fontWeight: 600 }}>
          Reading with:
        </span>
        <div style={{ minWidth: 220 }}>
          <Select value={activeStudentId ?? ""} onValueChange={(v) => pick(v ?? "")}>
            <SelectTrigger>
              <span>{activeStudent?.name ?? "Pick a student"}</span>
            </SelectTrigger>
            <SelectContent>
              {students.map((s: any) => (
                <SelectItem key={s.externalId} value={s.externalId}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {activeStudentId ? (
          <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
            Tap any word to send it to {activeStudent?.name ?? "their"} flashcards.
          </span>
        ) : (
          <span
            className="pill"
            style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}
          >
            Pick a student to save words
          </span>
        )}
      </div>

      <ReadingView
        material={material}
        mode="live-teach"
        activeStudentId={activeStudentId}
        learnerLocale={learnerLocale}
      />
    </div>
  );
}
