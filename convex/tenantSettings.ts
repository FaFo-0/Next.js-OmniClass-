// Tenant configuration: branding, locale, policies, AI cost params.
// Read by `useBrand()` on every page. Edited from /admin/branding,
// /admin/scheduling, /admin/ai.

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

const localeCode = v.union(v.literal("en"), v.literal("ru"), v.literal("ar"));

const tenantSettingsValidator = v.object({
  name: v.string(),
  tagline: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  logoDarkUrl: v.optional(v.string()),
  faviconUrl: v.optional(v.string()),
  supportEmail: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),

  primaryColor: v.string(),
  primaryColorHover: v.optional(v.string()),
  backgroundColor: v.string(),
  themeOverrides: v.optional(v.record(v.string(), v.string())),

  defaultLocale: localeCode,
  enabledLocales: v.array(v.string()),
  timezone: v.string(),
  baseCurrency: v.string(),

  maxReschedulesPerMonth: v.number(),
  rescheduleWindowHours: v.number(),
  cancelWindowHours: v.number(),
  defaultLessonDurationMinutes: v.number(),
  noShowConsumesLesson: v.boolean(),

  features: v.object({
    gamification: v.boolean(),
    achievements: v.boolean(),
    library: v.boolean(),
    liveQuizGen: v.boolean(),
    payments: v.boolean(),
  }),

  ai: v.object({
    sonioxCostPerMinute: v.number(),
    avgLessonMinutes: v.number(),
  }),
});

// Default activity types used both for new-tenant seeding and as
// fallback when an existing tenantSettings row predates Phase H.
// §13.1 (2026-07-14): balance is lesson-denominated — 1 lesson = 1 unit.
// v1 ships ONE active activity (online 1-on-1). Other kinds return
// post-v1 as additional activity types with their own lesson cost.
export const DEFAULT_ACTIVITY_TYPES = [
  {
    id: "1on1_general",
    name: "Online 1-on-1",
    pointCost: 1,
    recordRequired: true,
    isGroup: false,
    allowedRoles: ["admin", "teacher"],
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "1on1_ielts",
    name: "IELTS prep",
    pointCost: 2,
    recordRequired: true,
    isGroup: false,
    allowedRoles: ["admin", "teacher"],
    isActive: false,
    sortOrder: 2,
  },
  {
    id: "online_group",
    name: "Online speaking group",
    pointCost: 1,
    recordRequired: true,
    isGroup: true,
    allowedRoles: ["admin", "teacher"],
    isActive: false,
    sortOrder: 3,
  },
  {
    id: "offline_group",
    name: "Offline speaking meetup",
    pointCost: 1,
    recordRequired: false,
    isGroup: true,
    allowedRoles: ["admin"],
    isActive: false,
    sortOrder: 4,
  },
];

/**
 * §13.1 one-off: normalize stored activityTypes to lesson-denominated
 * costs and v1 scope (only 1on1_general active).
 * Usage: npx convex run tenantSettings:normalizeLessonCosts '{"orgId":"org_…"}'
 */
export const normalizeLessonCosts = internalMutation({
  args: { orgId: v.string() },
  handler: async (ctx, { orgId }) => {
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!settings) return "No tenantSettings row";
    const defaults = new Map(DEFAULT_ACTIVITY_TYPES.map((d) => [d.id, d]));
    const updated = (settings.activityTypes ?? DEFAULT_ACTIVITY_TYPES).map(
      (a) => {
        const d = defaults.get(a.id);
        return d ? { ...a, pointCost: d.pointCost, isActive: d.isActive } : a;
      }
    );
    await ctx.db.patch(settings._id, { activityTypes: updated });
    return `Normalized ${updated.length} activity types`;
  },
});

export const DEFAULT_TRIAL_POLICY = {
  enabled: true,
  points: 1, // §13.1: lesson-denominated — 1 trial lesson
  requiresPayment: false,
  durationDays: 14,
};

export const DEFAULT_CURRENCIES = [
  {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    rateToUSD: 1,
    isPrimaryDisplay: true,
    updatedAt: new Date(0).toISOString(),
  },
];

// ── Defaults for Omnica English (first tenant) ────────────────────
const OMNICA_ENGLISH_DEFAULTS = {
  name: "Omnica English",
  tagline: "Speak English with confidence.",
  logoUrl: "/brand/tenant/logo.svg",
  logoDarkUrl: "/brand/tenant/logo-dark.svg",
  faviconUrl: "/brand/tenant/favicon.svg",
  supportEmail: "hello@omnica.app",
  websiteUrl: "https://omnica.app",

  primaryColor: "#6716A4",
  primaryColorHover: "#581289",
  backgroundColor: "#FFCA00",

  defaultLocale: "en" as const,
  enabledLocales: ["en", "ru", "ar"],
  timezone: "Asia/Almaty",
  baseCurrency: "USD",

  maxReschedulesPerMonth: 4,
  rescheduleWindowHours: 6,
  cancelWindowHours: 24,
  defaultLessonDurationMinutes: 60,
  noShowConsumesLesson: true,

  features: {
    gamification: true,
    achievements: true,
    library: true,
    liveQuizGen: true,
    payments: false,
  },

  ai: {
    sonioxCostPerMinute: 0.0067,
    avgLessonMinutes: 60,
  },

  activityTypes: DEFAULT_ACTIVITY_TYPES,
  trialPolicy: DEFAULT_TRIAL_POLICY,
  currencies: DEFAULT_CURRENCIES,
  currencyAutoUpdate: false,
};

