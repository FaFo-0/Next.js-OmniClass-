"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { getDueCount } from "@/lib/srs/sm2";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  BookOpen,
  Upload,
  Play,
  Layers,
  Clock,
  FileText,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function DecksPage() {
  const router = useRouter();
  const t = useTranslations("student.decks");

  // --- Stores ---
  const { currentUserId } = useAuth();
  const publishedLessons = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const lessonFlashcards = useQuery(
    api.lessonContent.getFlashcardsForStudentLessons,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const srsCards = useQuery(
    api.study.getSRSCardsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];
  const syncCardsMut = useMutation(api.study.syncCardsFromLessons);
  const importDeckMut = useMutation(api.study.importDeck);

  // --- Create deck state ---
  const [newDeckName, setNewDeckName] = useState("");
  const [newCards, setNewCards] = useState<{ front: string; back: string }[]>(
    []
  );
  const [frontInput, setFrontInput] = useState("");
  const [backInput, setBackInput] = useState("");

  // --- CSV import state (collapsed) ---
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvDeckName, setCsvDeckName] = useState("");
  const [csvText, setCsvText] = useState("");

  // --- Derived data ---
  const importedDeckIds = useMemo(() => {
    const lessonIds = new Set(publishedLessons.map((l) => l.externalId));
    const ids = new Set<string>();
    for (const card of srsCards) {
      if (!lessonIds.has(card.deckId)) {
        ids.add(card.deckId);
      }
    }
    return Array.from(ids);
  }, [srsCards, publishedLessons]);

  // --- Auto-sync lesson flashcards to SRS on mount ---
  useEffect(() => {
    if (!currentUserId) return;
    for (const { lessonExternalId, flashcards } of lessonFlashcards) {
      if (flashcards.length > 0) {
        syncCardsMut({ ownerId: currentUserId, deckId: lessonExternalId, flashcards });
      }
    }
  }, [lessonFlashcards, syncCardsMut, currentUserId]);

  // --- Stats ---
  const totalCards = srsCards.length;
  const totalDue = useMemo(() => getDueCount(srsCards), [srsCards]);

  // --- Lesson deck stats ---
  const lessonDeckStats = useMemo(
    () =>
      publishedLessons.map((lesson) => {
        const deckCards = srsCards.filter((c) => c.deckId === lesson.externalId);
        return {
          lesson,
          cardCount: deckCards.length,
          dueCount: getDueCount(deckCards),
        };
      }),
    [publishedLessons, srsCards]
  );

  // --- Imported deck stats ---
  const importedDeckStats = useMemo(
    () =>
      importedDeckIds.map((deckId) => {
        const deckCards = srsCards.filter((c) => c.deckId === deckId);
        return {
          deckId,
          cardCount: deckCards.length,
          dueCount: getDueCount(deckCards),
        };
      }),
    [importedDeckIds, srsCards]
  );

  // --- Add card to new deck ---
  const handleAddCard = useCallback(() => {
    const front = frontInput.trim();
    const back = backInput.trim();
    if (!front || !back) {
      toast.error(t("fillBoth"));
      return;
    }
    setNewCards((prev) => [...prev, { front, back }]);
    setFrontInput("");
    setBackInput("");
  }, [frontInput, backInput]);

  // --- Remove card from new deck ---
  const handleRemoveCard = useCallback((index: number) => {
    setNewCards((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Create deck ---
  const handleCreateDeck = useCallback(() => {
    const name = newDeckName.trim();
    if (!name) {
      toast.error(t("enterDeckName"));
      return;
    }
    if (newCards.length === 0) {
      toast.error(t("addAtLeast"));
      return;
    }

    if (!currentUserId) return;
    const deckId = `custom-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    importDeckMut({ ownerId: currentUserId, deckId, cards: newCards });
    toast.success(t("created", { name, count: newCards.length }));
    setNewDeckName("");
    setNewCards([]);
    setFrontInput("");
    setBackInput("");
  }, [newDeckName, newCards, importDeckMut]);

  // --- CSV import handler ---
  const handleCsvImport = useCallback(() => {
    const trimmedName = csvDeckName.trim();
    if (!trimmedName) {
      toast.error(t("enterDeckName"));
      return;
    }

    const lines = csvText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      toast.error(t("pasteAtLeast"));
      return;
    }

    const cards: { front: string; back: string }[] = [];
    for (const line of lines) {
      const commaIndex = line.indexOf(",");
      if (commaIndex === -1) {
        toast.error(`Invalid line (no comma found): "${line}"`);
        return;
      }
      const front = line.slice(0, commaIndex).trim();
      const back = line.slice(commaIndex + 1).trim();
      if (!front || !back) {
        toast.error(`Empty front or back in line: "${line}"`);
        return;
      }
      cards.push({ front, back });
    }

    if (!currentUserId) return;
    const deckId = `import-${trimmedName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    importDeckMut({ ownerId: currentUserId, deckId, cards });
    toast.success(t("imported", { name: trimmedName, count: cards.length }));
    setCsvDeckName("");
    setCsvText("");
  }, [csvDeckName, csvText, importDeckMut]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Overall Stats */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalCards}</p>
                <p className="text-xs text-muted-foreground">{t("totalCards")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalDue}</p>
                <p className="text-xs text-muted-foreground">{t("dueToday")}</p>
              </div>
            </div>
          </div>
          <Button
            size="lg"
            className="gap-2"
            disabled={totalDue === 0}
            onClick={() => router.push("/student/study")}
          >
            <Play className="h-4 w-4" />
            {t("studyAllDue")}
          </Button>
        </CardContent>
      </Card>

      {/* Create New Deck */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("createNewDeck")}</h2>
        <Card>
          <CardContent className="space-y-5 p-6">
            {/* Deck name */}
            <Input
              placeholder={t("deckName")}
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              className="text-base"
            />

            {/* Add card inputs */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                {t("addCard")}
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder={t("front")}
                  value={frontInput}
                  onChange={(e) => setFrontInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (frontInput.trim() && backInput.trim()) {
                        handleAddCard();
                      }
                    }
                  }}
                  className="flex-1 text-end"
                  dir="rtl"
                />
                <Input
                  placeholder={t("back")}
                  value={backInput}
                  onChange={(e) => setBackInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCard();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleAddCard}
                  disabled={!frontInput.trim() || !backInput.trim()}
                  className="gap-1.5 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            {/* Cards list */}
            {newCards.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Cards ({newCards.length})
                </p>
                <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border p-3">
                  {newCards.map((card, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2"
                    >
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">
                        {i + 1}
                      </span>
                      <span
                        className="flex-1 text-end font-medium"
                        dir="rtl"
                        lang="ar"
                      >
                        {card.front}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="flex-1">{card.back}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleRemoveCard(i)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create button */}
            <div className="flex justify-end">
              <Button
                onClick={handleCreateDeck}
                disabled={!newDeckName.trim() || newCards.length === 0}
                className="gap-2"
                size="lg"
              >
                <Layers className="h-4 w-4" />
                {t("createDeck", { count: newCards.length })}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Lesson Decks */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("lessonDecks")}</h2>
        {lessonDeckStats.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {t("noPublishedLessons")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lessonDeckStats.map(({ lesson, cardCount, dueCount }) => (
              <Card key={lesson.externalId}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">
                      {lesson.title}
                    </CardTitle>
                    {dueCount > 0 && (
                      <Badge variant="destructive" className="shrink-0">
                        {t("due", { count: dueCount })}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {cardCount} {cardCount === 1 ? "card" : "cards"}
                  </p>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      router.push(
                        `/student/study?deck=${encodeURIComponent(lesson.externalId)}`
                      )
                    }
                  >
                    <Play className="h-3.5 w-3.5" />
                    Study
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Imported / Custom Decks */}
      {importedDeckStats.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t("customDecks")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {importedDeckStats.map(({ deckId, cardCount, dueCount }) => {
              const namePart = deckId
                .replace(/^(import|custom)-/, "")
                .replace(/-\d+$/, "")
                .replace(/-/g, " ");
              const displayName =
                namePart.charAt(0).toUpperCase() + namePart.slice(1);

              return (
                <Card key={deckId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        {displayName}
                      </CardTitle>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary">{t("custom")}</Badge>
                        {dueCount > 0 && (
                          <Badge variant="destructive">{t("due", { count: dueCount })}</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {cardCount} {cardCount === 1 ? "card" : "cards"}
                    </p>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        router.push(
                          `/student/study?deck=${encodeURIComponent(deckId)}`
                        )
                      }
                    >
                      <Play className="h-3.5 w-3.5" />
                      Study
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* CSV Import (collapsed) */}
      <section className="space-y-2">
        <button
          onClick={() => setShowCsvImport(!showCsvImport)}
          className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {showCsvImport ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {t("csvImport")}
        </button>

        {showCsvImport && (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>
                  {t("csvPlaceholder")}
                </span>
              </div>
              <Input
                placeholder={t("deckNamePlaceholder")}
                value={csvDeckName}
                onChange={(e) => setCsvDeckName(e.target.value)}
              />
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t("csvExample")}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  className="gap-2"
                  onClick={handleCsvImport}
                  disabled={!csvDeckName.trim() || !csvText.trim()}
                >
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
