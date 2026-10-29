"use client";

import { useTranslations } from "next-intl";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpensesTab, FinanceOverview, MoneyLedgerTab, PayrollTab } from "@/components/billing/FinanceTabs";
import { AdminMoneyTool } from "@/components/billing/AdminMoneyTool";
import { DiscountCodes } from "@/components/billing/DiscountCodes";
import { PackEditor } from "@/components/billing/PackEditor";

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
        <TabsList className="max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:!h-auto max-sm:[&>button]:min-h-9 max-sm:[&>button]:whitespace-normal">
          <TabsTrigger value="commercial" className="max-sm:col-span-2">{t("commercialCatalogueOrders")}</TabsTrigger>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="payroll">{t("payroll")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("expenses")}</TabsTrigger>
          <TabsTrigger value="money">{t("moneyLedger")}</TabsTrigger>
        </TabsList>
        <AdminMoneyTool />
        <TabsContent value="commercial" className="mt-3">
          <DiscountCodes />
          <PackEditor />
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
