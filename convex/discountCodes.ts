import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTenantPermission, tenantTable } from "./lib/tenant";
import { orderSnapshots, type CataloguePackOffer } from "./lib/pricingCatalogue";
import type { Doc } from "./_generated/dataModel";

export function normalizeCode(code: string) { return code.trim().toUpperCase(); }

export async function resolveCode(ctx: QueryCtx | MutationCtx, orgId: string, input?: string) {
  if (!input?.trim()) return { code: null, error: null };
  const code = await tenantTable(ctx, orgId, "discountCodes").query()
    .withIndex("by_organization_and_code", q => q.eq("organizationId", orgId).eq("code", normalizeCode(input))).unique();
  if (!code || !code.active || (code.expiresAt && code.expiresAt <= new Date().toISOString()) ||
    (code.maxUses !== undefined && code.usedCount >= code.maxUses)) {
    return { code: null, error: "codeUnavailable" as const };
  }
  return { code, error: null };
}

/** Percentage is additional to the current offered price; round in currency minor units. */
export function discountedOffer(offer: CataloguePackOffer, percent: number): CataloguePackOffer {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: offer.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** digits;
  const base = Math.round(offer.netPrice * scale);
  const netPrice = (base - Math.round(base * percent / 100)) / scale;
  return { ...offer, netPrice, discountAmount: offer.listPrice - netPrice, onSale: netPrice < offer.listPrice };
}

/** The same server calculation drives confirmation and the immutable receipt. */
export function codeOrderPreview(offer: CataloguePackOffer, code: Doc<"discountCodes"> | null, now: string) {
  const finalOffer = code ? discountedOffer(offer, code.percent) : offer;
  const snapshots = orderSnapshots(finalOffer, now);
  const priceSnapshot = code ? { ...snapshots.priceSnapshot, discountCode: code.code,
    codePercent: code.percent, codeAmount: offer.netPrice - finalOffer.netPrice } : snapshots.priceSnapshot;
  return { offer: finalOffer, planSnapshot: snapshots.planSnapshot, priceSnapshot };
}

export const list = query({
  args: {},
  handler: async ctx => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    return await tenantTable(ctx, orgId, "discountCodes").query()
      .withIndex("by_organization", q => q.eq("organizationId", orgId)).order("desc").take(200);
  },
});

export const create = mutation({
  args: { code: v.string(), percent: v.number(), expiresAt: v.optional(v.string()), maxUses: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const code = normalizeCode(args.code);
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) throw new Error("Use 3–40 letters, numbers, hyphens or underscores");
    if (!Number.isInteger(args.percent) || args.percent < 1 || args.percent > 100) throw new Error("Discount must be a whole percentage from 1 to 100");
    if (args.maxUses !== undefined && (!Number.isSafeInteger(args.maxUses) || args.maxUses < 1)) throw new Error("Use limit must be a positive whole number");
    const expiresAt = args.expiresAt === undefined ? undefined : new Date(args.expiresAt).toISOString();
    if (expiresAt && expiresAt <= new Date().toISOString()) throw new Error("Expiry must be in the future");
    const table = tenantTable(ctx, orgId, "discountCodes");
    if (await table.query().withIndex("by_organization_and_code", q => q.eq("organizationId", orgId).eq("code", code)).unique()) throw new Error("This code already exists");
    return await table.insert({ code, percent: args.percent, expiresAt, maxUses: args.maxUses,
      active: true, usedCount: 0, createdAt: new Date().toISOString(), createdBy: user.externalId });
  },
});

export const setActive = mutation({
  args: { id: v.id("discountCodes"), active: v.boolean() },
  handler: async (ctx, { id, active }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    await tenantTable(ctx, orgId, "discountCodes").patch(id, { active });
  },
});
