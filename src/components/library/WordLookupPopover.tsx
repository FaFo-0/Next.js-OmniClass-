"use client";

// Popover anchored on a clicked word in the ReadingView.
//
// One decision only: is this word worth keeping? So there are two buttons —
// ask the AI what it means *here*, and add it to the list. Everything else a
// reader might want to do with a word (rename, correct, remove) belongs on
// the word list, not in their face mid-sentence.
//
// Positioning: the panel is placed in PAGE coordinates next to the word and
// portalled to the body, so it sits with the text — scroll the page and it
// stays where the word is, rather than floating over whatever happens to be
// under it. It flips above the word when the space below is too shallow, so
// tapping a word near the bottom of the screen never opens a box you can't
// read.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "@convex";
import { Loader2, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Id } from "@convex/dataModel";

export type ReadingMode = "self-study" | "live-teach";

interface WordLookupPopoverProps {
  word: string;
  locale?: string;
  /** The word's box in PAGE coordinates, plus how much room was below it. */
  anchor: WordAnchor;
  /** Sentence the word sits in — sent to the AI so the gloss fits the context. */
  sentence?: string;
  /** Already collected — adding again would be a no-op, so say so instead. */
  onList?: boolean;
  mode: ReadingMode;
  activeStudentId?: string;
  /** Learner's L1 — lets the backend translate words the dictionary lacks. */
  learnerLocale?: string;
  sourceWorkId?: Id<"libraryWorks">;
  sourceUnitId?: Id<"libraryUnits">;
  onClose: () => void;
}

interface Lookup {
  word: string;
  ipa?: string;
  audioUrl?: string;
  definition: string;
  translation?: string;
  partsOfSpeech: string[];
  examples: string[];
  isValid?: boolean;
  source: "free-dictionary" | "cache" | "translation" | "none";
}

export interface WordAnchor {
  /** Page coordinates — viewport rect + scroll offset at click time. */
  left: number;
  top: number;
  bottom: number;
  width: number;
  /** Viewport room below/above the word when it was tapped. */
  spaceBelow: number;
  spaceAbove: number;
}

const WIDTH = 320;
const GAP = 8;
const MARGIN = 8;

