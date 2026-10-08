"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@convex";
import { isNoExpiry } from "@/lib/expiry";
import { StudentPlanCard, type StudentPackOffer } from "@/components/billing/StudentPlanCard";
import { PlanRequestDialog } from "@/components/billing/PlanRequestDialog";
import { PendingOrderBanner } from "@/components/billing/PendingOrderBanner";
import { formatBillingAmount } from "@/components/billing/billingView";
import { isLocale } from "@/i18n/config";

type BillingOrderView = {
  orderId: string;
  status: "pending_verification" | "granted" | "rejected" | "cancelled";
  packId?: string | null;
  planSnapshot: { familyLabel: string; planLabel: string; lessonCount: number; expiryDays: number };
  priceSnapshot: { listAmount: number; discountAmount: number; netAmount: number; currency: string; calculatedAt: string };
  rejectionReason: string | null;
};

type PricingView = {
  groups: Array<{ familyId: string; label: string; description: string | null; packs: StudentPackOffer[] }>;
  openOrder: BillingOrderView | null;
};

type TenantSummary = { supportEmail?: string; supportWhatsappUrl?: string } | null | undefined;
type BalanceSummary = { balance: number; nextExpiresAt?: string | null } | null | undefined;

function PricingCatalogue({ pricing, orders, balance, tenant }: {
  pricing: PricingView;
  orders: BillingOrderView[];
  balance: BalanceSummary;
  tenant: TenantSummary;
}) {
  const t = useTranslations("app.billing");
  const activeLocale = useLocale();
  const locale = isLocale(activeLocale) ? activeLocale : undefined;
  const createOrder = useMutation(api.pricing.createOrderRequest);
  const [selected, setSelected] = useState<StudentPackOffer | null>(null);
  const [requesting, setRequesting] = useState(false);
  const requestKey = useRef<string | null>(null);
  const preview = useQuery(api.pricing.previewPack, selected ? { packId: selected.packId as never, locale } : "skip");
  const locked = Boolean(pricing.openOrder);

  async function submitOrder() {
    if (!selected || locked || requesting || !preview) return;
    setRequesting(true);
    try {
      requestKey.current ??= crypto.randomUUID();
      await createOrder({ packId: selected.packId as never, requestKey: requestKey.current });
      setSelected(null);
      requestKey.current = null;
      toast.success(t("orderSent"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div style={{ maxWidth: 1120 }}>
      <h1 className="h1" style={{ marginBottom: 4 }}>{t("title")}</h1>
      <p className="body-sm" style={{ marginBottom: 20 }}>{t("subtitle")}</p>

      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div><div style={{ fontSize: 30, fontWeight: 700 }}>{balance?.balance ?? 0}</div><div className="body-sm">{t("left")}</div></div>
        {balance?.nextExpiresAt && (balance.balance ?? 0) > 0 && <div className="body-sm">{t("nextExpiry")} <strong>{isNoExpiry(balance.nextExpiresAt) ? t("noExpiry") : balance.nextExpiresAt}</strong></div>}
      </div>

      {pricing.openOrder && <PendingOrderBanner order={pricing.openOrder} />}

      <h2 className="h2" style={{ marginBottom: 12 }}>{t("catalogueTitle")}</h2>
      <p className="body-sm" style={{ marginBottom: 16 }}>{t("catalogueHint")}</p>
      {pricing.groups.length === 0 ? (
        <div className="card body-sm" style={{ padding: 28, textAlign: "center" }}>
          {t("noPacks")}
          {tenant?.supportEmail ? <div style={{ marginTop: 12 }}><a className="link" href={`mailto:${tenant.supportEmail}`}>{tenant.supportEmail}</a></div> : null}
        </div>
      ) : pricing.groups.map((group) => (
        <section key={group.familyId} style={{ marginBottom: 24 }}>
          <h3 className="h3" style={{ marginBottom: 4 }}>{group.label}</h3>
          {group.description && <p className="body-sm" style={{ marginBottom: 10, color: "var(--omnic-gray-600)" }}>{group.description}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 16 }}>
            {group.packs.map((offer) => (
              <StudentPlanCard
                key={offer.packId}
                offer={offer}
                hasPendingOrder={locked}
                pendingPackId={pricing.openOrder?.packId ?? null}
                onChoose={setSelected}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="card" style={{ padding: 20, marginTop: 8 }}>
        <div className="h3" style={{ marginBottom: 4 }}>{t("howToPay")}</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>{t("howToPayHint")}</p>
        {tenant?.supportWhatsappUrl && <a className="btn btn-tenant" href={tenant.supportWhatsappUrl} target="_blank" rel="noopener noreferrer">{t("contactWhatsapp")}</a>}

      </div>

      {orders.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 className="h2" style={{ marginBottom: 10 }}>{t("claimLabel")}</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t("claimLabel")}</th><th>{t("youPay")}</th><th>{t("status")}</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderId}>
                    <td>{order.planSnapshot.familyLabel} · {order.planSnapshot.planLabel}</td>
                    <td dir="ltr">{formatBillingAmount(order.priceSnapshot.netAmount, order.priceSnapshot.currency, activeLocale)}</td>
                    <td>{t(order.status === "pending_verification" ? "statusPending" : order.status === "granted" ? "statusGranted" : order.status === "rejected" ? "statusRejected" : "statusCancelled")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PlanRequestDialog
        offer={selected}
        preview={preview}
        open={Boolean(selected)}
        submitting={requesting}
        onOpenChange={(open) => { if (!open && !requesting) { setSelected(null); requestKey.current = null; } }}
        onConfirm={() => void submitOrder()}
      />
    </div>
  );
}

export default function StudentBillingPage() {
  const activeLocale = useLocale();
  const locale = isLocale(activeLocale) ? activeLocale : undefined;
  const pricing = useQuery(api.pricing.getStudentCatalogue, { locale });
  const orders = useQuery(api.pricing.listMyOrders, {});
  const balance = useQuery(api.points.getBalance, {});
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const t = useTranslations("app.billing");
  if (pricing === undefined) return <div className="card" style={{ padding: 28 }}>{t("sending")}</div>;
  return (
    <PricingCatalogue
      pricing={pricing as PricingView}
      orders={(orders ?? []) as BillingOrderView[]}
      balance={balance}
      tenant={tenant}
    />
  );
}
