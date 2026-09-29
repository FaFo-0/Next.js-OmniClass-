export type PackOfferState = {
  disabled: boolean;
  selected: boolean;
  reason: "pending" | null;
};

/** One pending order per student: every pack is locked while it waits. */
export function packOfferState(
  hasPendingOrder: boolean,
  packId: string,
  pendingPackId?: string | null,
): PackOfferState {
  return {
    disabled: hasPendingOrder,
    selected: pendingPackId === packId,
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
