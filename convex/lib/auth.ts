import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { type Permission, roleHasPermission } from "./permissions";

type Role = "teacher" | "student" | "admin";

interface AuthenticatedUser {
  _id: any;
  externalId: string;
  role: Role;
  tokenIdentifier: string;
  name: string;
  email: string;
  teacherId?: string;
}

/**
 * Require an authenticated user. Throws if not logged in.
 * Returns the full user document from our users table.
 */
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

/**
 * Require an authenticated user for actions (no DB access).
 * Returns the Clerk identity.
 */
export async function requireAuthAction(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

/**
 * Require the caller has one of the specified roles.
 *
 * Prefer `requirePermission` for new code — it stays valid when roles
 * are added or removed via tenant config. `requireRole` is fine for
 * legacy call sites and explicit "admin-only" guards.
 */
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

/**
 * Require the caller's role carries the given permission.
 *
 * Permissions are tenant-config data (see `convex/lib/permissions.ts`),
 * so adding a new role or shifting permissions between roles requires
 * no code change at the call site.
 */
export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission
): Promise<AuthenticatedUser> {
  const user = await requireAuth(ctx);
  if (!roleHasPermission(user.role, permission)) {
    throw new Error(`Access denied: missing permission "${permission}"`);
  }
  return user;
}
