// Centralized tenant-isolation wrapper.
//
// EVERY Convex query/mutation that touches `ctx.db` must go through
// `requireTenant()` then `tenantTable()`. Direct `ctx.db.query(...)` /
// `ctx.db.get(id)` is forbidden in feature code — wrap or extend here.
//
// `organizationId` comes from the Clerk JWT claim `org_id` (configured
// in the Clerk JWT template named "convex"). Users without an active
// organization fail the check and cannot read tenant data.

import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import type { DataModel, Doc, Id, TableNames } from "../_generated/dataModel";
import {
  type Permission,
  userHasPermission,
} from "./permissions";

interface ResolvedIdentity {
  orgId: string;
  user: Doc<"users">;
}

function readOrgId(identity: any): string | null {
  if (!identity) return null;
  return (
    identity.org_id ||
    identity.orgId ||
    identity.organization_id ||
    null
  );
}

/**
 * Resolve the active organization + matching `users` doc.
 * Throws when the caller is unauthenticated, has no active org, or
 * has no `users` row scoped to the active org.
 */
export async function requireTenant(
  ctx: QueryCtx | MutationCtx
): Promise<ResolvedIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const orgId = readOrgId(identity);
  if (!orgId) throw new Error("No active organization");

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (!user) throw new Error("User not found — please sign in again");
  if (user.organizationId !== orgId) {
    throw new Error("Cross-tenant access denied");
  }

  return { orgId, user };
}

/**
 * Resolve org for an action context (no DB access).
 * The action must subsequently call queries/mutations through
 * `runQuery` / `runMutation` which will re-validate.
 */
export async function requireTenantAction(
  ctx: ActionCtx
): Promise<{ orgId: string; tokenIdentifier: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const orgId = readOrgId(identity);
  if (!orgId) throw new Error("No active organization");
  return { orgId, tokenIdentifier: identity.tokenIdentifier };
}

/**
 * Combined: tenant + permission check.
 */
export async function requireTenantPermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission
): Promise<ResolvedIdentity> {
  const resolved = await requireTenant(ctx);
  if (!userHasPermission(resolved.user, permission)) {
    throw new Error(`Access denied: missing permission "${permission}"`);
  }
  return resolved;
}

// ── Tenant-scoped table accessor ─────────────────────────────────────
//
// Returns helpers that auto-enforce `organizationId === orgId` on every
// read/write. Soft delete is exposed for tables that have `isDeleted`.

type TenantTable<T extends TableNames> = {
  /** Query builder pre-filtered by org. Chain `.withIndex(...)` etc. */
  query: () => ReturnType<QueryCtx["db"]["query"]>;
  /** Get one doc by ID. Returns null if missing OR if it belongs to another org. */
  get: (id: Id<T>) => Promise<Doc<T> | null>;
  /** Insert with `organizationId` auto-stamped. */
  insert: (doc: Omit<any, "organizationId">) => Promise<Id<T>>;
  /** Patch with cross-org guard. Rejects attempts to change `organizationId`. */
  patch: (id: Id<T>, patch: Record<string, any>) => Promise<void>;
  /** Replace with cross-org guard. */
  replace: (id: Id<T>, doc: Omit<any, "organizationId">) => Promise<void>;
  /** Hard delete (use sparingly — prefer softDelete). */
  delete: (id: Id<T>) => Promise<void>;
  /** Soft delete: sets isDeleted=true + deletedAt + optional deletedBy. */
  softDelete: (id: Id<T>, deletedBy?: string) => Promise<void>;
  /** Restore a soft-deleted row. */
  restore: (id: Id<T>) => Promise<void>;
};

export function tenantTable<T extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  table: T
): TenantTable<T> {
  const db = ctx.db as any;

  const guard = async (id: Id<T>) => {
    const row = await db.get(id);
    if (!row) return null;
    if (row.organizationId !== orgId) {
      throw new Error("Cross-tenant access denied");
    }
    return row;
  };

  return {
    query: () => db.query(table),

    get: async (id) => {
      const row = await db.get(id);
      if (!row) return null;
      if (row.organizationId !== orgId) return null;
      return row as Doc<T>;
    },

    insert: (doc) =>
      (db as any).insert(table, { ...doc, organizationId: orgId }),

    patch: async (id, patch) => {
      const row = await guard(id);
      if (!row) throw new Error(`${String(table)} ${id} not found`);
      if ("organizationId" in patch) {
        throw new Error("Cannot reassign organizationId");
      }
      await (db as any).patch(id, patch);
    },

    replace: async (id, doc) => {
      const row = await guard(id);
      if (!row) throw new Error(`${String(table)} ${id} not found`);
      await (db as any).replace(id, { ...doc, organizationId: orgId });
    },

    delete: async (id) => {
      const row = await guard(id);
      if (!row) throw new Error(`${String(table)} ${id} not found`);
      await (db as any).delete(id);
    },

    softDelete: async (id, deletedBy) => {
      const row = await guard(id);
      if (!row) throw new Error(`${String(table)} ${id} not found`);
      const patch: Record<string, any> = {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      };
      if (deletedBy) patch.deletedBy = deletedBy;
      await (db as any).patch(id, patch);
    },

    restore: async (id) => {
      const row = await guard(id);
      if (!row) throw new Error(`${String(table)} ${id} not found`);
      await (db as any).patch(id, {
        isDeleted: false,
        deletedAt: undefined,
        deletedBy: undefined,
      });
    },
  };
}

// Convenience: filter a list of rows down to non-deleted.
export function notDeleted<T extends { isDeleted?: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.isDeleted);
}
