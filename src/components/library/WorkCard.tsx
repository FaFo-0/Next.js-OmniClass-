"use client";

// A single catalogue card for a Library 2.0 "work" (reading). Shared by the
// student and teacher library grids.

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Doc } from "@convex/dataModel";

const KIND_KEYS = ["article", "story", "dialog", "transcript", "pdf", "book"] as const;

export function WorkCard({
  work,
  href,
}: {
  work: Doc<"libraryWorks">;
  href: string;
}) {
  const t = useTranslations("app.library.kinds");
  const kindKey = KIND_KEYS.find((key) => key === work.kind);
  const kindLabel = kindKey ? t(kindKey) : work.kind;

  return (
    <Link href={href} className="card" style={{ overflow: "hidden", display: "block" }}>
      {work.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={work.coverImageUrl}
          alt=""
          style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--brand-purple-tint, rgba(103,22,164,0.06))",
            color: "var(--brand-purple, #6716A4)",
            fontWeight: 700,
            fontSize: 20,
          }}
        >
          {kindLabel}
        </div>
      )}
      <div style={{ padding: 14 }}>
        <div className="text-sm font-semibold" style={{ color: "var(--omnic-gray-900)" }}>
          {work.title}
        </div>
        {work.author && (
          <div className="text-xs mt-0.5" style={{ color: "var(--omnic-gray-500)" }}>
            {work.author}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {work.levelCEFR && <span className="pill pill-tenant">{work.levelCEFR}</span>}
          <span className="pill pill-new">{kindLabel}</span>
        </div>
      </div>
    </Link>
  );
}
