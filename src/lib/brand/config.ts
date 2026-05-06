// LinguLab brand + tenant configuration layer.
//
// Two brand layers exist in this codebase:
//
//   1. SOFTWARE_BRAND — the software product itself (LinguLab).
//      Hardcoded. Permanent. Appears only on super-admin, legal, and
//      neutral system surfaces. Never shown on tenant-facing UI.
//
//   2. TenantBrand — the active tenant's brand + behavioral config.
//      Lives in `current-tenant-brand.ts` during Phase 7 (single-file
//      stub). Later phase replaces the stub with a per-tenant Convex
//      query. Every tenant-facing surface reads this via `useBrand()`.
//
// Agnostic config principle (Phase 7a): every tunable is an open map or
// array, not a typed enum. Extension = data edit, not code change.
// Defaults below fit a language school. Any other vertical (gym,
// therapy, coaching) swaps the data in `current-tenant-brand.ts`.
//
// Rule: nothing in this file (or anywhere else) should hardcode a tenant
// name literal. Only SOFTWARE_BRAND.name ("LinguLab") is a hardcoded
// product name anywhere in the codebase.

// ── Software brand (permanent) ─────────────────────────────────────
export const SOFTWARE_BRAND = {
  name: "OmniClass",
  tagline: "The class management platform for any business that teaches",
  supportEmail: "support@omniclass.app",
  websiteUrl: "https://omniclass.app",
} as const;

export type SoftwareBrand = typeof SOFTWARE_BRAND;

// ── Terminology ────────────────────────────────────────────────────
// Open map. Consumers look up keys like `terms.student` / `terms.lesson`.
// Missing key → consumer falls back to the key string itself.
export type Terminology = Record<string, string>;

export const DEFAULT_TERMINOLOGY: Terminology = {
  student: "Student",
  students: "Students",
  teacher: "Teacher",
  teachers: "Teachers",
  lesson: "Lesson",
  lessons: "Lessons",
  class: "Class",
  classes: "Classes",
  admin: "Admin",
  admins: "Admins",
};

// ── Currency ───────────────────────────────────────────────────────
// Open registry. Add any code, symbol, rate-to-base, decimals.
// Base currency is what internal arithmetic uses; others convert via
// `rateToBase`. Loyalty points work as a "currency" with decimals: 0.
export interface CurrencyDef {
  code: string; // "USD", "KGS", "points", anything
  symbol: string; // "$", "с", "pts"
  rateToBase: number; // 1.0 if this is base
  decimals: number; // 2 for fiat, 0 for points
  label?: string; // human-readable ("US Dollar")
}

export const DEFAULT_CURRENCIES: CurrencyDef[] = [
  { code: "USD", symbol: "$", rateToBase: 1, decimals: 2, label: "US Dollar" },
];

// ── Locale / timezone / region ─────────────────────────────────────
// BCP 47 locale + IANA timezone + ISO 4217 currency code. Any value
// the browser's `Intl` API accepts is valid. No enum to maintain.
export interface RegionConfig {
  locale: string; // "en-US", "ru-RU", "ar-SA"
  timezone: string; // "UTC", "Europe/Istanbul", "Asia/Bishkek"
  timeFormat: "12h" | "24h";
  firstDayOfWeek: 0 | 1 | 6; // Sun | Mon | Sat
}

export const DEFAULT_REGION: RegionConfig = {
  locale: "en-US",
  timezone: "UTC",
  timeFormat: "24h",
  firstDayOfWeek: 1,
};

// ── Feature flags ──────────────────────────────────────────────────
// Open map. Missing key = `undefined` → consumers treat as enabled.
// Explicit `false` disables. Use for per-tenant toggles, not A/B tests.
export type FeatureFlags = Record<string, boolean>;

export const DEFAULT_FEATURES: FeatureFlags = {
  recordings: true,
  aiGeneration: true,
  flashcards: true,
  quizzes: true,
  achievements: true,
  certificates: true,
  referrals: true,
  groupClasses: false,
  payments: true,
};

