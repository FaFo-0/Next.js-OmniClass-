"use client";

import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";
import { billingOfferState, formatBillingAmount } from "./billingView";
import { BILLING_SECTIONS, type BillingPresentation, type BillingSection } from "../../../convex/lib/billingCatalogue";

export type StudentBillingOffer = {
  planVersionId: string;
  familyLabel: string;
  familyDescription?: string | null;
  planLabel: string;
  planDescription?: string | null;
  programLabel?: string | null;
  lessonCount: number;
  currency: string;
  listPrice: number;
  discountAmount: number;
  netPrice: number;
  discountName: string | null;
  expiryDays: number;
  benefits: string[];
  featured?: boolean;
  badgeLabel?: string | null;
  ctaLabel?: string | null;
  presentation: BillingPresentation;
};

type Props = {
  offer: StudentBillingOffer;
  hasPendingOrder: boolean;
  pendingPlanVersionId?: string | null;
  onChoose: (offer: StudentBillingOffer) => void;
};

const accentStyles: Record<BillingPresentation["accent"], { border: string; text: string; tint: string }> = {
  purple: { border: "var(--brand-purple)", text: "var(--brand-purple)", tint: "var(--brand-purple-tint)" },
  gold: { border: "#CA8A04", text: "#92400E", tint: "#FFFBEB" },
  blue: { border: "#2563EB", text: "#1D4ED8", tint: "#EFF6FF" },
  green: { border: "#16A34A", text: "#15803D", tint: "#F0FDF4" },
  slate: { border: "#475569", text: "#334155", tint: "#F8FAFC" },
};

export function StudentPlanCard({ offer, hasPendingOrder, pendingPlanVersionId, onChoose }: Props) {
  const t = useTranslations("app.billing");
  const state = billingOfferState(hasPendingOrder, offer.planVersionId, pendingPlanVersionId);
  const presentation = offer.presentation;
  const accent = accentStyles[presentation.accent];
  const sectionOrder = presentation.sectionOrder.length > 0 ? presentation.sectionOrder : BILLING_SECTIONS;
  const sectionVisible = (section: BillingSection) => presentation.sections[section] !== false;

  const section = (name: BillingSection) => {
    if (!sectionVisible(name)) return null;
    if (name === "family") return <div key={name} className="body-sm" style={{ fontWeight: 700, color: accent.text }}>{offer.familyLabel}</div>;
    if (name === "description" && (offer.planDescription || offer.familyDescription || offer.programLabel)) {
      return <div key={name} className="body-sm" style={{ color: "var(--omnic-gray-600)" }}>{offer.programLabel && <strong style={{ display: "block", color: accent.text }}>{offer.programLabel}</strong>}{offer.planDescription ?? offer.familyDescription}</div>;
    }
    if (name === "price") return (
      <div key={name}>
        <div dir="ltr" style={{ fontSize: presentation.variant === "compact" ? 27 : 32, lineHeight: 1.1, fontWeight: 800, color: accent.text, unicodeBidi: "isolate" }}>
          {formatBillingAmount(offer.netPrice, offer.currency)}
        </div>
        {offer.discountAmount > 0 && (
          <div className="body-sm" style={{ color: "#15803D", marginTop: 4 }}>
            {t("discount")} {offer.discountName ? `· ${offer.discountName}` : ""}{" "}
            <span dir="ltr" style={{ textDecoration: "line-through", unicodeBidi: "isolate" }}>{formatBillingAmount(offer.listPrice, offer.currency)}</span>
          </div>
        )}
      </div>
    );
    if (name === "lessons") return <div key={name} className="body-sm">{t("packLessons", { count: offer.lessonCount })}</div>;
    if (name === "expiry") return <div key={name} className="body-sm">{t("validFor", { days: offer.expiryDays })}</div>;
    if (name === "benefits") return (
      <div key={name}>
        <div className="body-sm" style={{ fontWeight: 700, marginBottom: 6 }}>{t("benefits")}</div>
        <ul style={{ display: "grid", gap: 6, padding: 0, margin: 0, listStyle: "none" }}>
          {offer.benefits.map((benefit, index) => (
            <li key={`${offer.planVersionId}-benefit-${index}`} className="body-sm" style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <Icon name="check" size={14} style={{ color: "#15803D", marginTop: 2, flexShrink: 0 }} />
              <span dir="auto">{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
    );
    if (name === "badge" && (offer.badgeLabel || offer.featured)) return (
      <div key={name} className="pill" style={{ alignSelf: "flex-start", background: accent.tint, color: accent.text, fontWeight: 700 }}>
        {offer.badgeLabel ?? t("featured")}
      </div>
    );
    return null;
  };

  return (
    <article
      className="card"
      style={{
        minHeight: presentation.variant === "compact" ? 300 : 360,
        padding: presentation.variant === "compact" ? 18 : 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: state.disabled && !state.selected ? 0.58 : 1,
        borderColor: state.selected || presentation.featured ? accent.border : undefined,
        boxShadow: state.selected ? `0 0 0 1px ${accent.border}` : undefined,
        background: presentation.variant === "featured" ? accent.tint : undefined,
      }}
    >
      <div className="h3" style={{ marginTop: 8 }}>{offer.planLabel}</div>
      {sectionOrder.map(section)}
      <button
        type="button"
        className="btn btn-tenant"
        style={{ marginTop: "auto", width: "100%", background: accent.border }}
        disabled={state.disabled}
        aria-disabled={state.disabled}
        onClick={() => onChoose(offer)}
        title={state.disabled ? t("pendingOrderHint") : undefined}
      >
        {state.selected ? t("requested") : offer.ctaLabel ?? t("request")}
      </button>
    </article>
  );
}
