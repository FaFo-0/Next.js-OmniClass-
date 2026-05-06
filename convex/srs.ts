// SRS — decks + cards. Two key rules from MASTER_PLAN §3:
//   1. Each lesson finalize creates a deck `source: "lesson"` (1:1).
//   2. Each student has exactly one `isDefault: true` "My Words" deck
//      created lazily on first manual add.
//
// This file holds the cross-cutting deck/card mutations used by the
// Library Hub. Lesson-deck creation will be wired in Phase D.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import type { Id } from "./_generated/dataModel";

// ── Deck helpers ─────────────────────────────────────────────────

async function ensureDefaultDeck(
  ctx: any,
  orgId: string,
  ownerId: string
): Promise<Id<"srsDecks">> {
  const existing = await ctx.db
    .query("srsDecks")
    .withIndex("by_organization_and_ownerId", (q: any) =>
      q.eq("organizationId", orgId).eq("ownerId", ownerId)
    )
    .filter((q: any) => q.eq(q.field("isDefault"), true))
    .first();
  if (existing) return existing._id as Id<"srsDecks">;

  return await ctx.db.insert("srsDecks", {
    organizationId: orgId,
    externalId: `default-${ownerId}`,
    name: "My Words",
    ownerId,
    source: "manual" as const,
    isDefault: true,
    createdAt: new Date().toISOString(),
  });
}

// ── Queries ──────────────────────────────────────────────────────

export const listDecks = query({
  args: { ownerId: v.optional(v.string()) },
  handler: async (ctx, { ownerId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const targetOwner = ownerId ?? user.externalId;
    const rows = await ctx.db
      .query("srsDecks")
      .withIndex("by_organization_and_ownerId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", targetOwner)
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

export const listCardsInDeck = query({
  args: { deckId: v.id("srsDecks") },
  handler: async (ctx, { deckId }) => {
    const { orgId } = await requireTenant(ctx);
    const deck = await ctx.db.get(deckId);
    if (!deck || deck.organizationId !== orgId) return [];
    const cards = await ctx.db
      .query("srsCards")
      .withIndex("by_organization_and_deckId", (q) =>
        q.eq("organizationId", orgId).eq("deckId", deckId)
      )
      .collect();
    return cards.filter((c) => !c.isDeleted);
  },
});

// ── Mutations ────────────────────────────────────────────────────

/**
 * Add a card to the caller's own default deck (Self-study mode in the
 * Reading Hub). Used by both students and teachers when reading alone.
 */
export const addCardToOwnDeck = mutation({
  args: {
    front: v.string(),
    back: v.string(),
    exampleSentence: v.optional(v.string()),
    sourceLibraryMaterialId: v.optional(v.id("libraryMaterials")),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    const deckId = await ensureDefaultDeck(ctx, orgId, user.externalId);
    const now = new Date().toISOString();
    const cardId = `${user.externalId}-${Date.now()}`;
    return await ctx.db.insert("srsCards", {
      organizationId: orgId,
      cardId,
      deckId,
      ownerId: user.externalId,
      front: args.front,
      back: args.back,
      exampleSentence: args.exampleSentence,
      sourceLibraryMaterialId: args.sourceLibraryMaterialId,
      addedBy: "self",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: now.slice(0, 10),
      lastReviewDate: null,
    });
  },
});

/**
 * Teacher pushes a word into a specific student's default deck (Live
 * mode). Requires `library.send_word_to_student` permission.
 *
 * Verifies the target student belongs to the same org. Optionally
 * checks the student is assigned to this teacher (skipped for admins
 * who hold the same permission).
 */
export const pushCardToStudentDeck = mutation({
  args: {
    studentId: v.string(), // users.externalId
    front: v.string(),
    back: v.string(),
    exampleSentence: v.optional(v.string()),
    sourceLibraryMaterialId: v.optional(v.id("libraryMaterials")),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "library.send_word_to_student"
    );

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", args.studentId)
      )
      .unique();
    if (!student) throw new Error("Student not found in this organization");
    if (student.role !== "student") throw new Error("Target user is not a student");

    // Teachers may only push to their own students unless they're admin.
    if (
      user.role === "teacher" &&
      student.teacherId &&
      student.teacherId !== user.externalId
    ) {
      throw new Error(
        "Teacher can only push words to their own assigned students"
      );
    }

    const deckId = await ensureDefaultDeck(ctx, orgId, args.studentId);
    const now = new Date().toISOString();
    const cardId = `${args.studentId}-${Date.now()}`;
    return await ctx.db.insert("srsCards", {
      organizationId: orgId,
      cardId,
      deckId,
      ownerId: args.studentId,
      front: args.front,
      back: args.back,
      exampleSentence: args.exampleSentence,
      sourceLibraryMaterialId: args.sourceLibraryMaterialId,
      addedBy: "teacher",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: now.slice(0, 10),
      lastReviewDate: null,
    });
  },
});
