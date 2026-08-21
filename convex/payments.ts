// POLICY §3 — Lemon Squeezy checkout.
//
// Shape of the flow:
//   1. Student clicks Buy → `createCheckout` (action) asks Lemon Squeezy for
//      a one-off checkout URL carrying who/what as custom data.
//   2. Student pays on Lemon Squeezy's page. We are never near a card.
//   3. Lemon Squeezy POSTs `order_created` to /lemonsqueezy/webhook
//      (convex/http.ts) → `fulfillOrder` grants the pack.
//
// The webhook is the ONLY thing that grants lessons. The redirect back is a
// thank-you page and nothing more: a browser that never comes back, or a
// student who closes the tab, must still get what they paid for.
//
// Lemon Squeezy is a Merchant of Record, so it charges in the store's own
// currency — for us USD (`pointPackages.priceUSD`). `priceLocal` stays on the
// card as the reference price the student recognises.
//
// Configuration lives in environment variables on the Convex deployment, not
// in the database: they're secrets, and one academy runs one store.
//   LEMONSQUEEZY_API_KEY        — API key with write access to checkouts
//   LEMONSQUEEZY_STORE_ID       — numeric store id
//   LEMONSQUEEZY_WEBHOOK_SECRET — the signing secret set on the webhook
//   SITE_URL                    — where to send the student back to

import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import { grantPointsInternal } from "./points";
import { recordEntry } from "./finance";
import type { Id } from "./_generated/dataModel";

const LS_API = "https://api.lemonsqueezy.com/v1";
const NOW = () => new Date().toISOString();

/** Present and non-blank. An env var set to "" is not configured. */
const envOr = (key: string): string | null => {
  const raw = process.env[key];
  return raw && raw.trim() ? raw.trim() : null;
};

export function lemonConfig() {
  return {
    apiKey: envOr("LEMONSQUEEZY_API_KEY"),
    storeId: envOr("LEMONSQUEEZY_STORE_ID"),
    webhookSecret: envOr("LEMONSQUEEZY_WEBHOOK_SECRET"),
    siteUrl: envOr("SITE_URL") ?? envOr("NEXT_PUBLIC_SITE_URL"),
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Status — what the student page and the admin page each need to know
// ─────────────────────────────────────────────────────────────────────

/**
 * Can this academy actually take a card right now? Both halves have to be
 * true: the tenant's Payments feature is on AND the deployment has keys.
 * Deliberately says nothing about the keys themselves.
 */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const cfg = lemonConfig();
    return {
      featureEnabled: settings?.features?.payments === true,
      configured: !!(cfg.apiKey && cfg.storeId && cfg.webhookSecret),
      live: settings?.features?.payments === true &&
        !!(cfg.apiKey && cfg.storeId && cfg.webhookSecret),
    };
  },
});

/**
 * Admin view: which env vars are missing, the webhook URL to paste into
 * Lemon Squeezy, and which packs still have no variant wired up. Reports
 * presence only — a key is never echoed back to a browser.
 */
export const getAdminStatus = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    const cfg = lemonConfig();
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const packages = await ctx.db
      .query("pointPackages")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const active = packages.filter((p) => p.isActive);

    // Convex serves HTTP actions from the .site domain, not .cloud.
    const cloud = envOr("CONVEX_CLOUD_URL");
    const webhookUrl = cloud
      ? `${cloud.replace(".convex.cloud", ".convex.site")}/lemonsqueezy/webhook`
      : null;

    const recent = await ctx.db
      .query("paymentEvents")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .order("desc")
      .take(15);
    // Unmatched events carry no org, so they'd never show under the org
    // index — and those are exactly the ones an admin must see.
    const orphans = await ctx.db
      .query("paymentEvents")
      .withIndex("by_organization", (q) => q.eq("organizationId", undefined))
      .order("desc")
      .take(10);

    return {
      featureEnabled: settings?.features?.payments === true,
      hasApiKey: !!cfg.apiKey,
      hasStoreId: !!cfg.storeId,
      hasWebhookSecret: !!cfg.webhookSecret,
      hasSiteUrl: !!cfg.siteUrl,
      storeId: cfg.storeId,
      webhookUrl,
      packagesMissingVariant: active
        .filter((p) => !p.lemonSqueezyVariantId)
        .map((p) => ({ id: p._id, name: p.name })),
      packagesWired: active.filter((p) => !!p.lemonSqueezyVariantId).length,
      recentEvents: [...recent, ...orphans]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 15),
    };
  },
});

