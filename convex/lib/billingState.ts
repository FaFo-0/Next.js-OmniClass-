export type CatalogueVersionStatus = "draft" | "published" | "superseded" | "archived";
export type CatalogueVersionAction = "publish" | "supersede" | "archive";
export type BillingOrderStatus = "pending_verification" | "granted" | "rejected" | "cancelled";
export type BillingOrderAction = "grant" | "reject" | "cancel";

const catalogueTransitions: Record<CatalogueVersionStatus, Partial<Record<CatalogueVersionAction, CatalogueVersionStatus>>> = {
  draft: { publish: "published" },
  published: { supersede: "superseded", archive: "archived" },
  superseded: { archive: "archived" },
  archived: {},
};

const orderTransitions: Record<BillingOrderStatus, Partial<Record<BillingOrderAction, BillingOrderStatus>>> = {
  pending_verification: { grant: "granted", reject: "rejected", cancel: "cancelled" },
  granted: {},
  rejected: {},
  cancelled: {},
};

export function transitionCatalogueVersion(
  status: CatalogueVersionStatus,
  action: CatalogueVersionAction,
): CatalogueVersionStatus {
  const next = catalogueTransitions[status]?.[action];
  if (!next) throw new Error(`Cannot ${action} catalogue version from ${status}`);
  return next;
}

export function transitionBillingOrder(
  status: BillingOrderStatus,
  action: BillingOrderAction,
): BillingOrderStatus {
  const next = orderTransitions[status]?.[action];
  if (!next) throw new Error(`Cannot ${action} billing order from ${status}`);
  return next;
}

export function isOpenBillingOrder(status: BillingOrderStatus): boolean {
  return status === "pending_verification";
}