export function WordLookupPopover({
  word,
  locale = "en",
  anchor,
  sentence,
  onList = false,
  mode,
  activeStudentId,
  learnerLocale,
  sourceWorkId,
  sourceUnitId,
  onClose,
}: WordLookupPopoverProps) {
  const lookupAction = useAction(api.library.getWordLookup);
  const addOwn = useMutation(api.srs.addCardToOwnDeck);
  const pushStudent = useMutation(api.srs.pushCardToStudentDeck);

  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A word with no machine answer still deserves a card — the reader types
  // the meaning themselves.
  const [manual, setManual] = useState("");
  // A teacher has no list of their own: saving requires a chosen student.
  const needsStudent = mode === "live-teach" && !activeStudentId;

  // ── Placement ────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number }>(
    () => ({
      left: anchor.left,
      top: anchor.bottom + GAP,
      maxH: Math.max(160, Math.min(420, anchor.spaceBelow - GAP - MARGIN)),
    })
  );

  useLayoutEffect(() => {
    function place() {
      const h = panelRef.current?.offsetHeight ?? 260;
      const below = anchor.spaceBelow - GAP - MARGIN;
      const above = anchor.spaceAbove - GAP - MARGIN;
      // Prefer below; go above only when it is genuinely roomier.
      const flip = below < Math.min(h, 240) && above > below;
      const maxH = Math.max(160, Math.min(420, flip ? above : below));
      const top = flip
        ? anchor.top - GAP - Math.min(h, maxH)
        : anchor.bottom + GAP;

      const wanted = anchor.left + anchor.width / 2 - WIDTH / 2;
      const docW = document.documentElement.clientWidth;
      const left = Math.max(MARGIN, Math.min(wanted, docW - WIDTH - MARGIN));
      setPos({ left, top, maxH });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, lookup, error, manual]);

  // Escape closes — a reader mid-text shouldn't have to aim at an X.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLookup(null);
    setError(null);
    lookupAction({ word, locale, translateTo: learnerLocale })
      .then((res) => {
        if (!cancelled) setLookup(res as Lookup);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? "Lookup failed");
      });
    return () => {
      cancelled = true;
    };
  }, [word, locale, learnerLocale, lookupAction]);

  async function handleAdd() {
    if (!lookup || needsStudent) return;
    setBusy(true);
    try {
      const front = lookup.word;
      // A card is studied word → meaning in the learner's language; the
      // English definition is supporting detail, not the answer. When the
      // reader typed the meaning themselves, that IS the translation.
      const translation = lookup.translation ?? (manual.trim() || undefined);
      // The card's context is the sentence the word actually sits in — not a
      // generic dictionary example. Fall back to a dictionary example only
      // when the reader didn't capture a sentence.
      const exampleSentence = sentence ?? lookup.examples[0] ?? front;
      const payload = {
        front,
        translation,
        translationLocale: translation ? learnerLocale : undefined,
        definition: lookup.definition,
        partOfSpeech: lookup.partsOfSpeech[0],
        exampleSentence,
        sourceWorkId,
        sourceUnitId,
      };
      if (mode === "live-teach" && activeStudentId) {
        await pushStudent({ studentId: activeStudentId, ...payload });
        toast.success(`Added "${front}" to their words`);
      } else {
        await addOwn(payload);
        toast.success(`Added "${front}" to your words`);
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function playAudio() {
    if (!lookup?.audioUrl) return;
    const a = new Audio(lookup.audioUrl);
    a.play().catch(() => {});
  }

  const whose = mode === "live-teach" ? "their words" : "my words";

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      className="absolute z-50 rounded-lg border bg-white shadow-xl"
      style={{
        left: pos.left,
        top: pos.top,
        width: WIDTH,
        maxHeight: pos.maxH,
        display: "flex",
        flexDirection: "column",
        borderColor: "var(--omnic-gray-200)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--omnic-gray-100)", flexShrink: 0 }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-bold text-base"
            style={{ color: "var(--brand-purple)" }}
          >
            {lookup?.word ?? word}
          </span>
          {lookup?.ipa && (
            <span className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
              {lookup.ipa}
            </span>
          )}
          {lookup?.audioUrl && (
            <button
              onClick={playAudio}
              className="rounded-full p-1 hover:bg-zinc-100"
              aria-label="Play audio"
            >
              <Volume2 size={14} />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 hover:bg-zinc-100"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 overflow-y-auto text-sm" style={{ flex: 1 }}>
        {!lookup && !error && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 size={14} className="animate-spin" />
            Looking up…
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {lookup && (
          <>
            {lookup.isValid === false && (
              <p className="text-sm" style={{ color: "#B45309" }}>
                “{lookup.word}” isn’t a word we can teach — it looks like a
                fragment or a typo, so it can’t be added.
              </p>
            )}
            {lookup.translation && (
              <p
                className="text-base font-semibold"
                style={{ color: "var(--brand-purple)" }}
                dir="auto"
              >
                {lookup.translation}
              </p>
            )}
            {lookup.definition && (
              <p className="whitespace-pre-line text-sm text-zinc-700">
                {lookup.definition}
              </p>
            )}
            {/* No translation = a card whose answer is in the language being
                learned, which is no answer at all. Say why, offer the way out. */}
            {!lookup.translation && lookup.isValid !== false && !onList && (
              <div className="mt-2">
                <p className="text-zinc-500 text-xs mb-1">
                  {!learnerLocale
                    ? mode === "live-teach"
                      ? "No native language on file for this student — set it on their profile for automatic translations."
                      : "Set your native language in your profile for automatic translations."
                    : `No ${learnerLocale.toUpperCase()} translation yet — type one.`}
                </p>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  style={{ borderColor: "var(--omnic-gray-200)" }}
                  rows={2}
                  placeholder="Meaning in the learner's language"
                  dir="auto"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                />
              </div>
            )}
            {lookup.examples[0] && (
              <p
                className="mt-2 italic text-xs"
                style={{ color: "var(--omnic-gray-500)" }}
              >
                “{lookup.examples[0]}”
              </p>
            )}
          </>
        )}
      </div>

      <div
        className="px-4 py-3 border-t space-y-2"
        style={{ borderColor: "var(--omnic-gray-100)", flexShrink: 0 }}
      >
        {onList ? (
          <div
            className="w-full rounded-md px-2 py-2 text-center text-xs font-medium"
            style={{ background: "rgba(22,163,74,0.12)", color: "#15803D" }}
          >
            Already on {whose}
          </div>
        ) : (
          <Button
            onClick={handleAdd}
            disabled={
              !lookup ||
              busy ||
              needsStudent ||
              lookup.isValid === false ||
              (!lookup.definition && !lookup.translation && !manual.trim())
            }
            className="w-full"
            style={{ background: "var(--brand-purple)" }}
          >
            {busy
              ? "Adding…"
              : lookup?.isValid === false
                ? "Not a usable word"
                : needsStudent
                  ? "Pick a student first"
                  : mode === "live-teach"
                    ? "Add to their words"
                    : "Add to my words"}
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}
