// Permission registry — server side.
//
// Permissions are "namespace.action" strings. Role keys are free-form
// strings. `users.permissions: string[]` (optional) on the user doc
// overrides role defaults so admins can elevate or restrict per-user.

export const PERMISSIONS = [
  // Lessons
  "lessons.create",
  "lessons.edit",
  "lessons.view.own",
  "lessons.view.any",
  "lessons.delete",
  "lessons.restore",
  "lessons.mark_no_show",
  "lessons.flag_teacher_miss",

  // Users
  "users.create",
  "users.edit",
  "users.view.any",
  "users.delete",
  "users.assign_self_students",
  "users.create_students",

  // Billing / finance
  "billing.view",
  "billing.edit",

  // Settings
  "ai.configure",
  "achievements.edit",
  "schedule.manage",
  "scheduling.edit",
  "branding.edit",
  "certificates.issue",
  "impersonate",

  // Calendar — split full / request_only
  "calendar.edit.full",
  "calendar.edit.request_only",
  "calendar.cancel.full",
  "calendar.cancel.request_only",
  "calendar.delete.full",

  // Library / Reading Hub
  "library.upload",
  "library.view",
  "library.send_word_to_student",
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
      "lessons.restore",
      "lessons.mark_no_show",
      "lessons.flag_teacher_miss",
      "users.create",
      "users.edit",
      "users.view.any",
      "users.delete",
      "users.assign_self_students",
      "users.create_students",
      "billing.view",
      "billing.edit",
      "ai.configure",
      "achievements.edit",
      "schedule.manage",
      "scheduling.edit",
      "branding.edit",
      "certificates.issue",
      "impersonate",
      "calendar.edit.full",
      "calendar.cancel.full",
      "calendar.delete.full",
      "library.upload",
      "library.view",
      "library.send_word_to_student",
    ],
  },
  {
    key: "teacher",
    permissions: [
      "lessons.create",
      "lessons.edit",
      "lessons.view.any",
      "lessons.mark_no_show",
      "users.view.any",
      "calendar.edit.full",
      "calendar.cancel.full",
      "library.view",
      "library.send_word_to_student",
      // NOT default-on per Handoff #2:
      //   users.assign_self_students, users.create_students
    ],
  },
  {
    key: "student",
    permissions: ["lessons.view.own", "library.view"],
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

export function userHasPermission(
  user: { role: string; permissions?: string[] },
  permission: Permission
): boolean {
  if (user.permissions && user.permissions.length > 0) {
    return user.permissions.includes(permission);
  }
  return roleHasPermission(user.role, permission);
}
