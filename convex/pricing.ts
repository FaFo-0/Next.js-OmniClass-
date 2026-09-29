// Pricing catalogue — the whole commercial model.
//
//   packFamilies  a heading that groups packs
//   packs         one sellable row: name, lessons, price, optional sale price,
//                 expiry, benefits, order, visibility
//
// There is no versioning and no price lock. Editing a pack changes what every
// student is offered the next time a page loads. A `billingOrders` row keeps a
// plain receipt of what one student agreed to pay on one day; it never decides
// anyone's future price.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ACADEMY_ID, requireTenant, requireTenantPermission, tenantTable } from "./lib/tenant";
import {
  neighbourToSwap,
  nextSortOrder,
  normalizedPricingText,
  optionalText,
  requiredText,
  sortFamilies,
  sortPacks,
  validCurrency,
  validSortOrder,
  validatePackPricing,
  type PricingLocale,
} from "./lib/pricing";
import {
  buildCatalogue,
  findOffer,
  orderAdminLink,
  orderSnapshots,
  type CatalogueFamilyGroup,
} from "./lib/pricingCatalogue";
import { transitionBillingOrder } from "./lib/billingState";
import { grantPointsInternal } from "./points";
import { recordEntry } from "./finance";
import { insertNotification } from "./notifications";

const localeArg = v.union(v.literal("en"), v.literal("ru"), v.literal("ar"), v.literal("kk"));
const pricingTextArg = v.object({
  default: v.string(),
  en: v.optional(v.string()),
  ru: v.optional(v.string()),
});
const directionArg = v.union(v.literal(-1), v.literal(1));
const orderStatusArg = v.union(
  v.literal("pending_verification"),
  v.literal("granted"),
  v.literal("rejected"),
  v.literal("cancelled"),
);

const NOW = () => new Date().toISOString();

async function allFamilies(ctx: QueryCtx | MutationCtx, orgId: string) {
  return await tenantTable(ctx, orgId, "packFamilies").query()
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
}

async function allPacks(ctx: QueryCtx | MutationCtx, orgId: string) {
  return await tenantTable(ctx, orgId, "packs").query()
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
}

async function catalogueFor(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  locale: PricingLocale,
  publicOnly = false,
): Promise<CatalogueFamilyGroup[]> {
  const [families, packs] = await Promise.all([allFamilies(ctx, orgId), allPacks(ctx, orgId)]);
  return buildCatalogue({ locale, now: NOW(), families, packs, publicOnly });
}

function publicOrder(order: Doc<"billingOrders">) {
  return {
    orderId: order._id,
    status: order.status,
    packId: order.packId ?? null,
    requestedAt: order.requestedAt,
    planSnapshot: order.planSnapshot,
    priceSnapshot: order.priceSnapshot,
    rejectionReason: order.rejectionReason ?? null,
    grantId: order.grantId ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Reading the catalogue
// ─────────────────────────────────────────────────────────────────────

/**
 * Signed-out catalogue for the public website. Public by design, fixed to the
 * academy tenant, and projecting only commercial fields through
 * `buildCatalogue`. Like the student portal it reads the same rows in the same
 * order, so a new family appears on the website because it was created — not
 * because code changed. A family switched off for the website is skipped here
 * and still shown to students.
 */
export const getPublicCatalogue = query({
  args: { locale: v.optional(localeArg) },
  handler: async (ctx, { locale }) => {
    return await catalogueFor(ctx, ACADEMY_ID, locale ?? "ru", true);
  },
});

export const getStudentCatalogue = query({
  args: { locale: v.optional(localeArg) },
  handler: async (ctx, { locale }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const selected = (locale ?? user.locale ?? "en") as PricingLocale;
    const groups = await catalogueFor(ctx, orgId, selected);
    const orders = await tenantTable(ctx, orgId, "billingOrders").query()
      .withIndex("by_organization_and_buyerStudentId_and_status", (q) =>
        q.eq("organizationId", orgId).eq("buyerStudentId", user.externalId).eq("status", "pending_verification")
      )
      .collect();
    return { groups, openOrder: orders[0] ? publicOrder(orders[0]) : null };
  },
});

/** Every order this student has placed, newest first. */
export const listMyOrders = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const orders = await tenantTable(ctx, orgId, "billingOrders").query()
      .withIndex("by_organization_and_buyerStudentId_and_status", (q) =>
        q.eq("organizationId", orgId).eq("buyerStudentId", user.externalId).eq("status", "pending_verification")
      )
      .collect();
    const [granted, rejected, cancelled] = await Promise.all([
      tenantTable(ctx, orgId, "billingOrders").query()
        .withIndex("by_organization_and_buyerStudentId_and_status", (q) => q.eq("organizationId", orgId).eq("buyerStudentId", user.externalId).eq("status", "granted")).collect(),
      tenantTable(ctx, orgId, "billingOrders").query()
        .withIndex("by_organization_and_buyerStudentId_and_status", (q) => q.eq("organizationId", orgId).eq("buyerStudentId", user.externalId).eq("status", "rejected")).collect(),
      tenantTable(ctx, orgId, "billingOrders").query()
        .withIndex("by_organization_and_buyerStudentId_and_status", (q) => q.eq("organizationId", orgId).eq("buyerStudentId", user.externalId).eq("status", "cancelled")).collect(),
    ]);
    return [...orders, ...granted, ...rejected, ...cancelled]
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || String(b._id).localeCompare(String(a._id)))
      .map(publicOrder);
  },
});

