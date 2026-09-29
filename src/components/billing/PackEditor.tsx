"use client";

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

type FamilyRow = {
  _id: string;
  label: string;
  labelEn?: string;
  labelRu?: string;
  description?: string;
  descriptionEn?: string;
  descriptionRu?: string;
  sortOrder: number;
  isVisible: boolean;
  /** Hidden families still sell inside the portal. Undefined means shown. */
  showOnWebsite?: boolean;
  isArchived: boolean;
};

type BenefitRow = PricingText;

type PackRow = {
  _id: string;
  familyId: string;
  name: string;
  nameEn?: string;
  nameRu?: string;
  lessons: number;
  currency: string;
  price: number;
  salePrice?: number;
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
  priceSnapshot: { listAmount: number; discountAmount: number; netAmount: number; currency: string; calculatedAt: string };
  rejectionReason: string | null;
};

type FamilyForm = {
  id?: string;
  label: string;
  labelEn: string;
  labelRu: string;
  description: string;
  descriptionEn: string;
  descriptionRu: string;
  isVisible: boolean;
  showOnWebsite: boolean;
};

type PackForm = {
  id?: string;
  familyId: string;
  name: string;
  nameEn: string;
  nameRu: string;
  lessons: string;
  currency: string;
  price: string;
  salePrice: string;
  saleEndsAt: string;
  expiryDays: string;
  benefits: BenefitRow[];
  isVisible: boolean;
};

const emptyFamily = (): FamilyForm => ({
  label: "", labelEn: "", labelRu: "",
  description: "", descriptionEn: "", descriptionRu: "",
  isVisible: true,
  showOnWebsite: true,
});

const emptyPack = (familyId = ""): PackForm => ({
  familyId,
  name: "", nameEn: "", nameRu: "",
  lessons: "4",
  currency: "KZT",
  price: "",
  salePrice: "",
  saleEndsAt: "",
  expiryDays: "60",
  benefits: [],
  isVisible: true,
});