// ── Queries ────────────────────────────────────────────────────────

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const orgId =
      (identity as any).org_id ||
      (identity as any).orgId ||
      (identity as any).organization_id;
    if (!orgId) return null;
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!settings) return null;
    // Backfill Phase-H optional fields for rows seeded pre-H.
    return {
      ...settings,
      activityTypes: settings.activityTypes ?? DEFAULT_ACTIVITY_TYPES,
      trialPolicy: settings.trialPolicy ?? DEFAULT_TRIAL_POLICY,
      currencies: settings.currencies ?? DEFAULT_CURRENCIES,
    };
  },
});

export const getByOrgId = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .unique();
  },
});

// ── Mutations ──────────────────────────────────────────────────────

export const update = mutation({
  args: { patch: v.any() },
  handler: async (ctx, { patch }) => {
    const { orgId } = await requireTenantPermission(ctx, "branding.edit");
    const existing = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!existing) throw new Error("Tenant settings not initialized");
    if ("organizationId" in patch) delete patch.organizationId;
    await ctx.db.patch(existing._id, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  },
});

// Public mutation: lazy-init tenantSettings for the active org if absent.
// Called once from the admin onboarding flow when no row exists yet.
export const ensureForActiveOrg = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin") {
      throw new Error("Only admins can initialize tenant settings");
    }
    const existing = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("tenantSettings", {
      organizationId: orgId,
      ...OMNICA_ENGLISH_DEFAULTS,
      createdAt: new Date().toISOString(),
    });
  },
});

// CLI bootstrap: seed defaults for a specific org. Called via
//   npx convex run tenantSettings:seedOrg --orgId org_xxx
/** One-off ops helper: change the academy anchor timezone.
 *  Usage: npx convex run tenantSettings:setOrgTimezone '{"orgId":"org_…","timezone":"Asia/Almaty"}' [--prod] */
export const setOrgTimezone = internalMutation({
  args: { orgId: v.string(), timezone: v.string() },
  handler: async (ctx, { orgId, timezone }) => {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }); // throws if invalid
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!settings) return "No tenantSettings row";
    await ctx.db.patch(settings._id, { timezone });
    return `Timezone set to ${timezone}`;
  },
});

export const seedOrg = internalMutation({
  args: { organizationId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { organizationId, name }) => {
    const existing = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("tenantSettings", {
      organizationId,
      ...OMNICA_ENGLISH_DEFAULTS,
      ...(name ? { name } : {}),
      createdAt: new Date().toISOString(),
    });
  },
});

// ── H.2 helpers ────────────────────────────────────────────────────

export const getActivityTypes = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, { activeOnly }) => {
    const { orgId } = await requireTenant(ctx);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const types =
      settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
    const filtered = activeOnly ? types.filter((t) => t.isActive) : types;
    return [...filtered].sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const setActivityTypes = mutation({
  args: {
    types: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        pointCost: v.number(),
        recordRequired: v.boolean(),
        isGroup: v.boolean(),
        allowedRoles: v.array(v.string()),
        isActive: v.boolean(),
        sortOrder: v.number(),
      })
    ),
  },
  handler: async (ctx, { types }) => {
    const { orgId } = await requireTenantPermission(ctx, "branding.edit");
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!settings) throw new Error("Tenant settings not initialized");
    // De-dupe ids.
    const seen = new Set<string>();
    for (const t of types) {
      if (seen.has(t.id)) throw new Error(`Duplicate activity id: ${t.id}`);
      seen.add(t.id);
    }
    await ctx.db.patch(settings._id, {
      activityTypes: types,
      updatedAt: new Date().toISOString(),
    });
  },
});

// ── H.6 helpers — teacher invite token ─────────────────────────────

function randomToken(len = 24): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const getTeacherInviteToken = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "branding.edit");
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    return settings?.teacherInviteToken ?? null;
  },
});

export const rotateTeacherInviteToken = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "branding.edit"
    );
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!settings) throw new Error("Tenant settings not initialized");
    const token = randomToken();
    await ctx.db.patch(settings._id, {
      teacherInviteToken: token,
      updatedAt: new Date().toISOString(),
    });
    // Revoke old token rows + insert new
    const olds = await ctx.db
      .query("teacherInvites")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const now = new Date().toISOString();
    for (const t of olds) {
      if (!t.revokedAt) await ctx.db.patch(t._id, { revokedAt: now });
    }
    await ctx.db.insert("teacherInvites", {
      organizationId: orgId,
      token,
      usesCount: 0,
      createdBy: user.externalId,
      createdAt: now,
    });
    return token;
  },
});

/**
 * H.6 — called from a public route handler (no auth required) to
 * resolve an invite token to a tenant. Used by the sign-up wrapper
 * to remember the target org before Clerk takes over.
 *
 * Returns minimal tenant identity. Throws if not found / revoked.
 */
export const resolveTeacherInvite = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query("teacherInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!invite) return null;
    if (invite.revokedAt) return null;
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", invite.organizationId)
      )
      .unique();
    if (!settings) return null;
    return {
      organizationId: invite.organizationId,
      tenantName: settings.name,
      logoUrl: settings.logoUrl ?? null,
    };
  },
});

/**
 * H.6 — flip a freshly-signed-up user to role=teacher after they
 * arrived via an invite link. Called from the post-signup client
 * effect. Server-side validation: token must match the user's
 * active org's stored invite token.
 */
export const acceptTeacherInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { orgId, user } = await requireTenant(ctx);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!settings || settings.teacherInviteToken !== token) {
      throw new Error("Invalid teacher invite token");
    }
    const invite = await ctx.db
      .query("teacherInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!invite || invite.revokedAt) {
      throw new Error("Invite revoked");
    }
    await ctx.db.patch(user._id, {
      role: "teacher",
      onboardingComplete: true,
    });
    await ctx.db.patch(invite._id, {
      usesCount: invite.usesCount + 1,
      lastUsedAt: new Date().toISOString(),
    });
  },
});

export { tenantSettingsValidator };
