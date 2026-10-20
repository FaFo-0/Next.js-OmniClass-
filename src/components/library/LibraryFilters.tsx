"use client";
import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Doc } from "@convex/dataModel";
import { initialLibraryFilter, type LibraryFilter } from "@/lib/libraryCatalogue";
export { filterLibrary, initialLibraryFilter, type LibraryFilter } from "@/lib/libraryCatalogue";
export function LibraryFilters({ works, value, onChange }: { works: Doc<"libraryWorks">[]; value: LibraryFilter; onChange: (value: LibraryFilter) => void }) {
  const t = useTranslations("app.library");
  const [expanded, setExpanded] = useState(false);
  const topics = [...new Set(works.flatMap(w => w.topicTags))].sort();
  const active = [value.level, value.topic, value.kind, value.text].filter(Boolean).length;
  const change = (key: keyof LibraryFilter, val: string) => onChange({ ...value, [key]: val });
  return <div className="catalogue-discovery">
    <div className="catalogue-search-row">
      <label className="catalogue-search"><Search size={19} aria-hidden="true" /><input type="search" aria-label={t("search")} placeholder={t("search")} value={value.search} onChange={e => change("search", e.target.value)} /></label>
      <button className="catalogue-filter-button" aria-expanded={expanded} aria-controls="library-filter-panel" onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={18} /><span>{t("filters")}</span>{active > 0 && <span className="catalogue-filter-count">{active}</span>}</button>
    </div>
    {expanded && <div id="library-filter-panel" className="catalogue-filter-panel">
      <label>{t("level")}<select value={value.level ?? ""} onChange={e => change("level", e.target.value)}><option value="">{t("allLevels")}</option>{["A1", "A2", "B1", "B2", "C1", "C2"].map(level => <option key={level}>{level}</option>)}</select></label>
      <label>{t("topic")}<select value={value.topic} onChange={e => change("topic", e.target.value)}><option value="">{t("topics")}</option>{topics.map(topic => <option key={topic}>{topic}</option>)}</select></label>
      <label>{t("type")}<select value={value.kind} onChange={e => change("kind", e.target.value)}><option value="">{t("types")}</option>{["book", "article", "story", "dialog", "transcript", "video", "resource"].map(kind => <option key={kind} value={kind}>{t(`kinds.${kind}`)}</option>)}</select></label>
      <label>{t("readWhere")}<select value={value.text} onChange={e => change("text", e.target.value)}><option value="">{t("availability")}</option><option value="text">{t("insideReading")}</option><option value="link">{t("external")}</option></select></label>
    </div>}
    {active > 0 && <div className="catalogue-active-filters">{[value.level, value.topic, value.kind ? t(`kinds.${value.kind}`) : "", value.text ? t(value.text === "text" ? "insideReading" : "external") : ""].filter(Boolean).map(label => <span key={label}>{label}</span>)}<button onClick={() => onChange({ ...initialLibraryFilter, search: value.search })}><X size={13} />{t("clearFilters")}</button></div>}
  </div>;
}
