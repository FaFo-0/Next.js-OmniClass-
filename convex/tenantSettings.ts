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
  timezone: "Asia/Bishkek",
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

  // H.2 — default activity types
  activityTypes: [
    {
      id: "1on1_general",
      name: "Online 1-on-1",
      pointCost: 10,
      recordRequired: true,
      isGroup: false,
      allowedRoles: ["admin", "teacher"],
      isActive: true,
      sortOrder: 1,
    },
    {
      id: "1on1_ielts",
      name: "IELTS prep",
      pointCost: 15,
      recordRequired: true,
      isGroup: false,
      allowedRoles: ["admin", "teacher"],
      isActive: true,
      sortOrder: 2,
    },
    {
      id: "online_group",
      name: "Online speaking group",
      pointCost: 2,
      recordRequired: true,
      isGroup: true,
      allowedRoles: ["admin", "teacher"],
      isActive: true,
      sortOrder: 3,
    },
    {
      id: "offline_group",
      name: "Offline speaking meetup",
      pointCost: 5,
      recordRequired: false,
      isGroup: true,
      allowedRoles: ["admin"],
      isActive: true,
      sortOrder: 4,
    },
  ],

  // H.5 — trial policy default (free, 5 points, 14 days)
  trialPolicy: {
    enabled: true,
    points: 5,
    requiresPayment: false,
    durationDays: 14,
  },

  // H.3 — currencies (USD primary by default)
  currencies: [
    {
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      rateToUSD: 1,
      isPrimaryDisplay: true,
      updatedAt: new Date(0).toISOString(),
    },
  ],
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
    return settings;
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
    const types = settings?.activityTypes ?? [];
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

export { tenantSettingsValidator };
