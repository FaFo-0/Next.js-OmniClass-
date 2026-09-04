// Library & Reading Hub — admin uploads materials; students browse +
// study; teachers open the same view live and push words straight into
// the student's deck.
//
// All access goes through `tenantTable()` so cross-org leaks are
// structurally impossible.

import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireTenant, requireTenantPermission, tenantTable } from "./lib/tenant";
import { userHasPermission } from "./lib/permissions";

const kind = v.union(
  v.literal("article"),
  v.literal("story"),
  v.literal("dialog"),
  v.literal("transcript"),
  v.literal("pdf")
);

const cefr = v.union(
  v.literal("A1"),
  v.literal("A2"),
  v.literal("B1"),
  v.literal("B2"),
  v.literal("C1"),
  v.literal("C2")
);

// ── Queries ──────────────────────────────────────────────────────

/** All published materials for this org. Hides soft-deleted. */
export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("libraryMaterials")
      .withIndex("by_organization_and_isPublished", (q) =>
        q.eq("organizationId", orgId).eq("isPublished", true)
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/** Admin view — includes drafts, excludes soft-deleted. */
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const rows = await ctx.db
      .query("libraryMaterials")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

export const get = query({
  args: { id: v.id("libraryMaterials") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenant(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== orgId || row.isDeleted) return null;
    return row;
  },
});

// ── Mutations ────────────────────────────────────────────────────

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    kind,
    levelCEFR: v.optional(cefr),
    topicTags: v.array(v.string()),
    contentMarkdown: v.string(),
    audioFileId: v.optional(v.id("_storage")),
    coverImageId: v.optional(v.id("_storage")),
    sourceUrl: v.optional(v.string()),
    estimatedReadMinutes: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "library.upload");
    const now = new Date().toISOString();
    // Resolve the cover URL once, at write time — every card in every portal
    // reads it, and a per-row storage lookup on a grid is wasteful.
    const coverImageUrl = args.coverImageId
      ? ((await ctx.storage.getUrl(args.coverImageId)) ?? undefined)
      : undefined;
    return await ctx.db.insert("libraryMaterials", {
      organizationId: orgId,
      ...args,
      coverImageUrl,
      isPublished: args.isPublished ?? false,
      uploadedBy: user.externalId,
      createdAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("libraryMaterials"),
    patch: v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      kind: v.optional(kind),
      levelCEFR: v.optional(cefr),
      topicTags: v.optional(v.array(v.string())),
      contentMarkdown: v.optional(v.string()),
      audioFileId: v.optional(v.id("_storage")),
      coverImageId: v.optional(v.id("_storage")),
      sourceUrl: v.optional(v.string()),
      estimatedReadMinutes: v.optional(v.number()),
      isPublished: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryMaterials");
    const extra: { coverImageUrl?: string } = {};
    if (patch.coverImageId) {
      const existing = await ctx.db.get(id);
      if (existing?.coverImageId && existing.coverImageId !== patch.coverImageId) {
        await ctx.storage.delete(existing.coverImageId).catch(() => {});
      }
      extra.coverImageUrl =
        (await ctx.storage.getUrl(patch.coverImageId)) ?? undefined;
    }
    await t.patch(id, { ...patch, ...extra, updatedAt: new Date().toISOString() });
  },
});

export const softDelete = mutation({
  args: { id: v.id("libraryMaterials") },
  handler: async (ctx, { id }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryMaterials");
    await t.softDelete(id, user.externalId);
  },
});

export const restore = mutation({
  args: { id: v.id("libraryMaterials") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "library.upload");
    const t = tenantTable(ctx, orgId, "libraryMaterials");
    await t.restore(id);
  },
});

// ── Storage URL helpers ──────────────────────────────────────────

/** Generate a one-shot upload URL the client uses to PUT a file. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireTenantPermission(ctx, "library.upload");
    return await ctx.storage.generateUploadUrl();
  },
});

export const audioUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireTenant(ctx);
    return await ctx.storage.getUrl(storageId);
  },
});

// ════════════════════════════════════════════════════════════════
//  Word lookup (Free Dictionary API, cached in libraryWordLookups)
// ════════════════════════════════════════════════════════════════

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
    const res = await fetch(url);
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
    const res = await fetch(url);
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

// ════════════════════════════════════════════════════════════════
//  Vocabulary pre-pass — every word in a text gets an entry up front
// ════════════════════════════════════════════════════════════════

/** Internal — which of these words does the bank already know? */
export const _bankedWords = internalQuery({
  args: {
    organizationId: v.string(),
    locale: v.string(),
    words: v.array(v.string()),
    translationLocale: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, locale, words, translationLocale }) => {
    const known: string[] = [];
    for (const w of words) {
      const row = await ctx.db
        .query("libraryWordLookups")
        .withIndex("by_organization_and_word_and_locale", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("word", w)
            .eq("locale", locale)
        )
        .first();
      if (!row) continue;
      // A row without the learner language still needs work.
      if (translationLocale && row.isValid !== false && !row.translations?.[translationLocale]) {
        continue;
      }
      known.push(w);
    }
    return known;
  },
});

