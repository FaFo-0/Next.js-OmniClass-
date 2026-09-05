// Word lookup + card-translation backfill.
//
// This is the surviving half of the old library module. The material/reading
// model moved to `libraryWorks.ts` (works + units); what remains here is the
// shared word bank and the Free Dictionary / MyMemory lookup the reader uses
// when a learner taps a word, plus the background translation backfill for
// cards collected before a learner's native language was known.

import { v } from "convex/values";
import {
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { userHasPermission } from "./lib/permissions";

/** Internal — cache check. */
export const _findCached = internalQuery({
  args: {
    organizationId: v.string(),
    word: v.string(),
    locale: v.string(),
  },
  handler: async (ctx, { organizationId, word, locale }) => {
    return await ctx.db
      .query("libraryWordLookups")
      .withIndex("by_organization_and_word_and_locale", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("word", word.toLowerCase())
          .eq("locale", locale)
      )
      .first();
  },
});

/**
 * Internal — upsert into the shared word bank.
 *
 * One row per (org, word, locale) that every teacher and student reads from,
 * so a word is only ever resolved once for the whole academy. Translations
 * accumulate per learner language rather than overwriting each other, and a
 * word already judged invalid stays invalid.
 */
export const _writeCached = internalMutation({
  args: {
    organizationId: v.string(),
    word: v.string(),
    locale: v.string(),
    definition: v.optional(v.string()),
    ipa: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    partsOfSpeech: v.optional(v.array(v.string())),
    baseForm: v.optional(v.string()),
    /** Add/replace one learner language's translation. */
    translationLocale: v.optional(v.string()),
    translation: v.optional(v.string()),
    isValid: v.optional(v.boolean()),
    source: v.optional(
      v.union(
        v.literal("free-dictionary"),
        v.literal("merriam"),
        v.literal("manual"),
        v.literal("ai")
      )
    ),
  },
  handler: async (ctx, args) => {
    const word = args.word.toLowerCase();
    const existing = await ctx.db
      .query("libraryWordLookups")
      .withIndex("by_organization_and_word_and_locale", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("word", word)
          .eq("locale", args.locale)
      )
      .first();

    const translations = { ...(existing?.translations ?? {}) };
    if (args.translationLocale && args.translation) {
      translations[args.translationLocale] = args.translation;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        baseForm: args.baseForm ?? existing.baseForm,
        // Never blank an existing definition with an empty one.
        definition: args.definition || existing.definition,
        ipa: args.ipa ?? existing.ipa,
        audioUrl: args.audioUrl ?? existing.audioUrl,
        partsOfSpeech: args.partsOfSpeech ?? existing.partsOfSpeech,
        translations,
        isValid: args.isValid ?? existing.isValid,
        fetchedAt: new Date().toISOString(),
      });
      return existing._id;
    }

    return await ctx.db.insert("libraryWordLookups", {
      organizationId: args.organizationId,
      word,
      locale: args.locale,
      definition: args.definition ?? "",
      ipa: args.ipa,
      audioUrl: args.audioUrl,
      partsOfSpeech: args.partsOfSpeech ?? [],
      baseForm: args.baseForm,
      translations,
      isValid: args.isValid,
      fetchedAt: new Date().toISOString(),
      source: args.source ?? "free-dictionary",
    });
  },
});

interface WordLookupResult {
  word: string;
  ipa?: string;
  audioUrl?: string;
  definition: string;
  /** In the learner's language — what a flashcard is actually studied from. */
  translation?: string;
  partsOfSpeech: string[];
  examples: string[];
  /** false = judged not a real word; the UI must refuse to make a card. */
  isValid?: boolean;
  source: "free-dictionary" | "cache" | "translation" | "none";
}

/**
 * Fallback for words the dictionary doesn't carry — proper nouns, rare or
 * inflected forms, and anything not in English. MyMemory is keyless and good
 * enough to give the student *something* on the card rather than an error.
 * Returns null when it can't help; the caller degrades to a blank definition.
 */
