"use client";

/* The commercial billing editor is mounted from /admin/billing. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useSearchParams } from "next/navigation";
import { api } from "@convex";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Labels = { default: string; en: string; ru: string; ar: string; kk: string };
const EMPTY_LABELS = (): Labels => ({ default: "", en: "", ru: "", ar: "", kk: "" });
const LOCALES = ["default", "en", "ru", "ar", "kk"] as const;
type BenefitRow = { sortOrder: string; labels: Labels };
type SectionKey = "family" | "description" | "price" | "lessons" | "expiry" | "benefits" | "badge";
type VersionForm = {
  id?: string;
  planId: string;
  familyId: string;
  programLabel: Labels;
  lessonCount: string;
  currency: string;
  listPrice: string;
  expiryDays: string;
  sortOrder: string;
  visibility: "visible" | "hidden";
  publicationScope: "new_clients_only" | "replace_for_everyone";
  variant: "standard" | "compact" | "featured";
  accent: "purple" | "gold" | "blue" | "green" | "slate";
  featured: boolean;
  badge: Labels;
  ctaLabel: Labels;
  sectionOrder: string;
  sections: Record<SectionKey, boolean>;
};

const emptyVersion = (planId = "", familyId = ""): VersionForm => ({
  planId,
  familyId,
  programLabel: EMPTY_LABELS(),
  lessonCount: "4",
  currency: "KZT",
  listPrice: "15000",
  expiryDays: "60",
  sortOrder: "0",
  visibility: "visible",
  publicationScope: "replace_for_everyone",
  variant: "standard",
  accent: "purple",
  featured: false,
  badge: EMPTY_LABELS(),
  ctaLabel: EMPTY_LABELS(),
  sectionOrder: "family,description,price,lessons,expiry,benefits,badge",
  sections: { family: true, description: true, price: true, lessons: true, expiry: true, benefits: true, badge: true },
});

function labelsFrom(value: any): Labels {
  const source = value ?? {};
  return { default: source.default ?? "", en: source.en ?? "", ru: source.ru ?? "", ar: source.ar ?? "", kk: source.kk ?? "" };
}

function labelsPayload(value: Labels) {
  return { default: value.default.trim(), en: value.en.trim() || undefined, ru: value.ru.trim() || undefined, ar: value.ar.trim() || undefined, kk: value.kk.trim() || undefined };
}

function LocaleInputs({ label, value, onChange }: { label: string; value: Labels; onChange: (next: Labels) => void }) {
  return (
    <div>
      <div className="text-sm font-medium" style={{ marginBottom: 5 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 6 }}>
        {LOCALES.map((locale) => (
          <Input key={locale} aria-label={`${label} ${locale}`} placeholder={locale === "default" ? "Default" : locale.toUpperCase()} value={value[locale]} onChange={(event) => onChange({ ...value, [locale]: event.target.value })} />
        ))}
      </div>
    </div>
  );
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

function dateTimeValue(iso?: string) {
  return iso ? iso.slice(0, 16) : "";
}

function QueueOrder({ order, selected, onGrant, onReject, rejecting, rejectReason, setRejectReason, onConfirmReject, t }: any) {
  const snapshot = order.discountSnapshot;
  return (
    <article id={`billing-order-${order.orderId}`} className="card" style={{ padding: 16, borderColor: selected ? "var(--brand-purple)" : order.status === "pending_verification" ? "#F59E0B" : "var(--omnic-gray-200)", boxShadow: selected ? "0 0 0 2px color-mix(in srgb, var(--brand-purple) 25%, transparent)" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 260, flex: "1 1 420px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><strong>{order.buyerName}</strong><span className="body-sm">{order.buyerStudentId}</span></div>
          <div className="body-sm" style={{ marginTop: 6 }}>{order.planSnapshot.familyLabel} · {order.planSnapshot.planLabel}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("lessonEntitlement")}: {order.planSnapshot.lessonCount} · {t("expiryDays")}: {order.planSnapshot.expiryDays}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("requestTime")}: {new Date(order.requestedAt).toLocaleString()}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("status")}: {t(order.status === "pending_verification" ? "statusPending" : order.status === "granted" ? "statusGranted" : order.status === "rejected" ? "statusRejected" : "statusCancelled")}</div>
          {order.rejectionReason && <div className="body-sm" style={{ marginTop: 4, color: "#B91C1C" }}>{t("rejectionReason")}: {order.rejectionReason}</div>}
        </div>
        <div style={{ minWidth: 210, textAlign: "end" }}>
          <div className="body-sm">{t("basePrice")}: {formatAmount(order.priceSnapshot.listAmount, order.priceSnapshot.currency)}</div>
          <div className="body-sm">{t("discountAmount")}: −{formatAmount(order.priceSnapshot.discountAmount, order.priceSnapshot.currency)}</div>
          <strong style={{ display: "block", marginTop: 4 }}>{t("netPrice")}: {formatAmount(order.priceSnapshot.netAmount, order.priceSnapshot.currency)}</strong>
          <div className="body-sm" style={{ marginTop: 3 }}>{t("currency")}: {order.priceSnapshot.currency}</div>
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--omnic-gray-200)" }}>
        <strong className="body-sm">{t("discountSnapshot")}</strong>
        {snapshot ? (
          <div className="body-sm" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 4, marginTop: 5 }}>
            <span>{t("discountId")}: {snapshot.discountId ?? "—"}</span><span>{t("name")}: {snapshot.name}</span><span>{t("kind")}: {snapshot.kind}</span><span>{t("value")}: {snapshot.value}</span><span>{t("discountAmount")}: {formatAmount(snapshot.amount, snapshot.currency ?? order.priceSnapshot.currency)}</span><span>{t("scope")}: {t(snapshot.scope === "all_plans" ? "allPlans" : snapshot.scope === "family" ? "familyScope" : "planScope")}</span><span>{t("eligibility")}: {t(snapshot.eligibility === "new_clients_only" ? "newClientsOnly" : snapshot.eligibility)}</span><span>{t("priority")}: {snapshot.priority}</span><span>{t("validAt")}: {new Date(snapshot.validAt).toLocaleString()}</span>
          </div>
        ) : <div className="body-sm" style={{ marginTop: 5 }}>—</div>}
      </div>
      {order.status === "pending_verification" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button size="sm" onClick={onGrant}>{t("grant")}</Button><Button size="sm" variant="outline" onClick={onReject}>{t("reject")}</Button></div>
          {rejecting && <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}><Textarea rows={2} placeholder={t("reasonShownToStudent")} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /><Button variant="destructive" disabled={rejectReason.trim().length < 5} onClick={onConfirmReject}>{t("confirmReject")}</Button></div>}
        </div>
      )}
    </article>
  );
}

export function BillingOperations() {
  const t = useTranslations("adminBilling");
  const searchParams = useSearchParams();
  const catalogue = useQuery(api.billing.listCatalogue, {}) as any;
  const orders = (useQuery(api.billing.listOrders, {}) ?? []) as any[];
  const discounts = (useQuery(api.billing.listDiscounts, {}) ?? []) as any[];
  const seed = useMutation(api.billing.seedInitialCatalogue);
  const grant = useMutation(api.billing.grantOrder);
  const reject = useMutation(api.billing.rejectOrder);
  const adoptLegacy = useMutation(api.billing.adoptLegacyClaim);
  const saveFamily = useMutation(api.billing.saveFamily);
  const savePlan = useMutation(api.billing.savePlan);
  const saveVersion = useMutation(api.billing.savePlanVersionDraft);
  const saveBenefits = useMutation(api.billing.savePlanBenefits);
  const publishVersion = useMutation(api.billing.publishPlanVersion);
  const archiveVersion = useMutation(api.billing.archivePlanVersion);
  const restoreVersion = useMutation(api.billing.restorePlanVersion);
  const setVisibility = useMutation(api.billing.setPlanVersionVisibility);
  const setFamilyArchived = useMutation(api.billing.setFamilyArchived);
  const setPlanArchived = useMutation(api.billing.setPlanArchived);
  const saveDiscount = useMutation(api.billing.saveDiscount);
  const setDiscountActive = useMutation(api.billing.setDiscountActive);
  const setAllowlist = useMutation(api.billing.setDiscountAllowlist);

  const families = useMemo(() => catalogue?.families ?? [], [catalogue?.families]);
  const plans = useMemo(() => catalogue?.plans ?? [], [catalogue?.plans]);
  const versions = catalogue?.versions ?? [];
  const benefits = catalogue?.benefits ?? [];
  const legacyPackages = catalogue?.legacyPackages ?? [];
  const legacyClaims = catalogue?.legacyClaims ?? [];
  const legacyReviews = catalogue?.legacyReviews ?? [];
  const [familyId, setFamilyId] = useState<string>();
  const [familyKey, setFamilyKey] = useState("");
  const [familyLabels, setFamilyLabels] = useState(EMPTY_LABELS());
  const [familyDescription, setFamilyDescription] = useState(EMPTY_LABELS());
  const [familyVisibility, setFamilyVisibility] = useState<"visible" | "hidden">("visible");
  const [familyOrder, setFamilyOrder] = useState("0");
  const [planId, setPlanId] = useState<string>();
  const [planFamilyId, setPlanFamilyId] = useState("");
  const [planKey, setPlanKey] = useState("");
  const [planLabels, setPlanLabels] = useState(EMPTY_LABELS());
  const [planDescription, setPlanDescription] = useState(EMPTY_LABELS());
  const [planVisibility, setPlanVisibility] = useState<"visible" | "hidden">("visible");
  const [planOrder, setPlanOrder] = useState("0");
  const [version, setVersion] = useState<VersionForm>(emptyVersion());
  const [versionBenefits, setVersionBenefits] = useState<BenefitRow[]>([]);
  const [rejecting, setRejecting] = useState<string>();
  const [rejectReason, setRejectReason] = useState("");
  const [publishTarget, setPublishTarget] = useState<any>();
  const [publishScope, setPublishScope] = useState<"new_clients_only" | "replace_for_everyone">("replace_for_everyone");
  const [archiveTarget, setArchiveTarget] = useState<{ kind: "family" | "plan" | "version" | "discount"; id: string; label: string; archived: boolean }>();
  const [discountId, setDiscountId] = useState<string>();
  const [discountName, setDiscountName] = useState("");
  const [discountLabels, setDiscountLabels] = useState(EMPTY_LABELS());
  const [discountDescription, setDiscountDescription] = useState(EMPTY_LABELS());
  const [discountKind, setDiscountKind] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [discountCurrency, setDiscountCurrency] = useState("KZT");
  const [discountScope, setDiscountScope] = useState<"all_plans" | "family" | "plan">("all_plans");
  const [discountFamilyId, setDiscountFamilyId] = useState("");
  const [discountPlanId, setDiscountPlanId] = useState("");
  const [discountEligibility, setDiscountEligibility] = useState<"everyone" | "new_clients_only" | "allowlist">("everyone");
  const [discountStartsAt, setDiscountStartsAt] = useState("");
  const [discountEndsAt, setDiscountEndsAt] = useState("");
  const [discountPriority, setDiscountPriority] = useState("100");
  const [discountMax, setDiscountMax] = useState("");
  const [allowlist, setAllowlistText] = useState("");
  const [discountArchived, setDiscountArchived] = useState(false);
  const selectedOrderId = searchParams.get("order") ?? undefined;
  const plansByFamily = useMemo(() => new Map<string, any[]>(families.map((family: any) => [family._id, plans.filter((plan: any) => plan.familyId === family._id)])), [families, plans]);

  useEffect(() => {
    const orderId = searchParams.get("order");
    if (!orderId) return;
    const timer = window.setTimeout(() => document.getElementById(`billing-order-${orderId}`)?.scrollIntoView({ block: "center" }), 0);
    return () => window.clearTimeout(timer);
  }, [searchParams, orders.length]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try { const result = await action(); toast.success(success); return result; } catch (error) { toast.error((error as Error).message); return null; }
  };
  function resetFamily() { setFamilyId(undefined); setFamilyKey(""); setFamilyLabels(EMPTY_LABELS()); setFamilyDescription(EMPTY_LABELS()); setFamilyVisibility("visible"); setFamilyOrder(String(families.length)); }
  function editFamily(row: any) { setFamilyId(row._id); setFamilyKey(row.key); setFamilyLabels(labelsFrom(row.labels)); setFamilyDescription(labelsFrom(row.description)); setFamilyVisibility(row.visibility === "hidden" ? "hidden" : "visible"); setFamilyOrder(String(row.sortOrder)); }
  function resetPlan() { setPlanId(undefined); setPlanFamilyId(families[0]?._id ?? ""); setPlanKey(""); setPlanLabels(EMPTY_LABELS()); setPlanDescription(EMPTY_LABELS()); setPlanVisibility("visible"); setPlanOrder(String(plans.length)); }
  function editPlan(row: any) { setPlanId(row._id); setPlanFamilyId(row.familyId); setPlanKey(row.key); setPlanLabels(labelsFrom(row.labels)); setPlanDescription(labelsFrom(row.description)); setPlanVisibility(row.visibility === "hidden" ? "hidden" : "visible"); setPlanOrder(String(row.sortOrder)); }
  function editVersion(row: any) { const p = row.presentation ?? {}; setVersion({ id: row._id, planId: row.planId, familyId: row.familyId, programLabel: labelsFrom(row.programLabel), lessonCount: String(row.lessonCount), currency: row.currency, listPrice: String(row.listPrice), expiryDays: String(row.expiryDays), sortOrder: String(row.sortOrder ?? 0), visibility: row.visibility, publicationScope: row.publicationScope, variant: p.variant ?? "standard", accent: p.accent ?? "purple", featured: p.featured === true, badge: labelsFrom(p.badge), ctaLabel: labelsFrom(p.ctaLabel), sectionOrder: (p.sectionOrder ?? emptyVersion().sectionOrder.split(",")).join(","), sections: { family: p.sections?.family !== false, description: p.sections?.description !== false, price: true, lessons: true, expiry: true, benefits: true, badge: p.sections?.badge !== false } }); setVersionBenefits(benefits.filter((benefit: any) => benefit.planVersionId === row._id).sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((benefit: any) => ({ sortOrder: String(benefit.sortOrder), labels: labelsFrom(benefit.labels) }))); }
  function newVersion(plan?: any) { setVersion(emptyVersion(plan?._id ?? "", plan?.familyId ?? "")); setVersionBenefits([]); }
  function editDiscount(row: any) { setDiscountId(row._id); setDiscountArchived(!row.isActive); setDiscountName(row.name); setDiscountLabels(labelsFrom(row.labels ?? { default: row.name })); setDiscountDescription(labelsFrom(row.description)); setDiscountKind(row.kind); setDiscountValue(String(row.value)); setDiscountCurrency(row.currency ?? "KZT"); setDiscountScope(row.scope); setDiscountFamilyId(row.familyId ?? ""); setDiscountPlanId(row.planId ?? ""); setDiscountEligibility(row.eligibility); setDiscountStartsAt(dateTimeValue(row.startsAt)); setDiscountEndsAt(dateTimeValue(row.endsAt)); setDiscountPriority(String(row.priority)); setDiscountMax(row.maxRedemptions == null ? "" : String(row.maxRedemptions)); setAllowlistText(""); }
  function resetDiscount() { setDiscountId(undefined); setDiscountArchived(false); setDiscountName(""); setDiscountLabels(EMPTY_LABELS()); setDiscountDescription(EMPTY_LABELS()); setDiscountKind("percent"); setDiscountValue("10"); setDiscountCurrency("KZT"); setDiscountScope("all_plans"); setDiscountFamilyId(""); setDiscountPlanId(""); setDiscountEligibility("everyone"); setDiscountStartsAt(""); setDiscountEndsAt(""); setDiscountPriority("100"); setDiscountMax(""); setAllowlistText(""); }

  async function saveVersionForm() {
    const plan = plans.find((candidate: any) => candidate._id === version.planId);
    if (!plan) return toast.error(t("choosePlan"));
    const savedId = await run(() => saveVersion({ id: version.id as never, planId: version.planId as never, familyId: plan.familyId as never, programLabel: labelsPayload(version.programLabel).default ? labelsPayload(version.programLabel) : undefined, lessonCount: Number(version.lessonCount), currency: version.currency, listPrice: Number(version.listPrice), expiryDays: Number(version.expiryDays), sortOrder: Number(version.sortOrder), visibility: version.visibility, publicationScope: version.publicationScope, presentation: { variant: version.variant, accent: version.accent, featured: version.featured, badge: labelsPayload(version.badge).default ? labelsPayload(version.badge) : undefined, ctaLabel: labelsPayload(version.ctaLabel).default ? labelsPayload(version.ctaLabel) : undefined, sectionOrder: version.sectionOrder.split(",").map((part) => part.trim()).filter(Boolean) as any, sections: version.sections } }), version.id ? t("draftCreatedFromPublished") : t("draftSaved"));
    if (savedId) setVersion((current) => ({ ...current, id: String(savedId) }));
  }
  async function saveBenefitForm() { if (!version.id) return toast.error(t("saveDraftFirst")); await run(() => saveBenefits({ planVersionId: version.id as never, benefits: versionBenefits.map((benefit) => ({ sortOrder: Number(benefit.sortOrder), labels: labelsPayload(benefit.labels) })) }), t("benefitsSaved")); }
  async function publish() { if (!publishTarget) return; await run(() => publishVersion({ planVersionId: publishTarget._id, publicationScope: publishScope }), publishScope === "replace_for_everyone" ? t("publishedForEveryone") : t("publishedForNewClients")); setPublishTarget(undefined); }
  async function archive() { if (!archiveTarget) return; const target = archiveTarget; if (target.kind === "family") await run(() => setFamilyArchived({ familyId: target.id as never, isArchived: !target.archived }), target.archived ? t("restored") : t("archived")); if (target.kind === "plan") await run(() => setPlanArchived({ planId: target.id as never, isArchived: !target.archived }), target.archived ? t("restored") : t("archived")); if (target.kind === "version") await run(() => target.archived ? restoreVersion({ planVersionId: target.id as never }) : archiveVersion({ planVersionId: target.id as never }), target.archived ? t("restored") : t("archived")); if (target.kind === "discount") await run(() => setDiscountActive({ discountId: target.id as never, isActive: target.archived }), target.archived ? t("activated") : t("archived")); setArchiveTarget(undefined); }
  async function saveDiscountForm() {
    const startsAt = discountStartsAt ? new Date(discountStartsAt).toISOString() : "";
    const labelPayload = labelsPayload(discountLabels);
    const descriptionPayload = labelsPayload(discountDescription);
    const result = await (async () => { try { const id = await saveDiscount({ id: discountId as never, name: discountName, labels: labelPayload.default ? labelPayload : undefined, description: descriptionPayload.default ? descriptionPayload : undefined, kind: discountKind, value: Number(discountValue), currency: discountKind === "fixed" ? discountCurrency : undefined, scope: discountScope, familyId: discountScope === "family" && discountFamilyId ? discountFamilyId as never : undefined, planId: discountScope === "plan" && discountPlanId ? discountPlanId as never : undefined, eligibility: discountEligibility, priority: Number(discountPriority), startsAt: startsAt || new Date().toISOString(), endsAt: discountEndsAt ? new Date(discountEndsAt).toISOString() : undefined, maxRedemptions: discountMax ? Number(discountMax) : undefined, isActive: !discountArchived }); if (discountEligibility === "allowlist") await setAllowlist({ discountId: id as never, studentIds: allowlist.split(/[,\n]/).map((studentId) => studentId.trim()).filter(Boolean) }); toast.success(discountId ? t("discountUpdated") : t("discountCreated")); return id; } catch (error) { toast.error((error as Error).message); return null; } })();
    if (result) resetDiscount();
  }
  async function confirmReject(orderId: string) { const result = await run(() => reject({ orderId: orderId as never, reason: rejectReason }), t("orderRejected")); if (result) { setRejecting(undefined); setRejectReason(""); } }

  if (catalogue === undefined) return <div className="card body-sm" style={{ padding: 20 }}>{t("loading")}</div>;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><h2 className="h2" style={{ margin: 0 }}>{t("catalogue")}</h2><p className="body-sm" style={{ marginTop: 4 }}>{t("catalogueHint")}</p></div><Button size="sm" onClick={() => void run(() => seed({}), t("seeded"))}>{t("seed")}</Button></div>
        {families.length === 0 ? <div className="body-sm" style={{ padding: 20, textAlign: "center" }}>{t("emptyCatalogue")}</div> : <div style={{ display: "grid", gap: 12, marginTop: 16 }}>{families.map((family: any) => <div key={family._id} style={{ borderTop: "1px solid var(--omnic-gray-200)", paddingTop: 12 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><div><strong>{family.labels.default}</strong><span className="body-sm"> · {t("order")} {family.sortOrder} · {family.isArchived ? t("archived") : family.visibility === "hidden" ? t("hidden") : t("visible")}</span>{family.description?.default && <div className="body-sm">{family.description.default}</div>}</div><div style={{ display: "flex", gap: 6 }}><Button size="sm" variant="outline" onClick={() => editFamily(family)}>{t("edit")}</Button><Button size="sm" variant="outline" onClick={() => setArchiveTarget({ kind: "family", id: family._id, label: family.labels.default, archived: family.isArchived })}>{family.isArchived ? t("restore") : t("archive")}</Button></div></div>{(plansByFamily.get(family._id) ?? []).map((plan: any) => <div key={plan._id} style={{ marginTop: 8, paddingInlineStart: 12 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><div><strong>{plan.labels.default}</strong><span className="body-sm"> · {t("order")} {plan.sortOrder} · {plan.isArchived ? t("archived") : plan.visibility === "hidden" ? t("hidden") : t("visible")}</span></div><div style={{ display: "flex", gap: 6 }}><Button size="sm" variant="outline" onClick={() => editPlan(plan)}>{t("edit")}</Button><Button size="sm" variant="outline" onClick={() => setArchiveTarget({ kind: "plan", id: plan._id, label: plan.labels.default, archived: plan.isArchived })}>{plan.isArchived ? t("restore") : t("archive")}</Button><Button size="sm" variant="outline" onClick={() => newVersion(plan)}>{t("newDraft")}</Button></div></div>{versions.filter((row: any) => row.planId === plan._id).sort((a: any, b: any) => b.version - a.version).map((row: any) => <div key={row._id} className="body-sm" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 6, paddingInlineStart: 12 }}><span>v{row.version} · {row.lessonCount} {t("lessons")} · {formatAmount(row.listPrice, row.currency)} · {row.status} · {row.visibility}</span><span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}><Button size="sm" variant="outline" onClick={() => editVersion(row)}>{t("edit")}</Button>{row.status === "draft" && <Button size="sm" onClick={() => { setPublishTarget(row); setPublishScope(row.publicationScope); }}>{t("publish")}</Button>}{row.status !== "archived" && <Button size="sm" variant="outline" onClick={() => setArchiveTarget({ kind: "version", id: row._id, label: `v${row.version}`, archived: false })}>{t("archive")}</Button>}{row.status === "archived" && <Button size="sm" variant="outline" onClick={() => setArchiveTarget({ kind: "version", id: row._id, label: `v${row.version}`, archived: true })}>{t("restore")}</Button>}{row.status === "published" && <Button size="sm" variant="outline" onClick={() => void run(() => setVisibility({ planVersionId: row._id, visibility: row.visibility === "visible" ? "hidden" : "visible" }), row.visibility === "visible" ? t("hidden") : t("visible"))}>{row.visibility === "visible" ? t("hide") : t("show")}</Button>}</span></div>)}</div>)}</div>)}</div>}
      </section>

      <section className="card" style={{ padding: 20 }}><h3 className="h3">{familyId ? t("editFamily") : t("newFamily")}</h3><div style={{ display: "grid", gap: 10, marginTop: 10 }}><Input placeholder={t("familyKey")} value={familyKey} onChange={(event) => setFamilyKey(event.target.value)} /><LocaleInputs label={t("familyLabels")} value={familyLabels} onChange={setFamilyLabels} /><LocaleInputs label={t("familyDescription")} value={familyDescription} onChange={setFamilyDescription} /><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><select className="input" value={familyVisibility} onChange={(event) => setFamilyVisibility(event.target.value as typeof familyVisibility)}><option value="visible">{t("visible")}</option><option value="hidden">{t("hidden")}</option></select><Input type="number" min="0" placeholder={t("order")} value={familyOrder} onChange={(event) => setFamilyOrder(event.target.value)} /></div><div style={{ display: "flex", gap: 8 }}><Button onClick={() => void run(() => saveFamily({ id: familyId as never, key: familyKey, labels: labelsPayload(familyLabels), description: labelsPayload(familyDescription), visibility: familyVisibility, sortOrder: Number(familyOrder), isArchived: false }), familyId ? t("saved") : t("created"))}>{familyId ? t("save") : t("create")}</Button><Button variant="outline" onClick={resetFamily}>{t("clear")}</Button></div></div></section>

      <section className="card" style={{ padding: 20 }}><h3 className="h3">{planId ? t("editPlan") : t("newPlan")}</h3><div style={{ display: "grid", gap: 10, marginTop: 10 }}><select className="input" value={planFamilyId} onChange={(event) => setPlanFamilyId(event.target.value)}><option value="">{t("chooseFamily")}</option>{families.map((family: any) => <option key={family._id} value={family._id}>{family.labels.default}</option>)}</select><Input placeholder={t("planKey")} value={planKey} onChange={(event) => setPlanKey(event.target.value)} /><LocaleInputs label={t("planLabels")} value={planLabels} onChange={setPlanLabels} /><LocaleInputs label={t("planDescription")} value={planDescription} onChange={setPlanDescription} /><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><select className="input" value={planVisibility} onChange={(event) => setPlanVisibility(event.target.value as typeof planVisibility)}><option value="visible">{t("visible")}</option><option value="hidden">{t("hidden")}</option></select><Input type="number" min="0" placeholder={t("order")} value={planOrder} onChange={(event) => setPlanOrder(event.target.value)} /></div><div style={{ display: "flex", gap: 8 }}><Button disabled={!planFamilyId} onClick={() => void run(() => savePlan({ id: planId as never, familyId: planFamilyId as never, key: planKey, labels: labelsPayload(planLabels), description: labelsPayload(planDescription), visibility: planVisibility, sortOrder: Number(planOrder), isArchived: false }), planId ? t("saved") : t("created"))}>{planId ? t("save") : t("create")}</Button><Button variant="outline" onClick={resetPlan}>{t("clear")}</Button></div></div></section>

      <section className="card" style={{ padding: 20 }}><h3 className="h3">{version.id ? t("editVersion") : t("newVersion")}</h3><div style={{ display: "grid", gap: 10, marginTop: 10 }}><select className="input" value={version.planId} onChange={(event) => { const selected = plans.find((plan: any) => plan._id === event.target.value); setVersion({ ...version, planId: event.target.value, familyId: selected?.familyId ?? "" }); }}><option value="">{t("choosePlan")}</option>{plans.map((plan: any) => <option key={plan._id} value={plan._id}>{plan.labels.default}</option>)}</select><LocaleInputs label={t("programLabel")} value={version.programLabel} onChange={(programLabel) => setVersion({ ...version, programLabel })} /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}><Input type="number" min="1" value={version.lessonCount} onChange={(event) => setVersion({ ...version, lessonCount: event.target.value })} placeholder={t("lessons")} /><Input type="number" min="0" value={version.listPrice} onChange={(event) => setVersion({ ...version, listPrice: event.target.value })} placeholder={t("price")} /><Input value={version.currency} onChange={(event) => setVersion({ ...version, currency: event.target.value.toUpperCase() })} placeholder={t("currency")} /><Input type="number" min="1" value={version.expiryDays} onChange={(event) => setVersion({ ...version, expiryDays: event.target.value })} placeholder={t("expiryDays")} /><Input type="number" min="0" value={version.sortOrder} onChange={(event) => setVersion({ ...version, sortOrder: event.target.value })} placeholder={t("order")} /></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}><select className="input" value={version.visibility} onChange={(event) => setVersion({ ...version, visibility: event.target.value as VersionForm["visibility"] })}><option value="visible">{t("visible")}</option><option value="hidden">{t("hidden")}</option></select><select className="input" value={version.publicationScope} onChange={(event) => setVersion({ ...version, publicationScope: event.target.value as VersionForm["publicationScope"] })}><option value="replace_for_everyone">{t("replaceForEveryone")}</option><option value="new_clients_only">{t("newClientsOnly")}</option></select><select className="input" value={version.variant} onChange={(event) => setVersion({ ...version, variant: event.target.value as VersionForm["variant"] })}><option value="standard">{t("standard")}</option><option value="compact">{t("compact")}</option><option value="featured">{t("featuredVariant")}</option></select><select className="input" value={version.accent} onChange={(event) => setVersion({ ...version, accent: event.target.value as VersionForm["accent"] })}><option value="purple">{t("purple")}</option><option value="gold">{t("gold")}</option><option value="blue">{t("blue")}</option><option value="green">{t("green")}</option><option value="slate">{t("slate")}</option></select></div><label className="body-sm" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={version.featured} onChange={(event) => setVersion({ ...version, featured: event.target.checked })} />{t("featured")}</label><LocaleInputs label={t("badge")} value={version.badge} onChange={(badge) => setVersion({ ...version, badge })} /><LocaleInputs label={t("ctaLabel")} value={version.ctaLabel} onChange={(ctaLabel) => setVersion({ ...version, ctaLabel })} /><Input placeholder={t("sectionOrder")} value={version.sectionOrder} onChange={(event) => setVersion({ ...version, sectionOrder: event.target.value })} /><div className="body-sm">{t("mandatoryFields")}</div><Button onClick={() => void saveVersionForm()}>{version.id ? t("saveAsDraft") : t("createDraft")}</Button></div></section>

      <section className="card" style={{ padding: 20 }}><h3 className="h3">{t("benefits")}</h3><p className="body-sm" style={{ marginTop: 4 }}>{t("benefitsHint")}</p><div style={{ display: "grid", gap: 12, marginTop: 10 }}>{versionBenefits.map((benefit, index) => <div key={`${version.id ?? "new"}-${index}`} style={{ borderTop: "1px solid var(--omnic-gray-200)", paddingTop: 10 }}><div style={{ display: "flex", gap: 8 }}><Input type="number" min="0" value={benefit.sortOrder} onChange={(event) => setVersionBenefits(versionBenefits.map((row, rowIndex) => rowIndex === index ? { ...row, sortOrder: event.target.value } : row))} /><Button variant="outline" size="sm" onClick={() => setVersionBenefits(versionBenefits.filter((_, rowIndex) => rowIndex !== index))}>{t("remove")}</Button></div><LocaleInputs label={`${t("benefit")} ${index + 1}`} value={benefit.labels} onChange={(labels) => setVersionBenefits(versionBenefits.map((row, rowIndex) => rowIndex === index ? { ...row, labels } : row))} /></div>)}<div style={{ display: "flex", gap: 8 }}><Button variant="outline" onClick={() => setVersionBenefits([...versionBenefits, { sortOrder: String(versionBenefits.length), labels: EMPTY_LABELS() }])}>{t("addBenefit")}</Button><Button disabled={!version.id} onClick={() => void saveBenefitForm()}>{t("saveBenefits")}</Button></div></div></section>

      <section className="card" style={{ padding: 20 }}><h2 className="h2" style={{ margin: 0 }}>{t("orderQueue")}</h2><p className="body-sm" style={{ marginTop: 4 }}>{t("orderQueueHint")}</p><div style={{ display: "grid", gap: 10, marginTop: 14 }}>{orders.length === 0 ? <div className="body-sm" style={{ padding: 20, textAlign: "center" }}>{t("noOrders")}</div> : orders.map((order) => <QueueOrder key={order.orderId} order={order} selected={selectedOrderId === order.orderId} rejecting={rejecting === order.orderId} rejectReason={rejectReason} setRejectReason={setRejectReason} onGrant={() => void run(() => grant({ orderId: order.orderId as never }), t("orderGranted"))} onReject={() => { setRejecting(rejecting === order.orderId ? undefined : order.orderId); setRejectReason(""); }} onConfirmReject={() => void confirmReject(order.orderId)} t={t} />)}</div></section>

      <section className="card" style={{ padding: 20 }}><h2 className="h2" style={{ margin: 0 }}>{t("legacyReview")}</h2><p className="body-sm" style={{ marginTop: 4 }}>{t("legacyReviewHint")}</p>{legacyPackages.length > 0 && <div className="body-sm" style={{ marginTop: 10 }}>{t("legacyPackageCount")}: {legacyPackages.length}</div>}<div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>{t("claimLabel")}</th><th>{t("student")}</th><th>{t("status")}</th><th>{t("order")}</th><th /></tr></thead><tbody>{legacyClaims.length === 0 ? <tr><td colSpan={5} className="body-sm" style={{ textAlign: "center", padding: 20 }}>{t("noLegacyClaims")}</td></tr> : legacyClaims.map((claimRow: any) => <tr key={claimRow.claimId}><td>{claimRow.packName}<div className="body-sm">{claimRow.lessonCount ?? "—"} {t("lessons")}</div></td><td>{claimRow.studentId}</td><td>{claimRow.status === "pending" || claimRow.status === "received" ? t("statusPending") : claimRow.status === "fulfilled" ? t("statusGranted") : claimRow.status === "rejected" ? t("statusRejected") : t("statusPending")}</td><td>{claimRow.billingOrderId ?? "—"}</td><td>{!claimRow.billingOrderId && (claimRow.status === "pending" || claimRow.status === "received") && <Button size="sm" onClick={() => void run(() => adoptLegacy({ eventId: claimRow.claimId as never }), t("legacyAdopted"))}>{t("adoptToQueue")}</Button>}</td></tr>)}</tbody></table></div><div className="body-sm" style={{ marginTop: 12 }}>{t("unresolvedLegacyReviews")}: {legacyReviews.filter((review: any) => review.status === "unreconstructable").length}</div></section>

      <section className="card" style={{ padding: 20 }}><h2 className="h2" style={{ margin: 0 }}>{t("discounts")}</h2><p className="body-sm" style={{ marginTop: 4 }}>{t("discountsHint")}</p><div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>{t("name")}</th><th>{t("rule")}</th><th>{t("scope")}</th><th>{t("window")}</th><th>{t("status")}</th><th /></tr></thead><tbody>{discounts.map((discount) => <tr key={discount._id}><td>{discount.name}</td><td>{discount.kind === "percent" ? `${discount.value}%` : formatAmount(discount.value, discount.currency ?? "KZT")}</td><td>{t(discount.scope === "all_plans" ? "allPlans" : discount.scope === "family" ? "familyScope" : "planScope")} · {t(discount.eligibility === "new_clients_only" ? "newClientsOnly" : discount.eligibility)} · {t("priority")} {discount.priority}</td><td>{discount.startsAt.slice(0, 10)}{discount.endsAt ? ` → ${discount.endsAt.slice(0, 10)}` : ""}</td><td>{discount.isActive ? t("active") : t("archived")}</td><td><div style={{ display: "flex", gap: 6 }}><Button size="sm" variant="outline" onClick={() => editDiscount(discount)}>{t("edit")}</Button><Button size="sm" variant="outline" onClick={() => setArchiveTarget({ kind: "discount", id: discount._id, label: discount.name, archived: !discount.isActive })}>{discount.isActive ? t("archive") : t("restore")}</Button></div></td></tr>)}</tbody></table></div><div style={{ display: "grid", gap: 10, marginTop: 14 }}><Input placeholder={t("discountName")} value={discountName} onChange={(event) => setDiscountName(event.target.value)} /><LocaleInputs label={t("discountLabels")} value={discountLabels} onChange={setDiscountLabels} /><LocaleInputs label={t("discountDescription")} value={discountDescription} onChange={setDiscountDescription} /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}><select className="input" value={discountKind} onChange={(event) => setDiscountKind(event.target.value as typeof discountKind)}><option value="percent">{t("percentage")}</option><option value="fixed">{t("fixedAmount")}</option></select><Input type="number" min="0" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder={t("value")} /><Input value={discountCurrency} onChange={(event) => setDiscountCurrency(event.target.value.toUpperCase())} placeholder={t("currency")} /><select className="input" value={discountScope} onChange={(event) => setDiscountScope(event.target.value as typeof discountScope)}><option value="all_plans">{t("allPlans")}</option><option value="family">{t("familyScope")}</option><option value="plan">{t("planScope")}</option></select>{discountScope === "family" && <select className="input" value={discountFamilyId} onChange={(event) => setDiscountFamilyId(event.target.value)}><option value="">{t("chooseFamily")}</option>{families.map((family: any) => <option key={family._id} value={family._id}>{family.labels.default}</option>)}</select>}{discountScope === "plan" && <select className="input" value={discountPlanId} onChange={(event) => setDiscountPlanId(event.target.value)}><option value="">{t("choosePlan")}</option>{plans.map((plan: any) => <option key={plan._id} value={plan._id}>{plan.labels.default}</option>)}</select>}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}><select className="input" value={discountEligibility} onChange={(event) => setDiscountEligibility(event.target.value as typeof discountEligibility)}><option value="everyone">{t("everyone")}</option><option value="new_clients_only">{t("newClientsOnly")}</option><option value="allowlist">{t("allowlist")}</option></select><Input type="datetime-local" value={discountStartsAt} onChange={(event) => setDiscountStartsAt(event.target.value)} aria-label={t("startsAt")} /><Input type="datetime-local" value={discountEndsAt} onChange={(event) => setDiscountEndsAt(event.target.value)} aria-label={t("endsAt")} /><Input type="number" min="0" value={discountPriority} onChange={(event) => setDiscountPriority(event.target.value)} placeholder={t("priority")} /><Input type="number" min="1" value={discountMax} onChange={(event) => setDiscountMax(event.target.value)} placeholder={t("maxRedemptions")} /></div>{discountEligibility === "allowlist" && <Textarea rows={2} placeholder={t("allowlistHint")} value={allowlist} onChange={(event) => setAllowlistText(event.target.value)} />}{discountArchived && <div className="body-sm">{t("archivedEditHint")}</div>}<div style={{ display: "flex", gap: 8 }}><Button onClick={() => void saveDiscountForm()}>{discountId ? t("save") : t("create")}</Button><Button variant="outline" onClick={resetDiscount}>{t("clear")}</Button></div></div></section>

      <Dialog open={Boolean(publishTarget)} onOpenChange={(open) => !open && setPublishTarget(undefined)}><DialogContent><DialogHeader><DialogTitle>{t("publishConfirmTitle")}</DialogTitle><DialogDescription>{t("publishConfirmHint")}</DialogDescription></DialogHeader><div className="space-y-3"><div className="body-sm">{publishTarget?.lessonCount} {t("lessons")} · {publishTarget?.listPrice?.toLocaleString()} {publishTarget?.currency}</div><select className="input" value={publishScope} onChange={(event) => setPublishScope(event.target.value as typeof publishScope)}><option value="replace_for_everyone">{t("replaceForEveryone")}</option><option value="new_clients_only">{t("newClientsOnly")}</option></select></div><DialogFooter><Button variant="outline" onClick={() => setPublishTarget(undefined)}>{t("cancel")}</Button><Button onClick={() => void publish()}>{t("confirmPublish")}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(undefined)}><DialogContent><DialogHeader><DialogTitle>{archiveTarget?.archived ? t("restoreConfirmTitle") : t("archiveConfirmTitle")}</DialogTitle><DialogDescription>{archiveTarget?.archived ? t("restoreConfirmHint") : t("archiveConfirmHint")}</DialogDescription></DialogHeader><div className="body-sm">{archiveTarget?.label}</div><DialogFooter><Button variant="outline" onClick={() => setArchiveTarget(undefined)}>{t("cancel")}</Button><Button variant={archiveTarget?.archived ? "default" : "destructive"} onClick={() => void archive()}>{archiveTarget?.archived ? t("restore") : t("confirmArchive")}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