/** Admin editor read model. Raw rows so the editor never re-derives order. */
export const listCatalogue = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const [families, packs] = await Promise.all([allFamilies(ctx, orgId), allPacks(ctx, orgId)]);
    return { families: sortFamilies(families), packs: sortPacks(packs) };
  },
});

export const getPaymentInstructions = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    const settings = await tenantTable(ctx, orgId, "tenantSettings").query()
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const instructions = settings?.manualPayment;
    if (!instructions?.enabled) return null;
    return {
      kaspiPhone: instructions.kaspiPhone ?? null,
      recipientName: instructions.recipientName ?? null,
      note: instructions.note ?? null,
      qrUrl: instructions.qrUrl ?? null,
    };
  },
});

/** What the student will be charged right now, for the confirm dialog. */
export const previewPack = query({
  args: { packId: v.id("packs"), locale: v.optional(localeArg) },
  handler: async (ctx, { packId, locale }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const groups = await catalogueFor(ctx, orgId, (locale ?? user.locale ?? "en") as PricingLocale);
    const offer = findOffer(groups, String(packId));
    if (!offer) throw new Error("This pack is not available");
    return { offer, ...orderSnapshots(offer, NOW()) };
  },
});

export const listOrders = query({
  args: { status: v.optional(orderStatusArg) },
  handler: async (ctx, { status }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const table = tenantTable(ctx, orgId, "billingOrders");
    const orders = status
      ? await table.query().withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", status)).order("desc").collect()
      : (await Promise.all(
          (["pending_verification", "granted", "rejected", "cancelled"] as const).map((state) =>
            table.query().withIndex("by_organization_and_status", (q) => q.eq("organizationId", orgId).eq("status", state)).collect()
          ),
        )).flat();
    const users = await tenantTable(ctx, orgId, "users").query()
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId)).collect();
    const names = new Map(users.map((user) => [user.externalId, user.name]));
    return orders
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || String(b._id).localeCompare(String(a._id)))
      .map((order) => {
        const buyerExists = names.has(order.buyerStudentId);
        const deletionBlockReason = order.status === "pending_verification"
          ? "pending"
          : buyerExists
            ? "buyer_exists"
            : null;
        return {
          ...publicOrder(order),
          buyerStudentId: order.buyerStudentId,
          buyerName: names.get(order.buyerStudentId) ?? order.buyerStudentId,
          deletionAllowed: deletionBlockReason === null,
          deletionBlockReason,
        };
      });
  },
});

