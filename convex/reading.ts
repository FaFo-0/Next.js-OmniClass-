// Reading word status — the LingQ model.
//
// A reader's relationship with each word: learning, known, or ignored.
// "New" is the absence of a row, so opening a text colours instantly from one
// query and costs nothing however long the text is.
//
// Teachers have no word list of their own; when reading *with* a student they
// act on that student's list, which is why every function takes an optional
// `studentId` and checks the caller may act for them.

import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTenant } from "./lib/tenant";

const wordStatus = v.union(
  v.literal("learning"),
  v.literal("known"),
  v.literal("ignored")
);

/** Normalised form used as the key — the same shape the reader tokenises to. */
function norm(word: string): string {
  return word.toLowerCase().trim();
}

/**
 * Whose list is being read or written, with permission enforced.
 * Students only ever touch their own; teachers and admins may act for a
 * student they are reading with.
 */
async function resolveOwner(
  ctx: QueryCtx | MutationCtx,
  studentId: string | undefined
): Promise<{ orgId: string; ownerId: string }> {
  const { orgId, user } = await requireTenant(ctx);
  if (!studentId || studentId === user.externalId) {
    return { orgId, ownerId: user.externalId };
  }
  if (user.role === "student") {
    throw new ConvexError("You can only change your own words");
  }
  if (user.role === "teacher") {
    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", studentId)
      )
      .unique();
    if (!student || student.teacherId !== user.externalId) {
      throw new ConvexError("Not your student");
    }
  }
  return { orgId, ownerId: studentId };
}

/**
 * Every judged word for this reader. The client turns this into a lookup and
 * colours the text; anything absent is New.
 */
export const getWordStatuses = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, ownerId } = await resolveOwner(ctx, studentId);
    const rows = await ctx.db
      .query("wordStatuses")
      .withIndex("by_organization_and_ownerId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", ownerId)
      )
      .collect();
    return rows.map((r) => ({ word: r.word, status: r.status }));
  },
});

async function writeStatus(
  ctx: MutationCtx,
  orgId: string,
  ownerId: string,
  word: string,
  status: "learning" | "known" | "ignored" | null
) {
  const w = norm(word);
  if (!w) return;
  const existing = await ctx.db
    .query("wordStatuses")
    .withIndex("by_organization_and_ownerId_and_word", (q) =>
      q.eq("organizationId", orgId).eq("ownerId", ownerId).eq("word", w)
    )
    .unique();

  // Clearing a status returns the word to New — which is the absence of a row,
  // not a fourth state.
  if (status === null) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }
  const updatedAt = new Date().toISOString();
  if (existing) {
    await ctx.db.patch(existing._id, { status, updatedAt });
  } else {
    await ctx.db.insert("wordStatuses", {
      organizationId: orgId,
      ownerId,
      word: w,
      status,
      updatedAt,
    });
  }
}

/** Set (or clear, with `status: null`) one word's status. */
export const setWordStatus = mutation({
  args: {
    word: v.string(),
    status: v.union(wordStatus, v.null()),
    studentId: v.optional(v.string()),
  },
  handler: async (ctx, { word, status, studentId }) => {
    const { orgId, ownerId } = await resolveOwner(ctx, studentId);
    await writeStatus(ctx, orgId, ownerId, word, status);
    return null;
  },
});

/**
 * Bulk set — "I know the rest of this page".
 *
 * Only writes words that would actually change, so marking a whole page known
 * doesn't rewrite hundreds of untouched rows, and never downgrades a word the
 * reader is deliberately studying.
 */
export const setWordStatusesBulk = mutation({
  args: {
    words: v.array(v.string()),
    status: wordStatus,
    studentId: v.optional(v.string()),
    /** Leave words already judged alone (used by "mark the rest known"). */
    onlyNew: v.optional(v.boolean()),
  },
  handler: async (ctx, { words, status, studentId, onlyNew }) => {
    const { orgId, ownerId } = await resolveOwner(ctx, studentId);
    const existing = await ctx.db
      .query("wordStatuses")
      .withIndex("by_organization_and_ownerId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", ownerId)
      )
      .collect();
    const byWord = new Map(existing.map((r) => [r.word, r]));

    let changed = 0;
    // Cap per call so one enormous page can't blow the transaction limit.
    for (const raw of [...new Set(words.map(norm))].slice(0, 800)) {
      if (!raw) continue;
      const row = byWord.get(raw);
      if (onlyNew && row) continue;
      if (row?.status === status) continue;
      await writeStatus(ctx, orgId, ownerId, raw, status);
      changed++;
    }
    return { changed };
  },
});
