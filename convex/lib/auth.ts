// Legacy auth helpers — kept for compatibility with `ai.ts` / `soniox.ts`
// actions. New feature code should call `requireTenant` / `requireTenantPermission`
// from `./tenant.ts` instead, which adds organizationId enforcement.

import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { type Permission, userHasPermission } from "./permissions";

type Role = "teacher" | "student" | "admin";

interface AuthenticatedUser {
  _id: any;
  organizationId: string;
  externalId: string;
  role: Role;
  tokenIdentifier?: string;
  name: string;
  email: string;
  teacherId?: string;
  permissions?: string[];
}

export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<AuthenticatedUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q: any) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (!user) throw new Error("User not found — please sign in again");
  return user as AuthenticatedUser;
}

export async function requireAuthAction(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  ...roles: Role[]
): Promise<AuthenticatedUser> {
  const user = await requireAuth(ctx);
  if (!roles.includes(user.role)) {
    throw new Error(`Access denied: requires ${roles.join(" or ")} role`);
  }
  return user;
}

export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission
): Promise<AuthenticatedUser> {
  const user = await requireAuth(ctx);
  if (!userHasPermission(user, permission)) {
    throw new Error(`Access denied: missing permission "${permission}"`);
  }
  return user;
}
