"use client";
import Link from "next/link";
import { BookOpen, ArrowUpRight, Clock3 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Doc } from "@convex/dataModel";
const KIND_KEYS = ["article", "story", "dialog", "transcript", "pdf", "book", "video", "resource"] as const;
export function WorkCard({ work, href, status }: { work: Doc<"libraryWorks">; href: string; status?: string }) {
  const t = useTranslations("app.library");
  const key = KIND_KEYS.find(k => k === work.kind);
  const kind = key ? t(`kinds.${key}`) : work.kind;
  return <Link href={href} className="card work-card" style={{ overflow: "hidden", display: "flex", minWidth: 0 }}>
    <div className={`catalogue-cover catalogue-cover-${work.kind}`}>
      {work.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={work.coverImageUrl} alt="" loading="lazy" />
      ) : <><BookOpen size={28} strokeWidth={1.3} /><span>{kind}</span></>}
      {work.levelCEFR && <span className="catalogue-level">{work.levelCEFR}</span>}
    </div>
    <div className="catalogue-card-body"><div className="catalogue-card-kind">{kind}{work.externalUrl && <ArrowUpRight size={14} aria-label={t("external")} />}</div><h2>{work.title}</h2>{work.author && <p className="catalogue-author">{work.author}</p>}{work.description && <p className="catalogue-description">{work.description}</p>}<div className="catalogue-card-footer">{work.estimatedReadMinutes ? <span><Clock3 size={13} />{t("minRead", { count: work.estimatedReadMinutes })}</span> : <span>{t(work.hasText === false ? "external" : "insideReading")}</span>}{status && <strong>{status}</strong>}</div></div>
  </Link>;
}
