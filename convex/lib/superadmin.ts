// Platform owner. OmniClass is multi-tenant software; a superadmin is an
// account that belongs to the software rather than to one academy, so it can
// never be demoted, removed or stripped of permissions by a tenant admin.
//
// Membership is by email and lives in code on purpose: a row in the database
// that grants total power is a row someone can edit. Adding an owner is a
// deploy, which is the point.
//
// NOTE: this does not by itself let the account read another tenant's data —
// every query is still org-scoped through `requireTenant`, and the org comes
// from the Clerk session. It marks the account and protects it.

const SUPERADMIN_EMAILS = ["warp.smp@gmail.com"];

export function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPERADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function isSuperadmin(user: { email?: string | null } | null | undefined): boolean {
  return isSuperadminEmail(user?.email ?? null);
}
