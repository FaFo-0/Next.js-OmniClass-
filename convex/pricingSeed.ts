// One-time seed / migration for the pricing catalogue.
//
// Rebuilds `packFamilies` + `packs` for one organization from the reviewed
// launch catalogue. It writes only those two tables: orders, grants, the
// lesson ledger, finance entries, notifications, and the retired versioned
// catalogue are all left alone. Runs only with the explicit confirmation
// token.

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { LAUNCH_PRICING_CATALOGUE, PRICING_SEED_CONFIRMATION, buildSeedPlan } from "./lib/pricingSeed";

export const previewPricingSeed = internalQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const [families, packs] = await Promise.all([
      ctx.db.query("packFamilies").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("packs").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ]);
    return {
      plan: buildSeedPlan(),
      existing: { families: families.length, packs: packs.length },
      confirmation: PRICING_SEED_CONFIRMATION,
    };
  },
});

export const seedPricingCatalogue = internalMutation({
  args: { organizationId: v.string(), confirmation: v.string() },
  handler: async (ctx, { organizationId, confirmation }) => {
    if (confirmation !== PRICING_SEED_CONFIRMATION) throw new Error("Pricing seed requires the exact confirmation token");
    if (!organizationId.trim()) throw new Error("Pricing seed requires an organization id");
    const now = new Date().toISOString();

    const existingFamilies = await ctx.db.query("packFamilies")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
    const existingPacks = await ctx.db.query("packs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
    for (const pack of existingPacks) await ctx.db.delete(pack._id);
    for (const family of existingFamilies) await ctx.db.delete(family._id);

    let sortOrder = 0;
    for (const family of LAUNCH_PRICING_CATALOGUE) {
      const familyId = await ctx.db.insert("packFamilies", {
        organizationId,
        label: family.label,
        labelEn: family.labelEn,
        labelRu: family.labelRu,
        description: family.description,
        descriptionEn: family.descriptionEn,
        descriptionRu: family.descriptionRu,
        sortOrder: sortOrder++,
        isVisible: true,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      });
      let packOrder = 0;
      for (const pack of family.packs) {
        await ctx.db.insert("packs", {
          organizationId,
          familyId,
          name: pack.name,
          nameEn: pack.nameEn,
          nameRu: pack.nameRu,
          lessons: pack.lessons,
          currency: pack.currency,
          price: pack.price,
          expiryDays: pack.expiryDays,
          benefits: pack.benefits,
          sortOrder: packOrder++,
          isVisible: true,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const [families, packs] = await Promise.all([
      ctx.db.query("packFamilies").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
      ctx.db.query("packs").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect(),
    ]);
    return { removed: { families: existingFamilies.length, packs: existingPacks.length }, seeded: { families: families.length, packs: packs.length } };
  },
});