/**
 * POLICY §3 v1 — what a student needs in order to pay by hand.
 *
 * Deliberately readable by any signed-in member of the academy: these are
 * "where do I send the money" details, not secrets, and the whole point is
 * that nobody has to message anyone to get them.
 *
 * Returns null when manual payment is switched off, so the page can simply
 * fall back to the Request button rather than rendering an empty card.
 */
export const getPaymentInstructions = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const mp = settings?.manualPayment;
    if (!mp?.enabled) return null;
    // An "enabled" block with nothing in it would render a card that tells
    // the student nothing — treat it as not configured.
    if (!mp.kaspiPhone && !mp.qrUrl) return null;
    return {
      kaspiPhone: mp.kaspiPhone ?? null,
      recipientName: mp.recipientName ?? null,
      qrUrl: mp.qrUrl ?? null,
      note: mp.note ?? null,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────
//  Checkout
// ─────────────────────────────────────────────────────────────────────

/** Everything the action needs, read in one transaction. */
export const checkoutContext = internalQuery({
  args: { packageId: v.id("pointPackages") },
  handler: async (ctx, { packageId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new Error("Students only");
    const pkg = await ctx.db.get(packageId);
    if (!pkg || pkg.organizationId !== orgId || !pkg.isActive) {
      throw new Error("Package not found");
    }
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (settings?.features?.payments !== true) {
      throw new Error("Online payment isn't switched on for this academy yet");
    }
    if (!pkg.lemonSqueezyVariantId) {
      throw new Error("This pack isn't set up for online payment yet");
    }
    return {
      orgId,
      studentId: user.externalId,
      email: user.email,
      name: user.name,
      variantId: pkg.lemonSqueezyVariantId,
      packName: pkg.name,
    };
  },
});

/**
 * Ask Lemon Squeezy for a checkout URL. Returns the URL; the client
 * navigates to it. Nothing is granted here — the webhook does that.
 */
export const createCheckout = action({
  args: { packageId: v.id("pointPackages") },
  handler: async (ctx, { packageId }): Promise<{ url: string }> => {
    const cfg = lemonConfig();
    if (!cfg.apiKey || !cfg.storeId) {
      throw new Error("Online payment isn't configured yet");
    }
    // Refuse to sell if the webhook secret is missing: the payment would
    // succeed and the lessons would never arrive.
    if (!cfg.webhookSecret) {
      throw new Error("Online payment isn't configured yet");
    }

    const info = await ctx.runQuery(internal.payments.checkoutContext, {
      packageId,
    });

    const redirect = cfg.siteUrl
      ? `${cfg.siteUrl.replace(/\/$/, "")}/student/billing/thanks`
      : undefined;

    const res = await fetch(`${LS_API}/checkouts`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email: info.email || undefined,
              name: info.name || undefined,
              // Comes back on the webhook as `meta.custom_data`. This is the
              // only link between a Lemon Squeezy order and our student.
              custom: {
                organizationId: info.orgId,
                studentId: info.studentId,
                packageId: packageId as string,
              },
            },
            product_options: {
              enabled_variants: [Number(info.variantId)],
              ...(redirect ? { redirect_url: redirect } : {}),
            },
            checkout_options: { embed: false },
          },
          relationships: {
            store: { data: { type: "stores", id: String(cfg.storeId) } },
            variant: { data: { type: "variants", id: String(info.variantId) } },
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[lemonsqueezy] checkout failed", res.status, body);
      throw new Error("Couldn't start checkout. Please try again.");
    }
    const json = (await res.json()) as {
      data?: { attributes?: { url?: string } };
    };
    const url = json.data?.attributes?.url;
    if (!url) throw new Error("Couldn't start checkout. Please try again.");
    return { url };
  },
});

// ─────────────────────────────────────────────────────────────────────
//  Webhook fulfilment
// ─────────────────────────────────────────────────────────────────────

export type LemonWebhook = {
  eventKey: string;
  eventName: string;
  orderId?: string;
  orderNumber?: string;
  organizationId?: string;
  studentId?: string;
  packageId?: string;
  email?: string;
  amount?: number;
  currency?: string;
};

/**
 * Claim this delivery. Returns null when the same `eventKey` has already been
 * recorded — the caller then does nothing at all. Gateways retry on any
 * non-2xx and on their own schedule, so without this a slow response would
 * hand the student a second pack.
 */
export const claimEvent = internalMutation({
  args: {
    eventKey: v.string(),
    eventName: v.string(),
    orderId: v.optional(v.string()),
    orderNumber: v.optional(v.string()),
    organizationId: v.optional(v.string()),
    studentId: v.optional(v.string()),
    email: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"paymentEvents"> | null> => {
    const existing = await ctx.db
      .query("paymentEvents")
      .withIndex("by_eventKey", (q) => q.eq("eventKey", args.eventKey))
      .unique();
    if (existing) return null;
    return await ctx.db.insert("paymentEvents", {
      ...args,
      provider: "lemonsqueezy",
      status: "received",
      createdAt: NOW(),
    });
  },
});

/**
 * Grant the pack a paid order bought.
 *
 * Everything that can disqualify the order is checked here rather than in the
 * HTTP handler, because this is the transaction that writes: the same event
 * can't be half-fulfilled.
 */
export const fulfillOrder = internalMutation({
  args: {
    eventId: v.id("paymentEvents"),
    organizationId: v.optional(v.string()),
    studentId: v.optional(v.string()),
    packageId: v.optional(v.string()),
    orderId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fail = async (message: string, status: "ignored" | "failed") => {
      await ctx.db.patch(args.eventId, {
        status,
        message,
        processedAt: NOW(),
      });
      console.error("[lemonsqueezy]", message);
      return { ok: false as const, message };
    };

    if (!args.organizationId || !args.studentId || !args.packageId) {
      return fail(
        "Order carried no custom data — can't tell which student bought it",
        "failed"
      );
    }

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q
          .eq("organizationId", args.organizationId!)
          .eq("externalId", args.studentId!)
      )
      .unique();
    if (!student) {
      return fail(`No student ${args.studentId} in this academy`, "failed");
    }

    let pkg;
    try {
      pkg = await ctx.db.get(args.packageId as Id<"pointPackages">);
    } catch {
      pkg = null;
    }
    if (!pkg || pkg.organizationId !== args.organizationId) {
      return fail(`Package ${args.packageId} not found`, "failed");
    }

    // A second order for the same student and pack is a real second purchase;
    // only a repeated *order id* is a duplicate, and `claimEvent` caught that.
    const { grantId, balanceAfter } = await grantPointsInternal(ctx, {
      orgId: args.organizationId,
      studentId: args.studentId,
      points: pkg.points,
      source: "purchase",
      packageId: pkg._id,
      expiryDays: pkg.expiryDays,
      externalOrderId: args.orderId,
      performedBy: "lemonsqueezy",
      notes: `Online purchase — ${pkg.name}`,
    });

    await ctx.db.patch(args.eventId, {
      status: "fulfilled",
      packageId: pkg._id,
      grantId,
      processedAt: NOW(),
    });

    const now = NOW();
    await ctx.db.insert("notifications", {
      organizationId: args.organizationId,
      recipientId: args.studentId,
      kind: "payment_received",
      payload: {
        packName: pkg.name,
        lessons: pkg.points,
        balanceAfter,
      },
      link: "/student/billing",
      createdAt: now,
    });

    const admins = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", args.organizationId!).eq("role", "admin")
      )
      .collect();
    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        organizationId: args.organizationId,
        recipientId: admin.externalId,
        kind: "payment_received",
        payload: {
          studentName: student.name,
          packName: pkg.name,
          lessons: pkg.points,
        },
        link: `/admin/billing?student=${args.studentId}`,
        createdAt: now,
      });
    }

    return { ok: true as const, grantId };
  },
});

