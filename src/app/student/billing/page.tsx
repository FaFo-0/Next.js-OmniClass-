"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { isNoExpiry } from "@/lib/expiry";
import { StudentPlanCard, type StudentBillingOffer } from "@/components/billing/StudentPlanCard";
import { PlanRequestDialog } from "@/components/billing/PlanRequestDialog";
import { PendingOrderBanner } from "@/components/billing/PendingOrderBanner";

type BillingOrderView = {
  orderId: string;
  status: "pending_verification" | "granted" | "rejected" | "cancelled";
  planVersionId?: string;
  planSnapshot: { familyLabel: string; planLabel: string; lessonCount: number; expiryDays: number };
  priceSnapshot: { listAmount: number; discountAmount: number; netAmount: number; currency: string; calculatedAt: string };
  discountSnapshot?: { name: string; amount: number } | null;
  rejectionReason: string | null;
};

type BillingView = {
  offers: StudentBillingOffer[];
  openOrder: BillingOrderView | null;
  recentOrders: BillingOrderView[];
};

type PaymentInstructions = { kaspiPhone?: string | null; recipientName?: string | null; note?: string | null; qrUrl?: string | null };
type TenantSummary = { supportEmail?: string };
type BalanceSummary = { balance: number; nextExpiresAt?: string | null };

function money(amount: number, currency: string) {
  return `${amount.toLocaleString()} ${currency}`;
}

function VersionedCatalogue({ billing, balance, payHow, tenant }: { billing: BillingView; balance: BalanceSummary | null | undefined; payHow: PaymentInstructions | null | undefined; tenant: TenantSummary | null | undefined }) {
  const t = useTranslations("app.billing");
  const createOrder = useMutation(api.billing.createOrderRequest);
  const [selected, setSelected] = useState<StudentBillingOffer | null>(null);
  const [requesting, setRequesting] = useState(false);
  const requestKey = useRef<string | null>(null);
  const preview = useQuery(api.billing.previewDiscount, selected ? { planVersionId: selected.planVersionId as never } : "skip");
  const locked = Boolean(billing.openOrder);
  const visibleOrder = billing.openOrder ?? billing.recentOrders[0] ?? null;
  const groups = billing.offers.reduce<Array<{ family: string; description?: string | null; offers: StudentBillingOffer[] }>>((result, offer) => {
    const current = result.find((group) => group.family === offer.familyLabel);
    if (current) current.offers.push(offer);
    else result.push({ family: offer.familyLabel, description: offer.familyDescription, offers: [offer] });
    return result;
  }, []);

  async function submitOrder() {
    if (!selected || locked || requesting || !preview) return;
    setRequesting(true);
    try {
      requestKey.current ??= crypto.randomUUID();
      await createOrder({ planVersionId: selected.planVersionId as never, requestKey: requestKey.current });
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
      <p className="body-sm" style={{ marginBottom: 20 }}>{t("catalogueHint")}</p>

      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div><div style={{ fontSize: 30, fontWeight: 700 }}>{balance?.balance ?? 0}</div><div className="body-sm">{t("left")}</div></div>
        {balance?.nextExpiresAt && (balance.balance ?? 0) > 0 && <div className="body-sm">{t("nextExpiry")} <strong>{isNoExpiry(balance.nextExpiresAt) ? t("noExpiry") : balance.nextExpiresAt}</strong></div>}
      </div>

      {visibleOrder && <PendingOrderBanner order={visibleOrder} />}

      <h2 className="h2" style={{ marginBottom: 12 }}>{t("catalogueTitle")}</h2>
      {groups.length === 0 ? (
        <div className="card body-sm" style={{ padding: 28, textAlign: "center" }}>{t("noPacks")}{tenant?.supportEmail ? <div style={{ marginTop: 12 }}><a className="link" href={`mailto:${tenant.supportEmail}`}>{tenant.supportEmail}</a></div> : null}</div>
      ) : groups.map((group) => (
        <section key={group.family} style={{ marginBottom: 24 }}>
          <h3 className="h3" style={{ marginBottom: 4 }}>{group.family}</h3>
          {group.description && <p className="body-sm" style={{ marginBottom: 10, color: "var(--omnic-gray-600)" }}>{group.description}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 16 }}>
            {group.offers.map((offer) => <StudentPlanCard key={offer.planVersionId} offer={offer} hasPendingOrder={locked} pendingPlanVersionId={billing.openOrder?.planVersionId} onChoose={setSelected} />)}
          </div>
        </section>
      ))}

      <div className="card" style={{ padding: 20, marginTop: 8 }}>
        <div className="h3" style={{ marginBottom: 4 }}>{t("howToPay")}</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>{t("howToPayHint")}</p>
        {payHow?.kaspiPhone && <div className="body-sm"><strong>{t("kaspiNumber")}:</strong> <span dir="ltr">{payHow.kaspiPhone}</span></div>}
        {payHow?.recipientName && <div className="body-sm"><strong>{t("recipient")}:</strong> {payHow.recipientName}</div>}
        {payHow?.note && <div className="body-sm" style={{ marginTop: 6 }}>{payHow.note}</div>}
        {payHow?.qrUrl && <img src={payHow.qrUrl} alt={t("scanQr")} style={{ width: 140, height: 140, objectFit: "contain", marginTop: 12, border: "1px solid var(--omnic-gray-200)", borderRadius: 8 }} />}
        {!payHow && <div className="body-sm">{t("noOnlinePayment")}{tenant?.supportEmail ? ` ${tenant.supportEmail}` : ""}</div>}
      </div>

      {billing.recentOrders.length > 0 && <div style={{ marginTop: 24 }}><h2 className="h2" style={{ marginBottom: 10 }}>{t("claimLabel")}</h2><div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t("claimLabel")}</th><th>{t("youPay")}</th><th>{t("status")}</th></tr></thead><tbody>{billing.recentOrders.map((order) => <tr key={order.orderId}><td>{order.planSnapshot.familyLabel} · {order.planSnapshot.planLabel}</td><td dir="ltr">{money(order.priceSnapshot.netAmount, order.priceSnapshot.currency)}</td><td>{order.status === "pending_verification" ? t("statusPending") : order.status === "granted" ? t("statusGranted") : order.status === "rejected" ? t("statusRejected") : t("statusCancelled")}</td></tr>)}</tbody></table></div></div>}

      <PlanRequestDialog offer={selected} preview={preview} open={Boolean(selected)} submitting={requesting} onOpenChange={(open) => { if (!open && !requesting) { setSelected(null); requestKey.current = null; } }} onConfirm={() => void submitOrder()} />
    </div>
  );
}

export default function StudentBillingPage() {
  const balance = useQuery(api.points.getBalance, {});
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const payHow = useQuery(api.payments.getPaymentInstructions, {});
  const billing = useQuery(api.billing.getStudentBilling, {});
  const t = useTranslations("app.billing");
  if (billing === undefined) return <div className="card" style={{ padding: 28 }}>{t("sending")}</div>;
  return <VersionedCatalogue billing={billing as BillingView} balance={balance} payHow={payHow} tenant={tenant} />;
}
