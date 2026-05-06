"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";

export default function StudentLibraryPage() {
  const materials = useQuery(api.library.listPublished) ?? [];
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Library"
        subtitle="Read on your own. Tap any word to see its meaning and add it to your flashcards."
      />
      {materials.length === 0 && (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-zinc-500" style={{ borderColor: "var(--omnic-gray-100)" }}>
          No materials available yet.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {materials.map((m) => (
          <Link
            key={m._id}
            href={`/student/library/${m._id}`}
            className="rounded-lg border bg-white p-5 hover:shadow-md transition-shadow"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="flex justify-between items-start gap-3">
              <h3 className="font-semibold" style={{ color: "var(--omnic-gray-900)" }}>{m.title}</h3>
              {m.levelCEFR && (
                <span className="pill pill-tenant">{m.levelCEFR}</span>
              )}
            </div>
            {m.description && (
              <p className="mt-2 text-sm" style={{ color: "var(--omnic-gray-600)" }}>
                {m.description}
              </p>
            )}
            <div className="mt-3 flex gap-2 text-xs" style={{ color: "var(--omnic-gray-500)" }}>
              <span className="capitalize">{m.kind}</span>
              {m.estimatedReadMinutes && <span>· {m.estimatedReadMinutes} min</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
