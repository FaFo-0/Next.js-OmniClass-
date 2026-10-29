"use client";

import { PublicPlanCard } from "./PublicPlanCard";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { useLocale, useTranslations } from "next-intl";
import { packOfferState } from "./billingView";
import type { CataloguePackOffer } from "../../../convex/lib/pricingCatalogue";

export type { CataloguePackOffer as StudentPackOffer };

type Props = {
  offer: CataloguePackOffer;
  hasPendingOrder: boolean;
  disabled?: boolean;
  pendingPackId?: string | null;
  onChoose: (offer: CataloguePackOffer) => void;
};

export function StudentPlanCard({ offer, hasPendingOrder, pendingPackId, onChoose, disabled = false }: Props) {
  const t = useTranslations("app.billing");
  const locale = useLocale();
  const state = packOfferState(hasPendingOrder, offer.packId, pendingPackId);

  const launch = useQuery(api.tenantSettings.getPublicLaunchInfo);

  return (
    <div className="h-full rounded-3xl" title={state.disabled ? t("pendingOrderHint") : undefined} style={state.selected ? { outline: "2px solid var(--brand-purple)", outlineOffset: 3 } : undefined}>
      <PublicPlanCard
        offer={offer}
        locale={locale}
        onChoose={() => onChoose(offer)}
        primaryLabel={state.selected ? t("requested") : t("request")}
        disabled={state.disabled || disabled}
        whatsappUrl={launch?.supportWhatsappUrl}
      />
    </div>
  );
}
