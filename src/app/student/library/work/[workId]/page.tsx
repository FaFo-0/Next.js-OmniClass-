"use client";

// Work detail — table of contents. A book shows its chapters; an article is a
// single unit. Opens a unit in the shared ReadingView.

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";

const KIND_LABELS: Record<string, string> = {
  book: "Book",
  article: "Article",
  story: "Story",
  dialog: "Dialogue",
  transcript: "Transcript",
};

export default function WorkDetailPage() {
  const { workId } = useParams<{ workId: string }>();
  const data = useQuery(api.libraryWorks.getWork, { id: workId as Id<"libraryWorks"> });

  if (data === undefined) return <div className="p-6">Loading…</div>;
  if (data === null) return <div className="p-6">Not found.</div>;

  const { work, units } = data;

  return (
    <div className="max-w-3xl mx-auto py-6 px-6">
      <Link href="/student/library" className="text-sm link" style={{ color: "var(--brand-purple)" }}>
        ← Library
      </Link>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold" style={{ color: "var(--omnic-gray-900)" }}>{work.title}</h1>
          <span className="pill pill-tenant">{KIND_LABELS[work.kind] ?? work.kind}</span>
          {work.levelCEFR && <span className="pill pill-new">{work.levelCEFR}</span>}
        </div>
        {work.author && (
          <p className="mt-1 text-sm" style={{ color: "var(--omnic-gray-600)" }}>{work.author}</p>
        )}
        {work.description && (
          <p className="mt-2 text-sm" style={{ color: "var(--omnic-gray-600)" }}>{work.description}</p>
        )}
        {(work.license || work.attribution) && (
          <p className="mt-3 text-xs" style={{ color: "var(--omnic-gray-400)" }}>
            {[work.license, work.attribution].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <div className="mt-6 rounded-lg border bg-white overflow-hidden" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--omnic-gray-500)", borderBottom: "1px solid var(--omnic-gray-100)" }}>
          Contents
        </div>
        {units.map((u) => (
          <Link
            key={u._id}
            href={`/student/library/work/${work._id}/${u._id}`}
            className="flex items-center justify-between px-5 py-3 border-b last:border-0 hover:bg-zinc-50"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <span className="text-sm font-medium" style={{ color: "var(--omnic-gray-800)" }}>{u.title}</span>
            {u.estimatedReadMinutes && (
              <span className="text-xs" style={{ color: "var(--omnic-gray-400)" }}>
                {u.estimatedReadMinutes} min
              </span>
            )}
          </Link>
        ))}
        {units.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">No content yet.</div>
        )}
      </div>
    </div>
  );
}
