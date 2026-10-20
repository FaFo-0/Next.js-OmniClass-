import type { Doc } from "@convex/dataModel";
export interface LibraryFilter { search: string; topic: string; kind: string; text: string; level?: string }
export const initialLibraryFilter: LibraryFilter = { search: "", topic: "", kind: "", text: "", level: "" };
export const LIBRARY_PAGE_SIZE = 24;
export function filterLibrary(works: Doc<"libraryWorks">[], filter: LibraryFilter) {
  const search = filter.search.toLocaleLowerCase().trim();
  return works.filter(w => (!search || [w.title, w.author, w.description, ...w.topicTags].join(" ").toLocaleLowerCase().includes(search))
    && (!filter.topic || w.topicTags.includes(filter.topic)) && (!filter.kind || w.kind === filter.kind)
    && (!filter.level || w.levelCEFR === filter.level)
    && (!filter.text || (filter.text === "text" ? w.hasText !== false : !!w.externalUrl)));
}
export function cataloguePage<T>(items: T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / LIBRARY_PAGE_SIZE));
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  return { page, pages, items: items.slice(page * LIBRARY_PAGE_SIZE, (page + 1) * LIBRARY_PAGE_SIZE) };
}