async function translateFallback(
  word: string,
  from: string,
  to: string
): Promise<string | null> {
  if (!to || to === from) return null;
  try {
    const url =
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}` +
      `&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      responseData?: { translatedText?: string };
    };
    const t = j.responseData?.translatedText?.trim();
    if (!t) return null;
    // MyMemory echoes the input (or an error sentence) when it has no match.
    if (t.toLowerCase() === word.toLowerCase()) return null;
    if (/NO QUERY SPECIFIED|INVALID/i.test(t)) return null;
    // It often answers a single word with a thesaurus dump ("تصفية, تنقية,
    // تحسين, …"). Eleven near-synonyms is not an answer a learner can be
    // graded on — keep the first few senses and drop the rest.
    const senses = t
      .split(/\s*[,،;؛/]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    return senses.length > 1 ? senses.slice(0, 3).join(", ") : t;
  } catch {
    return null;
  }
}

interface DictEntry {
  word: string;
  phonetic?: string;
  phonetics?: Array<{ text?: string; audio?: string }>;
  meanings?: Array<{
    partOfSpeech: string;
    definitions: Array<{ definition: string; example?: string }>;
  }>;
}

async function fetchEntry(
  locale: string,
  word: string
): Promise<DictEntry[] | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/${encodeURIComponent(locale)}/${encodeURIComponent(word)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = (await res.json()) as DictEntry[];
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

/**
 * Candidate base forms, most likely first. Deliberately crude — a wrong guess
 * simply misses and falls through to the translation path, so the cost of
 * being naive here is nil and the payoff (one card per word) is daily.
 */
function baseForms(w: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (s.length >= 3 && s !== w && !out.includes(s)) out.push(s);
  };
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s")) add(w.slice(0, -1));
  if (w.endsWith("ing")) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + "e");
  }
  if (w.endsWith("ed")) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
  }
  if (/([bcdfghjklmnpqrstvwxz])\1(ing|ed)$/.test(w)) {
    add(w.replace(/([bcdfghjklmnpqrstvwxz])\1(ing|ed)$/, "$1"));
  }
  return out;
}

/**
 * Look up a word. Free Dictionary API (api.dictionaryapi.dev). Cached
 * per (org, word, locale) so the same word doesn't re-bill the upstream
 * service. Locale defaults to "en"; the upstream API only supports a
 * handful — fall back to "en" if the requested locale isn't supported.
 */
