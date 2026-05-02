"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DollarSign,
  TrendingUp,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Pause,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Id } from "@convex/dataModel";

type ExpenseCategory = "ads" | "subscriptions" | "salary" | "trial_lessons" | "other";
type ViewMode = "month" | "year" | "custom" | "all";

export default function AnalyticsPage() {
  const t = useTranslations("admin.analytics");

  // Date range state
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<"KGS" | "USD">("KGS");

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth(); // 0-indexed

  // Calculate date range based on view mode
  const { startDate, endDate, rangeLabel } = useMemo(() => {
    if (viewMode === "all") {
      return { startDate: undefined, endDate: undefined, rangeLabel: t("allTime") };
    }
    if (viewMode === "year") {
      return {
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        rangeLabel: String(year),
      };
    }
    if (viewMode === "custom") {
      const start = customStart;
      const end = customEnd;
      return { startDate: start, endDate: end, rangeLabel: `${start} — ${end}` };
    }
    // month
    const s = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const e = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const label = selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return { startDate: s, endDate: e, rangeLabel: label };
  }, [viewMode, year, month, customStart, customEnd, selectedDate, t]);

  const prevPeriod = () => {
    const d = new Date(selectedDate);
    if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "year") d.setFullYear(d.getFullYear() - 1);
    setSelectedDate(d);
  };

  const nextPeriod = () => {
    const d = new Date(selectedDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else if (viewMode === "year") d.setFullYear(d.getFullYear() + 1);
    setSelectedDate(d);
  };

  // Data queries
  const allUsers = useQuery(api.users.listUsers) ?? [];
  const students = allUsers.filter((u) => u.role === "student");
  const profiles = useQuery(api.studentProfiles.listAllProfiles) ?? [];
  const billingRecords = useQuery(api.billing.listBillingRecords, {}) ?? [];
  const expenseArgs = viewMode === "all" ? {} : { startDate, endDate };
  const expenses = useQuery(api.expenses.listExpenses, expenseArgs) ?? [];
  const exchangeRate = useQuery(api.exchangeRates.getRate, { fromCurrency: "KGS", toCurrency: "USD" });

  const createExpenseMut = useMutation(api.expenses.createExpense);
  const updateExpenseMut = useMutation(api.expenses.updateExpense);
  const deleteExpenseMut = useMutation(api.expenses.deleteExpense);
  const setRateMut = useMutation(api.exchangeRates.setRate);
  const fetchRateAction = useAction(api.exchangeRates.fetchAndSaveRate);

  // Expense dialog state
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [expenseEditId, setExpenseEditId] = useState<Id<"expenses"> | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    category: "ads" as ExpenseCategory,
    amount: "",
    date: "",
    note: "",
  });

  // Exchange rate dialog state
  const [rateDialog, setRateDialog] = useState(false);
  const [rateInput, setRateInput] = useState("");

  const rate = exchangeRate?.rate ?? 87; // default fallback

  const convert = (amountKGS: number): number => {
    if (currency === "KGS") return amountKGS;
    return Math.round((amountKGS / rate) * 100) / 100;
  };

  const formatAmount = (amountKGS: number): string => {
    const val = convert(amountKGS);
    if (currency === "USD") return `$${val.toLocaleString()}`;
    return `${val.toLocaleString()} KGS`;
  };

  // ── Compute metrics ──

  const profileMap = new Map(profiles.map((p) => [p.studentId, p]));

  // Helper: check if a date string falls within the selected range
  const inRange = (dateStr: string) => {
    if (!startDate || !endDate) return true; // "all" mode
    return dateStr >= startDate && dateStr <= endDate;
  };

  // Billing records in the selected period (by renewalDate or paymentDate)
  const periodBillingRecords = useMemo(() => {
    if (!startDate || !endDate) return billingRecords; // all time
    return billingRecords.filter((b) => {
      if (b.paymentDate && inRange(b.paymentDate)) return true;
      if (inRange(b.renewalDate)) return true;
      return false;
    });
  }, [billingRecords, startDate, endDate]);

  // Revenue: sum of paid billing records in this period
  const revenue = useMemo(() => {
    return periodBillingRecords
      .filter((b) => b.status === "paid" && b.paymentDate && inRange(b.paymentDate))
      .reduce((sum, b) => sum + b.monthlyAmount, 0);
  }, [periodBillingRecords, startDate, endDate]);

  // Teacher payments from billing
  const teacherPaymentsFromBilling = useMemo(() => {
    return periodBillingRecords
      .filter((b) => b.status === "paid" && b.paymentDate && inRange(b.paymentDate))
      .reduce((sum, b) => sum + b.teacherPayment, 0);
  }, [periodBillingRecords, startDate, endDate]);

  // Expense totals by category
  const expenseTotals = useMemo(() => {
    const totals: Record<ExpenseCategory, number> = { ads: 0, subscriptions: 0, salary: 0, trial_lessons: 0, other: 0 };
    for (const e of expenses) {
      totals[e.category as ExpenseCategory] += e.amount;
    }
    return totals;
  }, [expenses]);

  const totalExpenses = expenseTotals.ads + expenseTotals.subscriptions + expenseTotals.salary + expenseTotals.trial_lessons + expenseTotals.other;
  const teacherPaymentsTotal = teacherPaymentsFromBilling + expenseTotals.salary;
  const netProfit = revenue - totalExpenses - teacherPaymentsFromBilling;

  // Student metrics
  const newStudents = useMemo(() => {
    if (!startDate || !endDate) return students; // all time = all students are "new"
    return students.filter((s) => {
      const created = s.createdAt.slice(0, 10);
      return created >= startDate && created <= endDate;
    });
  }, [students, startDate, endDate]);

  const newFromAds = useMemo(() => {
    return newStudents.filter((s) => {
      const profile = profileMap.get(s.externalId);
      return profile?.referralSource === "instagram" || profile?.referralSource === "telegram" || profile?.referralSource === "facebook";
    });
  }, [newStudents, profileMap]);

  const renewedStudents = useMemo(() => {
    // Students who had a paid billing record in this period but are NOT new in this period
    const newIds = new Set(newStudents.map((s) => s.externalId));
    const paidStudentIds = new Set(
      periodBillingRecords
        .filter((b) => b.status === "paid" && b.paymentDate && inRange(b.paymentDate))
        .map((b) => b.studentId)
    );
    return students.filter((s) => paidStudentIds.has(s.externalId) && !newIds.has(s.externalId));
  }, [students, newStudents, periodBillingRecords, startDate, endDate]);

  const stoppedStudents = useMemo(() => {
    return students.filter((s) => s.studentStatus === "cancelled");
  }, [students]);

  const pausedStudents = useMemo(() => {
    return students.filter((s) => s.studentStatus === "paused");
  }, [students]);

  const trialStudents = useMemo(() => {
    return students.filter((s) => s.studentStatus === "trial");
  }, [students]);

  const activeStudents = useMemo(() => {
    return students.filter((s) => s.studentStatus === "active");
  }, [students]);

  const totalStudentsInMonth = newStudents.length + renewedStudents.length;
  const uniqueStudentsTotal = students.length;

  // Trial lessons count and cost
  const trialLessonsCost = expenseTotals.trial_lessons;

  // ── Expense CRUD ──
  const openExpenseNew = () => {
    setExpenseEditId(null);
    setExpenseForm({ category: "ads", amount: "", date: new Date().toISOString().slice(0, 10), note: "" });
    setExpenseDialog(true);
  };

  const openExpenseEdit = (expense: typeof expenses[0]) => {
    setExpenseEditId(expense._id as Id<"expenses">);
    setExpenseForm({
      category: expense.category as ExpenseCategory,
      amount: String(expense.amount),
      date: expense.date,
      note: expense.note ?? "",
    });
    setExpenseDialog(true);
  };

  const handleSaveExpense = async () => {
    try {
      if (expenseEditId) {
        await updateExpenseMut({
          id: expenseEditId,
          category: expenseForm.category,
          amount: Number(expenseForm.amount) || 0,
          date: expenseForm.date,
          note: expenseForm.note || undefined,
        });
      } else {
        await createExpenseMut({
          category: expenseForm.category,
          amount: Number(expenseForm.amount) || 0,
          date: expenseForm.date,
          note: expenseForm.note || undefined,
        });
      }
      setExpenseDialog(false);
      toast.success(t("expenseSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDeleteExpense = async (id: Id<"expenses">) => {
    try {
      await deleteExpenseMut({ id });
      toast.success(t("expenseDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleFetchRate = async () => {
    try {
      const result = await fetchRateAction({});
      if (result.success) {
        toast.success(t("rateFetched", { rate: result.rate }));
      } else {
        toast.error(result.error ?? "Failed to fetch rate");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleSetRate = async () => {
    try {
      await setRateMut({
        fromCurrency: "KGS",
        toCurrency: "USD",
        rate: Number(rateInput) || 0,
        isManual: true,
      });
      setRateDialog(false);
      toast.success(t("rateUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  // ── CSV Export ──
  const handleExportCSV = () => {
    const headers = [
      "Metric", "Value", "Currency",
    ];

    const rows = [
      ["Total Revenue", String(convert(revenue)), currency],
      ["Ad Spend", String(convert(expenseTotals.ads)), currency],
      ["App Subscriptions", String(convert(expenseTotals.subscriptions)), currency],
      ["Teacher & Employee Payments", String(convert(teacherPaymentsTotal)), currency],
      ["Trial Lessons Cost", String(convert(trialLessonsCost)), currency],
      ["Other Expenses", String(convert(expenseTotals.other)), currency],
      ["Net Profit", String(convert(netProfit)), currency],
      ["---", "", ""],
      ["Total Students (month)", String(totalStudentsInMonth), ""],
      ["Active Students", String(activeStudents.length), ""],
      ["New Students", String(newStudents.length), ""],
      ["New from Ads", String(newFromAds.length), ""],
      ["Renewed Subscriptions", String(renewedStudents.length), ""],
      ["Stopped Students", String(stoppedStudents.length), ""],
      ["Paused Students", String(pausedStudents.length), ""],
      ["Trial Students", String(trialStudents.length), ""],
      ["Unique Students (all-time)", String(uniqueStudentsTotal), ""],
    ];

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics_${startDate ?? "all"}_${endDate ?? "time"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("csvExported"));
  };

  const categoryLabels: Record<ExpenseCategory, string> = {
    ads: t("cat_ads"),
    subscriptions: t("cat_subscriptions"),
    salary: t("cat_salary"),
    trial_lessons: t("cat_trialLessons"),
    other: t("cat_other"),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV}>
          <Download className="h-4 w-4" />
          {t("exportCSV")}
        </Button>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(["month", "year", "custom", "all"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              viewMode === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`view_${mode}`)}
          </button>
        ))}
      </div>

      {/* Date navigation + currency toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {(viewMode === "month" || viewMode === "year") && (
            <>
              <Button variant="outline" size="icon" onClick={prevPeriod}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-semibold min-w-[180px] text-center">{rangeLabel}</span>
              <Button variant="outline" size="icon" onClick={nextPeriod}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          {viewMode === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-[160px]"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-[160px]"
              />
            </div>
          )}
          {viewMode === "all" && (
            <span className="text-lg font-semibold">{t("allTime")}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={currency === "KGS" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrency("KGS")}
          >
            KGS
          </Button>
          <Button
            variant={currency === "USD" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrency("USD")}
          >
            USD
          </Button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeftRight className="h-3 w-3" />
            <span>1 USD = {rate} KGS</span>
            <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => { setRateInput(String(rate)); setRateDialog(true); }}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-1" onClick={handleFetchRate}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Financial summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("totalRevenue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatAmount(revenue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("adSpend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{formatAmount(expenseTotals.ads)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("otherExpenses")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {formatAmount(expenseTotals.subscriptions + expenseTotals.other)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("teacherPayments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{formatAmount(teacherPaymentsTotal)}</div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("netProfit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", netProfit >= 0 ? "text-green-700" : "text-red-700")}>
              {formatAmount(netProfit)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Student metrics cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("totalStudentsMonth")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudentsInMonth}</div>
            <p className="text-xs text-muted-foreground">{t("newPlusRenewed")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              {t("activeStudents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeStudents.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              {t("newStudents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{newStudents.length}</div>
            <p className="text-xs text-muted-foreground">
              {t("fromAds", { count: newFromAds.length })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t("renewedSubscriptions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{renewedStudents.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserX className="h-4 w-4" />
              {t("stoppedStudents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stoppedStudents.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Pause className="h-4 w-4" />
              {t("pausedStudents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{pausedStudents.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              {t("trialStudents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{trialStudents.length}</div>
            <p className="text-xs text-muted-foreground">
              {t("trialCost")}: {formatAmount(trialLessonsCost)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("uniqueStudents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueStudentsTotal}</div>
            <p className="text-xs text-muted-foreground">{t("allTime")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t("expenses")}</h2>
          <Button size="sm" className="gap-1" onClick={openExpenseNew}>
            <Plus className="h-4 w-4" />
            {t("addExpense")}
          </Button>
        </div>

        {expenses.length > 0 ? (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-start font-medium">{t("date")}</th>
                  <th className="px-4 py-2 text-start font-medium">{t("category")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("amount")}</th>
                  <th className="px-4 py-2 text-start font-medium">{t("note")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense._id} className="border-b last:border-0">
                    <td className="px-4 py-2">{expense.date}</td>
                    <td className="px-4 py-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {categoryLabels[expense.category as ExpenseCategory]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-end font-semibold">{formatAmount(expense.amount)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{expense.note ?? "-"}</td>
                    <td className="px-4 py-2 text-end">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openExpenseEdit(expense)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteExpense(expense._id as Id<"expenses">)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30">
                  <td className="px-4 py-2 font-semibold" colSpan={2}>{t("total")}</td>
                  <td className="px-4 py-2 text-end font-bold">{formatAmount(totalExpenses)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-8 text-muted-foreground">
              <DollarSign className="h-8 w-8 mb-2" />
              <p>{t("noExpenses")}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Expense dialog */}
      <AlertDialog open={expenseDialog} onOpenChange={(open) => !open && setExpenseDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{expenseEditId ? t("editExpense") : t("addExpense")}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">{t("category")}</label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })}
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="ads">{t("cat_ads")}</option>
                <option value="subscriptions">{t("cat_subscriptions")}</option>
                <option value="salary">{t("cat_salary")}</option>
                <option value="trial_lessons">{t("cat_trialLessons")}</option>
                <option value="other">{t("cat_other")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("amount")} (KGS)</label>
              <Input
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("date")}</label>
              <Input
                type="date"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("note")}</label>
              <Textarea
                value={expenseForm.note}
                onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })}
                placeholder={t("notePlaceholder")}
                rows={2}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveExpense}>
              {t("save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exchange rate dialog */}
      <AlertDialog open={rateDialog} onOpenChange={(open) => !open && setRateDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("setExchangeRate")}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">1 USD = ? KGS</label>
              <Input
                type="number"
                step="0.01"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="87.5"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSetRate}>
              {t("save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
