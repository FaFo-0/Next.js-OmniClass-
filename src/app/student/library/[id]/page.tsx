"use client";

// Student reading — the same surface the teacher uses, so a text read alone
// behaves exactly like one read together in a lesson.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { ReadingView } from "@/components/library/ReadingView";
import { Icon } from "@/components/shared/icons";

export default function StudentLibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const material = useQuery(api.library.get, {
    id: id as Id<"libraryMaterials">,
  });
  // The language cards get translated into — the student's native language,
  // not the language they happen to read the app in.
  const learnerLocale = useQuery(api.users.getLearnerLocale, {});

  if (material === undefined) {
    // Reserve the final layout instead of collapsing and snapping back.
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
  if (material === null) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-6" style={{ textAlign: "center" }}>
        <div className="h3" style={{ marginBottom: 8 }}>Reading not found</div>
        <Link href="/student/library" className="body-sm" style={{ color: "var(--brand-purple)" }}>
          Back to the library
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div
        className="max-w-3xl mx-auto px-6 pt-6"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/student/library"
          className="body-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--brand-purple)" }}
        >
          <Icon name="chevronLeft" size={14} /> Library
        </Link>
        <span
          className="body-sm"
          style={{ color: "var(--omnic-gray-500)", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              borderRadius: 3,
              background: "rgba(22,163,74,0.14)",
              boxShadow: "inset 0 -2px 0 rgba(22,163,74,0.5)",
            }}
          />
          already in your words · tap any word to add it
        </span>
      </div>
      <ReadingView
        material={material}
        mode="self-study"
        learnerLocale={learnerLocale ?? undefined}
      />
    </div>
  );
}