/** Distinct candidate words in a text, lowercased, longest-first-ish order. */
function extractWords(text: string): string[] {
  const stripped = text
    // Drop markdown syntax, URLs and code so we don't bank punctuation noise.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#>|\[\]()]/g, " ");
  const out = new Set<string>();
  for (const raw of stripped.split(/[^A-Za-z'-]+/)) {
    const w = raw.replace(/^[-']+|[-']+$/g, "").toLowerCase();
    if (w.length < 2) continue; // single letters aren't vocabulary
    if (w.length > 32) continue;
    out.add(w);
  }
  return [...out];
}

/**
 * Resolve every word in a material up front, so no student ever taps a word
 * and gets an empty box.
 *
 * The dictionary API is per-word and rate-limited, so this asks one model call
 * to do a batch: a short definition, the learner-language translation, and —
 * critically — whether it is a real word at all. OCR fragments and gibberish
 * get banked as `isValid: false` and can never become a flashcard.
 *
 * Safe to re-run: already-banked words are skipped, so this costs nothing on
 * a second pass.
 */
/** Internal — whether the caller may run paid editorial AI (`library.upload`). */
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

export const enrichMaterialVocabulary = action({
  args: {
    materialId: v.id("libraryMaterials"),
    /** Learner language to translate into ("ru" / "ar"). */
    translateTo: v.string(),
    /** Cap per run so one huge text can't burn the budget; re-run for more. */
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { materialId, translateTo, limit }
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

    const material = await ctx.runQuery(internal.library._getMaterial, {
      organizationId: orgId,
      id: materialId,
    });
    if (!material) throw new Error("Material not found");

    const locale = "en";
    const to = translateTo.toLowerCase();
    const all = extractWords(material.contentMarkdown);
    const known = await ctx.runQuery(internal.library._bankedWords, {
      organizationId: orgId,
      locale,
      words: all,
      translationLocale: to,
    });
    const knownSet = new Set(known);
    const todo = all.filter((w) => !knownSet.has(w)).slice(0, limit ?? 400);
    if (todo.length === 0) {
      return { scanned: all.length, resolved: 0, invalid: 0 };
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

    let resolved = 0;
    let invalid = 0;
    // Batches keep each response small enough to stay valid JSON.
    const BATCH = 60;
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
                "You build vocabulary entries for English learners. " +
                "Reply with ONLY a JSON array, no prose, no code fences. " +
                `Each item: {"w":"<the word>","d":"<one-line English definition>","t":"<translation into ${to}>","ok":<true|false>}. ` +
                '"ok" is false when the item is not a real English word a learner could study — ' +
                "OCR noise, fragments, misspellings, random letter strings. " +
                'When "ok" is false, "d" and "t" must be empty strings. ' +
                "Return one item for every word given, in the same order.",
            },
            { role: "user", content: JSON.stringify(batch) },
          ],
        }),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = j.choices?.[0]?.message?.content ?? "";
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start === -1 || end === -1) continue;
      let items: Array<{ w?: string; d?: string; t?: string; ok?: boolean }>;
      try {
        items = JSON.parse(raw.slice(start, end + 1));
      } catch {
        continue;
      }

      for (const it of items) {
        const w = (it.w ?? "").toLowerCase().trim();
        if (!w) continue;
        const ok = it.ok !== false;
        await ctx.runMutation(internal.library._writeCached, {
          organizationId: orgId,
          word: w,
          locale,
          definition: ok ? (it.d ?? "") : "",
          translationLocale: ok && it.t ? to : undefined,
          translation: ok && it.t ? it.t : undefined,
          isValid: ok,
          source: "ai",
        });
        if (ok) resolved++;
        else invalid++;
      }
    }

    return { scanned: all.length, resolved, invalid };
  },
});

/** Internal — read a material inside an action. */
export const _getMaterial = internalQuery({
  args: { organizationId: v.string(), id: v.id("libraryMaterials") },
  handler: async (ctx, { organizationId, id }) => {
    const row = await ctx.db.get(id);
    if (!row || row.organizationId !== organizationId || row.isDeleted) return null;
    return row;
  },
});

/**
 * ✨ Ask AI — the meaning of a word *in this sentence*.
 *
 * A dictionary answers "what can this word mean"; a reader needs "what does it
 * mean here". Sending the surrounding sentence is the whole point — it is what
 * separates a useful gloss for "bank" in *she sat on the river bank* from a
 * list of six unrelated senses, and it is the one place paying for a model
 * earns its keep.
 *
 * The result is banked like any other lookup, so the next reader gets it free.
 */
export const aiWordGloss = action({
  args: {
    word: v.string(),
    /** The sentence the word appeared in — the reason to use AI at all. */
    sentence: v.optional(v.string()),
    locale: v.optional(v.string()),
    translateTo: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { word, sentence, locale, translateTo }
  ): Promise<{
    word: string;
    definition: string;
    translation?: string;
    isValid: boolean;
  }> => {
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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("AI is not configured for this academy");

    const w = word.toLowerCase().trim();
    const lc = (locale ?? "en").toLowerCase();
    const to = (translateTo ?? "").toLowerCase();

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "You gloss a single word for a language learner. " +
              "Reply with ONLY a JSON object, no prose, no code fences: " +
              `{"d":"<short plain-English meaning IN THIS CONTEXT>","t":"${
                to ? `<translation into ${to} in this context>` : ""
              }","ok":<true|false>}. ` +
              "Keep the definition to one sentence a learner can read. " +
              '"ok" is false only when the item is not a real word ' +
              "(a fragment, typo, or random characters).",
          },
          {
            role: "user",
            content: sentence
              ? `Word: ${word}\nSentence: ${sentence}`
              : `Word: ${word}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error("AI lookup failed — try again");

    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = j.choices?.[0]?.message?.content ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI returned no answer");
    let parsed: { d?: string; t?: string; ok?: boolean };
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      throw new Error("AI returned no answer");
    }

    const ok = parsed.ok !== false;
    const definition = ok ? (parsed.d ?? "").trim() : "";
    const translation = ok ? (parsed.t ?? "").trim() || undefined : undefined;

    await ctx.runMutation(internal.library._writeCached, {
      organizationId: orgId,
      word: w,
      locale: lc,
      definition,
      translationLocale: translation && to ? to : undefined,
      translation,
      isValid: ok,
      source: "ai",
    });

    return { word: w, definition, translation, isValid: ok };
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
