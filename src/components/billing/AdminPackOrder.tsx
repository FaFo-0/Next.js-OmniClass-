"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { toast } from "sonner";
import { api } from "@convex";
import type { Id } from "../../../convex/_generated/dataModel";
import { userHasPermission } from "../../../convex/lib/permissions";
import { orderAdminLink } from "../../../convex/lib/pricingCatalogue";
import { errText } from "@/lib/convexError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CurrencyInput } from "./CurrencyInput";
import { formatBillingAmount } from "./billingView";

function academyToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function AdminPackOrder() {
  const [open, setOpen] = useState(false);
  const me = useQuery(api.users.getMe);
  return <section className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-5">
    <div>
      <h2 className="h2">WhatsApp purchases</h2>
      <p className="body-sm mt-1">Order a pack for a student, apply a code, and grant their lessons once paid.</p>
    </div>
    <Button disabled={!me || !userHasPermission(me, "billing.edit")} onClick={() => setOpen(true)}>Order for a student</Button>
    {open && <AdminPackOrderDialog onClose={() => setOpen(false)} />}
  </section>;
}

function AdminPackOrderDialog({ onClose }: { onClose: () => void }) {
  const [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [packId, setPackId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [code, setCode] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(academyToday);
  const [paymentOverride, setPaymentOverride] = useState({ key: "", amount: "", currency: "" });
  const [equivalent, setEquivalent] = useState({ key: "", value: "" });
  const [completed, setCompleted] = useState<{ granted: boolean; studentName: string; teacherId: string | null; orderId: string } | null>(null);
  const request = useRef({ fingerprint: "", key: "" });
  const create = useMutation(api.pricing.createAdminOrder);
  const options = useQuery(api.pricing.getAdminOrderOptions, { currency });
  const selectedStudent = options?.students.find(student => student.studentId === studentId);
  const selectedPack = options?.groups.flatMap(group => group.packs).find(pack => pack.packId === packId);
  const result = useQuery(api.pricing.previewAdminOrder, selectedStudent && selectedPack && !completed ? {
    studentId, packId: packId as Id<"packs">, currency, discountCode: appliedCode || undefined,
  } : "skip");
  const preview = result?.preview;
  const price = preview?.priceSnapshot;
  const paymentKey = `${studentId}|${packId}|${currency}|${appliedCode}|${price?.netAmount}`;
  const received = paymentOverride.key === paymentKey ? paymentOverride.amount : String(price?.netAmount ?? "");
  const receivedCurrency = paymentOverride.key === paymentKey ? paymentOverride.currency : currency;
  const equivalentKey = `${received}|${receivedCurrency}|${paymentDate}`;
  const usdEquivalent = equivalent.key === equivalentKey && equivalent.value ? Number(equivalent.value) : undefined;
  const today = academyToday();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) && paymentDate <= today;
  const rate = useQuery(api.finance.rateForEntry, paid && validDate && !completed ? { date: paymentDate, currency: receivedCurrency } : "skip");
  const needsEquivalent = rate?.available === false;
  const unappliedCode = code.trim().toUpperCase() !== appliedCode;
  const validPayment = received !== "" && Number.isFinite(Number(received)) && Number(received) >= 0 && validDate && rate &&
    (!needsEquivalent || (usdEquivalent !== undefined && Number.isFinite(usdEquivalent) && usdEquivalent > 0));
  const canSubmit = !busy && selectedStudent && preview && !result?.pendingOrderId && !unappliedCode && (!paid || validPayment);
  const filteredStudents = options?.students.filter(student => student.studentId === studentId || `${student.name} ${student.email}`.toLowerCase().includes(search.toLowerCase())) ?? [];

  async function submit() {
    if (!canSubmit || !price || !selectedStudent) return;
    setBusy(true);
    setError(null);
    const args = {
      studentId, packId: packId as Id<"packs">, currency, discountCode: appliedCode || undefined,
      expectedAmount: price.netAmount,
      payment: paid ? { amount: Number(received), currency: receivedCurrency, date: paymentDate, usdEquivalent: needsEquivalent ? usdEquivalent : undefined } : undefined,
    };
    const fingerprint = JSON.stringify(args);
    if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const order = await create({ ...args, requestKey: request.current.key });
      setCompleted({ granted: order.status === "granted", studentName: selectedStudent.name, teacherId: selectedStudent.teacherId, orderId: order.orderId });
      toast.success(order.status === "granted" ? "Payment recorded and lessons granted" : "Order created — awaiting payment");
    } catch (cause) { setError(errText(cause)); }
    finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={next => { if (!next && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-2xl" style={{ maxHeight: "calc(100dvh - 2rem)", display: "flex", flexDirection: "column", overflow: "hidden", padding: 0, gap: 0 }}>
      <DialogHeader className="shrink-0 px-5 py-5 pe-12">
        <DialogTitle>{completed ? "Order saved" : "Order for a student"}</DialogTitle>
        <DialogDescription>{completed ? `Purchase for ${completed.studentName}.` : "Use this for purchases arranged on WhatsApp. The student needs an existing account."}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto px-5 pb-5">
        {completed ? <div className="space-y-4">
          <p>{completed.granted ? "Payment is recorded and the pack’s lessons are now in the student’s balance." : "The order is awaiting payment in the order queue. Record the payment there to grant the lessons."}</p>
          <div className="flex flex-wrap gap-3">
            <Link className="text-primary underline" href={orderAdminLink(completed.orderId)} onClick={onClose}>View order</Link>
            {completed.granted && <Link className="text-primary underline" href={completed.teacherId ? `/admin/calendar?teacher=${encodeURIComponent(completed.teacherId)}` : "/admin/calendar"}>Book lessons in calendar</Link>}
          </div>
          {completed.granted && <p className="body-sm">In the teacher’s calendar, choose Add lesson and select {completed.studentName}.</p>}
        </div> : <fieldset disabled={busy} className="min-w-0 space-y-5">
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm">Find student<Input type="search" placeholder="Search name or email" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label className="grid gap-1 text-sm">Student<select className="input w-full" value={studentId} onChange={event => setStudentId(event.target.value)} disabled={!options}>
              <option value="">{options ? "Choose a student" : "Loading students…"}</option>
              {filteredStudents.map(student => <option key={student.studentId} value={student.studentId}>{student.name}{student.email ? ` · ${student.email}` : ""}</option>)}
            </select></label>
            {options && options.students.length === 0 && <p className="body-sm">No student accounts yet. Invite the student through People first.</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm">Pack<select className="input w-full" value={packId} onChange={event => setPackId(event.target.value)} disabled={!options}>
              <option value="">Choose a pack</option>
              {options?.groups.map(group => <optgroup key={group.familyId} label={group.label}>{group.packs.map(pack => <option key={pack.packId} value={pack.packId}>{pack.name} · {formatBillingAmount(pack.netPrice, pack.currency)}</option>)}</optgroup>)}
            </select></label>
            <label className="grid min-w-0 gap-1 text-sm">Order currency<CurrencyInput value={currency} onChange={setCurrency} label="Order currency" /></label>
          </div>
          {options?.groups.length === 0 && <p className="body-sm">Make a pack visible in the catalogue to order it.</p>}
          <div>
            <label className="grid gap-1 text-sm">Discount code (optional)<div className="flex gap-2">
              <Input dir="ltr" value={code} maxLength={40} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="Enter a code" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setAppliedCode(code.trim().toUpperCase()); } }} />
              <Button variant="outline" disabled={!code.trim() || !unappliedCode} onClick={() => setAppliedCode(code.trim().toUpperCase())}>Apply</Button>
              {(code || appliedCode) && <Button variant="ghost" onClick={() => { setCode(""); setAppliedCode(""); }}>Clear</Button>}
            </div></label>
            {unappliedCode && <p className="body-sm mt-1">Apply or clear the code before confirming.</p>}
            {result?.error && <p role="alert" className="mt-2 text-sm text-destructive">{result.error}</p>}
          </div>
          {price && preview && <div className="space-y-2 rounded-xl border p-4" style={{ background: "var(--brand-purple-tint)" }}>
            <strong>{preview.offer.familyLabel} · {preview.offer.name}</strong>
            <p className="body-sm">{preview.planSnapshot.lessonCount} lessons · Valid for {preview.planSnapshot.expiryDays} days from first use</p>
            {price.discountAmount > 0 && <div className="flex flex-wrap justify-between gap-2 text-sm"><span>Original price</span><s className="text-red-600" dir="ltr">{formatBillingAmount(price.listAmount, currency)}</s></div>}
            {"discountCode" in price && <p className="text-sm">{price.discountCode} · Extra {price.codePercent}% off the current price</p>}
            <div className="flex flex-wrap justify-between gap-2 border-t pt-2 font-bold"><span>Total to pay</span><span className="text-primary" dir="ltr">{formatBillingAmount(price.netAmount, currency)}</span></div>
          </div>}
          {result?.pendingOrderId ? <p role="status" className="rounded-xl border p-3 text-sm">This student already has an order awaiting payment. <Link className="text-primary underline" href={orderAdminLink(result.pendingOrderId)} onClick={onClose}>Open their existing order</Link> to complete or reject it first.</p> : <div className="space-y-3 border-t pt-4">
            <label className="flex items-start gap-3 text-sm"><input className="mt-1 size-4" type="checkbox" checked={paid} onChange={event => setPaid(event.target.checked)} /><span><strong>Payment received — grant lessons now</strong><span className="body-sm mt-1 block">Leave unchecked to create an order awaiting payment.</span></span></label>
            {paid && <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Amount received<Input type="number" min="0" step="any" value={received} onChange={event => setPaymentOverride({ key: paymentKey, amount: event.target.value, currency: receivedCurrency })} /></label>
              <label className="grid min-w-0 gap-1 text-sm">Payment currency<CurrencyInput label="Payment currency" value={receivedCurrency} onChange={next => setPaymentOverride({ key: paymentKey, amount: received, currency: next })} /></label>
              <label className="grid gap-1 text-sm">Payment date<Input type="date" max={today} value={paymentDate} onChange={event => setPaymentDate(event.target.value)} /></label>
              {needsEquivalent && <label className="grid gap-1 text-sm">USD equivalent received<Input type="number" min="0.01" step="0.01" value={equivalent.key === equivalentKey ? equivalent.value : ""} onChange={event => setEquivalent({ key: equivalentKey, value: event.target.value })} /><span className="body-sm">No saved rate for this date; enter the equivalent for this payment.</span></label>}
              {receivedCurrency !== currency && <p className="body-sm sm:col-span-2">Enter the actual amount received in {receivedCurrency}. The order total stays in {currency}.</p>}
            </div>}
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </fieldset>}
      </div>
      <DialogFooter className="shrink-0" style={{ margin: 0 }}>
        <Button variant="outline" disabled={busy} onClick={onClose}>{completed ? "Done" : "Cancel"}</Button>
        {!completed && <Button disabled={!canSubmit} onClick={() => void submit()}>{busy ? "Saving…" : paid ? "Record payment & grant pack" : "Create order — awaiting payment"}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
