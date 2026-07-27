"use client";

// Popover anchored on a clicked word in the ReadingView.
// Calls api.library.getWordLookup (Free Dictionary API + Convex cache).
// Renders definition + IPA + audio + a primary CTA whose label flips
// based on `mode`:
//   - "self-study"  → "Add to My Flashcards"
//   - "live-teach"  → "Send to Student's Flashcards"

import { useEffect, useState } from "react";
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
  anchor: { x: number; y: number };
  mode: ReadingMode;
  activeStudentId?: string;
  /** Learner's L1 — lets the backend translate words the dictionary lacks. */
  learnerLocale?: string;
  materialId?: Id<"libraryMaterials">;
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

export function WordLookupPopover({
  word,
  locale = "en",
  anchor,
  mode,
  activeStudentId,
  learnerLocale,
  materialId,
  onClose,
}: WordLookupPopoverProps) {
  const lookupAction = useAction(api.library.getWordLookup);
  const addOwn = useMutation(api.srs.addCardToOwnDeck);
  const pushStudent = useMutation(api.srs.pushCardToStudentDeck);

  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Words with no dictionary entry and no translation still deserve a card —
  // the teacher types the meaning themselves.
  const [manual, setManual] = useState("");
  // A teacher has no deck of their own: saving requires a chosen student.
  const needsStudent = mode === "live-teach" && !activeStudentId;

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
      // English definition is supporting detail, not the answer.
      const back = [lookup.translation, lookup.definition || manual.trim()]
        .filter(Boolean)
        .join(" — ");
      const exampleSentence = lookup.examples[0];
      if (mode === "live-teach" && activeStudentId) {
        await pushStudent({
          studentId: activeStudentId,
          front,
          back,
          exampleSentence,
          sourceLibraryMaterialId: materialId,
        });
        toast.success(`Sent "${front}" to student's flashcards`);
      } else {
        await addOwn({
          front,
          back,
          exampleSentence,
          sourceLibraryMaterialId: materialId,
        });
        toast.success(`Added "${front}" to flashcards`);
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

  return (
    <div
      role="dialog"
      className="fixed z-50 w-80 rounded-lg border bg-white shadow-xl"
      style={{
        left: Math.max(8, Math.min(anchor.x - 160, window.innerWidth - 328)),
        top: anchor.y + 12,
        borderColor: "var(--omnic-gray-200)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--omnic-gray-100)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-bold text-base"
            style={{ color: "var(--brand-purple)" }}
          >
            {word}
          </span>
          {lookup?.ipa && (
            <span
              className="text-xs"
              style={{ color: "var(--omnic-gray-500)" }}
            >
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

      <div className="px-4 py-3 max-h-64 overflow-y-auto text-sm">
        {!lookup && !error && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 size={14} className="animate-spin" />
            Looking up…
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {lookup && (
          <>
            {lookup.isValid === false ? (
              <p className="text-sm" style={{ color: "#B45309" }}>
                “{lookup.word}” isn’t a word we can teach — it looks like a
                fragment or a typo, so it can’t be added.
              </p>
            ) : null}
            {lookup.translation && (
              <p
                className="text-base font-semibold"
                style={{ color: "var(--brand-purple)" }}
                dir="auto"
              >
                {lookup.translation}
              </p>
            )}
            {lookup.definition ? (
              <p className="whitespace-pre-line text-sm text-zinc-700">
                {lookup.definition}
              </p>
            ) : lookup.translation || lookup.isValid === false ? null : (
              <>
                <p className="text-zinc-500 text-xs mb-2">
                  No dictionary entry or translation for “{lookup.word}”. Type
                  the meaning and it still becomes a card.
                </p>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  style={{ borderColor: "var(--omnic-gray-200)" }}
                  rows={2}
                  placeholder="Meaning / translation"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                />
              </>
            )}
            {lookup.source === "translation" && (
              <p className="mt-2 text-xs" style={{ color: "var(--omnic-gray-500)" }}>
                Translated — no dictionary entry for this word.
              </p>
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
        className="px-4 py-3 border-t"
        style={{ borderColor: "var(--omnic-gray-100)" }}
      >
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
            ? "Working…"
            : lookup?.isValid === false
              ? "Not a usable word"
              : needsStudent
                ? "Pick a student first"
              : mode === "live-teach"
                ? "Send to Student's Flashcards"
                : "Add to My Flashcards"}
        </Button>
      </div>
    </div>
  );
}