export const getWordLookup = action({
  args: {
    word: v.string(),
    locale: v.optional(v.string()),
    // Learner's L1 ("ru" / "ar"). When the dictionary has no entry, the word is
    // translated into this instead of failing, so it can still become a card.
    translateTo: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { word, locale, translateTo }
  ): Promise<WordLookupResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const orgId =
      (identity as any).org_id ||
      (identity as any).orgId ||
      (identity as any).organization_id;
    if (!orgId) throw new Error("No active organization");

    const lc = (locale ?? "en").toLowerCase();
    const w = word.toLowerCase().trim();
    if (!w) throw new Error("Empty word");

    // Cache check
    const cached = await ctx.runQuery(internal.library._findCached, {
      organizationId: orgId,
      word: w,
      locale: lc,
    });
    const wantLocale = (translateTo ?? "").toLowerCase();
    if (cached) {
      let translation = wantLocale
        ? cached.translations?.[wantLocale]
        : undefined;
      // Known word, but nobody has needed this learner language yet — resolve
      // it once and bank it for everyone.
      if (wantLocale && !translation && cached.isValid !== false) {
        const t = await translateFallback(cached.word, lc, wantLocale);
        if (t) {
          translation = t;
          await ctx.runMutation(internal.library._writeCached, {
            organizationId: orgId,
            word: cached.word,
            locale: lc,
            translationLocale: wantLocale,
            translation: t,
          });
        }
      }
      return {
        word: cached.baseForm ?? cached.word,
        ipa: cached.ipa,
        audioUrl: cached.audioUrl,
        definition: cached.definition,
        translation,
        partsOfSpeech: cached.partsOfSpeech,
        examples: [],
        isValid: cached.isValid,
        source: "cache",
      };
    }

    // A word the dictionary can't resolve still has to be usable — fall back
    // to a translation, and failing that return an empty definition the
    // teacher can fill in, rather than erroring the popover.
    const degrade = async (): Promise<WordLookupResult> => {
      // Non-Latin script in an English text (Arabic/Cyrillic names, quoted
      // terms) reads the other way round: translate it INTO English rather
      // than out of it.
      const script = /[؀-ۿ]/.test(w)
        ? "ar"
        : /[Ѐ-ӿ]/.test(w)
          ? "ru"
          : null;
      const [from, to] = script
        ? [script, "en"]
        : [lc, (translateTo ?? "").toLowerCase()];
      const translated = await translateFallback(w, from, to);
      if (translated) {
        await ctx.runMutation(internal.library._writeCached, {
          organizationId: orgId,
          word: w,
          locale: lc,
          definition: "",
          partsOfSpeech: [],
          translationLocale: to || undefined,
          translation: translated,
          source: "manual",
        });
      }
      return {
        word: w,
        definition: "",
        translation: translated ?? undefined,
        partsOfSpeech: [],
        examples: [],
        source: translated ? "translation" : "none",
      };
    };

    // Upstream. An inflected form ("services", "walked") usually has no entry
    // of its own — try the base form so the word list collects ONE card per
    // word instead of one per ending the reader happens to meet.
    const hit = await fetchEntry(lc, w);
    const data = hit ?? (await (async () => {
      for (const base of baseForms(w)) {
        const alt = await fetchEntry(lc, base);
        if (alt) return alt;
      }
      return null;
    })());
    if (!data) return await degrade();
    const entry = data[0];

    const ipa =
      entry.phonetic ??
      entry.phonetics?.find((p) => p.text)?.text ??
      undefined;
    const audioUrl =
      entry.phonetics?.find((p) => p.audio && p.audio.length > 0)?.audio ??
      undefined;

    const partsOfSpeech: string[] = [];
    const definitions: string[] = [];
    const examples: string[] = [];
    for (const m of entry.meanings ?? []) {
      partsOfSpeech.push(m.partOfSpeech);
      for (const d of m.definitions.slice(0, 2)) {
        definitions.push(`(${m.partOfSpeech}) ${d.definition}`);
        if (d.example) examples.push(d.example);
      }
    }
    const definition = definitions.slice(0, 3).join("\n\n");

    // The answer belongs to the base form when we had to fall back to one, so
    // "services" and "service" become the same word on the list.
    const resolved = (entry.word || w).toLowerCase().trim();

    // The dictionary knows it, so it is a real word — but a card still needs
    // the learner's language on the back, not just an English gloss.
    const translation = wantLocale
      ? ((await translateFallback(resolved, lc, wantLocale)) ?? undefined)
      : undefined;

    const banked = {
      organizationId: orgId,
      locale: lc,
      definition,
      ipa,
      audioUrl,
      partsOfSpeech,
      translationLocale: wantLocale || undefined,
      translation,
      isValid: true,
      source: "free-dictionary" as const,
    };
    await ctx.runMutation(internal.library._writeCached, {
      ...banked,
      word: resolved,
    });
    // Bank the form the reader actually tapped too, so the next tap on it is
    // a cache hit instead of another walk through the base-form guesses.
    if (resolved !== w) {
      await ctx.runMutation(internal.library._writeCached, {
        ...banked,
        word: w,
        baseForm: resolved,
      });
    }

    return {
      word: resolved,
      ipa,
      audioUrl,
      definition,
      translation,
      partsOfSpeech,
      examples,
      isValid: true,
      source: "free-dictionary",
    };
  },
});

/**
 * Fill in the missing translation on a freshly-created card.
 *
 * A flashcard is studied word → meaning in the learner's own language, so a
 * card without a translation can't be studied from. The reading popover
 * usually has one already; when it doesn't (no dictionary hit, no L1 known at
 * click time, teacher typed the meaning), this runs right after the insert.
 *
 * Order: the academy's shared word bank first — free and already paid for —
 * then the machine translator. Silent no-op when the owner has no L1 on file;
 * the English definition stays as the back until someone records one.
 */
async function backfillOne(
  ctx: any,
  cardDocId: Id<"srsCards">
): Promise<boolean> {
  const target = await ctx.runQuery(internal.srs._cardTranslationTarget, {
    cardDocId,
  });
  if (!target) return false;

  const cached = await ctx.runQuery(internal.library._findCached, {
    organizationId: target.organizationId,
    word: target.word,
    locale: "en",
  });
  let translation: string | undefined = cached?.translations?.[target.locale];

  if (!translation) {
    translation =
      (await translateFallback(target.word, "en", target.locale)) ?? undefined;
    if (translation) {
      // Bank it so the next reader of the same word pays nothing.
      await ctx.runMutation(internal.library._writeCached, {
        organizationId: target.organizationId,
        word: target.word,
        locale: "en",
        translationLocale: target.locale,
        translation,
      });
    }
  }
  if (!translation) return false;

  await ctx.runMutation(internal.srs._writeCardTranslation, {
    cardDocId,
    translation,
    translationLocale: target.locale,
  });
  return true;
}

