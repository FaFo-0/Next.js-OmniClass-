"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "next-intl";
import { formatBillingAmount } from "./billingView";
import type { CataloguePackOffer } from "../../../convex/lib/pricingCatalogue";

type Preview = {
  offer: CataloguePackOffer;
  priceSnapshot: {
    listAmount: number;
    discountAmount: number;
    netAmount: number;
    currency: string;
  };
};

type Props = {
  offer: CataloguePackOffer | null;
  preview?: Preview;
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function PlanRequestDialog({
  offer,
  preview,
  open,
  submitting,
  onOpenChange,
  onConfirm,
}: Props) {
  const t = useTranslations("app.billing");
  const locale = useLocale();
  if (!offer) return null;
  const price = preview?.priceSnapshot;
  const name = preview?.offer.name ?? offer.name;
  const lessons = preview?.offer.lessons ?? offer.lessons;
  const currency = price?.currency ?? offer.currency;
  const listAmount = price?.listAmount ?? offer.listPrice;
  const netAmount = price?.netAmount ?? offer.netPrice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("confirmTitle")}</DialogTitle>
          <DialogDescription>{t("confirmHint")}</DialogDescription>
        </DialogHeader>
        <div className="card" style={{ padding: 16, background: "var(--brand-purple-tint)" }}>
          <div className="body-sm">{offer.familyLabel}</div>
          <div className="h3" style={{ marginTop: 4 }}>{name}</div>
          <div className="body-sm" style={{ marginTop: 5 }}>{t("packLessons", { count: lessons })}</div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span className="body-sm">{t("listPrice")}</span>
            <span
              dir="ltr"
              style={{
                unicodeBidi: "isolate",
                textDecoration: price && price.discountAmount > 0 ? "line-through" : undefined,
              }}
            >
              {formatBillingAmount(listAmount, currency, locale)}
            </span>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid color-mix(in srgb, currentColor 15%, transparent)", display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 800 }}>
            <span>{t("youPay")}</span>
            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{formatBillingAmount(netAmount, currency, locale)}</span>
          </div>
        </div>
        <p className="body-sm">{t("verifiedNote")}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting || !preview}>
            {submitting ? t("requesting") : t("confirmRequest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
