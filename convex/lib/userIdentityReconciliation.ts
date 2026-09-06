// Identity reconciliation is deliberately pure so the safety decisions can be
// tested without a database. Matching an email identifies a review candidate;
// it never authorizes an automatic merge or deletion.

export type ReconciliableAdmin = {
  externalId: string;
  email: string;
  name: string;
  role: "admin" | "teacher" | "student";
  retiredAt?: string;
};

export type DuplicateAdminIdentity = {
  email: string;
  externalIds: string[];
};

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findDuplicateAdminIdentities(
  users: ReconciliableAdmin[]
): DuplicateAdminIdentity[] {
  const byEmail = new Map<string, string[]>();
  for (const user of users) {
    if (user.role !== "admin" || user.retiredAt) continue;
    const email = normalizedEmail(user.email);
    if (!email) continue;
    const ids = byEmail.get(email) ?? [];
    ids.push(user.externalId);
    byEmail.set(email, ids);
  }
  return [...byEmail.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([email, externalIds]) => ({ email, externalIds: [...externalIds].sort() }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** A duplicate can only be retired by another active admin and never itself. */
export function canRetireDuplicateAdmin(
  activeAdmins: ReconciliableAdmin[],
  actorExternalId: string,
  targetExternalId: string
): boolean {
  if (actorExternalId === targetExternalId || activeAdmins.length < 2) return false;
  return activeAdmins.some((admin) => admin.externalId === actorExternalId) &&
    activeAdmins.some((admin) => admin.externalId === targetExternalId);
}