function dateInputValue(iso?: string): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Local date (start of day) → ISO instant, so a sale ends where it says. */
function endOfLocalDay(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T23:59:59`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function amount(price: number, currency: string) {
  return formatBillingAmount(price, currency);
}

// ── Pack preview: exactly what the student card and the website render ──

function PackPreview({ form, families }: { form: PackForm; families: FamilyRow[] }) {
  const t = useTranslations("adminBilling");
  const currency = (form.currency || "KZT").toUpperCase();
  const price = Number(form.price || 0);
  const salePrice = form.salePrice.trim() === "" ? undefined : Number(form.salePrice);
  const resolved = resolvePackPrice(
    { price, salePrice, saleEndsAt: endOfLocalDay(form.saleEndsAt) },
    currency,
    new Date().toISOString(),
  );
  const family = families.find((row) => row._id === form.familyId);

  return (
    <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="body-sm" style={{ fontWeight: 700, color: "var(--brand-purple)" }}>
        {family?.label ?? t("addPack")}
      </div>
      <div className="h3">{form.name || t("packName")}</div>
      <div className="body-sm">{t("lessonsCount")}: {form.lessons || 0} · {t("validForDays", { days: Number(form.expiryDays || 0) })}</div>
      <div dir="ltr" style={{ fontSize: 30, fontWeight: 800, color: "var(--brand-purple)", unicodeBidi: "isolate" }}>
        {amount(resolved.netAmount, currency)}
      </div>
      {resolved.onSale && (
        <div className="body-sm" style={{ color: "var(--omnic-gray-600)" }}>
          <span dir="ltr" style={{ textDecoration: "line-through" }}>{amount(resolved.listAmount, currency)}</span>
        </div>
      )}
      {form.benefits.length > 0 && (
        <ul style={{ display: "grid", gap: 4, padding: 0, margin: "6px 0 0", listStyle: "none" }}>
          {form.benefits.map((benefit, index) => (
            <li key={index} className="body-sm">• {benefit.default || "—"}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Order queue ────────────────────────────────────────────────────────

function OrderCard({ order, onGrant, onReject }: { order: OrderRow; onGrant: () => void; onReject: (reason: string) => void }) {
  const t = useTranslations("adminBilling");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <article id={`billing-order-${order.orderId}`} className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 240, flex: "1 1 380px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong>{order.buyerName}</strong><span className="body-sm">{order.buyerStudentId}</span>
          </div>
          <div className="body-sm" style={{ marginTop: 6 }}>{order.planSnapshot.familyLabel} · {order.planSnapshot.planLabel}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("lessonEntitlement")}: {order.planSnapshot.lessonCount} · {t("expiryDays")}: {order.planSnapshot.expiryDays}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("requestTime")}: {new Date(order.requestedAt).toLocaleString()}</div>
          <div className="body-sm" style={{ marginTop: 4 }}>{t("status")}: {t(order.status === "pending_verification" ? "statusPending" : order.status === "granted" ? "statusGranted" : order.status === "rejected" ? "statusRejected" : "statusCancelled")}</div>
          {order.rejectionReason && <div className="body-sm" style={{ marginTop: 4, color: "#B91C1C" }}>{t("reasonShownToStudent")}: {order.rejectionReason}</div>}
        </div>
        <div style={{ minWidth: 200, textAlign: "end" }}>
          {order.priceSnapshot.discountAmount > 0 && (
            <div className="body-sm">
              <span dir="ltr" style={{ textDecoration: "line-through" }}>{amount(order.priceSnapshot.listAmount, order.priceSnapshot.currency)}</span>
            </div>
          )}
          <strong style={{ display: "block", marginTop: 4 }}>{t("netPrice")}: <span dir="ltr">{amount(order.priceSnapshot.netAmount, order.priceSnapshot.currency)}</span></strong>
        </div>
      </div>
      {order.status === "pending_verification" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" onClick={onGrant}>{t("grant")}</Button>
            <Button size="sm" variant="outline" onClick={() => { setRejecting(!rejecting); setReason(""); }}>{t("reject")}</Button>
          </div>
          {rejecting && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}>
              <Textarea rows={2} placeholder={t("reasonShownToStudent")} value={reason} onChange={(event) => setReason(event.target.value)} />
              <Button variant="destructive" disabled={reason.trim().length < 5} onClick={() => onReject(reason)}>{t("confirmReject")}</Button>
            </div>
          )}
        </div>
      )}
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
  const savePack = useMutation(api.pricing.savePack);
  const moveFamily = useMutation(api.pricing.moveFamily);
  const movePack = useMutation(api.pricing.movePack);
  const setFamilyVisible = useMutation(api.pricing.setFamilyVisible);
  const setPackVisible = useMutation(api.pricing.setPackVisible);
  const setPackArchived = useMutation(api.pricing.setPackArchived);
  const setFamilyArchived = useMutation(api.pricing.setFamilyArchived);
  const grantOrder = useMutation(api.pricing.grantOrder);
  const rejectOrder = useMutation(api.pricing.rejectOrder);
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
        description: familyForm.description,
        descriptionEn: familyForm.descriptionEn,
        descriptionRu: familyForm.descriptionRu,
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
        lessons: Number(packForm.lessons),
        currency: packForm.currency,
        price: Number(packForm.price),
        salePrice: packForm.salePrice.trim() === "" ? undefined : Number(packForm.salePrice),
        saleEndsAt: endOfLocalDay(packForm.saleEndsAt),
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
    <div style={{ display: "grid", gap: 20 }}>
      <section className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h2 className="h2" style={{ margin: 0 }}>{t("catalogue")}</h2>
            <p className="body-sm" style={{ marginTop: 4 }}>{t("catalogueHint")}</p>
          </div>
          <Button onClick={() => setFamilyForm(emptyFamily())}>{t("addFamily")}</Button>
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
                    description: family.description ?? "",
                    descriptionEn: family.descriptionEn ?? "",
                    descriptionRu: family.descriptionRu ?? "",
                    isVisible: family.isVisible,
                    showOnWebsite: family.showOnWebsite !== false,
                  })}>{t("edit")}</Button>
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
                      lessons: String(pack.lessons),
                      currency: pack.currency,
                      price: String(pack.price),
                      salePrice: pack.salePrice === undefined ? "" : String(pack.salePrice),
                      saleEndsAt: dateInputValue(pack.saleEndsAt),
                      expiryDays: String(pack.expiryDays),
                      benefits: pack.benefits.map((benefit) => ({ ...benefit })),
                      isVisible: pack.isVisible,
                    })}
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
                onGrant={() => void run(() => grantOrder({ orderId: order.orderId as never }), t("orderGranted"))}
                onReject={(reason) => void run(() => rejectOrder({ orderId: order.orderId as never, reason }), t("orderRejected"))}
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
          <Input value={give.currency} onChange={(event) => setGive({ ...give, currency: event.target.value.toUpperCase() })} placeholder={t("currency")} />
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
              <Input placeholder={t("familyDescription")} value={familyForm.description} onChange={(event) => setFamilyForm({ ...familyForm, description: event.target.value })} />
              <div style={{ display: "flex", gap: 8 }}>
                <Input placeholder={`${t("familyDescription")} · ${t("english")}`} value={familyForm.descriptionEn} onChange={(event) => setFamilyForm({ ...familyForm, descriptionEn: event.target.value })} />
                <Input placeholder={`${t("familyDescription")} · ${t("russian")}`} value={familyForm.descriptionRu} onChange={(event) => setFamilyForm({ ...familyForm, descriptionRu: event.target.value })} />
              </div>
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

      <Dialog open={Boolean(packForm)} onOpenChange={(open) => !open && setPackForm(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{packForm?.id ? t("editPack") : t("addPack")}</DialogTitle>
            <DialogDescription>{t("packHint")}</DialogDescription>
          </DialogHeader>
          {packForm && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <select className="input" value={packForm.familyId} onChange={(event) => setPackForm({ ...packForm, familyId: event.target.value })}>
                    <option value="">{t("chooseFamily")}</option>
                    {families.map((family) => <option key={family._id} value={family._id}>{family.label}</option>)}
                  </select>
                  <Input placeholder={t("packName")} value={packForm.name} onChange={(event) => setPackForm({ ...packForm, name: event.target.value })} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Input placeholder={t("english")} value={packForm.nameEn} onChange={(event) => setPackForm({ ...packForm, nameEn: event.target.value })} />
                    <Input placeholder={t("russian")} value={packForm.nameRu} onChange={(event) => setPackForm({ ...packForm, nameRu: event.target.value })} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
                    <Input type="number" min="1" placeholder={t("lessons")} value={packForm.lessons} onChange={(event) => setPackForm({ ...packForm, lessons: event.target.value })} />
                    <Input type="number" min="0" placeholder={t("price")} value={packForm.price} onChange={(event) => setPackForm({ ...packForm, price: event.target.value })} />
                    <Input value={packForm.currency} placeholder={t("currency")} onChange={(event) => setPackForm({ ...packForm, currency: event.target.value.toUpperCase() })} />
                    <Input type="number" min="1" placeholder={t("expiryDays")} value={packForm.expiryDays} onChange={(event) => setPackForm({ ...packForm, expiryDays: event.target.value })} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <Input type="number" min="0" placeholder={t("salePrice")} value={packForm.salePrice} onChange={(event) => setPackForm({ ...packForm, salePrice: event.target.value })} />
                    <Input type="date" aria-label={t("endsOn")} value={packForm.saleEndsAt} onChange={(event) => setPackForm({ ...packForm, saleEndsAt: event.target.value })} />
                    <label className="body-sm" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={packForm.isVisible} onChange={(event) => setPackForm({ ...packForm, isVisible: event.target.checked })} />
                      {t("visible")}
                    </label>
                  </div>
                  <p className="body-sm">{t("salePriceHint")}</p>
                </div>
                <PackPreview form={packForm} families={families} />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <strong className="body-sm">{t("benefits")}</strong>
                {packForm.benefits.map((benefit, index) => (
                  <div key={index} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 8 }}>
                    <Input aria-label={`${t("benefits")} ${index + 1}`} placeholder={t("benefitPlaceholder")} value={benefit.default} onChange={(event) => setPackForm({ ...packForm, benefits: packForm.benefits.map((row, i) => i === index ? { ...row, default: event.target.value } : row) })} />
                    <Input placeholder={t("english")} value={benefit.en ?? ""} onChange={(event) => setPackForm({ ...packForm, benefits: packForm.benefits.map((row, i) => i === index ? { ...row, en: event.target.value } : row) })} />
                    <Input placeholder={t("russian")} value={benefit.ru ?? ""} onChange={(event) => setPackForm({ ...packForm, benefits: packForm.benefits.map((row, i) => i === index ? { ...row, ru: event.target.value } : row) })} />
                    <Button variant="outline" size="sm" onClick={() => setPackForm({ ...packForm, benefits: packForm.benefits.filter((_, i) => i !== index) })}>{t("remove")}</Button>
                  </div>
                ))}
                <div>
                  <Button variant="outline" onClick={() => setPackForm({ ...packForm, benefits: [...packForm.benefits, { default: "", en: "", ru: "" }] })}>{t("addBenefit")}</Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPackForm(null)}>{t("cancel")}</Button>
            <Button disabled={busy || !packForm?.name.trim() || !packForm?.familyId || !packForm?.price} onClick={() => void submitPack()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackRowView({ pack, busy, onEdit, onMove, onToggleVisible, onToggleArchived }: {
  pack: PackRow;
  busy: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggleVisible: () => void;
  onToggleArchived: () => void;
}) {
  const t = useTranslations("adminBilling");
  // The row shows the configured sale, not a live quote: an end date in the
  // past simply stops applying on its own (see `isSaleActive`).
  const configuredSale = pack.salePrice !== undefined && pack.salePrice < pack.price;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 12px", border: "1px solid var(--omnic-gray-200)", borderRadius: 10 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <strong>{pack.name}</strong>
        <span className="body-sm">{t("lessonsCount")}: {pack.lessons}</span>
        <span className="body-sm">{t("validForDays", { days: pack.expiryDays })}</span>
        <span className="body-sm">
          <span dir="ltr">{amount(pack.price, pack.currency)}</span>
          {configuredSale && (
            <>
              {" → "}
              <strong dir="ltr">{amount(pack.salePrice as number, pack.currency)}</strong>
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
        <Button size="sm" variant="outline" disabled={busy} onClick={onToggleArchived}>{pack.isArchived ? t("restore") : t("archive")}</Button>
      </div>
    </div>
  );
}