// ── Modules registry ───────────────────────────────────────────────
// Sidebar + routing read this. New feature area = new entry. Remove
// or hide an area without deleting code by toggling `enabled`.
// `order` sorts within a portal; lower = earlier.
export interface ModuleDef {
  key: string; // stable identifier, matches route segment
  enabled: boolean;
  label?: string; // override terminology label for this module
  icon?: string; // lucide icon name
  order?: number;
  portals?: Array<"admin" | "teacher" | "student">;
}

// Module keys correspond to sidebar nav items + feature areas. Set
// `enabled: false` (or remove the entry) to hide everywhere it
// appears — sidebar filters its nav items through `module(key)?.enabled`.
export const DEFAULT_MODULES: ModuleDef[] = [
  // Cross-portal core
  { key: "dashboard", enabled: true, order: 10, portals: ["admin", "teacher", "student"] },
  { key: "calendar", enabled: true, order: 20, portals: ["admin", "teacher", "student"] },

  // Student-facing
  { key: "myLessons", enabled: true, order: 30, portals: ["student"] },
  { key: "study", enabled: true, order: 40, portals: ["student"] },
  { key: "decks", enabled: true, order: 50, portals: ["student"] },
  { key: "stats", enabled: true, order: 60, portals: ["student"] },
  { key: "achievements", enabled: true, order: 70, portals: ["student", "admin"] },
  { key: "profile", enabled: true, order: 80, portals: ["student"] },

  // Teacher-facing (besides dashboard + calendar)
  { key: "students", enabled: true, order: 30, portals: ["teacher", "admin"] },

  // Admin-facing
  { key: "users", enabled: true, order: 40, portals: ["admin"] },
  { key: "studentsCRM", enabled: true, order: 50, portals: ["admin"] },
  { key: "analytics", enabled: true, order: 60, portals: ["admin"] },
  { key: "aiManager", enabled: true, order: 70, portals: ["admin"] },
  { key: "scheduling", enabled: true, order: 80, portals: ["admin"] },
  { key: "certificates", enabled: true, order: 90, portals: ["admin"] },
];

// ── Roles + permissions ────────────────────────────────────────────
// Role name is a free-form string. Core code never checks role names
// directly — it checks permissions via `requirePermission(ctx, key)`.
// New role = add a key + list permissions it should carry.
// Permission keys are "namespace.action" strings. Known permissions
// live in PERMISSIONS for TS autocomplete; unknown keys still work.
export const PERMISSIONS = [
  "lessons.create",
  "lessons.edit",
  "lessons.view.own",
  "lessons.view.any",
  "lessons.delete",
  "users.create",
  "users.edit",
  "users.view.any",
  "users.delete",
  "billing.view",
  "billing.edit",
  "ai.configure",
  "achievements.edit",
  "certificates.issue",
  "schedule.manage",
  "impersonate",
] as const;

export type Permission = (typeof PERMISSIONS)[number] | (string & {});

export interface RoleDef {
  key: string; // "admin", "teacher", "student", "frontDesk", etc.
  label?: string; // display label; falls back to terminology
  permissions: Permission[];
}

export const DEFAULT_ROLES: RoleDef[] = [
  {
    key: "admin",
    permissions: [
      "lessons.create",
      "lessons.edit",
      "lessons.view.any",
      "lessons.delete",
      "users.create",
      "users.edit",
      "users.view.any",
      "users.delete",
      "billing.view",
      "billing.edit",
      "ai.configure",
      "achievements.edit",
      "certificates.issue",
      "schedule.manage",
      "impersonate",
    ],
  },
  {
    key: "teacher",
    permissions: [
      "lessons.create",
      "lessons.edit",
      "lessons.view.any",
      "schedule.manage",
      "users.view.any",
    ],
  },
  {
    key: "student",
    permissions: ["lessons.view.own"],
  },
];

