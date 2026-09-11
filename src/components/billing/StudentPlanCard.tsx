"use client";

import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";
import { billingOfferState, formatBillingAmount } from "./billingView";

export type StudentBillingOffer = {
  planVersionId: string;
  familyLabel: string;
  planLabel: string;
  lessonCount: number;
  currency: string;
  listPrice: number;
  discountAmount: number;
  netPrice: number;
  discountName: string | null;
  expiryDays: number;
  benefits: string[];
};

type Props = {
  offer: StudentBillingOffer;
  hasPendingOrder: boolean;
  pendingPlanVersionId?: string | null;
  onChoose: (offer: StudentBillingOffer) => void;
};

export function StudentPlanCard({
  offer,
  hasPendingOrder,
  pendingPlanVersionId,
  onChoose,
}: Props) {
  const t = useTranslations("app.billing");
  const state = billingOfferState(
    hasPendingOrder,
    offer.planVersionId,
    pendingPlanVersionId,
  );

  return (
    <article
      className="card"
      style={{
        minHeight: 360,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: state.disabled && !state.selected ? 0.58 : 1,
        borderColor: state.selected ? "var(--brand-purple)" : undefined,
        boxShadow: state.selected ? "0 0 0 1px var(--brand-purple)" : undefined,
      }}
    >
      <div className="body-sm" style={{ fontWeight: 700, color: "var(--brand-purple)" }}>
        {offer.familyLabel}
      </div>
      <h2 className="h3" style={{ margin: 0 }}>{offer.planLabel}</h2>
      <div
        dir="ltr"
        style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 800, color: "var(--brand-purple)", unicodeBidi: "isolate" }}
      >
        {formatBillingAmount(offer.netPrice, offer.currency)}
      </div>
      {offer.discountAmount > 0 && (
        <div className="body-sm" style={{ color: "#15803D" }}>
          {t("discount")} {offer.discountName ? `· ${offer.discountName}` : ""}{" "}
          <span dir="ltr" style={{ textDecoration: "line-through", unicodeBidi: "isolate" }}>
            {formatBillingAmount(offer.listPrice, offer.currency)}
          </span>
        </div>
      )}
      <div className="body-sm">
        {t("packLessons", { count: offer.lessonCount })} · {t("validFor", { days: offer.expiryDays })}
      </div>
      <div style={{ marginTop: 4 }}>
        <div className="body-sm" style={{ fontWeight: 700, marginBottom: 6 }}>{t("benefits")}</div>
        <ul style={{ display: "grid", gap: 6, padding: 0, margin: 0, listStyle: "none" }}>
          {offer.benefits.map((benefit) => (
            <li key={benefit} className="body-sm" style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <Icon name="check" size={14} style={{ color: "#15803D", marginTop: 2, flexShrink: 0 }} />
              <span dir="auto">{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className="btn btn-tenant"
        style={{ marginTop: "auto", width: "100%" }}
        disabled={state.disabled}
        aria-disabled={state.disabled}
        onClick={() => onChoose(offer)}
        title={state.disabled ? t("pendingOrderHint") : undefined}
      >
        {state.selected ? t("requested") : t("request")}
      </button>
    </article>
  );
}
