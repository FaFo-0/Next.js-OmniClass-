"use client";
import { PackFormDialog } from "./PackFormDialog";
import { packSaleEnd, type FamilyRow, type PackForm } from "./packEditorModel";
import { CurrencyInput } from "./CurrencyInput";

import { MoneyEquivalent } from "./MoneyEquivalent";

// The pricing catalogue editor, mounted from /admin/billing?tab=commercial.
//
// One screen: families across the page, packs under each family, a live
// preview of exactly what the student and the public website will render, the
// order queue, and the hand-made-deal box. Editing a pack changes the price for
// everyone — there is no draft, version, or publish step.

import { useEffect, useState } from "react";
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
import { formatBillingAmount } from "./billingView";
import { resolvePackPrice, type PricingText } from "../../../convex/lib/pricing";


type BenefitRow = PricingText;

type PackRow = {
  _id: string;
  familyId: string;
  name: string;
  nameEn?: string;
  nameRu?: string;
  nameKk?: string;
  lessons: number;
  currency: string;
  price: number;
  fixedPrices?: Record<string, number>;
  salePrice?: number;
  salePercent?: number;
  saleEndsAt?: string;
  expiryDays: number;
  benefits: BenefitRow[];
  sortOrder: number;
  isVisible: boolean;
  isArchived: boolean;
};

type OrderRow = {
  orderId: string;
  status: "pending_verification" | "granted" | "rejected" | "cancelled";
  buyerName: string;
  buyerStudentId: string;
  requestedAt: string;
  planSnapshot: { familyLabel: string; planLabel: string; lessonCount: number; expiryDays: number };
  priceSnapshot: { listAmount: number; discountAmount: number; netAmount: number; currency: string; calculatedAt: string; discountCode?: string; codePercent?: number };
  rejectionReason: string | null;
  deletionAllowed: boolean;
  deletionBlockReason: "pending" | "buyer_exists" | null;
};

type FamilyForm = {
  id?: string;
  label: string;
  labelEn: string;
  labelRu: string;
  labelKk: string;
  description: string;
  descriptionEn: string;
  descriptionRu: string;
  descriptionKk: string;
  isVisible: boolean;
  showOnWebsite: boolean;
};


const emptyFamily = (): FamilyForm => ({
  label: "", labelEn: "", labelRu: "", labelKk: "",
  description: "", descriptionEn: "", descriptionRu: "", descriptionKk: "",
  isVisible: true,
  showOnWebsite: true,
});

const emptyPack = (familyId = ""): PackForm => ({
  familyId,
  name: "", nameEn: "", nameRu: "", nameKk: "",
  lessons: "4",
  currency: "USD",
  price: "",
  fixedPrices: {},
  salePrice: "",
  salePercent: "",
  saleEndsAt: "",
  expiryDays: "60",
  benefits: [],
  isVisible: true,
});

function dateInputValue(iso?: string): string {
  return iso ? iso.slice(0, 10) : "";
}


function amount(price: number, currency: string) {
  return formatBillingAmount(price, currency);
}

// ── Order queue ────────────────────────────────────────────────────────

