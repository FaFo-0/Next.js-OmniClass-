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
  const t = useTranslations("app.library");
  const kindKey = KIND_KEYS.find((key) => key === work.kind);
  const kindLabel = kindKey ? t(`kinds.${kindKey}`) : work.kind;
  const cardContent = (
    <>
      {work.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={work.coverImageUrl}
          alt=""
          className="work-card-cover"
          style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          className="work-card-cover"
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
        <div className="text-sm font-semibold" style={{ color: "var(--omnic-gray-900)", overflowWrap: "anywhere" }}>
          {work.title}
        </div>
        {work.author && (
          <div className="text-xs mt-0.5" style={{ color: "var(--omnic-gray-500)", overflowWrap: "anywhere" }}>
            {work.author}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {work.levelCEFR && <span className="pill pill-tenant">{work.levelCEFR}</span>}
          <span className="pill pill-new">{kindLabel}</span>
          {work.externalUrl && <span className="pill pill-tenant">{t("external")}</span>}
        </div>
        {work.externalUrl && (
          <div className="mt-3 text-sm font-semibold" style={{ color: "var(--brand-purple, #6716A4)" }}>
            {t("openExternal")}
          </div>
        )}
      </div>
    </>
  );

  if (work.externalUrl) {
    return (
      <a
        href={work.externalUrl}
        target="_blank"
        rel="noreferrer"
        className="card work-card"
        style={{ overflow: "hidden", display: "block", minWidth: 0 }}
        aria-label={t("openExternal")}
      >
        {cardContent}
      </a>
    );
  }

  return (
    <Link href={href} className="card work-card" style={{ overflow: "hidden", display: "block", minWidth: 0 }}>
      {cardContent}
    </Link>
  );
}
