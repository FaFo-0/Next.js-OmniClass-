"use client";

import { MoneyEquivalent } from "./MoneyEquivalent";

import { Icon } from "@/components/shared/icons";
import { useLocale, useTranslations } from "next-intl";
import { packOfferState, formatBillingAmount } from "./billingView";
import type { CataloguePackOffer } from "../../../convex/lib/pricingCatalogue";

export type { CataloguePackOffer as StudentPackOffer };

type Props = {
  offer: CataloguePackOffer;
  hasPendingOrder: boolean;
  pendingPackId?: string | null;
  onChoose: (offer: CataloguePackOffer) => void;
};

export function StudentPlanCard({ offer, hasPendingOrder, pendingPackId, onChoose }: Props) {
  const t = useTranslations("app.billing");
  const locale = useLocale();
  const state = packOfferState(hasPendingOrder, offer.packId, pendingPackId);

  return (
    <article
      className="card"
      style={{
        minHeight: 320,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: state.disabled && !state.selected ? 0.58 : 1,
        borderColor: state.selected ? "var(--brand-purple)" : undefined,
        boxShadow: state.selected ? "0 0 0 1px var(--brand-purple)" : undefined,
      }}
    >
      <div className="h3" style={{ marginTop: 8 }}>{offer.name}</div>
      <div className="body-sm">{t("packLessons", { count: offer.lessons })} · {t("validFor", { days: offer.expiryDays })}</div>
      <div>
        <div
          dir="ltr"
          style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 800, color: "var(--brand-purple)", unicodeBidi: "isolate" }}
        >
          {formatBillingAmount(offer.netPrice, offer.currency, locale)}
        </div>
        <MoneyEquivalent amount={offer.netPrice} currency={offer.currency} />
        {offer.onSale && (
          <div className="body-sm" style={{ marginTop: 4, color: "var(--omnic-gray-600)" }}>
            <span dir="ltr" style={{ textDecoration: "line-through", unicodeBidi: "isolate" }}>
              {formatBillingAmount(offer.listPrice, offer.currency, locale)}
            </span>
          </div>
        )}
      </div>
      {offer.benefits.length > 0 && (
        <div>
          <div className="body-sm" style={{ fontWeight: 700, marginBottom: 6 }}>{t("benefits")}</div>
          <ul style={{ display: "grid", gap: 6, padding: 0, margin: 0, listStyle: "none" }}>
            {offer.benefits.map((benefit) => (
              <li key={`${offer.packId}-${benefit}`} className="body-sm" style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <Icon name="check" size={14} style={{ color: "#15803D", marginTop: 2, flexShrink: 0 }} />
                <span dir="auto">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
