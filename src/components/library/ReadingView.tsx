"use client";

// Reading surface shared by /admin/library, /student/library/[id],
// /teacher/library/[id]?studentId=...
//
// Reading is COLLECTING. A word is either on the learner's list (green) or it
// is ordinary prose — there is no third state, and nothing asks the reader to
// judge a word they simply don't need. Tap a word to see what it means and,
// if it's worth keeping, add it. The list is the single source the flashcards
// draw from.

import { useMemo, useState, type MouseEvent } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Doc, Id } from "@convex/dataModel";
import {
  WordLookupPopover,
  type ReadingMode,
  type WordAnchor,
} from "./WordLookupPopover";

interface ReadingViewProps {
  material: Doc<"libraryMaterials">;
  mode?: ReadingMode;
  activeStudentId?: string;
  /** Optional override locale; defaults to "en". */
  locale?: string;
  /** Learner's L1 — what the collected words get translated into. */
  learnerLocale?: string;
}

interface ActiveWord {
  word: string;
  /** Where the word sits on the page — the panel is placed against it. */
  anchor: WordAnchor;
  /** The sentence it sits in — what makes an AI gloss worth asking for. */
  sentence?: string;
}

/** Words already collected. Calm, but unmistakably marked. */
const COLLECTED: React.CSSProperties = {
  background: "rgba(22,163,74,0.14)",
  boxShadow: "inset 0 -2px 0 rgba(22,163,74,0.5)",
};

/** The sentence containing a clicked word, read off the rendered block. */
function sentenceAround(word: string, el: HTMLElement): string | undefined {
  const block = el.closest("p, div, blockquote");
  const text = block?.textContent ?? "";
  if (!text) return undefined;
  const parts = text.split(/(?<=[.!?])\s+/);
  const hit = parts.find((p) =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(p)
  );
  return (hit ?? text).slice(0, 400);
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

  // Whose list this is: the student being read with, else my own.
  const words = useQuery(api.srs.getWordSet, { studentId: activeStudentId });
  const collected = useMemo(
    () => new Set((words ?? []).map((w) => w.toLowerCase())),
    [words]
  );

  function onWordClick(e: MouseEvent<HTMLSpanElement>, word: string) {
    const r = e.currentTarget.getBoundingClientRect();
    setActive({
      word,
      // Page coordinates, so the panel stays with the word rather than with
      // the screen; the viewport gaps decide whether it opens up or down.
      anchor: {
        left: r.left + window.scrollX,
        top: r.top + window.scrollY,
        bottom: r.bottom + window.scrollY,
        width: r.width,
        spaceBelow: window.innerHeight - r.bottom,
        spaceAbove: r.top,
      },
      sentence: sentenceAround(word, e.currentTarget),
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

  // How much of this text is already collected — a quiet progress line, not
  // a scoreboard: it needs no judgement from the reader to be true.
  const collectedHere = useMemo(() => {
    const seen = new Set<string>();
    let hits = 0;
    for (const b of blocks) {
      for (const tok of tokenize(b.text)) {
        if (tok.kind !== "word") continue;
        const w = tok.value.toLowerCase();
        if (seen.has(w)) continue;
        seen.add(w);
        if (collected.has(w)) hits++;
      }
    }
    return { total: seen.size, mine: hits };
  }, [blocks, collected]);

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
          {/* Credit the source when the admin recorded one — otherwise the
              field is written and never seen by anyone. */}
          {material.sourceUrl && (
            <a
              href={material.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="link"
              style={{ color: "var(--brand-purple)" }}
            >
              Source
            </a>
          )}
        </div>
        {/* Quiet progress. No judgement required for it to be true. */}
        <div
          className="mt-3 flex flex-wrap items-center gap-3 text-xs"
          style={{ color: "var(--omnic-gray-600)" }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 3,
                ...COLLECTED,
              }}
            />
            <strong>{collectedHere.mine}</strong> of {collectedHere.total} words
            here are on {mode === "live-teach" ? "their" : "your"} list
          </span>
          <span style={{ color: "var(--omnic-gray-400)" }}>
            tap any word to add it
          </span>
        </div>
      </header>

      <article className="space-y-4 text-base leading-relaxed" style={{ color: "var(--omnic-gray-800)" }}>
        {blocks.map((b, bi) => {
          if (b.kind === "hr") {
            return (
              <hr key={bi} style={{ borderColor: "var(--omnic-gray-200)", margin: "20px 0" }} />
            );
          }
          const words = tokenize(b.text).map((tok, ti) => {
            if (tok.kind !== "word") return <span key={ti}>{tok.value}</span>;
            // Painted from the learner's own list — one query, no lookups,
            // so this stays instant however long the reading is.
            const mine = collected.has(tok.value.toLowerCase());
            return (
              <span
                key={ti}
                role="button"
                tabIndex={0}
                data-word={tok.value}
                title={mine ? "On your list" : undefined}
                onClick={(e) => onWordClick(e, tok.value)}
                className="cursor-pointer rounded-sm px-0.5 transition-colors hover:bg-[var(--brand-purple-tint)]"
                style={mine ? COLLECTED : undefined}
              >
                {tok.value}
              </span>
            );
          });

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
          sentence={active.sentence}
          onList={collected.has(active.word.toLowerCase())}
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
