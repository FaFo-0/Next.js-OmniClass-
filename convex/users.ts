// User CRUD — every operation org-scoped via Clerk org_id.

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

// ── Queries ──────────────────────────────────────────────────────────

function readOrgId(identity: any): string | null {
  if (!identity) return null;
  return (
    identity.org_id ||
    identity.orgId ||
    identity.organization_id ||
    null
  );
}

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "users.view.any");
    return await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

/** Lightweight user list for any authenticated user in the org. */
export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

export const getUser = query({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", externalId)
      )
      .unique();
  },
});

/** Get the currently authenticated user. Returns null if no active org or no row yet. */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const orgId = readOrgId(identity);
    const byToken = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!byToken) return null;
    // Don't leak cross-org rows.
    if (orgId && byToken.organizationId !== orgId) return null;
    return byToken;
  },
});

export const getStudentsForTeacher = query({
  args: { teacherId: v.string() },
  handler: async (ctx, { teacherId }) => {
    const { orgId } = await requireTenantPermission(ctx, "users.view.any");
    return await ctx.db
      .query("users")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId)
      )
      .collect();
  },
});

/**
 * Everything the teacher's student-detail page needs: identity + contact,
 * onboarding profile (level, goal, L1), lesson balance, lesson history stats,
 * and homework status. Only the student's assigned teacher (or an admin) may
 * read it.
 */
export const getStudentDetailForTeacher = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", studentId)
      )
      .unique();
    if (!student || student.role !== "student") return null;
    const isOwner = student.teacherId === user.externalId;
    if (user.role !== "admin" && !(user.role === "teacher" && isOwner)) {
      throw new Error("Not your student");
    }

    const profile = await ctx.db
      .query("studentProfiles")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", studentId)
      )
      .unique();
    const onboarding = await ctx.db
      .query("studentOnboarding")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", studentId)
      )
      .unique();

    // Lesson balance (unexpired grants) + soonest expiry.
    const today = new Date().toISOString().slice(0, 10);
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", studentId)
      )
      .collect();
    let balance = 0;
    let nextExpiresAt: string | null = null;
    for (const g of grants) {
      if (g.isExpired || g.expiresAt < today || g.remainingPoints <= 0) continue;
      balance += g.remainingPoints;
      if (nextExpiresAt === null || g.expiresAt < nextExpiresAt) {
        if (g.expiresAt < "9999") nextExpiresAt = g.expiresAt;
      }
    }

    // Lesson history + counts.
    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", studentId)
      )
      .collect();
    const live = events.filter((e) => !e.isDeleted && e.type !== "placeholder");
    const stats = {
      completed: live.filter((e) => e.status === "completed").length,
      upcoming: live.filter(
        (e) => e.status === "scheduled" || e.status === "makeup"
      ).length,
      noShow: live.filter(
        (e) => e.status === "no_show_student" || e.status === "no_show_teacher"
      ).length,
    };
    const recentLessons = [...live]
      .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))
      .slice(0, 8)
      .map((e) => ({
        _id: e._id,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        status: e.status,
        title: e.title,
      }));

    // Homework status.
    const homework = await ctx.db
      .query("homework")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", studentId)
      )
      .collect();
    const hw = {
      assigned: homework.filter((h) => h.status === "assigned" || h.status === "in_progress").length,
      submitted: homework.filter((h) => h.status === "submitted").length,
      reviewed: homework.filter((h) => h.status === "reviewed").length,
    };

    return {
      student: {
        externalId: student.externalId,
        name: student.name,
        email: student.email,
        status: student.studentStatus ?? "active",
        locale: student.locale ?? "en",
        timezone: student.timezone ?? null,
        phone: profile
          ? `${profile.phoneCountryCode} ${profile.phoneNumber}`
          : (onboarding?.phoneWhatsapp ?? student.phoneWhatsapp ?? null),
        pausedUntil: student.pausedUntil ?? null,
      },
      profile: {
        englishLevel: profile?.englishLevel ?? onboarding?.cefrSelfAssessed ?? null,
        country: profile?.country ?? null,
        age: profile?.age ?? onboarding?.age ?? null,
        l1: onboarding?.l1 ?? null,
        goal: onboarding?.goal ?? profile?.studyReason ?? null,
        preferredTimes: onboarding?.preferredDaysTimes ?? null,
      },
      balance,
      nextExpiresAt,
      stats,
      recentLessons,
      homework: hw,
    };
  },
});

