"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpensesTab, FinanceOverview, MoneyLedgerTab, PayrollTab } from "@/components/billing/FinanceTabs";
import { BillingOperations } from "@/components/billing/BillingOperations";

export default function BillingPage() {
  const t = useTranslations("adminBilling");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="h1" style={{ margin: 0 }}>{t("billingPageTitle")}</h1>
        <div className="body" style={{ marginTop: 4 }}>{t("billingPageSubtitle")}</div>
      </div>

      <Tabs defaultValue="commercial">
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
