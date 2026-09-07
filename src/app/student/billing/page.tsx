"use client";

// Student lesson packs — POLICY §3 v1 manual Kaspi flow.
//
// No card gateway is pretended to exist. The student picks a pack from the
// real catalogue, sees the exact Kaspi instructions + amount on the page,
// pays, taps "I have paid" → claimManualPayment parks ONE durable pending
// claim. Lessons appear only after the admin verifies the transfer in Kaspi
// and confirms. The paid 1,500 ₸ trial (once per student, ever, admin-booked)
// is shown separately and credited toward the first package.

import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
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
};

type Claim = {
  _id: string;
  status: string;
  amount: number;
  currency: string;
  packName: string | null;
  points: number | null;
  trialCreditApplied: number | null;
  createdAt: string;
  message?: string;
  isTrial?: boolean;
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
  const payHow = useQuery(api.payments.getPaymentInstructions, {});
  const myClaims = useQuery(api.payments.listMyClaims, {}) ?? [];
  const claims = myClaims as unknown as Claim[];
  const claimManual = useMutation(api.payments.claimManualPayment);
  const [selected, setSelected] = useState<Pack | null>(null);
  const [claiming, setClaiming] = useState(false);
  const requestKeyRef = useRef<string | null>(null);
  const t = useTranslations("app.billing");

  const hasTrial = claims.some((c) => c.isTrial);
  const pendingClaim = claims.find((c) => c.status === "pending") ?? null;
  const rejectedClaim = claims.find((c) => c.status === "rejected") ?? null;
  const left = balance?.balance ?? 0;

  const nextRequestKey = () => {
    if (!requestKeyRef.current) {
      requestKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return requestKeyRef.current;
  };

  async function choose(pkg: Pack) {
    setSelected(pkg);
    requestKeyRef.current = null;
  }

  async function claimIt() {
    if (!selected) return;
    setClaiming(true);
    try {
      await claimManual({
        packageId: selected._id as never,
        requestKey: nextRequestKey(),
      });
      setSelected(null);
      toast.success(t("claimSent"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClaiming(false);
    }
  }

  // Eligible trial credit for the currently selected pack (mirror of the
  // server-side snapshot): full price unless the trial was already used.
  const creditFor = (pkg: Pack) =>
    hasTrial && !claims.some((c) => c.packName === pkg.name && c.status === "fulfilled")
      ? 1500
      : 0;
  const trialCredit = selected ? creditFor(selected) : 0;
  const dueFor = selected
    ? Math.max(0, (selected.priceLocal ?? selected.priceUSD) - trialCredit)
    : 0;

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 className="h1" style={{ marginBottom: 4 }}>{t("title")}</h1>
      <p className="body-sm" style={{ marginBottom: 20 }}>
        {t("subtitle")}
      </p>

      {/* Balance */}
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

      {/* Pending claim banner */}
      {pendingClaim && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 20, borderColor: "#F59E0B", background: "#FFFBEB" }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name="clock" size={16} style={{ marginTop: 2, color: "#B45309" }} />
            <div>
              <div className="body" style={{ fontWeight: 700, color: "#92400E" }}>
                {t("pendingTitle")}
              </div>
              <p className="body-sm" style={{ color: "#92400E", marginTop: 2 }}>
                {t("pendingHint")} {t("verifiedNote")}
              </p>
              <div className="body-sm" style={{ color: "#92400E", marginTop: 6 }}>
                {t("claimLabel")}: {pendingClaim.packName ?? "—"} ·{" "}
                {pendingClaim.amount.toLocaleString()} {pendingClaim.currency}
                {pendingClaim.trialCreditApplied ? ` · ${t("trialCredit")}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejected claim */}
      {rejectedClaim && !pendingClaim && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 20, borderColor: "#FCA5A5", background: "#FEF2F2" }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name="alert" size={16} style={{ marginTop: 2, color: "#B91C1C" }} />
            <div>
              <div className="body" style={{ fontWeight: 700, color: "#991B1B" }}>
                {t("rejectedTitle")}
              </div>
              <p className="body-sm" style={{ color: "#991B1B", marginTop: 2 }}>
                {t("rejectedHint", { reason: rejectedClaim.message ?? "—" })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Paid trial card — POLICY §1: 1,500 ₸, once per student, admin-booked */}
      <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div className="h3" style={{ marginBottom: 4 }}>{t("paidTrialTitle")}</div>
          <p className="body-sm" style={{ maxWidth: 480 }}>
            {t("paidTrialHint")}
          </p>
        </div>
        {hasTrial ? (
          <span className="pill" style={{ background: "#DCFCE7", color: "#166534", fontWeight: 600 }}>
            <Icon name="check" size={13} /> {t("paidTrialBooked")}
          </span>
        ) : (
          <a
            className="btn btn-secondary btn-sm"
            href={tenant?.supportEmail ? `mailto:${tenant.supportEmail}` : undefined}
            style={{ flexShrink: 0 }}
          >
            {t("trialBookedBtn")}
          </a>
        )}
      </div>

      {/* Kaspi payment instructions */}
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

      {/* Catalogue */}
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
            const isSelected = selected?._id === pkg._id;
            const credit = creditFor(pkg);
            const due = Math.max(0, (pkg.priceLocal ?? pkg.priceUSD) - credit);
            return (
              <div
                key={pkg._id}
                className="card"
                style={{
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  ...(isSelected ? { borderColor: "var(--brand-purple)", boxShadow: "0 0 0 1px var(--brand-purple)" } : {}),
                }}
              >
                <div style={{ fontWeight: 700 }}>{pkg.name}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--brand-purple)" }}>
                  {priceLabel(pkg)}
                </div>
                {credit > 0 && (
                  <div className="body-sm" style={{ color: "#166534" }}>
                    {t("trialCredit")} · {t("payAmount")} {due.toLocaleString()} {pkg.currency ?? ""}
                  </div>
                )}
                <div className="body-sm">
                  {t("packLessons", { count: pkg.points })}
                  {pkg.expiryDays ? ` · ${t("validFor", { days: pkg.expiryDays })}` : ""}
                </div>
                <button
                  className="btn btn-tenant"
                  style={{ marginTop: "auto" }}
                  onClick={() => void choose(pkg)}
                >
                  {isSelected ? `${t("selected")} →` : t("choose")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* In-page payment instruction + claim (selected pack) */}
      {selected && (
        <div
          className="card"
          style={{
            padding: 20,
            marginTop: 20,
            borderColor: "var(--brand-purple)",
            background: "var(--brand-purple-tint)",
          }}
        >
          <div className="h3" style={{ marginBottom: 4 }}>
            {t("payInstructionTitle")}
          </div>
          <p className="body-sm" style={{ marginBottom: 14 }}>
            {t("payInstructionHint", {
              amount: `${dueFor.toLocaleString()} ${selected.currency ?? ""}`,
            })}
          </p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
                {t("payAmount")}
              </div>
              <div
                dir="ltr"
                style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}
              >
                {dueFor.toLocaleString()} {selected.currency ?? ""}
              </div>
              {trialCredit > 0 && (
                <div className="body-sm" style={{ color: "#166534", marginTop: 4 }}>
                  {t("trialCredit")}
                </div>
              )}
              {dueFor !== (selected.priceLocal ?? selected.priceUSD) && (
                <div className="body-sm" style={{ color: "var(--omnic-gray-500)", marginTop: 2, textDecoration: "line-through" }}>
                  {priceLabel(selected)}
                </div>
              )}
            </div>
            <button
              className="btn btn-tenant"
              disabled={claiming}
              onClick={() => void claimIt()}
              style={{ minWidth: 180 }}
            >
              <Icon name="check" size={15} /> {claiming ? t("claiming") : t("iHavePaid")}
            </button>
          </div>
        </div>
      )}

      <p className="body-sm" style={{ marginTop: 16, color: "var(--omnic-gray-500)" }}>
        {t("verifiedNote")}{" "}
        {t("noOnlinePayment")}
        {tenant?.supportEmail ? (
          <> <a className="link" href={`mailto:${tenant.supportEmail}`}>{tenant.supportEmail}</a></>
        ) : null}
      </p>
    </div>
  );
}