"use client";

// Reading surface shared by /admin/library, /student/library/[id],
// /teacher/library/[id]?studentId=...
//
// Renders `material.contentMarkdown` paragraph-by-paragraph and
// intercepts word taps. Each tap opens a `<WordLookupPopover>` whose
// CTA depends on `mode`.

import { useState, type MouseEvent } from "react";
import type { Doc, Id } from "@convex/dataModel";
import {
  WordLookupPopover,
  type ReadingMode,
} from "./WordLookupPopover";

interface ReadingViewProps {
  material: Doc<"libraryMaterials">;
  mode?: ReadingMode;
  activeStudentId?: string;
  /** Optional override locale; defaults to "en". */
  locale?: string;
  /** Learner's L1 — used to translate words the dictionary doesn't carry. */
  learnerLocale?: string;
}

interface ActiveWord {
  word: string;
  anchor: { x: number; y: number };
}

/** Parsed markdown block — the subset the library actually uses. */
type Block =
  | { kind: "hr"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "li"; text: string }
  | { kind: "p"; text: string };

const WORD_RE = /([\p{L}'-]+)|(\s+)|([^\p{L}\s])/gu;

/** Strip inline markdown markers so readers see prose, not syntax. */
function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → label
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/`([^`]*)`/g, "$1") // code
    .trim();
}

function tokenize(text: string): Array<{ kind: "word" | "ws" | "punct"; value: string }> {
  const out: Array<{ kind: "word" | "ws" | "punct"; value: string }> = [];
  for (const m of text.matchAll(WORD_RE)) {
    if (m[1]) out.push({ kind: "word", value: m[1] });
    else if (m[2]) out.push({ kind: "ws", value: m[2] });
    else if (m[3]) out.push({ kind: "punct", value: m[3] });
  }
  return out;
}

export function ReadingView({
  material,
  mode = "self-study",
  activeStudentId,
  locale = "en",
  learnerLocale,
}: ReadingViewProps) {
  const [active, setActive] = useState<ActiveWord | null>(null);

  function onWordClick(e: MouseEvent<HTMLSpanElement>, word: string) {
    setActive({
      word,
      anchor: { x: e.clientX, y: e.clientY },
    });
  }

  // Z.T.LIB-2 — markdown was rendered raw, so readers saw "## TABLE OF
  // CONTENTS" and "**bold**" as literal text. Parse the small subset the
  // library actually uses (headings, rules, quotes, list bullets, emphasis)
  // into blocks; words stay individually tappable.
  const blocks: Block[] = material.contentMarkdown
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .flatMap((raw): Block[] => {
      // A horizontal rule is its own block.
      if (/^([-*_])\1{2,}$/.test(raw)) return [{ kind: "hr", text: "" }];

      // Headings can be glued onto following prose ("# Title ## Sub"), so
      // split a block into its heading/paragraph lines.
      return raw.split("\n").flatMap((line): Block[] => {
        const l = line.trim();
        if (!l) return [];
        if (/^([-*_])\1{2,}$/.test(l)) return [{ kind: "hr", text: "" }];
        const h = l.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
          return [{ kind: "h", level: h[1].length, text: stripInline(h[2]) }];
        }
        if (l.startsWith(">")) {
          return [{ kind: "quote", text: stripInline(l.replace(/^>\s?/, "")) }];
        }
        const li = l.match(/^[-*+]\s+(.*)$/);
        if (li) return [{ kind: "li", text: stripInline(li[1]) }];
        return [{ kind: "p", text: stripInline(l) }];
      });
    });

  return (
    <div className="prose-reading max-w-3xl mx-auto py-6 px-6">
      <header className="mb-6 pb-4 border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--omnic-gray-900)", letterSpacing: "-0.01em" }}
        >
          {material.title}
        </h1>
        {material.description && (
          <p className="mt-1 text-sm" style={{ color: "var(--omnic-gray-600)" }}>
            {material.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: "var(--omnic-gray-500)" }}>
          {material.levelCEFR && <span className="pill pill-tenant">{material.levelCEFR}</span>}
          {material.estimatedReadMinutes && (
            <span>{material.estimatedReadMinutes} min read</span>
          )}
          {material.topicTags.map((t) => (
            <span key={t} className="pill pill-new">{t}</span>
          ))}
        </div>
      </header>

      <article className="space-y-4 text-base leading-relaxed" style={{ color: "var(--omnic-gray-800)" }}>
        {blocks.map((b, bi) => {
          if (b.kind === "hr") {
            return (
              <hr key={bi} style={{ borderColor: "var(--omnic-gray-200)", margin: "20px 0" }} />
            );
          }
          const words = tokenize(b.text).map((tok, ti) =>
            tok.kind === "word" ? (
              <span
                key={ti}
                role="button"
                tabIndex={0}
                onClick={(e) => onWordClick(e, tok.value)}
                className="cursor-pointer rounded-sm px-0.5 hover:bg-[var(--brand-purple-tint)] transition-colors"
              >
                {tok.value}
              </span>
            ) : (
              <span key={ti}>{tok.value}</span>
            )
          );

          if (b.kind === "quote") {
            return (
              <blockquote
                key={bi}
                className="italic"
                style={{
                  borderInlineStart: "3px solid var(--brand-purple)",
                  paddingInlineStart: 12,
                  color: "var(--omnic-gray-600)",
                }}
              >
                {words}
              </blockquote>
            );
          }
          if (b.kind === "li") {
            return (
              <div key={bi} style={{ display: "flex", gap: 8 }}>
                <span aria-hidden style={{ color: "var(--brand-purple)" }}>•</span>
                <span>{words}</span>
              </div>
            );
          }
          if (b.kind === "h") {
            const level = b.level;
            const size = level <= 1 ? 26 : level === 2 ? 21 : 17;
            return (
              <div
                key={bi}
                role="heading"
                aria-level={level}
                style={{
                  fontSize: size,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  marginTop: bi === 0 ? 0 : 24,
                  color: "var(--omnic-gray-900)",
                }}
              >
                {words}
              </div>
            );
          }
          return <p key={bi}>{words}</p>;
        })}
      </article>

      {active && (
        <WordLookupPopover
          word={active.word}
          locale={locale}
          anchor={active.anchor}
          mode={mode}
          activeStudentId={activeStudentId}
          learnerLocale={learnerLocale}
          materialId={material._id as Id<"libraryMaterials">}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