export const _backfillCardTranslation = internalAction({
  args: { cardDocId: v.id("srsCards") },
  handler: async (ctx, { cardDocId }): Promise<null> => {
    await backfillOne(ctx, cardDocId);
    return null;
  },
});

/**
 * Catch-up sweep after a student's native language is recorded.
 *
 * Cards collected before anyone knew the learner's L1 are English-only, and
 * nothing else would ever revisit them — so setting the language has to reach
 * backwards, not just forwards. Bounded per run; re-running is harmless.
 */
export const _backfillStudentTranslations = internalAction({
  args: { organizationId: v.string(), studentId: v.string() },
  handler: async (ctx, { organizationId, studentId }): Promise<null> => {
    const ids = await ctx.runQuery(internal.srs._untranslatedCards, {
      organizationId,
      ownerId: studentId,
    });
    for (const id of ids) await backfillOne(ctx, id);
    return null;
  },
});

// ── Vocabulary preparation (admin) ──────────────────────────────
//
// The live Free Dictionary API is free but slow and flaky, so a reading is
// "prepared" by resolving its words through the LLM once and banking the
// result. Readers then get instant definitions + translations from cache, and
// the reading still works when the dictionary provider is down.

/** Whether the caller may run paid editorial AI (`library.upload`). */
export const _canUpload = internalQuery({
  args: { tokenIdentifier: v.string(), organizationId: v.string() },
  handler: async (ctx, { tokenIdentifier, organizationId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (!user || user.organizationId !== organizationId) return false;
    return userHasPermission(user, "library.upload");
  },
});

/** Internal — the plain text of a work's units, for vocabulary preparation. */
export const _getWorkContent = internalQuery({
  args: { organizationId: v.string(), workId: v.id("libraryWorks") },
  handler: async (ctx, { organizationId, workId }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.organizationId !== organizationId) return null;
    const units = await ctx.db
      .query("libraryUnits")
      .withIndex("by_workId", (q) => q.eq("workId", workId))
      .collect();
    return { title: work.title, text: units.map((u) => u.contentMarkdown).join("\n") };
  },
});

/** Internal — which of the given words are already banked. */
export const _bankedWords = internalQuery({
  args: { organizationId: v.string(), locale: v.string(), words: v.array(v.string()) },
  handler: async (ctx, { organizationId, locale, words }) => {
    const banked: string[] = [];
    for (const w of words) {
      const row = await ctx.db
        .query("libraryWordLookups")
        .withIndex("by_organization_and_word_and_locale", (q) =>
          q.eq("organizationId", organizationId).eq("word", w.toLowerCase()).eq("locale", locale)
        )
        .first();
      if (row) banked.push(w);
    }
    return banked;
  },
});

function extractWords(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/[a-zA-Z']{3,}/g)) {
    seen.add(m[0].toLowerCase());
  }
  return [...seen];
}

