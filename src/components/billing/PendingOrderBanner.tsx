"use client";

import { Icon } from "@/components/shared/icons";
import { useTranslations } from "next-intl";
import { formatBillingAmount, orderStatusKey } from "./billingView";

type Order = {
  status: "pending_verification" | "granted" | "rejected" | "cancelled";
  planSnapshot: {
    familyLabel: string;
    planLabel: string;
    lessonCount: number;
  };
  priceSnapshot: { netAmount: number; currency: string };
  rejectionReason?: string | null;
};

type Props = { order: Order };

export function PendingOrderBanner({ order }: Props) {
  const t = useTranslations("app.billing");
  const pending = order.status === "pending_verification";
  const rejected = order.status === "rejected";
  const title = pending
    ? t("pendingOrderTitle")
    : rejected
      ? t("orderRejected")
      : t(orderStatusKey(order.status));
  const hint = pending
    ? t("pendingOrderHint")
    : rejected
      ? t("orderRejectedHint", { reason: order.rejectionReason ?? "—" })
      : t(orderStatusKey(order.status));

  return (
    <section
      className="card"
      aria-live="polite"
      style={{
        padding: 18,
        marginBottom: 20,
        borderColor: pending ? "#F59E0B" : rejected ? "var(--omnic-red)" : "var(--status-active)",
        background: pending ? "var(--brand-yellow-soft)" : rejected ? "var(--omnic-red-tint)" : "var(--status-active-bg)",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon
          name={pending ? "clock" : rejected ? "alert" : "check"}
          size={17}
          style={{ marginTop: 2, color: pending ? "var(--feedback-warning)" : rejected ? "var(--feedback-error)" : "var(--feedback-success)" }}
        />
        <div>
          <div className="body" style={{ fontWeight: 700 }}>{title}</div>
          <p className="body-sm" style={{ marginTop: 3 }}>{hint}</p>
          <div className="body-sm" style={{ marginTop: 7, fontWeight: 600 }}>
            {order.planSnapshot.familyLabel} · {order.planSnapshot.planLabel} · {t("packLessons", { count: order.planSnapshot.lessonCount })}
            {" · "}
            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
              {formatBillingAmount(order.priceSnapshot.netAmount, order.priceSnapshot.currency)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