/**
 * POLICY §3 — refunds happen (duplicate purchases, admin discretion), and a
 * refunded order must not leave the lessons behind.
 *
 * Unspent credit from that order is clawed back; credit already spent is not,
 * because those lessons were taught. The ledger gets a matching `refund` row
 * so the month's revenue reflects what was actually kept.
 */
export const refundOrder = internalMutation({
  args: {
    eventId: v.id("paymentEvents"),
    orderId: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.orderId) {
      await ctx.db.patch(args.eventId, {
        status: "ignored",
        message: "Refund carried no order id",
        processedAt: NOW(),
      });
      return { ok: false as const };
    }

    // Find the original purchase by the order id we stamped on its grant.
    const original = await ctx.db
      .query("paymentEvents")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect();
    const fulfilled = original.find((e) => e.status === "fulfilled" && e.grantId);
    if (!fulfilled?.grantId || !fulfilled.organizationId || !fulfilled.studentId) {
      await ctx.db.patch(args.eventId, {
        status: "ignored",
        message: `No fulfilled order ${args.orderId} to reverse`,
        processedAt: NOW(),
      });
      return { ok: false as const };
    }

    const grant = await ctx.db.get(fulfilled.grantId);
    const unspent = grant?.remainingPoints ?? 0;
    if (grant && unspent > 0) {
      // Zero out THIS grant, rather than spending the amount off the balance.
      // A normal spend walks grants FIFO by expiry, so it would have drained
      // whichever pack expires soonest — usually an older one the student
      // paid for and kept. The refunded order has to give back its own
      // lessons and nobody else's.
      await ctx.db.patch(grant._id, { remainingPoints: 0, isExpired: true });

      // Balance is recomputed rather than derived from the old figure: other
      // grants may have moved between the purchase and the refund.
      const remaining = await ctx.db
        .query("pointGrants")
        .withIndex("by_organization_and_studentId", (q) =>
          q
            .eq("organizationId", fulfilled.organizationId!)
            .eq("studentId", fulfilled.studentId!)
        )
        .collect();
      const today = NOW().slice(0, 10);
      const balanceAfter = remaining.reduce(
        (sum, g) =>
          g.isExpired || g.expiresAt < today ? sum : sum + g.remainingPoints,
        0
      );

      await ctx.db.insert("pointTransactions", {
        organizationId: fulfilled.organizationId,
        studentId: fulfilled.studentId,
        type: "refund",
        amount: -unspent,
        balanceAfter,
        grantId: grant._id,
        performedBy: "lemonsqueezy",
        reason: `Refunded order ${args.orderId}`,
        createdAt: NOW(),
      });
    }

    if (args.amount && args.amount > 0) {
      const settings = await ctx.db
        .query("tenantSettings")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", fulfilled.organizationId!)
        )
        .unique();
      await recordEntry(ctx, {
        organizationId: fulfilled.organizationId,
        direction: "out",
        category: "refund",
        amount: args.amount,
        currency: args.currency ?? settings?.baseCurrency ?? "USD",
        date: NOW().slice(0, 10),
        note: `Refund — order ${fulfilled.orderNumber ?? args.orderId}`,
        source: "auto",
        sourceKey: `refund:${args.orderId}`,
        studentId: fulfilled.studentId,
        createdBy: "lemonsqueezy",
      });
    }

    await ctx.db.patch(args.eventId, {
      status: "refunded",
      organizationId: fulfilled.organizationId,
      studentId: fulfilled.studentId,
      grantId: fulfilled.grantId,
      message:
        unspent > 0
          ? `Reversed ${unspent} unused lesson${unspent === 1 ? "" : "s"}`
          : "Nothing to reverse — all lessons had been used",
      processedAt: NOW(),
    });

    const admins = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", fulfilled.organizationId!).eq("role", "admin")
      )
      .collect();
    const now = NOW();
    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        organizationId: fulfilled.organizationId,
        recipientId: admin.externalId,
        kind: "payment_refunded",
        payload: {
          orderId: args.orderId,
          lessons: unspent,
          amount: args.amount,
          currency: args.currency,
        },
        link: "/admin/billing",
        createdAt: now,
      });
    }
    return { ok: true as const, reversed: unspent };
  },
});

