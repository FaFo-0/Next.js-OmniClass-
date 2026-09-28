export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "ref",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>>;

const VALUE_LIMITS: Record<AttributionKey, number> = {
  utm_source: 100,
  utm_medium: 100,
  utm_campaign: 150,
  ref: 150,
};
const STORAGE_KEY = "omnic_attribution";
const COOKIE_NAME = "omnic_attribution";

export function sanitizeAttributionValue(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

export function parseAttribution(input: string | URLSearchParams): Attribution {
  const params = typeof input === "string"
    ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
    : input;
  const result: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key);
    if (value === null) continue;
    const sanitized = sanitizeAttributionValue(value, VALUE_LIMITS[key]);
    if (sanitized) result[key] = sanitized;
  }
  return result;
}

export function buildAttributionValue(attribution: Attribution): string {
  const params = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) {
    const value = attribution[key];
    if (value) params.set(key, sanitizeAttributionValue(value, VALUE_LIMITS[key]));
  }
  return params.toString();
}

export function withAttribution(path: string, attribution: Attribution): string {
  const value = buildAttributionValue(attribution);
  if (!value) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${value}`;
}

export function storeAttribution(attribution: Attribution): void {
  const value = buildAttributionValue(attribution);
  if (!value || typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, value);
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=2592000; samesite=lax`;
}

export function readStoredAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  const fromSession = window.sessionStorage.getItem(STORAGE_KEY);
  if (fromSession) return parseAttribution(fromSession);
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return {};
  try {
    return parseAttribution(decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)));
  } catch {
    return {};
  }
}

export function clearStoredAttribution(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
}
