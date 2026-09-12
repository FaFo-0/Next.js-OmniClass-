"use client";

import { useTranslations } from "next-intl";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpensesTab, FinanceOverview, MoneyLedgerTab, PayrollTab } from "@/components/billing/FinanceTabs";
import { BillingOperations } from "@/components/billing/BillingOperations";

export default function BillingPage() {
  const t = useTranslations("adminBilling");
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab");
  const activeTab = tab === "overview" || tab === "payroll" || tab === "expenses" || tab === "money" ? tab : "commercial";
  const setActiveTab = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", value);
    if (value !== "commercial") next.delete("order");
    router.replace(`/admin/billing?${next.toString()}`, { scroll: false });
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="h1" style={{ margin: 0 }}>{t("billingPageTitle")}</h1>
        <div className="body" style={{ marginTop: 4 }}>{t("billingPageSubtitle")}</div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="commercial">{t("commercialCatalogueOrders")}</TabsTrigger>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="payroll">{t("payroll")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("expenses")}</TabsTrigger>
          <TabsTrigger value="money">{t("moneyLedger")}</TabsTrigger>
        </TabsList>
        <TabsContent value="commercial" className="mt-3">
          <BillingOperations />
        </TabsContent>
        <TabsContent value="overview" className="mt-3">
          <FinanceOverview />
        </TabsContent>
        <TabsContent value="payroll" className="mt-3">
          <PayrollTab />
        </TabsContent>
        <TabsContent value="expenses" className="mt-3">
          <ExpensesTab />
        </TabsContent>
        <TabsContent value="money" className="mt-3">
          <MoneyLedgerTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