// ─────────────────────────────────────────────────────────────────────
//  Editing the catalogue
// ─────────────────────────────────────────────────────────────────────

export const saveFamily = mutation({
  args: {
    id: v.optional(v.id("packFamilies")),
    label: v.string(),
    labelEn: v.optional(v.string()),
    labelRu: v.optional(v.string()),
    description: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionRu: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isVisible: v.optional(v.boolean()),
    showOnWebsite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "packFamilies");
    const existing = args.id ? await table.get(args.id) : null;
    if (args.id && !existing) throw new Error("Family not found");
    const rows = await allFamilies(ctx, orgId);
    const now = NOW();
    const fields = {
      label: requiredText(args.label, "Family name"),
      labelEn: optionalText(args.labelEn),
      labelRu: optionalText(args.labelRu),
      description: optionalText(args.description),
      descriptionEn: optionalText(args.descriptionEn),
      descriptionRu: optionalText(args.descriptionRu),
      isVisible: args.isVisible ?? existing?.isVisible ?? true,
      showOnWebsite: args.showOnWebsite ?? existing?.showOnWebsite ?? true,
      updatedAt: now,
      updatedBy: user.externalId,
    };
    if (existing) {
      await table.patch(existing._id, {
        ...fields,
        sortOrder: args.sortOrder === undefined ? existing.sortOrder : validSortOrder(args.sortOrder),
      });
      return existing._id;
    }
    return await table.insert({
      ...fields,
      organizationId: orgId,
      sortOrder: validSortOrder(args.sortOrder ?? nextSortOrder(rows)),
      isArchived: false,
      createdAt: now,
    });
  },
});

export const savePack = mutation({
  args: {
    id: v.optional(v.id("packs")),
    familyId: v.id("packFamilies"),
    name: v.string(),
    nameEn: v.optional(v.string()),
    nameRu: v.optional(v.string()),
    lessons: v.number(),
    currency: v.string(),
    price: v.number(),
    salePrice: v.optional(v.number()),
    saleEndsAt: v.optional(v.string()),
    expiryDays: v.number(),
    benefits: v.array(pricingTextArg),
    sortOrder: v.optional(v.number()),
    isVisible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const family = await tenantTable(ctx, orgId, "packFamilies").get(args.familyId);
    if (!family) throw new Error("Family not found");
    if (!Number.isInteger(args.lessons) || args.lessons <= 0) throw new Error("Lessons must be a positive whole number");
    if (!Number.isInteger(args.expiryDays) || args.expiryDays <= 0) throw new Error("Valid-for days must be a positive whole number");
    const currency = validCurrency(args.currency);
    const salePrice = args.salePrice === undefined ? undefined : args.salePrice;
    const saleEndsAt = optionalText(args.saleEndsAt);
    validatePackPricing({ price: args.price, salePrice, saleEndsAt });
    const benefits = args.benefits.map((benefit, index) => normalizedPricingText(benefit, `Benefit ${index + 1}`));

    const table = tenantTable(ctx, orgId, "packs");
    const existing = args.id ? await table.get(args.id) : null;
    if (args.id && !existing) throw new Error("Pack not found");
    const rows = await allPacks(ctx, orgId);
    const now = NOW();
    const fields = {
      familyId: args.familyId,
      name: requiredText(args.name, "Pack name"),
      nameEn: optionalText(args.nameEn),
      nameRu: optionalText(args.nameRu),
      lessons: args.lessons,
      currency,
      price: args.price,
      salePrice,
      saleEndsAt,
      expiryDays: args.expiryDays,
      benefits,
      isVisible: args.isVisible ?? existing?.isVisible ?? true,
      updatedAt: now,
      updatedBy: user.externalId,
    };
    if (existing) {
      await table.patch(existing._id, {
        ...fields,
        sortOrder: args.sortOrder === undefined ? existing.sortOrder : validSortOrder(args.sortOrder),
      });
      return existing._id;
    }
    return await table.insert({
      ...fields,
      organizationId: orgId,
      sortOrder: validSortOrder(args.sortOrder ?? nextSortOrder(rows)),
      isArchived: false,
      createdAt: now,
      createdBy: user.externalId,
    });
  },
});

