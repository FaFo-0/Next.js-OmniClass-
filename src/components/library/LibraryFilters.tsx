"use client";
import { useTranslations } from "next-intl";
import type { Doc } from "@convex/dataModel";
export interface LibraryFilter { search: string; topic: string; kind: string; text: string }
export const initialLibraryFilter: LibraryFilter = { search: "", topic: "", kind: "", text: "" };
export function filterLibrary(works: Doc<"libraryWorks">[], filter: LibraryFilter) {
  const search = filter.search.toLocaleLowerCase().trim();
  return works.filter(w => (!search || [w.title, w.author, w.description, ...w.topicTags].join(" ").toLocaleLowerCase().includes(search)) && (!filter.topic || w.topicTags.includes(filter.topic)) && (!filter.kind || w.kind === filter.kind) && (!filter.text || (filter.text === "text" ? w.hasText !== false : !!w.externalUrl)));
}
export function LibraryFilters({ works, value, onChange }: { works: Doc<"libraryWorks">[]; value: LibraryFilter; onChange: (value: LibraryFilter) => void }) {
  const t = useTranslations("app.library");
  const topics = [...new Set(works.flatMap(w => w.topicTags))].sort();
  const change = (key: keyof LibraryFilter, val: string) => onChange({ ...value, [key]: val });
  return <div className="mb-5 flex flex-wrap gap-2">
    <input className="search-input min-w-0 flex-1" style={{ minWidth: 160 }} aria-label={t("search")} placeholder={t("search")} value={value.search} onChange={e => change("search", e.target.value)} />
    <select className="select max-w-full" aria-label={t("topics")} value={value.topic} onChange={e => change("topic", e.target.value)}><option value="">{t("topics")}</option>{topics.map(topic => <option key={topic}>{topic}</option>)}</select>
    <select className="select max-w-full" aria-label={t("types")} value={value.kind} onChange={e => change("kind", e.target.value)}><option value="">{t("types")}</option>{["book", "article", "story", "dialog", "transcript", "video", "resource"].map(kind => <option key={kind} value={kind}>{t(`kinds.${kind}`)}</option>)}</select>
    <select className="select max-w-full" aria-label={t("availability")} value={value.text} onChange={e => change("text", e.target.value)}><option value="">{t("availability")}</option><option value="text">{t("insideReading")}</option><option value="link">{t("external")}</option></select>
  </div>;
}
