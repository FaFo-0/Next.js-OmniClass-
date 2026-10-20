import { v } from "convex/values";
export const preparedWord = v.object({
  key: v.string(), word: v.string(), sentence: v.string(), lemma: v.string(), senseId: v.string(),
  definition: v.string(), partOfSpeech: v.string(), translations: v.object({ ru: v.string(), ar: v.string(), kk: v.string() }),
  audioUrl: v.optional(v.string()), ipa: v.optional(v.string()),
});
export const preparationState = v.union(v.literal("queued"), v.literal("preparing"), v.literal("ready"), v.literal("failed"));
