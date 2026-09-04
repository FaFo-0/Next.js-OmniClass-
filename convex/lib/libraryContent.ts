/**
 * Library content compilation — pure, testable helpers shared by the works/units
 * authoring flow. No Convex dependency, so behaviour is unit-testable and stays
 * identical between the authoring UI and the import path.
 *
 * A "unit" is one ordered reading section (an article is one unit, a book is
 * many chapter units). The authoring surface lets an admin paste a whole book as
 * Markdown; `splitMarkdownIntoUnits` turns `## Chapter …` headings into units so
 * a book is authored once and read chapter-by-chapter.
 */

export interface LibraryUnitDraft {
  title: string;
  contentMarkdown: string;
  wordCount: number;
  estimatedReadMinutes: number;
}

/** Count words in plain-ish text. Matches the reader's word tokenization intent. */
export function countWords(text: string): number {
  const words = text.match(/[\p{L}\p{N}'-]+/gu);
  return words ? words.length : 0;
}

/** Reading time at a conservative 200 words/minute, minimum one minute. */
export function estimateReadMinutes(text: string): number {
  const words = countWords(text);
  if (words === 0) return 1;
  return Math.max(1, Math.round(words / 200));
}

/** Strip a leading document title (`# …`) so it is not treated as body text. */
function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#{1}\s+[^\n]*(?:\n|$)/, "");
}

/**
 * Split a Markdown document into ordered units on level-2 (`##`) headings.
 *
 * - Each `## Heading` starts a new unit; its title is the heading text.
 * - Body before the first `##` (after stripping a leading `#` title) is prepended
 *   to the first unit, so a short foreword is never dropped.
 * - With no `##` headings, the whole document is a single unit.
 */
export function splitMarkdownIntoUnits(
  markdown: string,
  fallbackTitle = "Reading"
): LibraryUnitDraft[] {
  const body = stripLeadingH1(markdown ?? "").trim();
  if (!body) return [];

  // Split on level-2 headings while keeping the heading line with its section.
  const headingRe = /^##\s+(.+)$/gm;
  const matches = [...body.matchAll(headingRe)];

  if (matches.length === 0) {
    return [makeUnit(fallbackTitle, body)];
  }

  const units: LibraryUnitDraft[] = [];
  // Front matter before the first heading (if any) attaches to the first unit.
  const firstIndex = matches[0].index ?? 0;
  const frontMatter = body.slice(0, firstIndex).trim();

  for (let i = 0; i < matches.length; i++) {
    const headingLineEnd = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;
    const title = (matches[i][1] ?? "").trim() || fallbackTitle;
    let content = body.slice(headingLineEnd, end).trim();
    if (i === 0 && frontMatter) {
      content = [frontMatter, content].filter(Boolean).join("\n\n");
    }
    units.push(makeUnit(title, content));
  }

  return units.filter((u) => u.contentMarkdown.length > 0);
}

function makeUnit(title: string, contentMarkdown: string): LibraryUnitDraft {
  const clean = contentMarkdown.trim();
  return {
    title: title.trim() || "Reading",
    contentMarkdown: clean,
    wordCount: countWords(clean),
    estimatedReadMinutes: estimateReadMinutes(clean),
  };
}

/** Normalize topic tags: trim, lowercase, drop blanks and duplicates. */
export function normalizeTopicTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
