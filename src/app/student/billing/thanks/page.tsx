"use client";

// Where Lemon Squeezy sends the student after checkout.
//
// This page grants nothing and confirms nothing on its own — the webhook is
// the source of truth (convex/payments.ts). It watches for the fulfilment to
// land and says so honestly while it hasn't: the student is usually back here
// a second or two before the gateway has called us, and "payment complete"
// over a balance that hasn't moved is the worst thing this screen could say.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useTranslations } from "next-intl";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

/** After this long without a webhook, stop implying it's imminent. */
const SLOW_AFTER_MS = 45_000;

export default function CheckoutThanksPage() {
  const t = useTranslations("app.billing");
  const purchase = useQuery(api.payments.myRecentPurchase, {});
  const balance = useQuery(api.points.getBalance, {});
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const done = !!purchase;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: done
              ? "var(--brand-purple-tint)"
              : "var(--omnic-gray-50)",
            border: done ? "none" : "3px solid var(--omnic-gray-200)",
            borderTopColor: done ? undefined : "var(--brand-purple)",
            animation: done ? undefined : "spin 0.9s linear infinite",
          }}
        >
          {done && (
            <Icon name="check" size={26} stroke="var(--brand-purple)" />
          )}
        </div>

        <div className="h2" style={{ marginBottom: 8 }}>{t("thanksTitle")}</div>

        <p className="body" style={{ marginBottom: 20 }}>
          {done
            ? t("thanksDone", {
                count: purchase?.lessons ?? balance?.balance ?? 0,
              })
            : slow
              ? t("thanksSlow")
              : t("thanksWaiting")}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="btn btn-secondary" href="/student/billing">
            {t("backToLessons")}
          </Link>
          {done && (
            <Link className="btn btn-tenant" href="/student/calendar">
              <Icon name="calendar" size={14} /> {t("bookALesson")}
            </Link>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