/** One-step display move. Swaps sort order with the neighbour. */
export const moveFamily = mutation({
  args: { familyId: v.id("packFamilies"), direction: directionArg },
  handler: async (ctx, { familyId, direction }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "packFamilies");
    const swap = neighbourToSwap(sortFamilies(await allFamilies(ctx, orgId)), String(familyId), direction);
    if (!swap) return familyId;
    const [current, neighbour] = swap;
    // Capture both orders before either patch: the row objects are live.
    const currentOrder = current.sortOrder;
    const neighbourOrder = neighbour.sortOrder;
    const now = NOW();
    await table.patch(current._id, { sortOrder: neighbourOrder, updatedAt: now, updatedBy: user.externalId });
    await table.patch(neighbour._id, { sortOrder: currentOrder, updatedAt: now, updatedBy: user.externalId });
    return familyId;
  },
});

export const movePack = mutation({
  args: { packId: v.id("packs"), direction: directionArg },
  handler: async (ctx, { packId, direction }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const pack = await tenantTable(ctx, orgId, "packs").get(packId);
    if (!pack) throw new Error("Pack not found");
    const siblings = (await allPacks(ctx, orgId)).filter((row) => String(row.familyId) === String(pack.familyId));
    const swap = neighbourToSwap(sortPacks(siblings), String(packId), direction);
    if (!swap) return packId;
    const [current, neighbour] = swap;
    const currentOrder = current.sortOrder;
    const neighbourOrder = neighbour.sortOrder;
    const now = NOW();
    const table = tenantTable(ctx, orgId, "packs");
    await table.patch(current._id, { sortOrder: neighbourOrder, updatedAt: now, updatedBy: user.externalId });
    await table.patch(neighbour._id, { sortOrder: currentOrder, updatedAt: now, updatedBy: user.externalId });
    return packId;
  },
});

export const setFamilyVisible = mutation({
  args: { familyId: v.id("packFamilies"), isVisible: v.boolean() },
  handler: async (ctx, { familyId, isVisible }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "packFamilies");
    if (!await table.get(familyId)) throw new Error("Family not found");
    await table.patch(familyId, { isVisible, updatedAt: NOW(), updatedBy: user.externalId });
    return familyId;
  },
});

export const setPackVisible = mutation({
  args: { packId: v.id("packs"), isVisible: v.boolean() },
  handler: async (ctx, { packId, isVisible }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "packs");
    if (!await table.get(packId)) throw new Error("Pack not found");
    await table.patch(packId, { isVisible, updatedAt: NOW(), updatedBy: user.externalId });
    return packId;
  },
});

/** Archive, never delete: an archived pack keeps its order history readable. */
export const setPackArchived = mutation({
  args: { packId: v.id("packs"), isArchived: v.boolean() },
  handler: async (ctx, { packId, isArchived }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "packs");
    if (!await table.get(packId)) throw new Error("Pack not found");
    await table.patch(packId, { isArchived, updatedAt: NOW(), updatedBy: user.externalId });
    return packId;
  },
});

export const setFamilyArchived = mutation({
  args: { familyId: v.id("packFamilies"), isArchived: v.boolean() },
  handler: async (ctx, { familyId, isArchived }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    const table = tenantTable(ctx, orgId, "packFamilies");
    if (!await table.get(familyId)) throw new Error("Family not found");
    await table.patch(familyId, { isArchived, updatedAt: NOW(), updatedBy: user.externalId });
    return familyId;
  },
});

// ─────────────────────────────────────────────────────────────────────
//  Buying: student request → admin verification → exactly one grant
// ─────────────────────────────────────────────────────────────────────

