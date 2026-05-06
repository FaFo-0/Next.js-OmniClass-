"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";

// Same listing as student. Teachers may pass `?studentId=...` to keep
// the active student in scope when they click into a material — that
// triggers the live-teach popover ("Send to Student's Flashcards").
export default function TeacherLibraryPage() {
  const materials = useQuery(api.library.listPublished) ?? [];
  const params = useSearchParams();
  const studentId = params.get("studentId");
  const linkSuffix = studentId ? `?studentId=${studentId}` : "";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Library"
        subtitle={
          studentId
            ? "Live-teach mode: tap a word to send it to the active student's flashcards."
            : "Browse materials. Open a material with a student selected to enter live-teach mode."
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {materials.map((m) => (
          <Link
            key={m._id}
            href={`/teacher/library/${m._id}${linkSuffix}`}
            className="rounded-lg border bg-white p-5 hover:shadow-md transition-shadow"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="flex justify-between items-start gap-3">
              <h3 className="font-semibold" style={{ color: "var(--omnic-gray-900)" }}>{m.title}</h3>
              {m.levelCEFR && <span className="pill pill-tenant">{m.levelCEFR}</span>}
            </div>
            {m.description && (
              <p className="mt-2 text-sm" style={{ color: "var(--omnic-gray-600)" }}>
                {m.description}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