function OrderCard({ order, busy, onGrant, onReject, onDelete }: { order: OrderRow; busy: boolean; onGrant: (payment: {amount: number; currency: string; date: string; usdEquivalent?:number}) => void; onReject: (reason: string) => void; onDelete: () => void }) {
  const t = useTranslations("adminBilling");
  const [paidAmount, setPaidAmount] = useState(String(order.priceSnapshot.netAmount));
  const [paidCurrency, setPaidCurrency] = useState(order.priceSnapshot.currency);
  const [paidDate, setPaidDate] = useState(new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Almaty",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()));
  const datedRate = useQuery(api.finance.rateForEntry, paidDate && paidDate <= new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Almaty",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()) ? { date: paidDate, currency: paidCurrency } : "skip");
  const [equivalent, setEquivalent] = useState({key:"",value:""});
  const equivalentKey = `${paidAmount}|${paidCurrency}|${paidDate}`;
  const usdEquivalent = equivalent.key === equivalentKey && equivalent.value ? Number(equivalent.value) : undefined;
  const needsEquivalent = datedRate?.available === false;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const deleteExplanation = order.deletionBlockReason === "pending"
    ? t("deleteOrderBlockedPending")
    : t("deleteOrderBlockedBuyer");
  return (
    <article id={`billing-order-${order.orderId}`} className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px", overflowWrap: "anywhere" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong>{order.buyerName}</strong><span className="body-sm">{order.buyerStudentId}</span>
          </div>
          <div className="body-sm" style={{ marginTop: 6 }}>{order.planSnapshot.familyLabel} · {order.planSnapshot.planLabel}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("lessonEntitlement")}: {order.planSnapshot.lessonCount} · {t("expiryDays")}: {order.planSnapshot.expiryDays}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("requestTime")}: {new Date(order.requestedAt).toLocaleString()}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("status")}: {t(order.status === "pending_verification" ? "statusPending" : order.status === "granted" ? "statusGranted" : order.status === "rejected" ? "statusRejected" : "statusCancelled")}</div>
          {order.rejectionReason && <div className="body-sm" style={{ marginTop: 4, color: "var(--feedback-error)" }}>{t("reasonShownToStudent")}: {order.rejectionReason}</div>}
        </div>
        <div style={{ minWidth: 0, textAlign: "end", overflowWrap: "anywhere" }}>
          {order.priceSnapshot.discountAmount > 0 && (
            <div className="body-sm">
              <span dir="ltr" style={{ textDecoration: "line-through" }}>{amount(order.priceSnapshot.listAmount, order.priceSnapshot.currency)}</span>
            </div>
          )}
          {order.priceSnapshot.discountCode && <div className="body-sm" dir="ltr">{order.priceSnapshot.discountCode} · {order.priceSnapshot.codePercent}%</div>}
          <strong style={{ display: "block", marginTop: 4 }}>{t("netPrice")}: <span dir="ltr">{amount(order.priceSnapshot.netAmount, order.priceSnapshot.currency)}</span></strong>
        </div>
      </div>
      {order.status === "pending_verification" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label className="body-sm">Received<Input aria-label="Actual payment amount" type="number" min="0" step="any" value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} /></label><label className="body-sm">Currency<CurrencyInput label="Actual payment currency" value={paidCurrency} onChange={setPaidCurrency} /></label><label className="body-sm">Payment date<Input type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)} /></label>
            {needsEquivalent && <label className="body-sm">USD equivalent<Input aria-label="USD equivalent received" type="number" min="0.01" step="0.01" value={equivalent.key === equivalentKey ? equivalent.value : ""} onChange={e=>setEquivalent({key:equivalentKey,value:e.target.value})} /></label>}
            <Button size="sm" disabled={busy || !datedRate || (needsEquivalent && !(usdEquivalent && Number.isFinite(usdEquivalent))) || !paidAmount || !Number.isFinite(Number(paidAmount)) || Number(paidAmount) < 0} onClick={() => onGrant({amount:Number(paidAmount),currency:paidCurrency,date:paidDate,usdEquivalent:needsEquivalent ? usdEquivalent : undefined})}>{t("grant")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setRejecting(!rejecting); setReason(""); }}>{t("reject")}</Button>
          </div>
          {rejecting && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}>
              <Textarea rows={2} placeholder={t("reasonShownToStudent")} value={reason} onChange={(event) => setReason(event.target.value)} />
              <Button variant="destructive" disabled={busy || reason.trim().length < 5} onClick={() => onReject(reason)}>{t("confirmReject")}</Button>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
        <Button size="sm" variant={order.deletionAllowed ? "destructive" : "outline"} disabled={busy || !order.deletionAllowed} onClick={onDelete}>
          {t("deleteOrder")}
        </Button>
        {!order.deletionAllowed && <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>{deleteExplanation}</span>}
      </div>
    </article>
  );
}

// ── The editor ─────────────────────────────────────────────────────────