export const createOrderRequest = mutation({
  args: { packId: v.id("packs"), requestKey: v.string(), locale: v.optional(localeArg) },
  handler: async (ctx, { packId, requestKey, locale }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const key = requiredText(requestKey, "Request key");
    if (key.length > 200) throw new Error("Request key is too long");
    const orders = tenantTable(ctx, orgId, "billingOrders");
    const sameKey = await orders.query()
      .withIndex("by_organization_and_requestKey", (q) => q.eq("organizationId", orgId).eq("requestKey", key))
      .unique();
    if (sameKey) {
      if (sameKey.buyerStudentId !== user.externalId) throw new Error("Request key is already in use");
      return publicOrder(sameKey);
    }
    const pending = await orders.query()
      .withIndex("by_organization_and_buyerStudentId_and_status", (q) =>
        q.eq("organizationId", orgId).eq("buyerStudentId", user.externalId).eq("status", "pending_verification")
      )
      .unique();
    if (pending) return publicOrder(pending);

    const selected = (locale ?? user.locale ?? "en") as PricingLocale;
    const groups = await catalogueFor(ctx, orgId, selected);
    const offer = findOffer(groups, String(packId));
    if (!offer) throw new Error("This pack is not available");
    const now = NOW();
    const { planSnapshot, priceSnapshot } = orderSnapshots(offer, now);
    const orderId = await orders.insert({
      organizationId: orgId,
      buyerStudentId: user.externalId,
      requestKey: key,
      packId,
      planSnapshot,
      priceSnapshot,
      status: "pending_verification",
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const admins = await tenantTable(ctx, orgId, "users").query()
      .withIndex("by_organization_and_role", (q) => q.eq("organizationId", orgId).eq("role", "admin")).collect();
    for (const admin of admins) {
      await insertNotification(ctx, {
        organizationId: orgId,
        recipientId: admin.externalId,
        kind: "billing_order_requested",
        payload: {
          studentId: user.externalId,
          studentName: user.name,
          familyLabel: planSnapshot.familyLabel,
          planLabel: planSnapshot.planLabel,
          lessons: planSnapshot.lessonCount,
          amount: priceSnapshot.netAmount,
          currency: priceSnapshot.currency,
          orderId,
        },
        link: orderAdminLink(String(orderId)),
        sourceKey: `billing-order-requested:${orderId}`,
      });
    }
    return publicOrder((await orders.get(orderId))!);
  },
});

export async function grantBillingOrderCore(
  ctx: MutationCtx,
  { orgId, orderId, processedBy }: { orgId: string; orderId: Id<"billingOrders">; processedBy: string },
) {
  const orders = tenantTable(ctx, orgId, "billingOrders");
  const order = await orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "granted") return { ok: true as const, alreadyProcessed: true, grantId: order.grantId };
  if (order.status !== "pending_verification") throw new Error(`Cannot grant an order that is ${order.status}`);
  const nextStatus = transitionBillingOrder(order.status, "grant");
  const now = NOW();
  const grant = await grantPointsInternal(ctx, {
    orgId,
    studentId: order.buyerStudentId,
    points: order.planSnapshot.lessonCount,
    source: "purchase",
    expiryDays: order.planSnapshot.expiryDays || undefined,
    performedBy: processedBy,
    notes: `${order.planSnapshot.familyLabel} · ${order.planSnapshot.planLabel} · billing order ${order._id}`,
    billingOrderId: order._id,
    packId: order.packId,
    planSnapshot: order.planSnapshot,
    priceSnapshot: order.priceSnapshot,
  });
  const financeEntryId = await recordEntry(ctx, {
    organizationId: orgId,
    direction: "in",
    category: "pack_sale",
    amount: order.priceSnapshot.netAmount,
    currency: order.priceSnapshot.currency,
    date: now.slice(0, 10),
    note: `${order.planSnapshot.familyLabel} · ${order.planSnapshot.planLabel} · ${order.planSnapshot.lessonCount} lessons`,
    source: "auto",
    sourceKey: `billing-order:${order._id}`,
    studentId: order.buyerStudentId,
    billingOrderId: order._id,
    createdBy: processedBy,
  });
  await orders.patch(order._id, { status: nextStatus, grantedAt: now, processedBy, grantId: grant.grantId, financeEntryId, updatedAt: now });
  await insertNotification(ctx, {
    organizationId: orgId,
    recipientId: order.buyerStudentId,
    kind: "payment_received",
    payload: { packName: order.planSnapshot.planLabel, familyLabel: order.planSnapshot.familyLabel, lessons: order.planSnapshot.lessonCount, balanceAfter: grant.balanceAfter, orderId: order._id },
    link: "/student/billing",
    sourceKey: `billing-order-granted:${order._id}`,
  });
  return { ok: true as const, alreadyProcessed: false, grantId: grant.grantId, financeEntryId };
}

export const grantOrder = mutation({
  args: { orderId: v.id("billingOrders") },
  handler: async (ctx, { orderId }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    return await grantBillingOrderCore(ctx, { orgId, orderId, processedBy: user.externalId });
  },
});

export async function rejectBillingOrderCore(
  ctx: MutationCtx,
  { orgId, orderId, reason, processedBy }: { orgId: string; orderId: Id<"billingOrders">; reason: string; processedBy: string },
) {
  const orders = tenantTable(ctx, orgId, "billingOrders");
  const order = await orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "rejected") return { ok: true as const, alreadyProcessed: true };
  if (order.status !== "pending_verification") throw new Error(`Cannot reject an order that is ${order.status}`);
  const cleaned = requiredText(reason, "Rejection reason");
  if (cleaned.length < 5) throw new Error("Give a readable reason");
  await orders.patch(order._id, { status: transitionBillingOrder(order.status, "reject"), rejectedAt: NOW(), processedBy, rejectionReason: cleaned, updatedAt: NOW() });
  await insertNotification(ctx, {
    organizationId: orgId,
    recipientId: order.buyerStudentId,
    kind: "billing_order_rejected",
    payload: { planLabel: order.planSnapshot.planLabel, familyLabel: order.planSnapshot.familyLabel, reason: cleaned, orderId: order._id },
    link: "/student/billing",
    sourceKey: `billing-order-rejected:${order._id}`,
  });
  return { ok: true as const, alreadyProcessed: false };
}

