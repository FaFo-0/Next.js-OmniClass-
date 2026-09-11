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
import { useTranslations } from "next-intl";
import { formatBillingAmount } from "./billingView";
import type { StudentBillingOffer } from "./StudentPlanCard";

type Preview = {
  planSnapshot: {
    familyLabel: string;
    planLabel: string;
    lessonCount: number;
    expiryDays: number;
  };
  priceSnapshot: {
    listAmount: number;
    discountAmount: number;
    netAmount: number;
    currency: string;
  };
  discountSnapshot?: { name: string; amount: number } | null;
};

type Props = {
  offer: StudentBillingOffer | null;
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
  if (!offer) return null;
  const price = preview?.priceSnapshot;
  const familyLabel = preview?.planSnapshot.familyLabel ?? offer.familyLabel;
  const planLabel = preview?.planSnapshot.planLabel ?? offer.planLabel;
  const lessons = preview?.planSnapshot.lessonCount ?? offer.lessonCount;
  const currency = price?.currency ?? offer.currency;
  const listAmount = price?.listAmount ?? offer.listPrice;
  const netAmount = price?.netAmount ?? offer.listPrice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("confirmTitle")}</DialogTitle>
          <DialogDescription>{t("confirmHint")}</DialogDescription>
        </DialogHeader>
        <div className="card" style={{ padding: 16, background: "var(--brand-purple-tint)" }}>
          <div className="body-sm">{familyLabel}</div>
          <div className="h3" style={{ marginTop: 4 }}>{planLabel}</div>
          <div className="body-sm" style={{ marginTop: 5 }}>{t("packLessons", { count: lessons })}</div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span className="body-sm">{t("listPrice")}</span>
            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{formatBillingAmount(listAmount, currency)}</span>
          </div>
          {price && price.discountAmount > 0 && preview?.discountSnapshot && (
            <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", gap: 12, color: "#15803D" }}>
              <span className="body-sm">{t("discount")} · {preview.discountSnapshot.name}</span>
              <span dir="ltr" style={{ unicodeBidi: "isolate" }}>−{formatBillingAmount(price.discountAmount, currency)}</span>
            </div>
          )}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid color-mix(in srgb, currentColor 15%, transparent)", display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 800 }}>
            <span>{t("youPay")}</span>
            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{formatBillingAmount(netAmount, currency)}</span>
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
