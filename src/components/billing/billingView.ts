export type BillingOfferState = {
  disabled: boolean;
  selected: boolean;
  reason: "pending" | null;
};

export function billingOfferState(
  hasPendingOrder: boolean,
  planVersionId: string,
  selectedPlanVersionId?: string | null,
): BillingOfferState {
  return {
    disabled: hasPendingOrder,
    selected: selectedPlanVersionId === planVersionId,
    reason: hasPendingOrder ? "pending" : null,
  };
}

export function orderStatusKey(
  status: "pending_verification" | "granted" | "rejected" | "cancelled",
): "statusPending" | "statusGranted" | "statusRejected" | "statusCancelled" {
  switch (status) {
    case "granted":
      return "statusGranted";
    case "rejected":
      return "statusRejected";
    case "cancelled":
      return "statusCancelled";
    default:
      return "statusPending";
  }
}

export function formatBillingAmount(
  amount: number,
  currency: string,
  locale?: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "KZT" || currency === "SAR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}
