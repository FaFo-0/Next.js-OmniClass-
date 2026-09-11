"use client";

/* Convex's generated catalogue rows are intentionally kept behind this UI boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";

const EMPTY_LABELS = { default: "", en: "", ru: "", ar: "", kk: "" };

function LabelsForm({ value, onChange }: { value: typeof EMPTY_LABELS; onChange: (value: typeof EMPTY_LABELS) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6 }}>
      {(Object.keys(EMPTY_LABELS) as Array<keyof typeof EMPTY_LABELS>).map((locale) => (
        <input key={locale} className="input" placeholder={locale === "default" ? "Default" : locale.toUpperCase()} value={value[locale]} onChange={(event) => onChange({ ...value, [locale]: event.target.value })} />
      ))}
    </div>
  );
}

function money(amount: number, currency: string) {
  return `${amount.toLocaleString()} ${currency}`;
}

export function BillingOperations() {
  const catalogue = useQuery(api.billing.listCatalogue, {}) as any;
  const orders = (useQuery(api.billing.listOrders, {}) ?? []) as any[];
  const discounts = (useQuery(api.billing.listDiscounts, {}) ?? []) as any[];
  const seed = useMutation(api.billing.seedInitialCatalogue);
  const grant = useMutation(api.billing.grantOrder);
  const reject = useMutation(api.billing.rejectOrder);
  const saveFamily = useMutation(api.billing.saveFamily);
  const savePlan = useMutation(api.billing.savePlan);
  const saveVersion = useMutation(api.billing.savePlanVersionDraft);
  const saveBenefits = useMutation(api.billing.savePlanBenefits);
  const publishVersion = useMutation(api.billing.publishPlanVersion);
  const archiveVersion = useMutation(api.billing.archivePlanVersion);
  const saveDiscount = useMutation(api.billing.saveDiscount);
  const setDiscountActive = useMutation(api.billing.setDiscountActive);

  const [familyLabels, setFamilyLabels] = useState(EMPTY_LABELS);
  const [familyKey, setFamilyKey] = useState("");
  const [planFamilyId, setPlanFamilyId] = useState("");
  const [planKey, setPlanKey] = useState("");
  const [planLabels, setPlanLabels] = useState(EMPTY_LABELS);
  const [versionPlanId, setVersionPlanId] = useState("");
  const [versionLessons, setVersionLessons] = useState("4");
  const [versionPrice, setVersionPrice] = useState("15000");
  const [versionCurrency, setVersionCurrency] = useState("KZT");
  const [versionExpiry, setVersionExpiry] = useState("60");
  const [versionScope, setVersionScope] = useState<"replace_for_everyone" | "new_clients_only">("replace_for_everyone");
  const [benefitVersionId, setBenefitVersionId] = useState("");
  const [benefitText, setBenefitText] = useState("");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [discountName, setDiscountName] = useState("");
  const [discountKind, setDiscountKind] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [discountCurrency, setDiscountCurrency] = useState("KZT");
  const [discountScope, setDiscountScope] = useState<"all_plans" | "family" | "plan">("all_plans");
  const [discountFamilyId, setDiscountFamilyId] = useState("");
  const [discountPlanId, setDiscountPlanId] = useState("");
  const [discountEligibility, setDiscountEligibility] = useState<"everyone" | "new_clients_only" | "allowlist">("everyone");
  const [discountStartsAt, setDiscountStartsAt] = useState(() => new Date().toISOString());
  const [discountEndsAt, setDiscountEndsAt] = useState("");
  const [discountPriority, setDiscountPriority] = useState("100");

  const families = catalogue?.families ?? [];
  const plans = catalogue?.plans ?? [];
  const versions = catalogue?.versions ?? [];
  const plansByFamily = new Map<string, any>(plans.map((plan: any) => [String(plan.familyId), plan]));
  const pendingOrders = orders.filter((order) => order.status === "pending_verification");

  async function run(action: () => Promise<unknown>, success: string) {
    try { await action(); toast.success(success); } catch (error) { toast.error((error as Error).message); }
  }

  function labelsOrDefault(value: typeof EMPTY_LABELS) {
    const fallback = value.default.trim();
    return { default: fallback, en: value.en.trim() || fallback, ru: value.ru.trim() || fallback, ar: value.ar.trim() || fallback, kk: value.kk.trim() || fallback };
  }

  async function createDraft() {
    const plan = plans.find((candidate: any) => candidate._id === versionPlanId);
    if (!plan) return;
    await run(() => saveVersion({ planId: versionPlanId as never, familyId: plan.familyId as never, lessonCount: Number(versionLessons), currency: versionCurrency, listPrice: Number(versionPrice), expiryDays: Number(versionExpiry), visibility: "visible", publicationScope: versionScope }), "Draft created");
  }

  async function saveBenefitRows() {
    const rows = benefitText.split("\n").map((text, sortOrder) => ({ sortOrder, labels: { default: text, en: text, ru: text, ar: text, kk: text } })).filter((benefit) => benefit.labels.default.trim());
    await run(() => saveBenefits({ planVersionId: benefitVersionId as never, benefits: rows }), "Benefits saved");
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div><h2 className="h2" style={{ margin: 0 }}>Catalogue</h2><p className="body-sm" style={{ marginTop: 4 }}>Versioned families, plans, benefits and rollout scope. Published versions are immutable.</p></div>
          <button className="btn btn-tenant btn-sm" onClick={() => void run(() => seed({}), "Initial catalogue is ready")}>Seed approved catalogue</button>
        </div>
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {families.map((family: any) => <div key={family._id} style={{ borderTop: "1px solid var(--omnic-gray-200)", paddingTop: 12 }}><div className="h3">{family.labels.default}</div>{plans.filter((plan: any) => plan.familyId === family._id).map((plan: any) => <div key={plan._id} style={{ marginTop: 8, paddingInlineStart: 12 }}><strong>{plan.labels.default}</strong>{versions.filter((version: any) => version.planId === plan._id).sort((a: any, b: any) => b.version - a.version).map((version: any) => <div key={version._id} className="body-sm" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}><span className="pill">v{version.version} · {version.status} · {version.visibility}</span><span>{version.lessonCount} lessons · {money(version.listPrice, version.currency)} · {version.expiryDays}d</span>{version.status === "draft" && <button className="btn btn-secondary btn-sm" onClick={() => void run(() => publishVersion({ planVersionId: version._id, publicationScope: version.publicationScope }), "Version published")}>Publish</button>}{version.status !== "archived" && <button className="btn btn-secondary btn-sm" onClick={() => void run(() => archiveVersion({ planVersionId: version._id }), "Version archived")}>Archive</button>}</div>)}</div>)}</div>)}
          {families.length === 0 && <div className="body-sm">No versioned catalogue yet. Seed the approved IELTS and Basic Tutoring catalogue or create one below.</div>}
        </div>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <h3 className="h3">Add family, plan, or version</h3>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <input className="input" placeholder="Family key (e.g. conversation)" value={familyKey} onChange={(event) => setFamilyKey(event.target.value)} />
          <LabelsForm value={familyLabels} onChange={setFamilyLabels} />
          <button className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }} onClick={() => void run(() => saveFamily({ key: familyKey, labels: labelsOrDefault(familyLabels), sortOrder: families.length + 1, isArchived: false }), "Family saved")}>Save family</button>
          <select className="input" value={planFamilyId} onChange={(event) => setPlanFamilyId(event.target.value)}><option value="">Family for new plan…</option>{families.map((family: any) => <option key={family._id} value={family._id}>{family.labels.default}</option>)}</select>
          <input className="input" placeholder="Plan key" value={planKey} onChange={(event) => setPlanKey(event.target.value)} />
          <LabelsForm value={planLabels} onChange={setPlanLabels} />
          <button className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }} disabled={!planFamilyId} onClick={() => void run(() => savePlan({ familyId: planFamilyId as never, key: planKey, labels: labelsOrDefault(planLabels), sortOrder: plans.length + 1, isArchived: false }), "Plan saved")}>Save plan</button>
          <div style={{ borderTop: "1px solid var(--omnic-gray-200)", paddingTop: 10, display: "grid", gap: 8 }}>
            <select className="input" value={versionPlanId} onChange={(event) => setVersionPlanId(event.target.value)}><option value="">Plan for new draft…</option>{plans.map((plan: any) => <option key={plan._id} value={plan._id}>{plansByFamily.get(String(plan.familyId))?.labels.default ?? ""} · {plan.labels.default}</option>)}</select>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}><input className="input" type="number" min="1" value={versionLessons} onChange={(event) => setVersionLessons(event.target.value)} placeholder="Lessons" /><input className="input" type="number" min="0" value={versionPrice} onChange={(event) => setVersionPrice(event.target.value)} placeholder="Price" /><input className="input" value={versionCurrency} onChange={(event) => setVersionCurrency(event.target.value)} placeholder="Currency" /><input className="input" type="number" min="1" value={versionExpiry} onChange={(event) => setVersionExpiry(event.target.value)} placeholder="Expiry days" /></div>
            <select className="input" value={versionScope} onChange={(event) => setVersionScope(event.target.value as typeof versionScope)}><option value="replace_for_everyone">Replace for everyone (future requests)</option><option value="new_clients_only">New clients only</option></select>
            <button className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }} disabled={!versionPlanId} onClick={() => { void createDraft(); }}>Create draft version</button>
          </div>
          <div style={{ borderTop: "1px solid var(--omnic-gray-200)", paddingTop: 10, display: "grid", gap: 8 }}><select className="input" value={benefitVersionId} onChange={(event) => setBenefitVersionId(event.target.value)}><option value="">Draft to edit benefits…</option>{versions.filter((version: any) => version.status === "draft").map((version: any) => <option key={version._id} value={version._id}>v{version.version} · {version.lessonCount} lessons</option>)}</select><textarea className="input" rows={3} placeholder="One benefit per line" value={benefitText} onChange={(event) => setBenefitText(event.target.value)} /><button className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }} disabled={!benefitVersionId} onClick={() => { void saveBenefitRows(); }}>Save benefits</button></div>
        </div>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <h2 className="h2" style={{ margin: 0 }}>Order queue</h2><p className="body-sm" style={{ marginTop: 4 }}>Verify Kaspi/payment outside the platform, then grant exactly once. Pending orders retain their accepted snapshots.</p>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>{pendingOrders.map((order) => <div key={order.orderId} style={{ border: "1px solid #F59E0B", borderRadius: 10, padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><strong>{order.buyerName}</strong> · {order.planSnapshot.familyLabel} · {order.planSnapshot.planLabel}<div className="body-sm" style={{ marginTop: 4 }}>{money(order.priceSnapshot.netAmount, order.priceSnapshot.currency)} · {order.planSnapshot.lessonCount} lessons · requested {new Date(order.requestedAt).toLocaleString()}</div></div><div style={{ display: "flex", gap: 8 }}><button className="btn btn-tenant btn-sm" onClick={() => void run(() => grant({ orderId: order.orderId as never }), "Order granted")}>Grant</button><button className="btn btn-secondary btn-sm" onClick={() => setRejecting(rejecting === order.orderId ? null : order.orderId)}>Reject</button></div></div>{rejecting === order.orderId && <div style={{ display: "flex", gap: 8, marginTop: 10 }}><input className="input" placeholder="Reason shown to student" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /><button className="btn btn-secondary btn-sm" disabled={!rejectReason.trim()} onClick={() => void run(() => reject({ orderId: order.orderId as never, reason: rejectReason }), "Order rejected")}>Confirm rejection</button></div>}</div>)}{pendingOrders.length === 0 && <div className="body-sm">No pending order requests.</div>}</div>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <h2 className="h2" style={{ margin: 0 }}>Automatic discounts</h2><p className="body-sm" style={{ marginTop: 4 }}>Admin-created rules only: one matching rule per order, no stacking, no voucher codes.</p>
        <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>Name</th><th>Rule</th><th>Scope</th><th>Window</th><th>Active</th><th /></tr></thead><tbody>{discounts.map((discount) => <tr key={discount._id}><td>{discount.name}</td><td>{discount.kind === "percent" ? `${discount.value}%` : money(discount.value, discount.currency ?? "")}</td><td>{discount.scope} · {discount.eligibility}</td><td>{discount.startsAt.slice(0, 10)}{discount.endsAt ? ` → ${discount.endsAt.slice(0, 10)}` : ""}</td><td>{discount.isActive ? "Yes" : "No"}</td><td><button className="btn btn-secondary btn-sm" onClick={() => void run(() => setDiscountActive({ discountId: discount._id as never, isActive: !discount.isActive }), discount.isActive ? "Discount paused" : "Discount activated")}>{discount.isActive ? "Pause" : "Activate"}</button></td></tr>)}</tbody></table></div>
        <div style={{ display: "grid", gap: 8, marginTop: 14 }}><input className="input" placeholder="Discount name" value={discountName} onChange={(event) => setDiscountName(event.target.value)} /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}><select className="input" value={discountKind} onChange={(event) => setDiscountKind(event.target.value as typeof discountKind)}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select><input className="input" type="number" min="0" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /><input className="input" value={discountCurrency} onChange={(event) => setDiscountCurrency(event.target.value)} placeholder="Currency" /><input className="input" type="number" value={discountPriority} onChange={(event) => setDiscountPriority(event.target.value)} placeholder="Priority" /></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}><select className="input" value={discountScope} onChange={(event) => setDiscountScope(event.target.value as typeof discountScope)}><option value="all_plans">All plans</option><option value="family">Family</option><option value="plan">Plan</option></select><select className="input" value={discountFamilyId} onChange={(event) => setDiscountFamilyId(event.target.value)}><option value="">Family scope…</option>{families.map((family: any) => <option key={family._id} value={family._id}>{family.labels.default}</option>)}</select><select className="input" value={discountPlanId} onChange={(event) => setDiscountPlanId(event.target.value)}><option value="">Plan scope…</option>{plans.map((plan: any) => <option key={plan._id} value={plan._id}>{plan.labels.default}</option>)}</select><select className="input" value={discountEligibility} onChange={(event) => setDiscountEligibility(event.target.value as typeof discountEligibility)}><option value="everyone">Everyone</option><option value="new_clients_only">New clients only</option><option value="allowlist">Allowlist</option></select></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}><input className="input" value={discountStartsAt} onChange={(event) => setDiscountStartsAt(event.target.value)} placeholder="Starts ISO timestamp" /><input className="input" value={discountEndsAt} onChange={(event) => setDiscountEndsAt(event.target.value)} placeholder="Ends ISO timestamp (optional)" /></div><button className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }} disabled={!discountName.trim()} onClick={() => void run(() => saveDiscount({ name: discountName, kind: discountKind, value: Number(discountValue), currency: discountKind === "fixed" ? discountCurrency : undefined, scope: discountScope, familyId: discountScope === "family" ? discountFamilyId as never : undefined, planId: discountScope === "plan" ? discountPlanId as never : undefined, eligibility: discountEligibility, priority: Number(discountPriority), startsAt: discountStartsAt, endsAt: discountEndsAt || undefined, isActive: true }), "Discount saved")}>Create automatic discount</button></div>
      </section>
    </div>
  );
}