export function PackEditor() {
  const t = useTranslations("adminBilling");
  const searchParams = useSearchParams();
  const catalogue = useQuery(api.pricing.listCatalogue, {});
  const orders = (useQuery(api.pricing.listOrders, {}) ?? []) as unknown as OrderRow[];

  const saveFamily = useMutation(api.pricing.saveFamily);
  const duplicatePack = useMutation(api.pricing.duplicatePack);
  const duplicateFamily = useMutation(api.pricing.duplicateFamily);
  const deletePack = useMutation(api.pricing.deletePack);
  const deleteFamily = useMutation(api.pricing.deleteFamily);
  const savePack = useMutation(api.pricing.savePack);
  const moveFamily = useMutation(api.pricing.moveFamily);
  const movePack = useMutation(api.pricing.movePack);
  const setFamilyVisible = useMutation(api.pricing.setFamilyVisible);
  const setPackVisible = useMutation(api.pricing.setPackVisible);
  const setPackArchived = useMutation(api.pricing.setPackArchived);
  const setFamilyArchived = useMutation(api.pricing.setFamilyArchived);
  const grantOrder = useMutation(api.pricing.grantOrder);
  const rejectOrder = useMutation(api.pricing.rejectOrder);
  const deleteOrphanedOrder = useMutation(api.pricing.deleteOrphanedOrder);
  const grantLessons = useMutation(api.pricing.grantLessonsToStudent);

  const families = (catalogue?.families ?? []) as unknown as FamilyRow[];
  const packs = (catalogue?.packs ?? []) as unknown as PackRow[];

  const [familyForm, setFamilyForm] = useState<FamilyForm | null>(null);
  const [packForm, setPackForm] = useState<PackForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [give, setGive] = useState({ studentId: "", lessons: "4", expiryDays: "60", amount: "", currency: "KZT", note: "" });

  const selectedOrderId = searchParams.get("order") ?? undefined;
  useEffect(() => {
    const id = searchParams.get("order");
    if (!id) return;
    const timer = window.setTimeout(() => document.getElementById(`billing-order-${id}`)?.scrollIntoView({ block: "center" }), 0);
    return () => window.clearTimeout(timer);
  }, [searchParams, orders.length]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      const result = await action();
      toast.success(success);
      return result;
    } catch (error) {
      toast.error((error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitFamily() {
    if (!familyForm) return;
    const result = await run(
      () => saveFamily({
        id: familyForm.id as never,
        label: familyForm.label,
        labelEn: familyForm.labelEn,
        labelRu: familyForm.labelRu,
        labelKk: familyForm.labelKk,
        description: familyForm.description,
        descriptionEn: familyForm.descriptionEn,
        descriptionRu: familyForm.descriptionRu,
        descriptionKk: familyForm.descriptionKk,
        isVisible: familyForm.isVisible,
        showOnWebsite: familyForm.showOnWebsite,
      }),
      familyForm.id ? t("saved") : t("created"),
    );
    if (result) setFamilyForm(null);
  }

  async function submitPack() {
    if (!packForm) return;
    const result = await run(
      () => savePack({
        id: packForm.id as never,
        familyId: packForm.familyId as never,
        name: packForm.name,
        nameEn: packForm.nameEn,
        nameRu: packForm.nameRu,
        nameKk: packForm.nameKk,
        lessons: Number(packForm.lessons),
        currency: packForm.currency,
        price: Number(packForm.price),
        fixedPrices: packForm.fixedPrices,
        salePercent: packForm.salePercent.trim() === "" ? undefined : Number(packForm.salePercent),
        saleEndsAt: packSaleEnd(packForm.saleEndsAt),
        expiryDays: Number(packForm.expiryDays),
        benefits: packForm.benefits.filter((benefit) => benefit.default.trim().length > 0),
        isVisible: packForm.isVisible,
      }),
      packForm.id ? t("packSaved") : t("packCreated"),
    );
    if (result) setPackForm(null);
  }

  if (catalogue === undefined) return <div className="card body-sm" style={{ padding: 20 }}>{t("loading")}</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <section className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h2 className="h2" style={{ margin: 0 }}>{t("catalogue")}</h2>
            <p className="body-sm" style={{ marginTop: 4 }}>{t("catalogueHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2"><a className="btn" href="/prices" target="_blank" rel="noreferrer">View prices</a><Button variant="outline" onClick={async()=>{try {await navigator.clipboard.writeText(`${window.location.origin}/prices`); toast.success("Prices link copied");}catch{toast.error("Could not copy link");}}}>Copy link</Button><Button onClick={() => setFamilyForm(emptyFamily())}>{t("addFamily")}</Button></div>
        </div>

        {families.length === 0 ? (
          <div className="body-sm" style={{ padding: 20, textAlign: "center" }}>{t("emptyCatalogue")}</div>
        ) : families.map((family) => {
          const familyPacks = packs.filter((pack) => pack.familyId === family._id);
          return (
            <div key={family._id} style={{ borderTop: "1px solid var(--omnic-gray-200)", marginTop: 16, paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: 17 }}>{family.label}</strong>
                  <span className="body-sm"> · {family.isArchived ? t("archived") : family.isVisible ? t("visible") : t("hidden")}</span>
                  <span className="body-sm"> · {family.showOnWebsite === false ? t("websiteHidden") : t("websiteShown")}</span>
                  {family.description && <div className="body-sm">{family.description}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Button size="sm" variant="outline" aria-label={t("moveUp")} disabled={busy} onClick={() => void run(() => moveFamily({ familyId: family._id as never, direction: -1 }), t("saved"))}>↑</Button>
                  <Button size="sm" variant="outline" aria-label={t("moveDown")} disabled={busy} onClick={() => void run(() => moveFamily({ familyId: family._id as never, direction: 1 }), t("saved"))}>↓</Button>
                  <Button size="sm" variant="outline" onClick={() => setFamilyForm({
                    id: family._id,
                    label: family.label,
                    labelEn: family.labelEn ?? "",
                    labelRu: family.labelRu ?? "",
                    labelKk: family.labelKk ?? "",
                    description: family.description ?? "",
                    descriptionEn: family.descriptionEn ?? "",
                    descriptionRu: family.descriptionRu ?? "",
                    descriptionKk: family.descriptionKk ?? "",
                    isVisible: family.isVisible,
                    showOnWebsite: family.showOnWebsite !== false,
                  })}>{t("edit")}</Button>
                  <details className="relative"><summary className="btn cursor-pointer">More</summary><div className="absolute z-20 end-0 mt-1 min-w-44 rounded-xl border bg-white p-2 shadow-lg grid gap-1"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => duplicateFamily({ familyId: family._id as never }), "Family duplicated (hidden)")}>Duplicate family</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (confirm(`Delete ${family.label} and its ${familyPacks.length} packs? Existing orders and payments are kept.`)) void run(() => deleteFamily({familyId: family._id as never}), "Family deleted"); }}>Delete family</Button></div></details>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => setFamilyVisible({ familyId: family._id as never, isVisible: !family.isVisible }), t("saved"))}>
                    {family.isVisible ? t("hide") : t("show")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => setFamilyArchived({ familyId: family._id as never, isArchived: !family.isArchived }), family.isArchived ? t("restored") : t("archived"))}>
                    {family.isArchived ? t("restore") : t("archive")}
                  </Button>
                  <Button size="sm" onClick={() => setPackForm(emptyPack(family._id))}>{t("addPack")}</Button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {familyPacks.length === 0 && <div className="body-sm">{t("emptyFamily")}</div>}
                {familyPacks.map((pack) => (
                  <PackRowView
                    key={pack._id}
                    pack={pack}
                    busy={busy}
                    onEdit={() => setPackForm({
                      id: pack._id,
                      familyId: pack.familyId,
                      name: pack.name,
                      nameEn: pack.nameEn ?? "",
                      nameRu: pack.nameRu ?? "",
                      nameKk: pack.nameKk ?? "",
                      lessons: String(pack.lessons),
                      currency: pack.currency,
                      price: String(pack.price),
                      fixedPrices: pack.fixedPrices ?? {},
                      salePrice: pack.salePrice === undefined ? "" : String(pack.salePrice),
                      salePercent: pack.salePercent != null ? String(pack.salePercent) : pack.salePrice != null && pack.price > 0 ? String(Math.round((1 - pack.salePrice / pack.price) * 10000) / 100) : "",
                      saleEndsAt: dateInputValue(pack.saleEndsAt),
                      expiryDays: String(pack.expiryDays),
                      benefits: pack.benefits.map((benefit) => ({ ...benefit })),
                      isVisible: pack.isVisible,
                    })}
                    onDuplicate={() => void run(() => duplicatePack({packId:pack._id as never}), "Pack duplicated (hidden)")}
                    onDelete={() => { if (confirm(`Delete ${pack.name}? Existing orders and payments are kept.`)) void run(() => deletePack({packId:pack._id as never}), "Pack deleted"); }}
                    onMove={(direction) => void run(() => movePack({ packId: pack._id as never, direction }), t("saved"))}
                    onToggleVisible={() => void run(() => setPackVisible({ packId: pack._id as never, isVisible: !pack.isVisible }), t("saved"))}
                    onToggleArchived={() => void run(() => setPackArchived({ packId: pack._id as never, isArchived: !pack.isArchived }), pack.isArchived ? t("restored") : t("archived"))}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="card" style={{ padding: 20 }}>
        <h2 className="h2" style={{ margin: 0 }}>{t("orderQueue")}</h2>
        <p className="body-sm" style={{ marginTop: 4 }}>{t("orderQueueHint")}</p>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {orders.length === 0
            ? <div className="body-sm" style={{ padding: 20, textAlign: "center" }}>{t("noOrders")}</div>
            : orders.map((order) => (
              <OrderCard
                key={order.orderId}
                order={order}
                busy={busy}
                onGrant={payment => void run(() => grantOrder({ orderId: order.orderId as never, payment }), t("orderGranted"))}
                onReject={(reason) => void run(() => rejectOrder({ orderId: order.orderId as never, reason }), t("orderRejected"))}
                onDelete={() => {
                  if (!confirm(t("deleteOrderConfirm"))) return;
                  void run(() => deleteOrphanedOrder({ orderId: order.orderId as never }), t("orderDeleted"));
                }}
              />
            ))}
          {selectedOrderId && orders.every((order) => order.orderId !== selectedOrderId) && (
            <div className="body-sm">{t("noOrders")}</div>
          )}
        </div>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <h2 className="h2" style={{ margin: 0 }}>{t("grantLessons")}</h2>
        <p className="body-sm" style={{ marginTop: 4 }}>{t("giveLessonsHint")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 12 }}>
          <Input placeholder={t("studentId")} value={give.studentId} onChange={(event) => setGive({ ...give, studentId: event.target.value })} />
          <Input type="number" min="1" placeholder={t("lessonsCount")} value={give.lessons} onChange={(event) => setGive({ ...give, lessons: event.target.value })} />
          <Input type="number" min="1" placeholder={t("validForDays", { days: "60" })} value={give.expiryDays} onChange={(event) => setGive({ ...give, expiryDays: event.target.value })} />
          <Input type="number" min="0" placeholder={t("amount")} value={give.amount} onChange={(event) => setGive({ ...give, amount: event.target.value })} />
          <MoneyEquivalent amount={Number(give.amount)} currency={give.currency} />
          <CurrencyInput value={give.currency} onChange={currency => setGive({ ...give, currency })} />
          <Input placeholder={t("note")} value={give.note} onChange={(event) => setGive({ ...give, note: event.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Button
            disabled={busy || !give.studentId.trim() || Number(give.lessons) <= 0}
            onClick={() => void run(
              () => grantLessons({
                studentId: give.studentId.trim(),
                lessons: Number(give.lessons),
                expiryDays: give.expiryDays ? Number(give.expiryDays) : undefined,
                amount: give.amount ? Number(give.amount) : undefined,
                currency: give.amount ? give.currency : undefined,
                note: give.note || undefined,
              }),
              t("giveLessonsDone"),
            )}
          >
            {t("give")}
          </Button>
        </div>
      </section>

      <Dialog open={Boolean(familyForm)} onOpenChange={(open) => !open && setFamilyForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{familyForm?.id ? t("editFamily") : t("addFamily")}</DialogTitle>
            <DialogDescription>{t("familyHint")}</DialogDescription>
          </DialogHeader>
          {familyForm && (
            <div style={{ display: "grid", gap: 8 }}>
              <Input placeholder={t("familyName")} value={familyForm.label} onChange={(event) => setFamilyForm({ ...familyForm, label: event.target.value })} />
              <Input placeholder={t("english")} value={familyForm.labelEn} onChange={(event) => setFamilyForm({ ...familyForm, labelEn: event.target.value })} />
              <Input placeholder={t("russian")} value={familyForm.labelRu} onChange={(event) => setFamilyForm({ ...familyForm, labelRu: event.target.value })} />
              <Input placeholder={t("kazakh")} value={familyForm.labelKk} onChange={(event) => setFamilyForm({ ...familyForm, labelKk: event.target.value })} />
              <Input placeholder={t("familyDescription")} value={familyForm.description} onChange={(event) => setFamilyForm({ ...familyForm, description: event.target.value })} />
              <div style={{ display: "flex", gap: 8 }}>
                <Input placeholder={`${t("familyDescription")} · ${t("english")}`} value={familyForm.descriptionEn} onChange={(event) => setFamilyForm({ ...familyForm, descriptionEn: event.target.value })} />
                <Input placeholder={`${t("familyDescription")} · ${t("russian")}`} value={familyForm.descriptionRu} onChange={(event) => setFamilyForm({ ...familyForm, descriptionRu: event.target.value })} />
              </div>
              <Input placeholder={`${t("familyDescription")} · ${t("kazakh")}`} value={familyForm.descriptionKk} onChange={(event) => setFamilyForm({ ...familyForm, descriptionKk: event.target.value })} />
              <label className="body-sm" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={familyForm.showOnWebsite} onChange={(event) => setFamilyForm({ ...familyForm, showOnWebsite: event.target.checked })} />
                {t("showOnWebsite")}
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFamilyForm(null)}>{t("cancel")}</Button>
            <Button disabled={busy || !familyForm?.label.trim()} onClick={() => void submitFamily()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {packForm && <PackFormDialog form={packForm} families={families} busy={busy} onChange={setPackForm} onClose={() => setPackForm(null)} onSave={() => void submitPack()} />}

    </div>
  );
}

function PackRowView({ pack, busy, onEdit, onMove, onToggleVisible, onToggleArchived, onDuplicate, onDelete }: {
  pack: PackRow;
  busy: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggleVisible: () => void;
  onToggleArchived: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("adminBilling");
  // The row shows the configured sale, not a live quote: an end date in the
  // past simply stops applying on its own (see `isSaleActive`).
  const sale = resolvePackPrice(pack, pack.currency, new Date().toISOString());
  const configuredSale = sale.onSale;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 12px", border: "1px solid var(--omnic-gray-200)", borderRadius: 10 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <strong>{pack.name}</strong>
        <span className="body-sm">{t("lessonsCount")}: {pack.lessons}</span>
        <span className="body-sm">{t("validForDays", { days: pack.expiryDays })}</span>
        <span className="body-sm">
          <span dir="ltr" className={configuredSale ? "text-red-600 line-through" : undefined}>{amount(pack.price, pack.currency)}</span>
          {configuredSale && (
            <>
              {" → "}
              <strong dir="ltr" className="text-purple-800">{amount(sale.netAmount, pack.currency)} · Sale</strong>
              {pack.saleEndsAt ? ` · ${t("endsOn")} ${dateInputValue(pack.saleEndsAt)}` : ""}
            </>
          )}
        </span>
        <span className="body-sm">{pack.benefits.length} {t("benefits")}</span>
        <span className="body-sm">{pack.isArchived ? t("archived") : pack.isVisible ? t("visible") : t("hidden")}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button size="sm" variant="outline" aria-label={t("moveUp")} disabled={busy} onClick={() => onMove(-1)}>↑</Button>
        <Button size="sm" variant="outline" aria-label={t("moveDown")} disabled={busy} onClick={() => onMove(1)}>↓</Button>
        <Button size="sm" variant="outline" onClick={onEdit}>{t("edit")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onToggleVisible}>{pack.isVisible ? t("hide") : t("show")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onToggleArchived}>{pack.isArchived ? t("restore") : t("archive")}</Button><details className="relative"><summary className="btn cursor-pointer">More</summary><div className="absolute z-20 end-0 mt-1 min-w-36 rounded-xl border bg-white p-2 shadow-lg grid gap-1"><Button size="sm" variant="outline" disabled={busy} onClick={onDuplicate}>Duplicate</Button><Button size="sm" variant="destructive" disabled={busy} onClick={onDelete}>Delete</Button></div></details>
      </div>
    </div>
  );
}
