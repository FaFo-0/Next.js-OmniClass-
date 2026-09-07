"use client";

// Student lesson packs. POLICY §3: when Lemon Squeezy is configured and the
// pack is wired to a variant, Buy opens a real checkout. Otherwise the page
// falls back to what it always did — show the real catalogue and send the
// academy a request. No checkout that can't take money.

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";
import { isNoExpiry } from "@/lib/expiry";

type Pack = {
  _id: string;
  name: string;
  points: number;
  priceUSD: number;
  priceLocal?: number;
  currency?: string;
  expiryDays?: number;
  lemonSqueezyVariantId?: string;
};

function priceLabel(pkg: Pack) {
  if (pkg.priceLocal && pkg.currency) {
    return `${pkg.priceLocal.toLocaleString()} ${pkg.currency}`;
  }
  return `$${pkg.priceUSD.toLocaleString()}`;
}

export default function StudentBillingPage() {
  const packages = (useQuery(api.points.listPackages, { activeOnly: true }) ??
    []) as Pack[];
  const balance = useQuery(api.points.getBalance, {});
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const payStatus = useQuery(api.payments.getStatus, {});
  const payHow = useQuery(api.payments.getPaymentInstructions, {});
  const requestLessons = useMutation(api.points.requestLessons);
  const createCheckout = useAction(api.payments.createCheckout);
  const [busy, setBusy] = useState<string | null>(null);
  const [requested, setRequested] = useState<string[]>([]);
  const t = useTranslations("app.billing");

  const canPay = payStatus?.live === true;

  async function request(pkg: Pack) {
    setBusy(pkg._id);
    try {
      await requestLessons({ packageId: pkg._id as never });
      setRequested((prev) => [...prev, pkg._id]);
      toast.success(t("requestSent"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function buy(pkg: Pack) {
    setBusy(pkg._id);
    try {
      const { url } = await createCheckout({ packageId: pkg._id as never });
      // Full navigation, not a new tab: pop-up blockers eat the tab opened
      // after an await, and the student is coming straight back anyway.
      window.location.href = url;
    } catch (e) {
      toast.error(`${t("checkoutFailed")} — ${(e as Error).message}`);
      setBusy(null);
    }
  }

  const left = balance?.balance ?? 0;

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 className="h1" style={{ marginBottom: 4 }}>{t("title")}</h1>
      <p className="body-sm" style={{ marginBottom: 20 }}>
        {canPay ? t("subtitleBuy") : t("subtitle")}
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: left === 0 ? "var(--omnic-red)" : undefined }}>
            {left}
          </div>
          <div className="body-sm">{t("left")}</div>
        </div>
        {balance?.nextExpiresAt && left > 0 && (
          <div className="body-sm">
            {t("nextExpiry")}{" "}
            <strong>
              {isNoExpiry(balance.nextExpiresAt)
                ? t("noExpiry")
                : balance.nextExpiresAt}
            </strong>
          </div>
        )}
      </div>

      {/* POLICY §3 v1 — the page answers "where do I send the money" itself.
          Gated on the academy's own switch, not on whether a card gateway
          happens to be configured: during a move between providers both can
          be true, and the admin turning this on IS the intent. */}
      {payHow && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="h3" style={{ marginBottom: 4 }}>{t("howToPay")}</div>
          <p className="body-sm" style={{ marginBottom: 14 }}>
            {t("howToPayHint")}
          </p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              {payHow.kaspiPhone && (
                <div style={{ marginBottom: 12 }}>
                  <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
                    {t("kaspiNumber")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      dir="ltr"
                      style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
                    >
                      {payHow.kaspiPhone}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(payHow.kaspiPhone!)
                          .then(() => toast.success(t("copied")))
                          .catch(() => {});
                      }}
                    >
                      <Icon name="file" size={13} /> {t("copy")}
                    </button>
                  </div>
                </div>
              )}
              {payHow.recipientName && (
                <div style={{ marginBottom: 12 }}>
                  <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
                    {t("recipient")}
                  </div>
                  <div dir="auto" style={{ fontWeight: 600, unicodeBidi: "isolate" }}>
                    {payHow.recipientName}
                  </div>
                  {/* A Kaspi transfer to the wrong person cannot be undone. */}
                  <div className="body-sm" style={{ color: "#92400E", marginTop: 2 }}>
                    {t("checkName")}
                  </div>
                </div>
              )}
              {payHow.note && (
                <p dir="auto" className="body-sm" style={{ marginTop: 10 }}>
                  {payHow.note}
                </p>
              )}
            </div>
            {payHow.qrUrl && (
              <div style={{ textAlign: "center" }}>
                {/* Plain <img>: the QR is a Convex storage URL, and next/image
                    would need the host allow-listed for no benefit here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={payHow.qrUrl}
                  alt={t("scanQr")}
                  style={{ width: 160, height: 160, objectFit: "contain", borderRadius: 8, border: "1px solid var(--omnic-gray-200)", background: "#fff" }}
                />
                <div className="body-sm" style={{ marginTop: 6, color: "var(--omnic-gray-500)" }}>
                  {t("scanQr")}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {packages.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="body">{t("noPacks")}</div>
          {tenant?.supportEmail && (
            <a className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} href={`mailto:${tenant.supportEmail}`}>
              Contact your academy
            </a>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {packages.map((pkg) => {
            // A pack with no variant can't be bought even when the store is
            // live — it falls back to the request flow on its own.
            const buyable = canPay && !!pkg.lemonSqueezyVariantId;
            const done = requested.includes(pkg._id);
            const working = busy === pkg._id;
            const showsUsdSeparately =
              buyable && !!pkg.priceLocal && !!pkg.currency;
            return (
              <div key={pkg._id} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>{pkg.name}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--brand-purple)" }}>
                  {priceLabel(pkg)}
                </div>
                {/* Lemon Squeezy charges in USD. Saying so on the card beats
                    the student discovering it on the payment page. */}
                {showsUsdSeparately && (
                  <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
                    {t("chargedUsd", { usd: pkg.priceUSD.toLocaleString() })}
                  </div>
                )}
                <div className="body-sm">
                  {t("packLessons", { count: pkg.points })}
                  {pkg.expiryDays ? ` · ${t("validFor", { days: pkg.expiryDays })}` : ""}
                </div>
                <button
                  className="btn btn-tenant"
                  style={{ marginTop: "auto" }}
                  disabled={working || (!buyable && done)}
                  onClick={() => void (buyable ? buy(pkg) : request(pkg))}
                >
                  {buyable ? (
                    working ? (
                      t("opening")
                    ) : (
                      <>
                        <Icon name="dollar" size={14} /> {t("buy")}
                      </>
                    )
                  ) : done ? (
                    <>
                      <Icon name="check" size={14} /> {t("requested")}
                    </>
                  ) : working ? (
                    t("sending")
                  ) : (
                    t("request")
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="body-sm" style={{ marginTop: 16, color: "var(--omnic-gray-500)" }}>
        {canPay ? (
          t("securePayment", {
            local: packages[0]?.currency ?? "your local price",
          })
        ) : (
          <>
            {t("noOnlinePayment")}
            {tenant?.supportEmail ? (
              <> <a className="link" href={`mailto:${tenant.supportEmail}`}>{tenant.supportEmail}</a></>
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}
