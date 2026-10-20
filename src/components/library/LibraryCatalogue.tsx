"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import type { Doc, Id } from "@convex/dataModel";
import { LibraryFilters } from "./LibraryFilters";
import { WorkCard } from "./WorkCard";
import { cataloguePage, filterLibrary, initialLibraryFilter } from "@/lib/libraryCatalogue";

type Activity = { completed: number; recent: { workId: Id<"libraryWorks">; unitId?: Id<"libraryUnits">; completed: boolean }[] };
export function LibraryCatalogue({ works, activity, baseHref, suffix = "", children }: { works: Doc<"libraryWorks">[] | undefined; activity?: Activity; baseHref: string; suffix?: string; children?: ReactNode }) {
  const t = useTranslations("app.library");
  const [tab, setTab] = useState("browse");
  const [filter, setFilter] = useState(initialLibraryFilter);
  const [sort, setSort] = useState("recommended");
  const [page, setPage] = useState(0);
  const all = works ?? [];
  const recent = activity?.recent ?? [];
  const recentById = new Map(recent.map(r => [r.workId, r]));
  const source = tab === "recent" ? recent.flatMap(r => { const work = all.find(w => w._id === r.workId); return work ? [work] : []; }) : all;
  const filtered = filterLibrary(source, filter);
  if (sort === "title") filtered.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "shortest") filtered.sort((a, b) => (a.estimatedReadMinutes ?? Infinity) - (b.estimatedReadMinutes ?? Infinity));
  const result = cataloguePage(filtered, page);
  return <section className="library-catalogue">
    <header className="catalogue-heading"><div><h1 className="h1">{t("title")}</h1><p>{t("catalogueSubtitle")}</p></div>{activity && <span className="catalogue-completed"><BookOpen size={16} />{t("readingsCompleted", { count: activity.completed })}</span>}</header>
    {children}
    {activity && <div className="catalogue-tabs" role="tablist" aria-label={t("title")}>{["browse", "recent"].map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setPage(0); setSort("recommended"); }}>{t(value)}</button>)}</div>}
    <LibraryFilters works={all} value={filter} onChange={value => { setFilter(value); setPage(0); }} />
    <div className="catalogue-results"><span aria-live="polite">{works === undefined ? t("loading") : t("materialCount", { count: filtered.length })}</span><label>{t("sort")}<select value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="recommended">{t(tab === "recent" ? "lastOpened" : "recommended")}</option><option value="title">{t("titleSort")}</option><option value="shortest">{t("shortest")}</option></select></label></div>
    <div className="library-grid">
      {works === undefined && Array.from({ length: 6 }, (_, i) => <div key={i} className="card skel" style={{ height: 280 }} />)}
      {result.items.map(work => { const progress = recentById.get(work._id); const resume = tab === "recent" && progress?.unitId; return <WorkCard key={work._id} work={work} href={`${baseHref}/${work._id}${resume ? `/${progress.unitId}` : ""}${suffix}`} status={tab === "recent" ? t(progress?.completed ? "completedReading" : "continueReading") : undefined} />; })}
    </div>
    {works !== undefined && !filtered.length && <div className="catalogue-empty"><BookOpen size={32} /><h2>{t(tab === "recent" ? "noRecent" : "noMatches")}</h2><p>{t(tab === "recent" ? "recentHint" : "searchHint")}</p></div>}
    {result.pages > 1 && <nav className="catalogue-pagination" aria-label={t("pages")}><button disabled={result.page === 0} onClick={() => setPage(result.page - 1)} aria-label={t("previousPage")}><ChevronLeft size={18} /></button><span>{t("pageOf", { page: result.page + 1, count: result.pages })}</span><button disabled={result.page + 1 >= result.pages} onClick={() => setPage(result.page + 1)} aria-label={t("nextPage")}><ChevronRight size={18} /></button></nav>}
  </section>;
}
