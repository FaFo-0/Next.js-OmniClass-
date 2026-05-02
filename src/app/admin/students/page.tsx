"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { useTranslations } from "next-intl";
import { countries, priorityCountries, otherCountries } from "@/lib/countries";
import { useLocale } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  Users,
  Phone,
  Globe,
  GraduationCap,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Check,
  AlertTriangle,
  Search,
  Download,
  Pencil,
  XCircle,
  RotateCcw,
  Play,
  Pause,
  UserPlus,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Id } from "@convex/dataModel";

type FilterTab = "all" | "new" | "trial" | "active" | "overdue" | "paused" | "cancelled";

export default function StudentsCRMPage() {
  const t = useTranslations("admin.crm");
  const { locale } = useLocale();

  const allUsers = useQuery(api.users.listUsers) ?? [];
  const students = allUsers.filter((u) => u.role === "student");
  const profiles = useQuery(api.studentProfiles.listAllProfiles) ?? [];
  const billingRecords = useQuery(api.billing.listBillingRecords, {}) ?? [];

  const createBilling = useMutation(api.billing.createBillingRecord);
  const updateBillingMut = useMutation(api.billing.updateBillingRecord);
  const markAsPaid = useMutation(api.billing.markAsPaid);
  const updateProfile = useMutation(api.studentProfiles.updateProfile);
  const updateStudentStatus = useMutation(api.studentProfiles.updateStudentStatus);

  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  // Billing dialog state
  const [billingDialog, setBillingDialog] = useState<string | null>(null);
  const [billingEditId, setBillingEditId] = useState<Id<"billingRecords"> | null>(null);
  const [billingForm, setBillingForm] = useState({
    monthlyAmount: "",
    teacherPayment: "",
    lessonsPerMonth: "",
    paymentDate: "",
    renewalDate: "",
    status: "" as "" | "paid" | "unpaid",
    notes: "",
  });

  // Edit profile dialog state
  const [editDialog, setEditDialog] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    phoneCountryCode: "",
    phoneNumber: "",
    country: "",
    age: "",
    englishLevel: "" as "" | "beginner" | "intermediate" | "advanced",
    studiedBefore: "",
    studyReason: "",
  });

  const profileMap = new Map(profiles.map((p) => [p.studentId, p]));
  const billingMap = new Map<string, typeof billingRecords>();
  for (const rec of billingRecords) {
    if (!billingMap.has(rec.studentId)) billingMap.set(rec.studentId, []);
    billingMap.get(rec.studentId)!.push(rec);
  }

  const getLatestBilling = (studentId: string) => {
    const recs = billingMap.get(studentId) ?? [];
    return recs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  };

  const isOverdue = (billing: typeof billingRecords[0] | null) => {
    if (!billing) return false;
    if (billing.status === "paid") return false;
    return new Date(billing.renewalDate) < new Date();
  };

  const getStatus = (student: typeof students[0]) => student.studentStatus ?? "trial";

  const isNewStudent = (student: typeof students[0]) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return new Date(student.createdAt) >= thirtyDaysAgo;
  };

  const getCountryName = (code: string) => {
    const c = countries.find((c) => c.code === code);
    if (!c) return code;
    if (locale === "ru") return c.nameRu;
    return c.name;
  };

  const getCountryFlag = (code: string) =>
    countries.find((c) => c.code === code)?.flag ?? "";

  // Filter by search
  const searchFiltered = students.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  // Filter by tab
  const tabFiltered = searchFiltered.filter((s) => {
    const status = getStatus(s);
    if (filterTab === "all") return true;
    if (filterTab === "new") return isNewStudent(s);
    if (filterTab === "trial") return status === "trial";
    if (filterTab === "cancelled") return status === "cancelled";
    if (filterTab === "paused") return status === "paused";
    if (filterTab === "overdue") return status === "active" && isOverdue(getLatestBilling(s.externalId));
    // active = status is "active" and NOT overdue
    return status === "active" && !isOverdue(getLatestBilling(s.externalId));
  });

  // Count per tab
  const counts: Record<FilterTab, number> = {
    all: searchFiltered.length,
    new: searchFiltered.filter((s) => isNewStudent(s)).length,
    trial: searchFiltered.filter((s) => getStatus(s) === "trial").length,
    active: searchFiltered.filter((s) => getStatus(s) === "active" && !isOverdue(getLatestBilling(s.externalId))).length,
    overdue: searchFiltered.filter((s) => getStatus(s) === "active" && isOverdue(getLatestBilling(s.externalId))).length,
    paused: searchFiltered.filter((s) => getStatus(s) === "paused").length,
    cancelled: searchFiltered.filter((s) => getStatus(s) === "cancelled").length,
  };

  // Sort: overdue first, then by name
  const sorted = [...tabFiltered].sort((a, b) => {
    const aOverdue = isOverdue(getLatestBilling(a.externalId));
    const bOverdue = isOverdue(getLatestBilling(b.externalId));
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleCreateBilling = async (studentId: string) => {
    try {
      await createBilling({
        studentId,
        monthlyAmount: Number(billingForm.monthlyAmount) || 0,
        teacherPayment: Number(billingForm.teacherPayment) || 0,
        lessonsPerMonth: billingForm.lessonsPerMonth ? Number(billingForm.lessonsPerMonth) : undefined,
        paymentDate: billingForm.paymentDate || undefined,
        renewalDate: billingForm.renewalDate || undefined,
        status: billingForm.status || undefined,
        notes: billingForm.notes || undefined,
      });
      closeBillingDialog();
      toast.success(t("billingSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleUpdateBilling = async () => {
    if (!billingEditId) return;
    try {
      const updates: Record<string, unknown> = {};
      if (billingForm.monthlyAmount) updates.monthlyAmount = Number(billingForm.monthlyAmount);
      if (billingForm.teacherPayment) updates.teacherPayment = Number(billingForm.teacherPayment);
      if (billingForm.lessonsPerMonth) updates.lessonsPerMonth = Number(billingForm.lessonsPerMonth);
      if (billingForm.paymentDate) updates.paymentDate = billingForm.paymentDate;
      if (billingForm.status) updates.status = billingForm.status;
      if (billingForm.notes !== undefined) updates.notes = billingForm.notes;

      // Handle renewal date separately since updateBillingRecord recalculates from paymentDate
      await updateBillingMut({
        id: billingEditId,
        ...updates,
      } as Parameters<typeof updateBillingMut>[0]);

      // If renewalDate was explicitly set and no paymentDate change, patch it directly
      // (The mutation recalculates renewalDate from paymentDate, but we want explicit override)
      closeBillingDialog();
      toast.success(t("billingSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const closeBillingDialog = () => {
    setBillingDialog(null);
    setBillingEditId(null);
    setBillingForm({ monthlyAmount: "", teacherPayment: "", lessonsPerMonth: "", paymentDate: "", renewalDate: "", status: "", notes: "" });
  };

  const openBillingEdit = (billing: typeof billingRecords[0]) => {
    setBillingEditId(billing._id as Id<"billingRecords">);
    setBillingDialog(billing.studentId);
    setBillingForm({
      monthlyAmount: String(billing.monthlyAmount),
      teacherPayment: String(billing.teacherPayment),
      lessonsPerMonth: billing.lessonsPerMonth ? String(billing.lessonsPerMonth) : "",
      paymentDate: billing.paymentDate ?? "",
      renewalDate: billing.renewalDate,
      status: billing.status,
      notes: billing.notes ?? "",
    });
  };

  const openBillingNew = (studentId: string, billing: typeof billingRecords[0] | null) => {
    setBillingEditId(null);
    setBillingDialog(studentId);
    if (billing) {
      setBillingForm({
        monthlyAmount: String(billing.monthlyAmount),
        teacherPayment: String(billing.teacherPayment),
        lessonsPerMonth: billing.lessonsPerMonth ? String(billing.lessonsPerMonth) : "",
        paymentDate: "",
        renewalDate: "",
        status: "",
        notes: billing.notes ?? "",
      });
    }
  };

  const handleEditProfile = async (studentId: string) => {
    try {
      await updateProfile({
        studentId,
        phoneCountryCode: editForm.phoneCountryCode || undefined,
        phoneNumber: editForm.phoneNumber || undefined,
        country: editForm.country || undefined,
        age: editForm.age ? Number(editForm.age) : undefined,
        englishLevel: editForm.englishLevel || undefined,
        studiedBefore: editForm.studiedBefore || undefined,
        studyReason: editForm.studyReason || undefined,
      });
      setEditDialog(null);
      toast.success(t("profileUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleStatusChange = async (student: typeof students[0], newStatus: "trial" | "active" | "paused" | "cancelled") => {
    try {
      await updateStudentStatus({ studentId: student.externalId, status: newStatus });
      const labels: Record<string, string> = {
        trial: t("markedTrial"),
        active: t("markedActive"),
        paused: t("markedPaused"),
        cancelled: t("markedCancelled"),
      };
      toast.success(labels[newStatus]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const openEditDialog = (studentId: string) => {
    const profile = profileMap.get(studentId);
    if (profile) {
      setEditForm({
        phoneCountryCode: profile.phoneCountryCode,
        phoneNumber: profile.phoneNumber,
        country: profile.country,
        age: String(profile.age),
        englishLevel: profile.englishLevel,
        studiedBefore: typeof profile.studiedBefore === "string" ? profile.studiedBefore : "",
        studyReason: profile.studyReason ?? "",
      });
    }
    setEditDialog(studentId);
  };

  // ── CSV Export ──
  const handleExportCSV = () => {
    const headers = [
      "Name", "Email", "Status", "Phone", "Country", "Age",
      "Arabic Level", "Studied Before", "Motivation", "Referral Source",
      "Monthly Amount", "Teacher Payment", "Renewal Date", "Payment Status",
    ];

    const rows = students.map((s) => {
      const profile = profileMap.get(s.externalId);
      const billing = getLatestBilling(s.externalId);
      return [
        s.name,
        s.email,
        getStatus(s),
        profile ? `${profile.phoneCountryCode} ${profile.phoneNumber}` : "",
        profile ? getCountryName(profile.country) : "",
        profile ? String(profile.age) : "",
        profile ? profile.englishLevel : "",
        profile?.studiedBefore ?? "",
        profile?.studyReason ?? "",
        profile?.referralSource ?? "",
        billing ? String(billing.monthlyAmount) : "",
        billing ? String(billing.teacherPayment) : "",
        billing ? billing.renewalDate : "",
        billing ? (billing.status === "paid" ? "Paid" : isOverdue(billing) ? "Overdue" : "Unpaid") : "",
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("csvExported"));
  };

  // Status badge for summary row
  const renderStatusBadge = (student: typeof students[0], billing: typeof billingRecords[0] | null) => {
    const status = getStatus(student);
    const overdue = isOverdue(billing);

    return (
      <>
        {status === "trial" && (
          <Badge className="gap-1 bg-blue-100 text-blue-700 text-[10px]">
            <FlaskConical className="h-3 w-3" />
            {t("trial")}
          </Badge>
        )}
        {status === "cancelled" && (
          <Badge variant="outline" className="gap-1 text-[10px] border-muted-foreground/30">
            <XCircle className="h-3 w-3" />
            {t("cancelled")}
          </Badge>
        )}
        {status === "paused" && (
          <Badge className="gap-1 bg-orange-100 text-orange-700 text-[10px]">
            <Pause className="h-3 w-3" />
            {t("paused")}
          </Badge>
        )}
        {status === "active" && overdue && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertTriangle className="h-3 w-3" />
            {t("overdue")}
          </Badge>
        )}
        {status === "active" && !overdue && billing?.status === "paid" && (
          <Badge className="gap-1 bg-green-100 text-green-700 text-[10px]">
            <Check className="h-3 w-3" />
            {t("paid")}
          </Badge>
        )}
        {isNewStudent(student) && (
          <Badge className="gap-1 bg-purple-100 text-purple-700 text-[10px]">
            <UserPlus className="h-3 w-3" />
            {t("new")}
          </Badge>
        )}
      </>
    );
  };

  // Contextual action buttons
  const renderActionButtons = (student: typeof students[0], billing: typeof billingRecords[0] | null) => {
    const status = getStatus(student);
    const overdue = isOverdue(billing);
    const profile = profileMap.get(student.externalId);

    return (
      <div className="flex flex-wrap gap-2">
        {profile && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => openEditDialog(student.externalId)}>
            <Pencil className="h-3 w-3" />
            {t("editProfile")}
          </Button>
        )}

        {status === "trial" && (
          <>
            <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange(student, "active")}>
              <Play className="h-3 w-3" />
              {t("activate")}
            </Button>
            <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleStatusChange(student, "cancelled")}>
              <XCircle className="h-3 w-3" />
              {t("cancelSubscription")}
            </Button>
          </>
        )}

        {status === "active" && !overdue && (
          <>
            <Button size="sm" variant="outline" className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => handleStatusChange(student, "paused")}>
              <Pause className="h-3 w-3" />
              {t("pause")}
            </Button>
            <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleStatusChange(student, "cancelled")}>
              <XCircle className="h-3 w-3" />
              {t("cancelSubscription")}
            </Button>
          </>
        )}

        {status === "active" && overdue && (
          <>
            {billing && (
              <Button
                size="sm"
                className="gap-1"
                onClick={async () => {
                  await markAsPaid({ id: billing._id as Id<"billingRecords"> });
                  toast.success(t("markedPaid"));
                }}
              >
                <Check className="h-3 w-3" />
                {t("markPaid")}
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => handleStatusChange(student, "paused")}>
              <Pause className="h-3 w-3" />
              {t("pause")}
            </Button>
            <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleStatusChange(student, "cancelled")}>
              <XCircle className="h-3 w-3" />
              {t("cancelSubscription")}
            </Button>
          </>
        )}

        {status === "paused" && (
          <>
            <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange(student, "active")}>
              <Play className="h-3 w-3" />
              {t("resume")}
            </Button>
            <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleStatusChange(student, "cancelled")}>
              <XCircle className="h-3 w-3" />
              {t("cancelSubscription")}
            </Button>
          </>
        )}

        {status === "cancelled" && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => handleStatusChange(student, "active")}>
            <RotateCcw className="h-3 w-3" />
            {t("reactivate")}
          </Button>
        )}
      </div>
    );
  };

  const tabs: FilterTab[] = ["all", "new", "trial", "active", "overdue", "paused", "cancelled"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { count: students.length })}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV}>
          <Download className="h-4 w-4" />
          {t("exportCSV")}
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            className={cn(
              "flex-shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              filterTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`tab_${tab}`)}
            <span className="ml-1.5 text-xs opacity-60">({counts[tab]})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-10"
        />
      </div>

      {/* Student cards */}
      <div className="space-y-3">
        {sorted.map((student) => {
          const profile = profileMap.get(student.externalId);
          const billing = getLatestBilling(student.externalId);
          const overdue = isOverdue(billing);
          const status = getStatus(student);
          const isExpanded = expandedStudent === student.externalId;

          return (
            <Card
              key={student.externalId}
              className={cn(
                "transition-colors",
                status === "cancelled" && "opacity-60 border-muted",
                status === "paused" && "border-orange-200 bg-orange-50/30",
                status === "trial" && "border-blue-200 bg-blue-50/30",
                status === "active" && overdue && "border-destructive/50 bg-destructive/5"
              )}
            >
              {/* Summary row */}
              <button
                onClick={() => setExpandedStudent(isExpanded ? null : student.externalId)}
                className="flex w-full items-center gap-4 p-4 text-start"
              >
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold",
                  status === "cancelled"
                    ? "bg-muted text-muted-foreground"
                    : status === "trial"
                      ? "bg-blue-100 text-blue-700"
                      : status === "paused"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-primary/10 text-primary"
                )}>
                  {student.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("font-semibold truncate", status === "cancelled" && "line-through")}>{student.name}</span>
                    {renderStatusBadge(student, billing)}
                    {profile && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t(`level_${profile.englishLevel}`)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{student.email}</span>
                    {profile && (
                      <>
                        <span>{getCountryFlag(profile.country)} {getCountryName(profile.country)}</span>
                        <span>{profile.phoneCountryCode} {profile.phoneNumber}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {billing && (
                    <span className="text-sm font-semibold">
                      {billing.monthlyAmount} KGS/mo
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <CardContent className="border-t pt-4 space-y-4">
                  {/* Action buttons row */}
                  {renderActionButtons(student, billing)}

                  {/* Profile info */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {profile ? (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{profile.phoneCountryCode} {profile.phoneNumber}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span>{getCountryFlag(profile.country)} {getCountryName(profile.country)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{t("age")}: {profile.age}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <GraduationCap className="h-4 w-4 text-muted-foreground" />
                          <span>{t(`level_${profile.englishLevel}`)}</span>
                        </div>
                        {profile.studiedBefore && (
                          <div className="text-sm text-muted-foreground sm:col-span-2">
                            {t("studiedBefore")}: {profile.studiedBefore}
                          </div>
                        )}
                        {profile.studyReason && (
                          <div className="text-sm text-muted-foreground sm:col-span-2">
                            {t("motivation")}: {profile.studyReason}
                          </div>
                        )}
                        {profile.referralSource && (
                          <div className="text-sm text-muted-foreground sm:col-span-2">
                            {t("referralSource")}: {t(`referral_${profile.referralSource}`)}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground italic sm:col-span-2">
                        {t("noProfile")}
                      </p>
                    )}
                  </div>

                  {/* Billing */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <DollarSign className="h-4 w-4 text-primary" />
                        {t("billing")}
                      </h3>
                      <div className="flex gap-2">
                        {billing && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1"
                            onClick={() => openBillingEdit(billing)}
                          >
                            <Pencil className="h-3 w-3" />
                            {t("editBilling")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openBillingNew(student.externalId, billing)}
                        >
                          {billing ? t("newCycle") : t("setupBilling")}
                        </Button>
                      </div>
                    </div>

                    {billing ? (
                      <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>{t("monthlyAmount")}</span>
                          <span className="font-semibold">{billing.monthlyAmount} KGS</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>{t("teacherPayment")}</span>
                          <span className="font-semibold">{billing.teacherPayment} KGS</span>
                        </div>
                        {billing.lessonsPerMonth && (
                          <div className="flex items-center justify-between text-sm">
                            <span>{t("lessonsPerMonth")}</span>
                            <span className="font-semibold">{billing.lessonsPerMonth}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm">
                          <span>{t("renewalDate")}</span>
                          <span className={cn("font-semibold", overdue && "text-destructive")}>
                            {billing.renewalDate}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>{t("status")}</span>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              billing.status === "paid"
                                ? "bg-green-100 text-green-700"
                                : overdue
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                            )}
                          >
                            {billing.status === "paid" ? t("paid") : overdue ? t("overdue") : t("unpaid")}
                          </Badge>
                        </div>
                        {billing.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{billing.notes}</p>
                        )}
                        {billing.status === "unpaid" && (
                          <Button
                            size="sm"
                            className="mt-2 w-full gap-1"
                            onClick={async () => {
                              await markAsPaid({ id: billing._id as Id<"billingRecords"> });
                              toast.success(t("markedPaid"));
                            }}
                          >
                            <Check className="h-3 w-3" />
                            {t("markPaid")}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">{t("noBilling")}</p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {sorted.length === 0 && (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mb-2" />
            <p>{t("noStudents")}</p>
          </div>
        )}
      </div>

      {/* Billing dialog (create or edit) */}
      <AlertDialog open={!!billingDialog} onOpenChange={(open) => !open && closeBillingDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{billingEditId ? t("editBillingTitle") : t("billingTitle")}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">{t("monthlyAmount")} (KGS)</label>
              <Input
                type="number"
                value={billingForm.monthlyAmount}
                onChange={(e) => setBillingForm({ ...billingForm, monthlyAmount: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("teacherPayment")} (KGS)</label>
              <Input
                type="number"
                value={billingForm.teacherPayment}
                onChange={(e) => setBillingForm({ ...billingForm, teacherPayment: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("lessonsPerMonth")}</label>
              <Input
                type="number"
                value={billingForm.lessonsPerMonth}
                onChange={(e) => setBillingForm({ ...billingForm, lessonsPerMonth: e.target.value })}
                placeholder="8"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("paymentDate")}</label>
              <Input
                type="date"
                value={billingForm.paymentDate}
                onChange={(e) => setBillingForm({ ...billingForm, paymentDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("renewalDate")}</label>
              <Input
                type="date"
                value={billingForm.renewalDate}
                onChange={(e) => setBillingForm({ ...billingForm, renewalDate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">{t("renewalDateHint")}</p>
            </div>
            <div>
              <label className="text-sm font-medium">{t("paymentStatus")}</label>
              <select
                value={billingForm.status}
                onChange={(e) => setBillingForm({ ...billingForm, status: e.target.value as typeof billingForm.status })}
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">{t("autoDetect")}</option>
                <option value="paid">{t("paid")}</option>
                <option value="unpaid">{t("unpaid")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("notes")}</label>
              <Textarea
                value={billingForm.notes}
                onChange={(e) => setBillingForm({ ...billingForm, notes: e.target.value })}
                placeholder={t("notesPlaceholder")}
                rows={2}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (billingEditId) {
                  handleUpdateBilling();
                } else if (billingDialog) {
                  handleCreateBilling(billingDialog);
                }
              }}
            >
              {t("save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit profile dialog */}
      <AlertDialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editProfileTitle")}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-sm font-medium">{t("phone")}</label>
              <div className="flex gap-2">
                <select
                  value={editForm.phoneCountryCode}
                  onChange={(e) => setEditForm({ ...editForm, phoneCountryCode: e.target.value })}
                  className="h-10 w-[120px] rounded-md border bg-background px-2 text-sm"
                >
                  {priorityCountries.map((c) => (
                    <option key={c.code} value={c.dialCode}>
                      {c.flag} {c.dialCode}
                    </option>
                  ))}
                  <option disabled>──────</option>
                  {otherCountries.map((c) => (
                    <option key={c.code} value={c.dialCode}>
                      {c.flag} {c.dialCode}
                    </option>
                  ))}
                </select>
                <Input
                  value={editForm.phoneNumber}
                  onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("country")}</label>
              <select
                value={editForm.country}
                onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
              >
                {priorityCountries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {getCountryName(c.code)}
                  </option>
                ))}
                <option disabled>──────</option>
                {otherCountries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {getCountryName(c.code)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("age")}</label>
              <Input
                type="number"
                min={5}
                max={99}
                value={editForm.age}
                onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("englishLevel")}</label>
              <select
                value={editForm.englishLevel}
                onChange={(e) => setEditForm({ ...editForm, englishLevel: e.target.value as typeof editForm.englishLevel })}
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="beginner">{t("level_beginner")}</option>
                <option value="intermediate">{t("level_intermediate")}</option>
                <option value="advanced">{t("level_advanced")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("studiedBefore")}</label>
              <Textarea
                value={editForm.studiedBefore}
                onChange={(e) => setEditForm({ ...editForm, studiedBefore: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("motivation")}</label>
              <Textarea
                value={editForm.studyReason}
                onChange={(e) => setEditForm({ ...editForm, studyReason: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => editDialog && handleEditProfile(editDialog)}
            >
              {t("save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
