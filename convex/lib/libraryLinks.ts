/** External links are opened, never fetched by the backend. */
export function assertLibraryUrl(value: string | null | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || url.hostname === "localhost") throw new Error();
    return url.href;
  } catch { throw new Error("Use a valid HTTPS link"); }
}
