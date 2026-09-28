const REFERRAL_SOURCE_LIMIT = 2_048;

export function cleanReferralSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, REFERRAL_SOURCE_LIMIT);
  return cleaned || undefined;
}

/** A non-positive duration means the configured trial does not expire. */
export function trialGrantExpiry(
  durationDays: number,
  nowMs = Date.now(),
): string | undefined {
  if (!Number.isFinite(durationDays) || durationDays <= 0) return undefined;
  return new Date(nowMs + durationDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