export const rejectOrder = mutation({
  args: { orderId: v.id("billingOrders"), reason: v.string() },
  handler: async (ctx, { orderId, reason }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    return await rejectBillingOrderCore(ctx, { orgId, orderId, reason, processedBy: user.externalId });
  },
});

/**
 * Remove a terminal order only after its buyer identity has disappeared.
 *
 * This is intentionally narrower than a generic order delete: a pending order
 * must be rejected/cancelled first, and a surviving buyer protects the order's
 * history. Point transactions and notifications do not all have an order-only
 * index, so their exact order/grant keys are filtered from the small,
 * organization-scoped collections used by this pre-launch tenant.
 */
export const deleteOrphanedOrder = mutation({
  args: { orderId: v.id("billingOrders") },
  handler: async (ctx, { orderId }) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const orders = tenantTable(ctx, orgId, "billingOrders");
    const order = await orders.get(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status === "pending_verification") {
      throw new Error("Reject or cancel this pending order before deleting it");
    }

    const buyer = await tenantTable(ctx, orgId, "users").query()
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", order.buyerStudentId)
      )
      .unique();
    if (buyer) throw new Error("Cannot delete an order while its buyer still exists");

    const finance = tenantTable(ctx, orgId, "financeEntries");
    const financeRows = new Map<string, Doc<"financeEntries">>();
    if (order.financeEntryId) {
      const linked = await finance.get(order.financeEntryId);
      if (linked) financeRows.set(String(linked._id), linked);
    }
    const orderFinance = await finance.query()
      .withIndex("by_organization_and_billingOrderId", (q) =>
        q.eq("organizationId", orgId).eq("billingOrderId", orderId)
      )
      .collect();
    for (const row of orderFinance) financeRows.set(String(row._id), row);

    const grantsTable = tenantTable(ctx, orgId, "pointGrants");
    const grants = await grantsTable.query()
      .withIndex("by_organization_and_billingOrderId", (q) =>
        q.eq("organizationId", orgId).eq("billingOrderId", orderId)
      )
      .collect();
    const grantIds = new Set(grants.map((grant) => String(grant._id)));

    // pointTransactions has no billingOrderId index yet; keep both exact
    // ownership checks in this bounded org-scoped scan.
    const transactionsTable = tenantTable(ctx, orgId, "pointTransactions");
    const transactions = (await transactionsTable.query()
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect())
      .filter((transaction) =>
        String(transaction.billingOrderId ?? "") === String(orderId) ||
        (transaction.grantId !== undefined && grantIds.has(String(transaction.grantId)))
      );

    const notificationSourceKeys = new Set([
      `billing-order-requested:${orderId}`,
      `billing-order-granted:${orderId}`,
      `billing-order-rejected:${orderId}`,
    ]);
    const notificationsTable = tenantTable(ctx, orgId, "notifications");
    const notifications = (await notificationsTable.query()
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect())
      .filter((notification) => notificationSourceKeys.has(notification.sourceKey ?? ""));

    for (const transaction of transactions) await transactionsTable.delete(transaction._id);
    for (const grant of grants) await grantsTable.delete(grant._id);
    for (const row of financeRows.values()) await finance.delete(row._id);
    for (const notification of notifications) await notificationsTable.delete(notification._id);
    await orders.delete(order._id);

    return {
      ordersDeleted: 1,
      financeEntriesDeleted: financeRows.size,
      pointGrantsDeleted: grants.length,
      pointTransactionsDeleted: transactions.length,
      notificationsDeleted: notifications.length,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────
//  Hand-made deals
// ─────────────────────────────────────────────────────────────────────

/**
 * Give one student lessons directly, without a pack: the agreed price is what
 * the admin types, and the amount is booked to the ledger when one is given.
 * This is the whole "deal with each student individually" path.
 */
export const grantLessonsToStudent = mutation({
  args: {
    studentId: v.string(),
    lessons: v.number(),
    expiryDays: v.optional(v.number()),
    note: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "billing.edit");
    if (!Number.isInteger(args.lessons) || args.lessons <= 0) throw new Error("Lessons must be a positive whole number");
    const student = await tenantTable(ctx, orgId, "users").query()
      .withIndex("by_organization_and_externalId", (q) => q.eq("organizationId", orgId).eq("externalId", args.studentId))
      .unique();
    if (!student || student.role !== "student") throw new Error("Unknown student");
    const expiryDays = args.expiryDays === undefined ? undefined : Math.max(1, Math.round(args.expiryDays));
    const note = optionalText(args.note);
    const grant = await grantPointsInternal(ctx, {
      orgId,
      studentId: args.studentId,
      points: args.lessons,
      source: "manual",
      expiryDays,
      performedBy: user.externalId,
      notes: note ?? `${args.lessons} lessons given by hand`,
    });
    const amount = args.amount ?? 0;
    let financeEntryId: Id<"financeEntries"> | null = null;
    if (amount > 0) {
      const currency = validCurrency(args.currency ?? "KZT");
      financeEntryId = await recordEntry(ctx, {
        organizationId: orgId,
        direction: "in",
        category: "pack_sale",
        amount,
        currency,
        date: NOW().slice(0, 10),
        note: note ? `${args.lessons} lessons · ${note}` : `${args.lessons} lessons given by hand`,
        source: "manual",
        sourceKey: `manual-grant:${grant.grantId}`,
        studentId: args.studentId,
        createdBy: user.externalId,
      });
    }
    await insertNotification(ctx, {
      organizationId: orgId,
      recipientId: args.studentId,
      kind: "payment_received",
      payload: { packName: note ?? "Lessons", familyLabel: "Manual", lessons: args.lessons, balanceAfter: grant.balanceAfter, orderId: "manual" },
      link: "/student/billing",
      sourceKey: `manual-grant:${grant.grantId}`,
    });
    return { grantId: grant.grantId, balanceAfter: grant.balanceAfter, financeEntryId };
  },
});