// ── Scheduling primitives ──────────────────────────────────────────
// Captures the shape of sessions a tenant offers. Scheduler code reads
// these — same engine serves 1-on-1 language lessons, 50-min therapy
// sessions, and 45-min group gym classes.
export interface SchedulingConfig {
  durations: number[]; // allowed slot durations in minutes
  defaultDuration: number;
  bufferMinutes: number; // gap between slots
  allowGroup: boolean;
  maxGroupSize?: number;
  allowRecurring: boolean;
  rescheduleWindowHours: number;
  cancelWindowHours: number;
}

export const DEFAULT_SCHEDULING: SchedulingConfig = {
  durations: [30, 45, 60, 90],
  defaultDuration: 60,
  bufferMinutes: 0,
  allowGroup: false,
  allowRecurring: true,
  rescheduleWindowHours: 24,
  cancelWindowHours: 24,
};

// ── Notifications ──────────────────────────────────────────────────
// Channel list + per-event toggle map. Only shape today; concrete
// senders wire in later. Adding a channel = push to array.
export type NotificationChannel = "email" | "sms" | "whatsapp" | "push" | (string & {});

export interface NotificationConfig {
  channels: NotificationChannel[]; // enabled channels, in preference order
  events: Record<string, boolean>; // e.g. lessonBooked, paymentDue
}

export const DEFAULT_NOTIFICATIONS: NotificationConfig = {
  channels: ["email"],
  events: {
    lessonBooked: true,
    lessonCancelled: true,
    lessonReminder: true,
    paymentDue: true,
    paymentReceived: true,
    achievementUnlocked: false,
  },
};

// ── Public slugs ───────────────────────────────────────────────────
// Tenant-facing public URL segments. Internal/admin paths never change.
export interface PublicSlugs {
  booking: string; // /{booking} e.g. "book" or "schedule"
  signup: string;
  pricing: string;
  about: string;
}

export const DEFAULT_PUBLIC_SLUGS: PublicSlugs = {
  booking: "book",
  signup: "signup",
  pricing: "pricing",
  about: "about",
};

// ── TenantBrand (composite) ────────────────────────────────────────
export interface TenantBrand {
  // Identity
  name: string;
  shortName?: string;
  tagline?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  primaryColor?: string; // oklch(...) string; injected as --primary at runtime
  supportEmail?: string;
  websiteUrl?: string;

  // Agnostic config layer (Phase 7a)
  terminology: Terminology;
  currencies: CurrencyDef[];
  baseCurrency: string; // code matching one entry in `currencies`
  region: RegionConfig;
  features: FeatureFlags;
  modules: ModuleDef[];
  roles: RoleDef[];
  scheduling: SchedulingConfig;
  notifications: NotificationConfig;
  publicSlugs: PublicSlugs;
}

// Merge a partial tenant config with all defaults. Use this when
// constructing a tenant brand so every agnostic field is always set.
export function withDefaults(
  partial: Partial<TenantBrand> & Pick<TenantBrand, "name">
): TenantBrand {
  return {
    terminology: { ...DEFAULT_TERMINOLOGY, ...(partial.terminology ?? {}) },
    currencies: partial.currencies ?? DEFAULT_CURRENCIES,
    baseCurrency: partial.baseCurrency ?? DEFAULT_CURRENCIES[0].code,
    region: { ...DEFAULT_REGION, ...(partial.region ?? {}) },
    features: { ...DEFAULT_FEATURES, ...(partial.features ?? {}) },
    modules: partial.modules ?? DEFAULT_MODULES,
    roles: partial.roles ?? DEFAULT_ROLES,
    scheduling: { ...DEFAULT_SCHEDULING, ...(partial.scheduling ?? {}) },
    notifications: {
      ...DEFAULT_NOTIFICATIONS,
      ...(partial.notifications ?? {}),
      events: {
        ...DEFAULT_NOTIFICATIONS.events,
        ...(partial.notifications?.events ?? {}),
      },
    },
    publicSlugs: { ...DEFAULT_PUBLIC_SLUGS, ...(partial.publicSlugs ?? {}) },
    ...partial,
  };
}
