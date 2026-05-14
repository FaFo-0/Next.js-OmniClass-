// Phase H.1 — point ledger. Replaces the old session-counter
// `studentPackages` model with FIFO point grants + an append-only
// transaction ledger.
//
// Spend rule: when a student spends N points (e.g. booking a 10pt 1on1),
// drain from grants in ascending `expiresAt` order, skipping expired
// rows. Each grant's `remainingPoints` is decremented; when it hits 0
// the grant stays in the table (we keep the history). A single ledger
// row records the spend, signed negative.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  mutation,
  query,
  internalMutation,
} from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import {
  requireTenant,
  requireTenantPermission,
} from "./lib/tenant";

const NOW = () => new Date().toISOString();
const TODAY = () => new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

/** Current spendable balance for the caller (sum of unexpired grants). */
export const getBalance = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    const today = TODAY();
    const rows = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", target)
      )
      .collect();
    let total = 0;
    let nextExpiresAt: string | null = null;
    for (const g of rows) {
      if (g.isExpired) continue;
      if (g.expiresAt < today) continue;
      if (g.remainingPoints <= 0) continue;
      total += g.remainingPoints;
      if (nextExpiresAt === null || g.expiresAt < nextExpiresAt) {
        nextExpiresAt = g.expiresAt;
      }
    }
    return { balance: total, nextExpiresAt };
  },
});

/**
 * Admin-only — balance + next expiry for every student in the org.
 * Used by /admin/billing.
 */
export const getBalancesForOrg = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    const today = TODAY();
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const byStudent = new Map<
      string,
      { studentId: string; balance: number; nextExpiresAt: string | null }
    >();
    for (const g of grants) {
      if (g.isExpired || g.expiresAt < today || g.remainingPoints <= 0) continue;
      const entry =
        byStudent.get(g.studentId) ??
        { studentId: g.studentId, balance: 0, nextExpiresAt: null };
      entry.balance += g.remainingPoints;
      if (entry.nextExpiresAt === null || g.expiresAt < entry.nextExpiresAt) {
        entry.nextExpiresAt = g.expiresAt;
      }
      byStudent.set(g.studentId, entry);
    }
    return Array.from(byStudent.values()).sort(
      (a, b) => b.balance - a.balance
    );
  },
});

/** Full grant list for the caller (or a given student, admin only). */
export const getGrants = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    return await ctx.db
      .query("pointGrants")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", target)
      )
      .order("desc")
      .collect();
  },
});

/** Recent transactions for the caller (or a given student, admin only). */
export const getTransactions = query({
  args: { studentId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { studentId, limit }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    return await ctx.db
      .query("pointTransactions")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", target)
      )
      .order("desc")
      .take(limit ?? 50);
  },
});

// ─────────────────────────────────────────────────────────────────────
// Mutations — public
// ─────────────────────────────────────────────────────────────────────

/**
 * Admin (or system) grants points to a student. Source captures the
 * reason. Defaults to a 45-day expiry from purchase if not given.
 */
export const grantPoints = mutation({
  args: {
    studentId: v.string(),
    points: v.number(),
    source: v.union(
      v.literal("purchase"),
      v.literal("manual"),
      v.literal("refund"),
      v.literal("makeup"),
      v.literal("trial")
    ),
    packageId: v.optional(v.id("pointPackages")),
    externalOrderId: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "billing.edit"
    );
    return await grantPointsInternal(ctx, {
      orgId,
      performedBy: user.externalId,
      ...args,
    });
  },
});

/**
 * Spend points from the caller's balance. Atomic: walks unexpired
 * grants in FIFO order, decrements remainingPoints, writes a single
 * spend transaction. Throws if balance < amount.
 */