/** Mark a delivery we understood but deliberately did nothing with. */
export const ignoreEvent = internalMutation({
  args: { eventId: v.id("paymentEvents"), message: v.string() },
  handler: async (ctx, { eventId, message }) => {
    await ctx.db.patch(eventId, {
      status: "ignored",
      message,
      processedAt: NOW(),
    });
  },
});

/**
 * Has the webhook landed yet? The thank-you page watches this rather than
 * claiming success on the redirect: the student is back in their browser
 * before Lemon Squeezy has necessarily called us. Convex pushes the update,
 * so the page flips by itself with no polling.
 *
 * Only purchases from the last 15 minutes count — an older one is somebody's
 * previous pack, not the payment they just made.
 */
export const myRecentPurchase = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const events = await ctx.db
      .query("paymentEvents")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .order("desc")
      .take(25);
    const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    const mine = events.find(
      (e) =>
        e.studentId === user.externalId &&
        e.status === "fulfilled" &&
        (e.processedAt ?? e.createdAt) >= cutoff
    );
    if (!mine) return null;
    const pkg = mine.packageId ? await ctx.db.get(mine.packageId) : null;
    return {
      at: mine.processedAt ?? mine.createdAt,
      orderNumber: mine.orderNumber ?? null,
      lessons: pkg?.points ?? null,
    };
  },
});
