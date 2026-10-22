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

import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "@convex";
import { Loader2, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { PreparedWord } from "../../../convex/lib/libraryText";
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
  learnerLocale?: string | null;
  sourceWorkId?: Id<"libraryWorks">;
  sourceUnitId?: Id<"libraryUnits">;
  prepared?: PreparedWord;
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
  lemma?: string;
  senseId?: string;
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
  prepared,
}: WordLookupPopoverProps) {
  const t = useTranslations("wordLookup");
  const lookupAction = useAction(api.library.getWordLookup);
  const addOwn = useMutation(api.srs.addCardToOwnDeck);
  const pushStudent = useMutation(api.srs.pushCardToStudentDeck);

  const preparedLookup = useMemo<Lookup | null>(() => prepared ? {
    word: prepared.lemma, lemma: prepared.lemma, senseId: prepared.senseId,
    definition: prepared.definition, translation: learnerLocale && learnerLocale in prepared.translations ? prepared.translations[learnerLocale as "ru" | "ar" | "kk"] : undefined,
    ipa: prepared.ipa, audioUrl: prepared.audioUrl, partsOfSpeech: [prepared.partOfSpeech], examples: [], source: "cache",
  } : null, [prepared, learnerLocale]);
  const [remoteLookup, setLookup] = useState<Lookup | null>(null);
  const lookup = preparedLookup ?? remoteLookup;
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
      const left = Math.max(MARGIN, Math.min(wanted, docW - Math.min(WIDTH, docW - 2 * MARGIN) - MARGIN));
      setPos(previous => previous.left === left && previous.top === top && previous.maxH === maxH ? previous : { left, top, maxH });
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
    if (prepared) return;
    setLookup(null);
    setError(null);
    lookupAction({ word, locale, translateTo: learnerLocale ?? undefined })
      .then((res) => {
        if (!cancelled) setLookup(res as Lookup);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? "Lookup failed");
      });
    return () => {
      cancelled = true;
    };
  }, [word, locale, learnerLocale, lookupAction, prepared]);

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
        lemma: lookup.lemma,
        senseId: lookup.senseId,
        audioUrl: lookup.audioUrl,
        translation,
        translationLocale: translation ? learnerLocale ?? undefined : undefined,
        definition: lookup.definition,
        partOfSpeech: lookup.partsOfSpeech[0],
        exampleSentence,
        sourceWorkId,
        sourceUnitId,
      };
      if (mode === "live-teach" && activeStudentId) {
        await pushStudent({ studentId: activeStudentId, ...payload });
        toast.success(t("addedTheir", { word: front }));
      } else {
        await addOwn(payload);
        toast.success(t("addedOwn", { word: front }));
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


  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      className="absolute z-50 rounded-lg border bg-card shadow-xl"
      style={{
        left: pos.left,
        top: pos.top,
        width: `min(${WIDTH}px, calc(100vw - ${MARGIN * 2}px))`,
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
              className="rounded-full p-1 hover:bg-muted"
              aria-label={t("playAudio")}
            >
              <Volume2 size={14} />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 hover:bg-muted"
          aria-label={t("close")}
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 overflow-y-auto text-sm" style={{ flex: 1 }}>
        {!lookup && !error && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {t("lookingUp")}
          </div>
        )}
        {error && <div className="text-sm text-red-600 dark:text-red-200">{error}</div>}
        {lookup && (
          <>
            {lookup.isValid === false && (
              <p className="text-sm" style={{ color: "var(--feedback-warning)" }}>
                {t("invalidWord", { word: lookup.word })}
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
              <p className="whitespace-pre-line text-sm text-foreground">
                {lookup.definition}
              </p>
            )}
            {/* No translation = a card whose answer is in the language being
                learned, which is no answer at all. Say why, offer the way out. */}
            {!lookup.translation && lookup.isValid !== false && !onList && (
              <div className="mt-2">
                <p className="text-muted-foreground text-xs mb-1">
                  {learnerLocale === null || learnerLocale === undefined
                    ? mode === "live-teach"
                      ? t("missingTheirLanguage")
                      : t("missingOwnLanguage")
                    : t("missingTranslation", { language: learnerLocale.toUpperCase() })}
                </p>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  style={{ borderColor: "var(--omnic-gray-200)" }}
                  rows={2}
                  placeholder={t("meaningPlaceholder")}
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
            style={{ background: "rgba(22,163,74,0.12)", color: "var(--feedback-success)" }}
          >
            {t(mode === "live-teach" ? "alreadyTheir" : "alreadyOwn")}
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
            style={{ background: "var(--primary)" }}
          >
            {busy
              ? t("adding")
              : lookup?.isValid === false
                ? t("unusable")
                : needsStudent
                  ? t("pickStudent")
                  : mode === "live-teach"
                    ? t("addTheir")
                    : t("addOwn")}
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}
