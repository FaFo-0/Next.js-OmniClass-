// Client-side helpers for grant expiry presentation (POLICY §2).
// `pointGrants.expiresAt` uses "9999-12-31" as the no-expiry sentinel; UI
// must render that as a localized "No expiry" instead of a literal date.

export const NO_EXPIRY = "9999-12-31";

/** True when a stored expiry is the no-expiry sentinel. */
export function isNoExpiry(expiresAt?: string | null): boolean {
  return !!expiresAt && expiresAt >= NO_EXPIRY;
}

/** The date to show, or null when the grant never expires. */
export function displayExpiry(
  expiresAt?: string | null,
  noExpiryLabel?: string
): string | null {
  if (!expiresAt) return null;
  return isNoExpiry(expiresAt) ? (noExpiryLabel ?? "No expiry") : expiresAt;
}