// Identity reconciliation is deliberately pure so the safety decisions can be
// tested without a database. Matching an email identifies a review candidate;
// it never authorizes an automatic merge or deletion.

export type ReconciliableAdmin = {
  /** Immutable application-row identity; Clerk external IDs can be duplicated. */
  id: string;
  externalId: string;
  email: string;
  name: string;
  role: "admin" | "teacher" | "student";
  retiredAt?: string;
};

export type DuplicateAdminIdentity = {
  email: string;
  ids: string[];
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
    ids.push(user.id);
    byEmail.set(email, ids);
  }
  return [...byEmail.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([email, ids]) => ({ email, ids: [...ids].sort() }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** A duplicate can only be retired by another active admin row and never itself. */
export function canRetireDuplicateAdmin(
  activeAdmins: ReconciliableAdmin[],
  actorId: string,
  targetId: string
): boolean {
  if (actorId === targetId || activeAdmins.length < 2) return false;
  return activeAdmins.some((admin) => admin.id === actorId) &&
    activeAdmins.some((admin) => admin.id === targetId);
}