function parseJsonArray(raw: string): Array<Record<string, unknown>> {
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = txt.indexOf("[");
  if (start >= 0) txt = txt.slice(start);
  try {
    const parsed: unknown = JSON.parse(txt);
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

/** Batch-resolve a list of words through the LLM and bank the results. */
async function enrichWords(
  ctx: any,
  organizationId: string,
  todo: string[]
): Promise<{ resolved: number; invalid: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  let resolved = 0;
  let invalid = 0;
  const BATCH = 50;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0,
        max_tokens: 4000,
        messages: [
          {
            role: "system",
            content:
              "You build vocabulary entries for English learners. Reply with ONLY a JSON array, no prose, no code fences. " +
              'Each item: {"w":"<the word>","d":"<one-line English definition>","t_ru":"<Russian translation>","t_ar":"<Arabic translation>","ok":<true|false>}. ' +
              '"ok" is false when the item is not a real English word a learner could study (fragments, misspellings, random strings). ' +
              'When "ok" is false, "d", "t_ru" and "t_ar" must be empty strings.',
          },
          { role: "user", content: JSON.stringify(batch) },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error("AI preparation failed — try again");
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = j.choices?.[0]?.message?.content ?? "";
    for (const item of parseJsonArray(raw)) {
      const w = typeof item.w === "string" ? item.w.toLowerCase().trim() : "";
      if (!w) continue;
      const ok = item.ok !== false;
      await ctx.runMutation(internal.library._writeCached, {
        organizationId,
        word: w,
        locale: "en",
        definition: ok ? String(item.d ?? "").trim() : "",
        isValid: ok,
        source: "ai",
      });
      if (ok && typeof item.t_ru === "string" && item.t_ru.trim()) {
        await ctx.runMutation(internal.library._writeCached, {
          organizationId,
          word: w,
          locale: "en",
          translationLocale: "ru",
          translation: item.t_ru.trim(),
          source: "ai",
        });
      }
      if (ok && typeof item.t_ar === "string" && item.t_ar.trim()) {
        await ctx.runMutation(internal.library._writeCached, {
          organizationId,
          word: w,
          locale: "en",
          translationLocale: "ar",
          translation: item.t_ar.trim(),
          source: "ai",
        });
      }
      if (ok) resolved++;
      else invalid++;
    }
  }
  return { resolved, invalid };
}

/** Internal — enrich one work's unbanked words (no auth; admin/seed path). */
export const _enrichWork = internalAction({
  args: { organizationId: v.string(), workId: v.id("libraryWorks") },
  handler: async (
    ctx,
    { organizationId, workId }
  ): Promise<{ scanned: number; resolved: number; invalid: number }> => {
    const content = await ctx.runQuery(internal.library._getWorkContent, {
      organizationId,
      workId,
    });
    if (!content) throw new Error("Work not found");

    const all = extractWords(content.text);
    const banked = await ctx.runQuery(internal.library._bankedWords, {
      organizationId,
      locale: "en",
      words: all,
    });
    const bankedSet = new Set(banked);
    const todo = all.filter((w) => !bankedSet.has(w)).slice(0, 400);
    if (todo.length === 0) return { scanned: all.length, resolved: 0, invalid: 0 };

    const { resolved, invalid } = await enrichWords(ctx, organizationId, todo);
    return { scanned: all.length, resolved, invalid };
  },
});

/** Internal — the ids of all works in an org (for bulk preparation). */
export const _listWorkIds = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const works = await ctx.db
      .query("libraryWorks")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    return works.filter((w) => !w.isDeleted).map((w) => w._id);
  },
});

/**
 * Admin-only: pre-resolve every word in a work (definition + Russian/Arabic
 * translations) through the LLM and bank the result. Idempotent and resumable.
 */
export const enrichWorkVocabulary = action({
  args: { workId: v.id("libraryWorks") },
  handler: async (
    ctx,
    { workId }
  ): Promise<{ scanned: number; resolved: number; invalid: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const orgId =
      (identity as any).org_id ||
      (identity as any).orgId ||
      (identity as any).organization_id;
    if (!orgId) throw new Error("No active organization");

    const canUpload = await ctx.runQuery(internal.library._canUpload, {
      tokenIdentifier: identity.tokenIdentifier,
      organizationId: orgId,
    });
    if (!canUpload) throw new Error("Access denied: library upload permission required");

    return await ctx.runAction(internal.library._enrichWork, {
      organizationId: orgId,
      workId,
    });
  },
});

/** Internal — enrich every work in an org. Run via CLI to prepare a catalogue. */
export const enrichAllWorks = internalAction({
  args: { organizationId: v.string() },
  handler: async (
    ctx,
    { organizationId }
  ): Promise<{ works: number; scanned: number; resolved: number; invalid: number }> => {
    const workIds = await ctx.runQuery(internal.library._listWorkIds, {
      organizationId,
    });
    let scanned = 0;
    let resolved = 0;
    let invalid = 0;
    for (const workId of workIds) {
      const r = await ctx.runAction(internal.library._enrichWork, {
        organizationId,
        workId,
      });
      scanned += r.scanned;
      resolved += r.resolved;
      invalid += r.invalid;
    }
    return { works: workIds.length, scanned, resolved, invalid };
  },
});
