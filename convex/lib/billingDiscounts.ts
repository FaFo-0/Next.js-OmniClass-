export type BillingDiscountKind = "percent" | "fixed";
export type BillingDiscountScope = "all_plans" | "family" | "plan";
export type BillingDiscountEligibility = "everyone" | "new_clients_only" | "allowlist";
export type BillingLocalizedDiscountText = {
  default: string;
  en?: string;
  ru?: string;
  ar?: string;
  kk?: string;
};

export interface BillingDiscountRule {
  id: string;
  name: string;
  labels?: BillingLocalizedDiscountText;
  kind: BillingDiscountKind;
  value: number;
  currency?: string;
  scope: BillingDiscountScope;
  familyId?: string;
  planId?: string;
  eligibility: BillingDiscountEligibility;
  priority: number;
  startsAt: string;
  endsAt?: string;
  maxRedemptions?: number;
  redemptionCount: number;
  isActive: boolean;
}

export interface BillingDiscountContext {
  familyId: string;
  planId: string;
  currency: string;
  isNewClient: boolean;
  allowlisted: boolean;
}

export interface DiscountCalculation {
  discountAmount: number;
  netAmount: number;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function validateDiscount(rule: BillingDiscountRule): void {
  if (!rule.name.trim()) throw new Error("Discount name is required");
  if (!finite(rule.value) || rule.value <= 0) throw new Error("Discount value must be positive");
  if (rule.kind === "percent" && rule.value > 100) throw new Error("Percent discount cannot exceed 100%");
  if (rule.kind === "fixed" && !rule.currency?.trim()) throw new Error("Fixed discount currency is required");
  if (rule.kind === "fixed" && !/^[A-Z]{3}$/.test(rule.currency!.trim().toUpperCase())) throw new Error("Fixed discount currency is invalid");
  if (rule.scope === "family" && !rule.familyId) throw new Error("Family scope requires a family");
  if (rule.scope === "plan" && !rule.planId) throw new Error("Plan scope requires a plan");
  if (rule.scope === "all_plans" && (rule.familyId || rule.planId)) throw new Error("All-plan discount cannot have a family or plan");
  if (rule.scope === "family" && rule.planId) throw new Error("Family discount cannot have a plan");
  if (rule.scope === "plan" && !rule.planId) throw new Error("Plan scope requires a plan");
  const start = Date.parse(rule.startsAt);
  const end = rule.endsAt ? Date.parse(rule.endsAt) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start) || end <= start) throw new Error("Discount dates are invalid");
  if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 1_000_000) throw new Error("Discount priority is invalid");
  if (rule.maxRedemptions !== undefined && (!Number.isInteger(rule.maxRedemptions) || rule.maxRedemptions <= 0 || rule.maxRedemptions > 1_000_000_000)) {
    throw new Error("Maximum redemptions must be a positive integer within the limit");
  }
  if (!Number.isInteger(rule.redemptionCount) || rule.redemptionCount < 0) {
    throw new Error("Redemption count is invalid");
  }
}

export function isWithinDiscountWindow(rule: BillingDiscountRule, now: string): boolean {
  const at = Date.parse(now);
  const start = Date.parse(rule.startsAt);
  const end = rule.endsAt ? Date.parse(rule.endsAt) : Number.POSITIVE_INFINITY;
  return Number.isFinite(at) && at >= start && at < end;
}

export function matchesDiscountScope(rule: BillingDiscountRule, context: BillingDiscountContext): boolean {
  if (rule.scope === "all_plans") return true;
  if (rule.scope === "family") return rule.familyId === context.familyId;
  return rule.planId === context.planId;
}

export function matchesDiscountEligibility(rule: BillingDiscountRule, context: BillingDiscountContext): boolean {
  if (rule.eligibility === "everyone") return true;
  if (rule.eligibility === "new_clients_only") return context.isNewClient;
  return context.allowlisted;
}

function moneyDigits(currency: string): number {
  // Launch catalogue currencies (KZT/SAR) are quoted in whole units. Other
  // currencies use the conventional two decimal places until a catalogue
  // explicitly requires a different minor-unit policy.
  return currency === "KZT" || currency === "SAR" || currency === "JPY" ? 0 : 2;
}

function roundMoney(value: number, currency: string): number {
  const factor = 10 ** moneyDigits(currency);
  return Math.round(value * factor) / factor;
}

export function calculateDiscount(
  listPrice: number,
  currency: string,
  rule?: BillingDiscountRule | null,
): DiscountCalculation {
  if (!finite(listPrice) || listPrice < 0) throw new Error("List price is invalid");
  if (!rule) return { discountAmount: 0, netAmount: listPrice };
  if (rule.kind === "fixed" && rule.currency !== currency) {
    throw new Error("Fixed discount currency does not match the plan");
  }
  const raw = rule.kind === "percent" ? (listPrice * rule.value) / 100 : rule.value;
  const discountAmount = Math.min(listPrice, Math.max(0, roundMoney(raw, currency)));
  return {
    discountAmount,
    netAmount: Math.max(0, roundMoney(listPrice - discountAmount, currency)),
  };
}

export function selectBestDiscount(
  rules: BillingDiscountRule[],
  context: BillingDiscountContext,
  now: string,
  listPrice = 0,
): BillingDiscountRule | null {
  const matching = rules.filter((rule) => {
    try {
      validateDiscount(rule);
    } catch {
      return false;
    }
    return (
      rule.isActive &&
      (rule.maxRedemptions === undefined || rule.redemptionCount < rule.maxRedemptions) &&
      isWithinDiscountWindow(rule, now) &&
      (rule.kind === "percent" || rule.currency === context.currency) &&
      matchesDiscountScope(rule, context) &&
      matchesDiscountEligibility(rule, context)
    );
  });
  matching.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aAmount = calculateDiscount(listPrice, context.currency, a).discountAmount;
    const bAmount = calculateDiscount(listPrice, context.currency, b).discountAmount;
    if (aAmount !== bAmount) return bAmount - aAmount;
    return a.id.localeCompare(b.id);
  });
  return matching[0] ?? null;
}