// ── Mutations ────────────────────────────────────────────────────────

/**
 * Upsert user from Clerk auth. Called client-side on sign-in.
 *
 * Priority:
 * 1. Already linked (by tokenIdentifier) AND in this org → update profile.
 * 2. Pre-created by admin (same email + org, no token yet) → link Clerk identity.
 * 3. New user → insert with default role "student" in this org.
 *
 * Caller MUST have an active org. If no org claim, throws — UI should
 * route the user to /onboarding/select-org first.
 */
/** §13.10 — user picks display timezone for calendars. */
export const setTimezone = mutation({
  args: { timezone: v.string() },
  handler: async (ctx, { timezone }) => {
    const { user } = await requireTenant(ctx);
    // Basic sanity: must be an IANA name the runtime knows
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new Error("Unknown timezone");
    }
    await ctx.db.patch(user._id, { timezone });
    return null;
  },
});

/** Clock preference for every calendar and dialog. Defaults to 24h. */
export const setTimeFormat = mutation({
  args: { timeFormat: v.union(v.literal("12h"), v.literal("24h")) },
  handler: async (ctx, { timeFormat }) => {
    const { user } = await requireTenant(ctx);
    await ctx.db.patch(user._id, { timeFormat });
    return null;
  },
});

/** C-8 — teacher's permanent meeting room, auto-filled onto new lessons. */
export const setMeetLink = mutation({
  args: { meetLink: v.string() },
  handler: async (ctx, { meetLink }) => {
    const { user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new Error("Only teachers set a meeting room");
    }
    const trimmed = meetLink.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      throw new Error("Enter a full link starting with https://");
    }
    await ctx.db.patch(user._id, { meetLink: trimmed || undefined });
    return null;
  },
});

export const upsertFromAuth = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const orgId = readOrgId(identity);
    if (!orgId) throw new Error("No active organization");

    const orgRole = (identity as any).org_role as string | undefined;
    const mappedRole: "admin" | "teacher" | "student" =
      orgRole === "org:admin"
        ? "admin"
        : orgRole === "org:teacher"
          ? "teacher"
          : "student";

    // 1. Existing token link
    const byToken = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (byToken) {
      // If user switched orgs (rare): refuse — they need a separate row per org.
      if (byToken.organizationId !== orgId) {
        // Fall through to email-link / insert path scoped to the new org.
      } else {
        await ctx.db.patch(byToken._id, {
          name: identity.name ?? byToken.name,
          email: identity.email ?? byToken.email,
          avatarUrl: identity.pictureUrl ?? byToken.avatarUrl,
        });
        return byToken.externalId;
      }
    }

    // 2. Pre-created admin row in same org
    if (identity.email) {
      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_organization_and_email", (q) =>
          q.eq("organizationId", orgId).eq("email", identity.email!)
        )
        .unique();
      if (byEmail && !byEmail.tokenIdentifier) {
        await ctx.db.patch(byEmail._id, {
          externalId: identity.subject,
          tokenIdentifier: identity.tokenIdentifier,
          name: identity.name ?? byEmail.name,
          avatarUrl: identity.pictureUrl ?? byEmail.avatarUrl,
        });
        return byEmail.externalId;
      }
    }

    // 3. Insert new
    const externalId = identity.subject;
    await ctx.db.insert("users", {
      organizationId: orgId,
      externalId,
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "New User",
      email: identity.email ?? "",
      role: mappedRole,
      avatarUrl: identity.pictureUrl,
      createdAt: new Date().toISOString(),
    });
    return externalId;
  },
});

