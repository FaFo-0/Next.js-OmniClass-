"use client";

import { CurrencySelector } from "@/components/billing/CurrencySelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

const subscribeCurrencyPreference = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("popstate", notify);
  };
};
const currencyPreferenceSnapshot = () => {
  const fromUrl = new URLSearchParams(window.location.search).get("currency");
  if (fromUrl) return fromUrl.toUpperCase();
  try { return localStorage.getItem("omnica-currency")?.toUpperCase() ?? "USD"; } catch { return "USD"; }
};

type BillingOrderView = {
  orderId: string;
  status: "pending_verification" | "granted" | "rejected" | "cancelled";
  packId?: string | null;
  planSnapshot: { familyLabel: string; planLabel: string; lessonCount: number; expiryDays: number };
  priceSnapshot: { listAmount: number; discountAmount: number; netAmount: number; currency: string; calculatedAt: string; discountCode?: string };
  rejectionReason: string | null;
};

type PricingView = {
  groups: Array<{ familyId: string; label: string; description: string | null; packs: StudentPackOffer[] }>;
  openOrder: BillingOrderView | null;
};

type TenantSummary = { supportEmail?: string; supportWhatsappUrl?: string; supportTelegramUrl?: string } | null | undefined;
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
  const [currencyOverride, setCurrency] = useState<string | null>(null);
  const rememberedCurrency = useSyncExternalStore(subscribeCurrencyPreference, currencyPreferenceSnapshot, () => "USD");
  const currencySettings = useQuery(api.currencies.publicSettings, {});
  const candidateCurrency = currencyOverride ?? rememberedCurrency;
  const currency = currencySettings?.enabledCurrencies.includes(candidateCurrency) ? candidateCurrency : "USD";
  const converted = useQuery(api.pricing.getStudentCatalogue, { locale, currency });
  const createOrder = useMutation(api.pricing.createOrderRequest);
  const [selected, setSelected] = useState<StudentPackOffer | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const discounted = useQuery(api.pricing.getStudentCatalogue, discountCode ? { locale, discountCode, currency } : "skip");
  const shownPricing = discounted ?? converted ?? pricing;
  const codeInvalid = Boolean(discountCode && (!discounted || discounted.discountError));
  const requestKey = useRef<string | null>(null);
  const preview = useQuery(api.pricing.previewPack, selected ? { packId: selected.packId as never, locale, currency, discountCode: discountCode || undefined } : "skip");
  const locked = Boolean(pricing.openOrder);

  useEffect(() => {
    if (!currencySettings || !converted) return;
    try {
      const packId = localStorage.getItem("omnica-selected-pack");
      if (!packId) return;
      if (locked || converted.openOrder) { localStorage.removeItem("omnica-selected-pack"); return; }
      // Hydration can initially render USD before the external preference is
      // restored. Wait for the actual selected currency's catalogue first.
      const requested = currencyPreferenceSnapshot();
      if (currencySettings.enabledCurrencies.includes(requested) && requested !== currency) return;
      const offer = converted.groups.flatMap(group => group.packs).find(pack => pack.packId === packId);
      localStorage.removeItem("omnica-selected-pack");
      if (offer) {
        requestKey.current = null;
        // Restoring a choice from browser storage is synchronization with an
        // external system, not a derived catalogue state update.
        setSelected(offer);
      }
    } catch { /* An unavailable/blocked browser store must not block billing. */ }
  }, [currencySettings, converted, locked, currency]);

  async function submitOrder() {
    if (!selected || locked || requesting || !preview || preview.error || codeInvalid) return;
    setRequesting(true);
    try {
      requestKey.current ??= crypto.randomUUID();
      await createOrder({ expectedAmount: preview.priceSnapshot.netAmount, packId: selected.packId as never, requestKey: requestKey.current, locale, currency, discountCode: discountCode || undefined });
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

      <CurrencySelector value={currency} onChange={code => { setCurrency(code); setSelected(null); requestKey.current = null; }} disabled={requesting} />
      <h2 className="h2" style={{ marginBottom: 12 }}>{t("catalogueTitle")}</h2>
      <p className="body-sm" style={{ marginBottom: 16 }}>{t("catalogueHint")}</p>
      <form className="card mb-4 p-4" onSubmit={event => { event.preventDefault(); setDiscountCode(codeInput.trim().toUpperCase()); requestKey.current = null; }}>
        <label htmlFor="discount-code" className="body-sm font-semibold">{t("discountCode")}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input id="discount-code" value={codeInput} onChange={event => setCodeInput(event.target.value)} maxLength={40} disabled={locked || requesting} className="min-w-0 flex-1 basis-40" dir="ltr" autoComplete="off" />
          <Button type="submit" disabled={locked || requesting || !codeInput.trim()}>{t("applyCode")}</Button>
          {discountCode && <Button type="button" variant="outline" disabled={requesting} onClick={() => { setDiscountCode(""); setCodeInput(""); requestKey.current = null; }}>{t("removeCode")}</Button>}
        </div>
        <p className="body-sm mt-2" aria-live="polite">{discounted?.discountError ? t("codeUnavailable") : discounted?.activeCode ? t("codeApplied", { code: discounted.activeCode.code, percent: discounted.activeCode.percent }) : t("codeHint")}</p>
      </form>
      {shownPricing.groups.length === 0 ? (
        <div className="card body-sm" style={{ padding: 28, textAlign: "center" }}>
          {t("noPacks")}
          {tenant?.supportEmail ? <div style={{ marginTop: 12 }}><a className="link" href={`mailto:${tenant.supportEmail}`}>{tenant.supportEmail}</a></div> : null}
        </div>
      ) : shownPricing.groups.map((group) => (
        <section key={group.familyId} style={{ marginBottom: 24 }}>
          <h3 className="h3" style={{ marginBottom: 4 }}>{group.label}</h3>
          {group.description && <p className="body-sm" style={{ marginBottom: 10, color: "var(--omnic-gray-600)" }}>{group.description}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 16 }}>
            {group.packs.map((offer) => (
              <StudentPlanCard
                key={offer.packId}
                offer={offer}
                hasPendingOrder={locked}
                disabled={codeInvalid}
                pendingPackId={pricing.openOrder?.packId ?? null}
                onChoose={(offer) => { requestKey.current = null; setSelected(offer); }}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="card" style={{ padding: 20, marginTop: 8 }}>
        <div className="h3" style={{ marginBottom: 4 }}>{t("howToPay")}</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>{t("howToPayHint")}</p>
        {tenant?.supportWhatsappUrl && <a className="btn btn-tenant" href={tenant.supportWhatsappUrl} target="_blank" rel="noopener noreferrer">{t("contactWhatsapp")}</a>}
        {tenant?.supportTelegramUrl && <a className="btn btn-tenant ms-2" href={tenant.supportTelegramUrl} target="_blank" rel="noopener noreferrer">Telegram</a>}

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
                    <td>{order.planSnapshot.familyLabel} · {order.planSnapshot.planLabel}{order.priceSnapshot.discountCode && <div className="body-sm" dir="ltr">{order.priceSnapshot.discountCode}</div>}</td>
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
        preview={preview && !preview.error && !codeInvalid ? preview : undefined}
        errorMessage={preview?.error || codeInvalid ? t("codeUnavailable") : undefined}
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