export const spendPoints = mutation({
  args: {
    amount: v.number(),
    scheduleEventId: v.optional(v.id("scheduleEvents")),
    enrollmentId: v.optional(v.id("scheduleEnrollments")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    return await spendPointsInternal(ctx, {
      orgId,
      studentId: user.externalId,
      performedBy: user.externalId,
      ...args,
    });
  },
});

/**
 * Admin refund — issues a brand-new grant of the refunded amount.
 * Original grant is left untouched (audit). Use this for teacher
 * no-show flows.
 */
export const refundPoints = mutation({
  args: {
    studentId: v.string(),
    amount: v.number(),
    reason: v.string(),
    scheduleEventId: v.optional(v.id("scheduleEvents")),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "billing.edit"
    );
    return await grantPointsInternal(ctx, {
      orgId,
      studentId: args.studentId,
      points: args.amount,
      source: "refund",
      expiresAt: args.expiresAt,
      performedBy: user.externalId,
      notes: args.reason,
      scheduleEventId: args.scheduleEventId,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────
// Internal helpers — also usable from other Convex modules
// ─────────────────────────────────────────────────────────────────────

export async function grantPointsInternal(
  ctx: any,
  args: {
    orgId: string;
    studentId: string;
    points: number;
    source:
      | "purchase"
      | "manual"
      | "refund"
      | "makeup"
      | "trial";
    packageId?: Id<"pointPackages">;
    externalOrderId?: string;
    expiresAt?: string;
    notes?: string;
    performedBy: string;
    scheduleEventId?: Id<"scheduleEvents">;
  }
): Promise<{ grantId: Id<"pointGrants">; balanceAfter: number }> {
  if (args.points <= 0) throw new Error("Grant amount must be positive");

  const purchasedAt = NOW();
  const expiresAt =
    args.expiresAt ??
    new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);

  const grantId: Id<"pointGrants"> = await ctx.db.insert("pointGrants", {
    organizationId: args.orgId,
    studentId: args.studentId,
    points: args.points,
    remainingPoints: args.points,
    purchasedAt,
    expiresAt,
    source: args.source,
    packageId: args.packageId,
    grantedBy: args.performedBy,
    externalOrderId: args.externalOrderId,
    notes: args.notes,
  });

  const balanceAfter = await computeBalance(
    ctx,
    args.orgId,
    args.studentId
  );

  await ctx.db.insert("pointTransactions", {
    organizationId: args.orgId,
    studentId: args.studentId,
    type: "grant",
    amount: args.points,
    balanceAfter,
    scheduleEventId: args.scheduleEventId,
    grantId,
    performedBy: args.performedBy,
    reason: args.notes ?? `Grant (${args.source})`,
    createdAt: purchasedAt,
  });

  return { grantId, balanceAfter };
}

export async function spendPointsInternal(
  ctx: any,
  args: {
    orgId: string;
    studentId: string;
    amount: number;
    scheduleEventId?: Id<"scheduleEvents">;
    enrollmentId?: Id<"scheduleEnrollments">;
    reason: string;
    performedBy: string;
  }
): Promise<{ balanceAfter: number; drainedFrom: Id<"pointGrants">[] }> {
  if (args.amount <= 0) throw new Error("Spend amount must be positive");

  const today = TODAY();
  const grants = (await ctx.db
    .query("pointGrants")
    .withIndex("by_organization_and_studentId_and_expiresAt", (q: any) =>
      q
        .eq("organizationId", args.orgId)
        .eq("studentId", args.studentId)
    )
    .collect()) as Doc<"pointGrants">[];

  // FIFO consumption — oldest expiry first, skip already expired.
  const usable = grants
    .filter(
      (g) =>
        !g.isExpired &&
        g.expiresAt >= today &&
        g.remainingPoints > 0
    )
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  const totalAvailable = usable.reduce(
    (sum, g) => sum + g.remainingPoints,
    0
  );
  if (totalAvailable < args.amount) {
    throw new Error(
      `Insufficient points: need ${args.amount}, have ${totalAvailable}`
    );
  }

  let remaining = args.amount;
  const drainedFrom: Id<"pointGrants">[] = [];
  for (const g of usable) {
    if (remaining <= 0) break;
    const take = Math.min(g.remainingPoints, remaining);
    await ctx.db.patch(g._id, {
      remainingPoints: g.remainingPoints - take,
    });
    drainedFrom.push(g._id);
    remaining -= take;
  }

  const balanceAfter = totalAvailable - args.amount;
  await ctx.db.insert("pointTransactions", {
    organizationId: args.orgId,
    studentId: args.studentId,
    type: "spend",
    amount: -args.amount,
    balanceAfter,
    scheduleEventId: args.scheduleEventId,
    enrollmentId: args.enrollmentId,
    performedBy: args.performedBy,
    reason: args.reason,
    createdAt: NOW(),
  });

  return { balanceAfter, drainedFrom };
}

async function computeBalance(
  ctx: any,
  orgId: string,
  studentId: string
): Promise<number> {
  const today = TODAY();
  const rows = (await ctx.db
    .query("pointGrants")
    .withIndex("by_organization_and_studentId", (q: any) =>
      q.eq("organizationId", orgId).eq("studentId", studentId)
    )
    .collect()) as Doc<"pointGrants">[];
  return rows.reduce(
    (sum, g) =>
      !g.isExpired && g.expiresAt >= today
        ? sum + g.remainingPoints
        : sum,
    0
  );
}

// ─────────────────────────────────────────────────────────────────────
// Expiry cron — called nightly
// ─────────────────────────────────────────────────────────────────────

export const expireDailyCron = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = TODAY();
    // Walk every org's grants in one pass — cron isn't tenant-scoped.
    const all = await ctx.db.query("pointGrants").collect();
    let expired = 0;
    for (const g of all) {
      if (g.isExpired) continue;
      if (g.expiresAt >= today) continue;
      if (g.remainingPoints <= 0) {
        await ctx.db.patch(g._id, { isExpired: true });
        continue;
      }
      const balanceAfter = await computeBalance(
        ctx,
        g.organizationId,
        g.studentId
      );
      await ctx.db.patch(g._id, {
        isExpired: true,
        remainingPoints: 0,
      });
      await ctx.db.insert("pointTransactions", {
        organizationId: g.organizationId,
        studentId: g.studentId,
        type: "expire",
        amount: -g.remainingPoints,
        balanceAfter: Math.max(0, balanceAfter - g.remainingPoints),
        grantId: g._id,
        performedBy: "system",
        reason: `Grant expired (${g.expiresAt})`,
        createdAt: NOW(),
      });
      expired += 1;
    }
    return { expired };
  },
});

// ─────────────────────────────────────────────────────────────────────
// pointPackages catalog (admin-managed)
// ─────────────────────────────────────────────────────────────────────

export const listPackages = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, { activeOnly }) => {
    const { orgId } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("pointPackages")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const filtered = activeOnly ? rows.filter((r) => r.isActive) : rows;
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const upsertPackage = mutation({
  args: {
    id: v.optional(v.id("pointPackages")),
    externalId: v.string(),
    name: v.string(),
    points: v.number(),
    priceUSD: v.number(),
    isActive: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const now = NOW();
    if (args.id) {
      await ctx.db.patch(args.id, {
        name: args.name,
        points: args.points,
        priceUSD: args.priceUSD,
        isActive: args.isActive,
        sortOrder: args.sortOrder,
        updatedAt: now,
      });
      return args.id;
    }
    return await ctx.db.insert("pointPackages", {
      organizationId: orgId,
      externalId: args.externalId,
      name: args.name,
      points: args.points,
      priceUSD: args.priceUSD,
      isActive: args.isActive,
      sortOrder: args.sortOrder,
      effectiveFrom: now,
      createdAt: now,
    });
  },
});