export const createUser = mutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("teacher"),
      v.literal("student"),
      v.literal("admin")
    ),
    avatarUrl: v.optional(v.string()),
    teacherId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "users.create");
    return await ctx.db.insert("users", {
      organizationId: orgId,
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

export const updateUser = mutation({
  args: {
    externalId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("teacher"), v.literal("student"), v.literal("admin"))
    ),
    avatarUrl: v.optional(v.string()),
    teacherId: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
    studentStatus: v.optional(
      v.union(
        v.literal("trial"),
        v.literal("active"),
        v.literal("paused"),
        v.literal("cancelled")
      )
    ),
    locale: v.optional(
      v.union(v.literal("en"), v.literal("ru"), v.literal("ar"))
    ),
  },
  handler: async (ctx, { externalId, ...updates }) => {
    const { orgId } = await requireTenantPermission(ctx, "users.edit");
    const user = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", externalId)
      )
      .unique();
    if (!user) throw new Error(`User not found: ${externalId}`);

    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) {
        if (k === "teacherId" && val === "") {
          patch[k] = undefined;
        } else {
          patch[k] = val;
        }
      }
    }
    await ctx.db.patch(user._id, patch);
  },
});

/**
 * H.8 — admin reassigns a student↔teacher pairing.
 * Side effects:
 *   - Notify the previous teacher they lost a student (if any).
 *   - Notify the new teacher they gained one (if any).
 *   - Both via in-app `notifications` table.
 */
export const assignTeacher = mutation({
  args: {
    studentId: v.string(), // student externalId
    teacherId: v.optional(v.string()), // teacher externalId or "" to unassign
  },
  handler: async (ctx, { studentId, teacherId }) => {
    const { orgId, user: admin } = await requireTenantPermission(
      ctx,
      "users.edit"
    );
    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", studentId)
      )
      .unique();
    if (!student) throw new Error("Student not found");
    if (student.role !== "student") {
      throw new Error("Target must be a student");
    }

    const prevTeacherId = student.teacherId;
    const nextTeacherId =
      teacherId === undefined || teacherId === "" ? undefined : teacherId;
    if (prevTeacherId === nextTeacherId) return;

    if (nextTeacherId) {
      const t = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", nextTeacherId)
        )
        .unique();
      if (!t || t.role !== "teacher") {
        throw new Error("New teacher not found / wrong role");
      }
    }

    await ctx.db.patch(student._id, { teacherId: nextTeacherId });

    const now = new Date().toISOString();

    // C-11 — the old teacher's schedule must not keep running for a student
    // who left them. End weekly schedules and surface the future lessons an
    // admin has to resolve (transfer or cancel+refund).
    let endedRecurring = 0;
    let orphanedLessons = 0;
    if (prevTeacherId) {
      const recurring = await ctx.db
        .query("recurringBookings")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", studentId)
        )
        .collect();
      for (const rb of recurring) {
        if (rb.status !== "active" || rb.teacherId !== prevTeacherId) continue;
        await ctx.db.patch(rb._id, { status: "ended", endedAt: now });
        endedRecurring++;
      }

      const todayStr = now.slice(0, 10);
      const events = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", studentId)
        )
        .collect();
      orphanedLessons = events.filter(
        (e) =>
          !e.isDeleted &&
          e.status === "scheduled" &&
          e.teacherId === prevTeacherId &&
          e.date >= todayStr
      ).length;
      if (orphanedLessons > 0) {
        await ctx.db.insert("notifications", {
          organizationId: orgId,
          recipientId: admin.externalId,
          kind: "reschedule_request",
          payload: {
            reason: "teacher_reassigned",
            studentId,
            studentName: student.name,
            previousTeacherId: prevTeacherId,
            lessonCount: orphanedLessons,
          },
          link: "/admin/calendar",
          createdAt: now,
        });
      }
    }

    if (prevTeacherId) {
      await ctx.db.insert("notifications", {
        organizationId: orgId,
        recipientId: prevTeacherId,
        kind: "student_unassigned",
        payload: { studentId, studentName: student.name },
        link: "/teacher/students",
        createdAt: now,
      });
    }
    if (nextTeacherId) {
      await ctx.db.insert("notifications", {
        organizationId: orgId,
        recipientId: nextTeacherId,
        kind: "student_assigned",
        payload: {
          studentId,
          studentName: student.name,
          assignedBy: admin.externalId,
        },
        link: "/teacher/students",
        createdAt: now,
      });
    }

    return { endedRecurring, orphanedLessons };
  },
});

