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
}

interface ActiveWord {
  word: string;
  anchor: { x: number; y: number };
}

const WORD_RE = /([\p{L}'-]+)|(\s+)|([^\p{L}\s])/gu;

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
}: ReadingViewProps) {
  const [active, setActive] = useState<ActiveWord | null>(null);

  function onWordClick(e: MouseEvent<HTMLSpanElement>, word: string) {
    setActive({
      word,
      anchor: { x: e.clientX, y: e.clientY },
    });
  }

  // Markdown rendering kept simple: split on blank lines into paragraphs,
  // bold/italic preserved as plain text. Phase H polish can swap in a
  // real markdown renderer if needed.
  const paragraphs = material.contentMarkdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

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
        {paragraphs.map((para, pi) => (
          <p key={pi}>
            {tokenize(para).map((tok, ti) => {
              if (tok.kind === "word") {
                return (
                  <span
                    key={ti}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => onWordClick(e, tok.value)}
                    className="cursor-pointer rounded-sm px-0.5 hover:bg-[var(--brand-purple-tint)] transition-colors"
                  >
                    {tok.value}
                  </span>
                );
              }
              return <span key={ti}>{tok.value}</span>;
            })}
          </p>
        ))}
      </article>

      {active && (
        <WordLookupPopover
          word={active.word}
          locale={locale}
          anchor={active.anchor}
          mode={mode}
          activeStudentId={activeStudentId}
          materialId={material._id as Id<"libraryMaterials">}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
