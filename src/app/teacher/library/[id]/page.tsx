"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { ReadingView } from "@/components/library/ReadingView";

// `?studentId=<externalId>` flips word-tap CTA to "Send to Student's
// Flashcards". Without it, teacher reads in self-study mode.
export default function TeacherLibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const activeStudentId = params.get("studentId") ?? undefined;

  const material = useQuery(api.library.get, {
    id: id as Id<"libraryMaterials">,
  });
  if (material === undefined) return null;
  if (material === null) return <div className="p-6">Not found.</div>;

  return (
    <ReadingView
      material={material}
      mode={activeStudentId ? "live-teach" : "self-study"}
      activeStudentId={activeStudentId}
    />
  );
}