/**
 * H.12 — get or create caller's .ics subscription token. Idempotent;
 * subsequent calls return the same token until rotateIcsToken is
 * called.
 */
export const ensureIcsToken = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireTenant(ctx);
    if (user.icsToken) return user.icsToken;
    const token = randomToken(28);
    await ctx.db.patch(user._id, { icsToken: token });
    return token;
  },
});

export const rotateIcsToken = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireTenant(ctx);
    const token = randomToken(28);
    await ctx.db.patch(user._id, { icsToken: token });
    return token;
  },
});

function randomToken(len: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Caller updates own locale. */
export const updateLocale = mutation({
  args: {
    locale: v.union(v.literal("en"), v.literal("ru"), v.literal("ar")),
  },
  handler: async (ctx, { locale }) => {
    const { user } = await requireTenant(ctx);
    await ctx.db.patch(user._id, { locale });
  },
});

export const deleteUser = mutation({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    const { orgId } = await requireTenantPermission(ctx, "users.delete");
    const user = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", externalId)
      )
      .unique();
    if (!user) throw new Error(`User not found: ${externalId}`);
    await ctx.db.delete(user._id);
  },
});

/**
 * CLI bootstrap. Promote a user to admin by email + org.
 *   npx convex run users:promoteToAdmin '{"email":"you@example.com","organizationId":"org_xxx"}'
 */
export const promoteToAdmin = internalMutation({
  args: { email: v.string(), organizationId: v.string() },
  handler: async (ctx, { email, organizationId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) =>
        q.eq("organizationId", organizationId).eq("email", email)
      )
      .unique();
    if (!user)
      throw new Error(`No user with email ${email} in org ${organizationId}`);
    await ctx.db.patch(user._id, { role: "admin" });
    return user.externalId;
  },
});

/**
 * CLI bootstrap. Set any role on a user by email + org. Used until
 * the admin "People" page (Phase F) exposes role assignment in UI.
 *   npx convex run users:setRole '{"email":"teacher@x.com","organizationId":"org_xxx","role":"teacher"}'
 */
export const setRole = internalMutation({
  args: {
    email: v.string(),
    organizationId: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("teacher"),
      v.literal("student")
    ),
  },
  handler: async (ctx, { email, organizationId, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) =>
        q.eq("organizationId", organizationId).eq("email", email)
      )
      .unique();
    if (!user)
      throw new Error(`No user with email ${email} in org ${organizationId}`);
    await ctx.db.patch(user._id, { role });
    return { externalId: user.externalId, role };
  },
});

/**
 * CLI bootstrap. Pre-seed a user row by email so they get the right
 * role on first sign-in (upsertFromAuth links the row by email).
 *   npx convex run users:seedUser '{"email":"teacher@x.com","organizationId":"org_xxx","role":"teacher","name":"Teacher One"}'
 */
export const seedUser = internalMutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("teacher"),
      v.literal("student")
    ),
    name: v.optional(v.string()),
    teacherId: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, email, role, name, teacherId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) =>
        q.eq("organizationId", organizationId).eq("email", email)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { role, ...(teacherId ? { teacherId } : {}) });
      return existing.externalId;
    }
    const externalId = `seed-${role}-${Date.now()}`;
    await ctx.db.insert("users", {
      organizationId,
      externalId,
      name: name ?? email.split("@")[0],
      email,
      role,
      teacherId,
      createdAt: new Date().toISOString(),
    });
    return externalId;
  },
});
