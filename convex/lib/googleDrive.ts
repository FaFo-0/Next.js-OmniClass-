const APPROVED_EXACT_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "drive.googleusercontent.com",
  "docs.googleusercontent.com",
  "drive.usercontent.google.com",
]);

/** Return true only for HTTPS URLs hosted by Google's Drive/Docs surfaces. */
export function isApprovedGoogleDriveUrl(value: string): boolean {
  if (value.trim() !== value) return false;
  try {
    const parsed = new URL(value);
    const authority = value.match(/^https:\/\/([^/?#]*)/i)?.[1] ?? "";
    const hostname = parsed.hostname.toLowerCase();
    const approvedHost = APPROVED_EXACT_HOSTS.has(hostname);

    return (
      parsed.protocol === "https:" &&
      approvedHost &&
      !authority.includes(":") &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === ""
    );
  } catch {
    return false;
  }
}

/** Validate an optional stored external link without changing its value. */
export function assertApprovedGoogleDriveUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!value || !isApprovedGoogleDriveUrl(value)) {
    throw new Error("externalUrl must be a valid HTTPS Google Drive or Google Docs URL");
  }
  return value;
}
