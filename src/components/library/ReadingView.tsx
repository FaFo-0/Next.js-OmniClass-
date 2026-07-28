"use client";

// Reading surface shared by /admin/library, /student/library/[id],
// /teacher/library/[id]?studentId=...
//
// Renders `material.contentMarkdown` paragraph-by-paragraph and
// intercepts word taps. Each tap opens a `<WordLookupPopover>` whose
// CTA depends on `mode`.

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex";
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

export type WordStatus = "new" | "learning" | "known" | "ignored";

interface ActiveWord {
  word: string;
  anchor: { x: number; y: number };
  /** The sentence it sits in — what makes an AI gloss worth asking for. */
  sentence?: string;
}

/**
 * How each status paints. New words are the ones that need attention, so they
 * carry the strongest mark; learning is warm; known and ignored recede into
 * the prose so a familiar text reads like ordinary text.
 */
const SWATCH: React.CSSProperties = {
  display: "inline-block",
  width: 12,
  height: 12,
  borderRadius: 3,
  border: "1px solid var(--omnic-gray-200)",
};

const STATUS_STYLE: Record<WordStatus, React.CSSProperties | undefined> = {
  new: {
    background: "rgba(37,99,235,0.12)",
    boxShadow: "inset 0 -2px 0 rgba(37,99,235,0.45)",
  },
  learning: {
    background: "rgba(217,119,6,0.16)",
    boxShadow: "inset 0 -2px 0 rgba(217,119,6,0.55)",
  },
  known: undefined,
  ignored: undefined,
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

  // Whose reading history this is: the student being read with, else my own.
  const statuses = useQuery(api.reading.getWordStatuses, {
    studentId: activeStudentId,
  });
  const setStatus = useMutation(api.reading.setWordStatus);
  const setStatusBulk = useMutation(api.reading.setWordStatusesBulk);

  const statusMap = useMemo(() => {
    const m = new Map<string, WordStatus>();
    for (const r of statuses ?? []) m.set(r.word, r.status as WordStatus);
    return m;
  }, [statuses]);

  // Words already on a card count as "learning" even before they're judged,
  // so collecting a word and marking it learning don't disagree.
  const knownWords = useQuery(api.srs.getKnownWords, {
    studentId: activeStudentId,
  });
  const carded = useMemo(
    () => new Set((knownWords ?? []).map((w) => w.toLowerCase())),
    [knownWords]
  );

  const statusOf = (word: string): WordStatus => {
    const w = word.toLowerCase();
    return statusMap.get(w) ?? (carded.has(w) ? "learning" : "new");
  };

  function onWordClick(e: MouseEvent<HTMLSpanElement>, word: string) {
    setActive({
      word,
      anchor: { x: e.clientX, y: e.clientY },
      sentence: sentenceAround(word, e.currentTarget),
    });
  }

  const [hovered, setHovered] = useState<string | null>(null);

  /** Mark and move on — the keyboard path that makes reading fast. */
  async function judge(word: string, status: WordStatus | null) {
    try {
      await setStatus({
        word,
        status: status === "new" ? null : status,
        studentId: activeStudentId,
      });
    } catch {
      /* a failed judgement is not worth interrupting the read */
    }
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

  // Every word in this text, in reading order, deduped — the basis for the
  // "new words" count and for marking the remainder known.
  const textWords = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const b of blocks) {
      for (const tok of tokenize(b.text)) {
        if (tok.kind !== "word") continue;
        const w = tok.value.toLowerCase();
        if (seen.has(w)) continue;
        seen.add(w);
        out.push(w);
      }
    }
    return out;
  }, [blocks]);

  const newCount = textWords.filter((w) => statusOf(w) === "new").length;
  const learningCount = textWords.filter(
    (w) => statusOf(w) === "learning"
  ).length;

  // K marks the hovered word known, X ignores it — the two judgements a reader
  // makes constantly, so they must not require aiming at a button.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const word = hovered ?? active?.word;
      if (!word) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        void judge(word, "known");
      } else if (k === "x") {
        e.preventDefault();
        void judge(word, "ignored");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, active, activeStudentId]);

  async function markRestKnown() {
    const r = await setStatusBulk({
      words: textWords,
      status: "known",
      studentId: activeStudentId,
      onlyNew: true,
    });
    toast.success(
      r.changed > 0
        ? `Marked ${r.changed} word${r.changed === 1 ? "" : "s"} known`
        : "Nothing left to mark"
    );
  }

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
        {/* Progress through the text, in the terms a reader thinks in. */}
        <div
          className="mt-3 flex flex-wrap items-center gap-3 text-xs"
          style={{ color: "var(--omnic-gray-600)" }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden style={{ ...SWATCH, ...STATUS_STYLE.new }} />
            <strong>{newCount}</strong> new
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden style={{ ...SWATCH, ...STATUS_STYLE.learning }} />
            <strong>{learningCount}</strong> learning
          </span>
          <span style={{ color: "var(--omnic-gray-400)" }}>
            hover a word · <kbd>K</kbd> known · <kbd>X</kbd> ignore
          </span>
          {newCount > 0 && (
            <button
              onClick={markRestKnown}
              className="chip"
              style={{ marginInlineStart: "auto" }}
              title="Everything still blue is a word you already know"
            >
              I know the rest
            </button>
          )}
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
            // The whole text is painted from the reader's own history — no
            // lookups, so this stays instant however long the reading is.
            const st = statusOf(tok.value);
            return (
              <span
                key={ti}
                role="button"
                tabIndex={0}
                data-word={tok.value}
                title={
                  st === "new"
                    ? "New — click for the meaning"
                    : st === "learning"
                      ? "You're learning this"
                      : undefined
                }
                onClick={(e) => onWordClick(e, tok.value)}
                onMouseEnter={() => setHovered(tok.value)}
                onMouseLeave={() =>
                  setHovered((h) => (h === tok.value ? null : h))
                }
                className="cursor-pointer rounded-sm px-0.5 transition-colors hover:bg-[var(--brand-purple-tint)]"
                style={STATUS_STYLE[st]}
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
          status={statusOf(active.word)}
          onSetStatus={(st) => judge(active.word, st)}
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
