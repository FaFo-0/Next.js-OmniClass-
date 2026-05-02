// Permission registry — server side.
//
// Mirrors `src/lib/brand/config.ts` DEFAULT_ROLES. Kept in sync by
// hand for now. When tenant config moves into the `tenants` Convex
// table (a later sub-phase), this file is replaced by a query that
// reads the active tenant's role table.
//
// Permissions are "namespace.action" strings. Role keys are free-form
// strings — the schema still constrains `users.role` to the original
// 3-role enum during Phase 7a, so adding a 4th role at the data layer
// is a separate sub-phase. Permission checks already work for any role
// key the schema accepts.

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
  key: string;
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

export function roleHasPermission(
  roleKey: string,
  permission: Permission
): boolean {
  const role = DEFAULT_ROLES.find((r) => r.key === roleKey);
  if (!role) return false;
  return role.permissions.includes(permission);
}
