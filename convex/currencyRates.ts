import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ACADEMY_ID, tenantTable } from "./lib/tenant";

/** Reject malformed feeds rather than poisoning every subsequent money write. */
export function parseDailyRates(payload: unknown, now = Date.now()) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid currency feed");
  const feed = payload as Record<string, unknown>;
  if (feed.result !== "success" || feed.base_code !== "USD") throw new Error("Currency feed is not USD based");
  const timestamp = Number(feed.time_last_update_unix) * 1000;
  if (!Number.isFinite(timestamp) || timestamp > now + 300_000 || now - timestamp > 4 * 86_400_000) {
    throw new Error("Currency feed timestamp is stale or invalid");
  }
  if (!feed.rates || typeof feed.rates !== "object" || Array.isArray(feed.rates)) throw new Error("Currency rates missing");
  const incoming = feed.rates as Record<string, unknown>;
  if (incoming.USD !== 1 || typeof incoming.KZT !== "number" || !Number.isFinite(incoming.KZT) || incoming.KZT <= 0) {
    throw new Error("Currency feed is missing its USD/KZT anchor");
  }
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(incoming)) {
    if (!/^[A-Z]{3}$/.test(code) || typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid currency feed entry: ${code}`);
    }
    const normalized = incoming.KZT / value;
    if (!Number.isFinite(normalized) || normalized <= 0) throw new Error(`Invalid normalized rate: ${code}`);
    rates[code] = normalized;
  }
  return { rates, effectiveAt: new Date(timestamp).toISOString(), source: "ExchangeRate-API" };
}

/** Fetch once daily; failed requests leave the last successful snapshot intact. */
export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Currency provider returned HTTP ${response.status}`);
    const snapshot = parseDailyRates(await response.json());
    await ctx.runMutation(internal.currencyRates.save, snapshot);
    return null;
  },
});

/** Daily keys are the provider's UTC effective date, not the fetch date. */
export const save = internalMutation({
  args: { rates: v.record(v.string(), v.number()), effectiveAt: v.string(), source: v.string() },
  handler: async (ctx, { rates, effectiveAt, source }) => {
    const effectiveMs = Date.parse(effectiveAt);
    if (!Number.isFinite(effectiveMs) || effectiveMs > Date.now() + 300_000) throw new Error("Invalid rate timestamp");
    if (rates.KZT !== 1 || !Number.isFinite(rates.USD) || rates.USD <= 0) throw new Error("Invalid rate anchors");
    for (const [code, value] of Object.entries(rates)) {
      if (!/^[A-Z]{3}$/.test(code) || !Number.isFinite(value) || value <= 0) throw new Error("Invalid rate");
    }
    const settings = tenantTable(ctx, ACADEMY_ID, "tenantSettings");
    const row = await settings.query().withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID)).unique();
    if (!row) throw new Error("Academy settings missing");
    const date = new Date(effectiveMs).toISOString().slice(0, 10);
    const daily = tenantTable(ctx, ACADEMY_ID, "fxDaily");
    const existing = await daily.query().withIndex("by_organization_and_date", q => q.eq("organizationId", ACADEMY_ID).eq("date", date)).unique();
    if (!existing) await daily.insert({ date, rates, source, effectiveAt });
    else if (existing.effectiveAt < effectiveAt) await daily.patch(existing._id, { rates, source, effectiveAt });
    if (!row.fxRatesUpdatedAt || row.fxRatesUpdatedAt < effectiveAt || Object.keys(row.fxRatesKzt ?? {}).length < 3) {
      await settings.patch(row._id, {
        fxRatesKzt: rates,
        fxRatesUpdatedAt: effectiveAt,
        fxRatesSource: source,
        updatedAt: new Date().toISOString(),
      });
    }
    return null;
  },
});
