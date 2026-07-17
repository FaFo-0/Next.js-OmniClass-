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
// §13.1 — sentinel for "never expires" (far past any real subscription).
export const NO_EXPIRY = "9999-12-31";

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
 * reason. §13.1: no expiry by default; pass expiresAt only for subscriptions.
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
  // §13.1: lessons do NOT expire in v1. Callers may still pass an explicit
  // expiresAt (future subscriptions); default is a far-future sentinel that
  // never trips the `expiresAt < today` checks or the expiry cron.
  const expiresAt = args.expiresAt ?? NO_EXPIRY;

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
// Dev/ops helper — grant lesson credits from the CLI.
// Usage: npx convex run points:grantCli '{"orgId":"org_…","studentId":"user_…","points":8}'
// ─────────────────────────────────────────────────────────────────────

/**
 * C-1 migration: push every still-active grant with a near-term expiry
 * out to NO_EXPIRY so lessons granted under the old 45-day default don't
 * silently burn. Leaves already-expired grants alone.
 * Usage: npx convex run points:migrateGrantExpiry '{"orgId":"org_…"}' [--prod]
 */
export const migrateGrantExpiry = internalMutation({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    const today = TODAY();
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    let bumped = 0;
    for (const g of grants) {
      if (g.isExpired) continue;
      if (g.remainingPoints <= 0) continue;
      if (g.expiresAt >= today && g.expiresAt < NO_EXPIRY) {
        await ctx.db.patch(g._id, { expiresAt: NO_EXPIRY });
        bumped++;
      }
    }
    return { bumped };
  },
});

export const grantCli = internalMutation({
  args: {
    orgId: v.string(),
    studentId: v.string(),
    points: v.number(),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await grantPointsInternal(ctx, {
      orgId: args.orgId,
      studentId: args.studentId,
      points: args.points,
      source: "manual",
      expiresAt: args.expiresAt,
      performedBy: "system-cli",
      notes: "CLI grant",
    });
  },
});

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

/**
 * H.4 — resolve the effective price a given student pays for a
 * package. Honors lockedPriceTier; falls back to the package's
 * current `priceUSD` if the student hasn't purchased this package
 * before or their lock was cleared by a force-migrate.
 */
export const resolveEffectivePrice = query({
  args: { packageId: v.id("pointPackages"), studentId: v.optional(v.string()) },
  handler: async (ctx, { packageId, studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    const pkg = await ctx.db.get(packageId);
    if (!pkg || pkg.organizationId !== orgId) {
      throw new Error("Package not found");
    }
    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", target)
      )
      .unique();
    const lock = student?.lockedPriceTier?.find(
      (l) => l.packageId === packageId
    );
    return lock
      ? {
          priceUSD: lock.lockedPriceUSD,
          points: lock.lockedPoints,
          locked: true,
          lockedAt: lock.lockedAt,
        }
      : {
          priceUSD: pkg.priceUSD,
          points: pkg.points,
          locked: false,
          lockedAt: null,
        };
  },
});

/**
 * H.4 — admin force-migrates all students to the current package
 * price. Clears any lockedPriceTier rows for the package and writes
 * a priceMigrationAudit row so an undo can restore them.
 */
export const forceMigratePackagePrice = mutation({
  args: { packageId: v.id("pointPackages") },
  handler: async (ctx, { packageId }) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "billing.edit"
    );
    const pkg = await ctx.db.get(packageId);
    if (!pkg || pkg.organizationId !== orgId) {
      throw new Error("Package not found");
    }
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const affected: {
      userId: string;
      beforeLockedPriceUSD?: number;
      beforeLockedPoints?: number;
    }[] = [];
    let firstLock: { priceUSD: number; points: number } | null = null;
    for (const u of users) {
      const locks = u.lockedPriceTier ?? [];
      const lock = locks.find((l) => l.packageId === packageId);
      if (!lock) continue;
      affected.push({
        userId: u.externalId,
        beforeLockedPriceUSD: lock.lockedPriceUSD,
        beforeLockedPoints: lock.lockedPoints,
      });
      if (!firstLock) {
        firstLock = {
          priceUSD: lock.lockedPriceUSD,
          points: lock.lockedPoints,
        };
      }
      await ctx.db.patch(u._id, {
        lockedPriceTier: locks.filter((l) => l.packageId !== packageId),
      });
    }
    await ctx.db.insert("priceMigrationAudit", {
      organizationId: orgId,
      packageId,
      oldPriceUSD: firstLock?.priceUSD ?? pkg.priceUSD,
      newPriceUSD: pkg.priceUSD,
      oldPoints: firstLock?.points ?? pkg.points,
      newPoints: pkg.points,
      performedBy: user.externalId,
      performedAt: new Date().toISOString(),
      affectedUsers: affected,
      undone: false,
    });
    return { migrated: affected.length };
  },
});

/** H.4 — undo a force-migrate by restoring the snapshot. */
export const undoPriceMigration = mutation({
  args: { auditId: v.id("priceMigrationAudit") },
  handler: async (ctx, { auditId }) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "billing.edit"
    );
    const audit = await ctx.db.get(auditId);
    if (!audit || audit.organizationId !== orgId) {
      throw new Error("Audit row not found");
    }
    if (audit.undone) throw new Error("Already undone");
    for (const a of audit.affectedUsers) {
      if (
        a.beforeLockedPriceUSD === undefined ||
        a.beforeLockedPoints === undefined
      )
        continue;
      const u = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", a.userId)
        )
        .unique();
      if (!u) continue;
      const locks = (u.lockedPriceTier ?? []).filter(
        (l) => l.packageId !== audit.packageId
      );
      locks.push({
        packageId: audit.packageId,
        lockedPriceUSD: a.beforeLockedPriceUSD,
        lockedPoints: a.beforeLockedPoints,
        lockedAt: audit.performedAt,
      });
      await ctx.db.patch(u._id, { lockedPriceTier: locks });
    }
    await ctx.db.patch(auditId, {
      undone: true,
      undoneAt: new Date().toISOString(),
      undoneBy: user.externalId,
    });
    return { restored: audit.affectedUsers.length };
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
