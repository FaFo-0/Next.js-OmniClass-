"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ExpensesTab,
  FinanceOverview,
  MoneyLedgerTab,
  PayrollTab,
} from "@/components/billing/FinanceTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";
import { useCurrency } from "@/lib/format/useCurrency";

// Human labels for the region slugs the pack catalog uses.
const REGION_LABELS: Record<string, string> = {
  central_asia: "Central Asia",
  gulf: "Gulf",
};
function regionLabel(r?: string) {
  if (!r) return "Uncategorized";
  return REGION_LABELS[r] ?? r;
}
/** Local price in the pack's own currency ("30,000 ₸"). */
function fmtLocal(pkg: any): string {
  if (pkg.priceLocal == null || !pkg.currency) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: pkg.currency,
      maximumFractionDigits: 0,
    }).format(pkg.priceLocal);
  } catch {
    return `${pkg.priceLocal} ${pkg.currency}`;
  }
}

type PackForm = {
  id?: string;
  externalId: string;
  name: string;
  points: string;
  region: string;
  currency: string;
  priceLocal: string;
  priceUSD: string;
  expiryDays: string;
  isActive: boolean;
};

const EMPTY_PACK: PackForm = {
  externalId: "",
  name: "",
  points: "",
  region: "central_asia",
  currency: "KZT",
  priceLocal: "",
  priceUSD: "",
  expiryDays: "60",
  isActive: true,
};

export default function BillingPage() {
  const allUsers = useQuery(api.users.listUsers) ?? [];
  const balances = useQuery(api.points.getBalancesForOrg) ?? [];
  const packages = useQuery(api.points.listPackages, {}) ?? [];
  const transactions = useQuery(api.points.listOrgTransactions, {}) ?? [];
  const pendingClaims = useQuery(api.payments.listPendingClaims, {}) ?? [];
  const { format } = useCurrency();

  const students = allUsers.filter((u) => u.role === "student");
  const usersMap = new Map(allUsers.map((u: any) => [u.externalId, u]));

  const totalActiveBalance = balances.reduce(
    (sum: number, b: any) => sum + b.balance,
    0
  );

  // Packs grouped by region so the catalog reads as the price sheet it is.
  const packsByRegion = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of packages) {
      const key = p.region ?? "_none";
      (m.get(key) ?? m.set(key, []).get(key)!).push(p);
    }
    for (const list of m.values()) list.sort((a, b) => a.points - b.points);
    return [...m.entries()];
  }, [packages]);

  // ── Grant flow ────────────────────────────────────────────────
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantStudent, setGrantStudent] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [grantPackId, setGrantPackId] = useState("");
  const grantPoints = useMutation(api.points.grantPoints);

  function openGrant(prefillPack?: any) {
    setGrantStudent("");
    setGrantReason("");
    if (prefillPack) {
      setGrantPackId(prefillPack._id);
      setGrantAmount(String(prefillPack.points));
    } else {
      setGrantPackId("");
      setGrantAmount("");
    }
    setGrantOpen(true);
  }

  async function submitGrant() {
    const amount = Number(grantAmount);
    if (!grantStudent || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Pick a student and a positive number of lessons");
      return;
    }
    try {
      await grantPoints({
        studentId: grantStudent,
        points: amount,
        source: grantPackId ? "purchase" : "manual",
        packageId: grantPackId ? (grantPackId as any) : undefined,
        notes: grantReason || undefined,
      });
      toast.success(`Granted ${amount} lesson${amount === 1 ? "" : "s"}`);
      setGrantOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ── Deduct / remove lessons ───────────────────────────────────
  const deductPoints = useMutation(api.points.deductPoints);
  const [deductFor, setDeductFor] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [deductAmount, setDeductAmount] = useState("");
  const [deductReason, setDeductReason] = useState("");

  async function submitDeduct() {
    if (!deductFor) return;
    const amount = Number(deductAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a positive number of lessons to remove");
      return;
    }
    try {
      const r = await deductPoints({
        studentId: deductFor.id,
        amount,
        notes: deductReason || undefined,
      });
      toast.success(
        `Removed ${r.deducted} lesson${r.deducted === 1 ? "" : "s"} — ${r.balanceAfter} left`
      );
      setDeductFor(null);
      setDeductAmount("");
      setDeductReason("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ── Pack editor ───────────────────────────────────────────────
  const upsertPackage = useMutation(api.points.upsertPackage);
  const seedPackages = useMutation(api.points.seedPackages);
  const [packOpen, setPackOpen] = useState(false);
  const [pack, setPack] = useState<PackForm>(EMPTY_PACK);
  const [packBusy, setPackBusy] = useState(false);

  function openNewPack() {
    setPack(EMPTY_PACK);
    setPackOpen(true);
  }
  function openEditPack(p: any) {
    setPack({
      id: p._id,
      externalId: p.externalId,
      name: p.name,
      points: String(p.points),
      region: p.region ?? "central_asia",
      currency: p.currency ?? "KZT",
      priceLocal: p.priceLocal != null ? String(p.priceLocal) : "",
      priceUSD: String(p.priceUSD ?? ""),
      expiryDays: p.expiryDays != null ? String(p.expiryDays) : "",
      isActive: p.isActive,
    });
    setPackOpen(true);
  }

  async function submitPack() {
    const points = Number(pack.points);
    const priceUSD = Number(pack.priceUSD);
    if (!pack.name || !Number.isFinite(points) || points <= 0) {
      toast.error("Name and a positive lesson count are required");
      return;
    }
    if (!Number.isFinite(priceUSD) || priceUSD < 0) {
      toast.error("Price (USD) must be a number");
      return;
    }
    setPackBusy(true);
    try {
      await upsertPackage({
        id: pack.id ? (pack.id as any) : undefined,
        externalId: pack.externalId || `${pack.region}_${points}_${Date.now()}`,
        name: pack.name,
        points,
        priceUSD,
        region: pack.region || undefined,
        currency: pack.currency || undefined,
        priceLocal: pack.priceLocal ? Number(pack.priceLocal) : undefined,
        expiryDays: pack.expiryDays ? Number(pack.expiryDays) : undefined,
        isActive: pack.isActive,
        sortOrder: points, // sensible default; region view sorts by lessons anyway
      });
      toast.success(pack.id ? "Pack updated" : "Pack created");
      setPackOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPackBusy(false);
    }
  }

  async function doSeed() {
    try {
      const r = await seedPackages({});
      toast.success(`Seeded ${r.created} new, updated ${r.updated}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const grantPack = grantPackId
    ? packages.find((p: any) => p._id === grantPackId)
    : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Billing</h1>
          <div className="body" style={{ marginTop: 4 }}>
            Income, costs, teacher pay, lesson balances and the pack catalogue.
          </div>
        </div>
        <button className="btn btn-tenant" onClick={() => openGrant()}>
          <Icon name="plus" size={14} /> Grant lessons
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatBox label="Students with balance" value={balances.length} />
        <StatBox label="Total active lessons" value={totalActiveBalance} />
        <StatBox label="Active packs" value={packages.filter((p: any) => p.isActive).length} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="packages">Packs ({packages.length})</TabsTrigger>
          <TabsTrigger value="howtopay">How students pay</TabsTrigger>
          <TabsTrigger value="payments">Payments ({pendingClaims.length})</TabsTrigger>
          <TabsTrigger value="money">Money ledger</TabsTrigger>
          <TabsTrigger value="records">Lesson ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <FinanceOverview />
        </TabsContent>

        <TabsContent value="payroll" className="mt-3">
          <PayrollTab />
        </TabsContent>

        <TabsContent value="expenses" className="mt-3">
          <ExpensesTab />
        </TabsContent>

        <TabsContent value="howtopay" className="mt-3">
          <ManualPaymentTab />
        </TabsContent>

        <TabsContent value="payments" className="mt-3">
          <ClaimsTab />
        </TabsContent>

        <TabsContent value="money" className="mt-3">
          <MoneyLedgerTab />
        </TabsContent>

        <TabsContent value="balances" className="mt-3">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Active lessons</th>
                  <th>Next expiry</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b: any) => {
                  const student = usersMap.get(b.studentId) as any;
                  return (
                    <tr key={b.studentId}>
                      <td style={{ fontWeight: 600 }}>{student?.name ?? b.studentId}</td>
                      <td>{b.balance}</td>
                      <td className="muted">
                        {b.nextExpiresAt && b.nextExpiresAt < "9999"
                          ? b.nextExpiresAt
                          : "—"}
                      </td>
                      <td style={{ textAlign: "end" }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={b.balance <= 0}
                          onClick={() => {
                            setDeductFor({
                              id: b.studentId,
                              name: student?.name ?? b.studentId,
                              balance: b.balance,
                            });
                            setDeductAmount("");
                            setDeductReason("");
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {balances.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                      No active balances. Grant lessons to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="packages" className="mt-3">
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Button size="sm" onClick={openNewPack}>
              <Icon name="plus" size={14} /> New pack
            </Button>
            {packages.length === 0 && (
              <Button size="sm" variant="outline" onClick={doSeed}>
                Seed default catalog
              </Button>
            )}
          </div>

          {packages.length === 0 ? (
            <div className="card body-sm" style={{ padding: 32, textAlign: "center" }}>
              No packs yet. Create one, or seed the CA + Gulf default catalog.
            </div>
          ) : (
            packsByRegion.map(([region, list]) => (
              <div key={region} style={{ marginBottom: 20 }}>
                <div className="h3" style={{ marginBottom: 8 }}>{regionLabel(region === "_none" ? undefined : region)}</div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Lessons</th>
                        <th>Local price</th>
                        <th>Per lesson</th>
                        <th>USD</th>
                        <th>Expiry</th>
                        <th>Active</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((p: any) => (
                        <tr key={p._id}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td>{p.points}</td>
                          <td>{fmtLocal(p)}</td>
                          <td className="muted">
                            {p.priceLocal != null && p.points
                              ? fmtLocal({ ...p, priceLocal: Math.round(p.priceLocal / p.points) })
                              : "—"}
                          </td>
                          <td className="muted">{format(p.priceUSD)}</td>
                          <td className="muted">{p.expiryDays ? `${p.expiryDays}d` : "never"}</td>
                          <td>{p.isActive ? "Yes" : "No"}</td>
                          <td style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditPack(p)}>
                              Edit
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => openGrant(p)}>
                              Grant
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="records" className="mt-3">
          {transactions.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center" }}>
              <Icon name="dollar" size={32} stroke="var(--omnic-gray-300)" />
              <div className="body" style={{ marginTop: 12 }}>
                No ledger entries yet. Grants, spends, refunds and expiries will
                show up here. (Payment integration deferred — grants are manual.)
              </div>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Student</th>
                    <th>Type</th>
                    <th>Lessons</th>
                    <th>Balance after</th>
                    <th>By</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t: any) => (
                    <tr key={t._id}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {usersMap.get(t.studentId)?.name ?? t.studentId}
                      </td>
                      <td>
                        <span className={`pill ${t.amount >= 0 ? "pill-active" : "pill-paused"}`}>
                          {t.type}
                        </span>
                      </td>
                      <td>{t.amount > 0 ? `+${t.amount}` : t.amount}</td>
                      <td>{t.balanceAfter}</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {t.performedBy === "system"
                          ? "system"
                          : (usersMap.get(t.performedBy)?.name ?? t.performedBy ?? "—")}
                      </td>
                      <td className="muted">{t.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Grant dialog */}
      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant lessons</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Student</label>
              <Select
                value={grantStudent}
                onValueChange={(v) => setGrantStudent(v ?? "")}
                items={students.map((s: any) => ({
                  value: s.externalId,
                  label: `${s.name} · ${s.email}`,
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s: any) => (
                    <SelectItem key={s.externalId} value={s.externalId}>
                      {s.name} · {s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Pack (optional)</label>
              <Select
                value={grantPackId || "none"}
                items={[
                  { value: "none", label: "Manual grant (no pack)" },
                  ...packages
                    .filter((p: any) => p.isActive)
                    .map((p: any) => ({
                      value: p._id,
                      label: `${regionLabel(p.region)} · ${p.name} · ${fmtLocal(p)}`,
                    })),
                ]}
                onValueChange={(v) => {
                  if (!v || v === "none") {
                    setGrantPackId("");
                    return;
                  }
                  setGrantPackId(v);
                  const p = packages.find((x: any) => x._id === v);
                  if (p) setGrantAmount(String(p.points));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Manual grant (no pack)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manual grant (no pack)</SelectItem>
                  {packages
                    .filter((p: any) => p.isActive)
                    .map((p: any) => (
                      <SelectItem key={p._id} value={p._id}>
                        {regionLabel(p.region)} · {p.name} · {fmtLocal(p)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {grantPack && (
                <p className="text-xs text-zinc-500 mt-1">
                  {grantPack.expiryDays
                    ? `Expires ${grantPack.expiryDays} days after the first lesson is used.`
                    : "These lessons never expire."}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Lessons</label>
              <Input
                type="number"
                min={1}
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Reason / notes</label>
              <Textarea
                rows={2}
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={submitGrant}>
              Grant
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove / deduct lessons dialog */}
      <Dialog open={!!deductFor} onOpenChange={(o) => !o && setDeductFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove lessons — {deductFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-zinc-500">
              Current balance: {deductFor?.balance ?? 0} lesson
              {deductFor?.balance === 1 ? "" : "s"}. Removing more than that just
              zeroes it out.
            </p>
            <div>
              <label className="text-sm font-medium">Lessons to remove</label>
              <Input
                type="number"
                min={1}
                value={deductAmount}
                onChange={(e) => setDeductAmount(e.target.value)}
              />
              {deductFor && (
                <button
                  className="mt-1 text-xs underline text-zinc-500"
                  onClick={() => setDeductAmount(String(deductFor.balance))}
                >
                  Remove all ({deductFor.balance})
                </button>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Reason / notes</label>
              <Textarea
                rows={2}
                value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
              />
            </div>
            <Button variant="destructive" className="w-full" onClick={submitDeduct}>
              Remove lessons
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pack editor dialog */}
      <Dialog open={packOpen} onOpenChange={setPackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pack.id ? "Edit pack" : "New pack"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={pack.name}
                placeholder="8 lessons"
                onChange={(e) => setPack({ ...pack, name: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <div style={{ flex: 1 }}>
                <label className="text-sm font-medium">Lessons</label>
                <Input
                  type="number"
                  min={1}
                  value={pack.points}
                  onChange={(e) => setPack({ ...pack, points: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="text-sm font-medium">Region</label>
                <select
                  className="select"
                  value={pack.region}
                  onChange={(e) => {
                    const region = e.target.value;
                    // Default the currency to the region's anchor.
                    const currency = region === "gulf" ? "SAR" : region === "central_asia" ? "KZT" : pack.currency;
                    setPack({ ...pack, region, currency });
                  }}
                >
                  <option value="central_asia">Central Asia</option>
                  <option value="gulf">Gulf</option>
                  <option value="">Uncategorized</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <div style={{ flex: 1 }}>
                <label className="text-sm font-medium">Local price</label>
                <Input
                  type="number"
                  min={0}
                  value={pack.priceLocal}
                  onChange={(e) => setPack({ ...pack, priceLocal: e.target.value })}
                />
              </div>
              <div style={{ width: 90 }}>
                <label className="text-sm font-medium">Currency</label>
                <Input
                  value={pack.currency}
                  placeholder="KZT"
                  onChange={(e) => setPack({ ...pack, currency: e.target.value.toUpperCase() })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="text-sm font-medium">Price USD</label>
                <Input
                  type="number"
                  min={0}
                  value={pack.priceUSD}
                  onChange={(e) => setPack({ ...pack, priceUSD: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">
                Expiry days after first lesson (blank = never)
              </label>
              <Input
                type="number"
                min={1}
                value={pack.expiryDays}
                onChange={(e) => setPack({ ...pack, expiryDays: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pack.isActive}
                onChange={(e) => setPack({ ...pack, isActive: e.target.checked })}
              />
              Active (shown to students)
            </label>
            <Button className="w-full" disabled={packBusy} onClick={submitPack}>
              {packBusy ? "Saving…" : pack.id ? "Save changes" : "Create pack"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card" style={{ padding: "var(--pad-card)" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div className="body-sm" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}


// ── How students pay (POLICY §3 v1) ──────────────────────────────────
// Until a gateway is connected, the student billing page has to answer
// "where do I send the money" on its own. This is where that answer is set.

function ManualPaymentTab() {
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const save = useMutation(api.tenantSettings.setManualPayment);
  const uploadUrl = useMutation(api.tenantSettings.generatePaymentQrUploadUrl);
  const setQr = useMutation(api.tenantSettings.setPaymentQr);
  const clearQr = useMutation(api.tenantSettings.clearPaymentQr);

  const mp = tenant?.manualPayment;
  // `null` means untouched — fall through to what's stored.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const vEnabled = enabled ?? mp?.enabled ?? false;
  const vPhone = phone ?? mp?.kaspiPhone ?? "";
  const vWho = who ?? mp?.recipientName ?? "";
  const vNote = note ?? mp?.note ?? "";

  async function handleSave() {
    setBusy(true);
    try {
      await save({
        enabled: vEnabled,
        kaspiPhone: vPhone,
        recipientName: vWho,
        note: vNote,
      });
      toast.success("Payment details saved");
      setEnabled(null);
      setPhone(null);
      setWho(null);
      setNote(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleQr(file: File) {
    if (file.size > 3_000_000) {
      toast.error("Keep the image under 3MB");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      await setQr({ storageId });
      toast.success("QR uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20, maxWidth: 680 }}>
      <div className="h3" style={{ marginBottom: 4 }}>How students pay</div>
      <p className="body-sm" style={{ marginBottom: 16 }}>
        Shown on the student&apos;s Lessons &amp; packs page while no card
        gateway is connected. Money still lands in your own Kaspi — you grant
        the pack here in Billing once you see it.
      </p>

      <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={vEnabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="body-sm">Show payment details to students</span>
      </label>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium" htmlFor="mp-phone">Kaspi number</label>
          <Input
            id="mp-phone"
            value={vPhone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 700 000 00 00"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="mp-who">Recipient name</label>
          <Input
            id="mp-who"
            value={vWho}
            onChange={(e) => setWho(e.target.value)}
            placeholder="As it appears in Kaspi"
          />
          <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
            Students are told to check this before sending. A Kaspi transfer to
            the wrong person can&apos;t be undone.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="mp-note">Note (optional)</label>
          <Textarea
            id="mp-note"
            rows={2}
            value={vNote}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Put your full name in the transfer comment so we can match it."
          />
        </div>

        <div>
          <span className="text-sm font-medium">Kaspi QR (optional)</span>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 8, flexWrap: "wrap" }}>
            {mp?.qrUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mp.qrUrl}
                alt="Kaspi QR"
                style={{ width: 120, height: 120, objectFit: "contain", border: "1px solid var(--omnic-gray-200)", borderRadius: 8, background: "#fff" }}
              />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="file"
                accept="image/*"
                className="body-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleQr(f);
                }}
              />
              {mp?.qrUrl && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void clearQr().then(() => toast.success("QR removed"))}
                >
                  Remove QR
                </button>
              )}
            </div>
          </div>
        </div>

        <Button
          onClick={() => void handleSave()}
          disabled={busy}
          style={{ background: "var(--brand-purple)" }}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ── Pending payment confirmations (POLICY §3 manual Kaspi) ────────────
// Student taps "I have paid" → a durable pending claim lands here. Confirm
// grants the pack + books income + notifies in ONE idempotent mutation;
// Reject requires a short reason and is shown to the student.

function ClaimsTab() {
  const claims = useQuery(api.payments.listPendingClaims, {}) ?? [];
  const confirmPayment = useMutation(api.payments.confirmManualPayment);
  const rejectPayment = useMutation(api.payments.rejectManualPayment);
  const recordTrialPayment = useMutation(api.payments.recordTrialPayment);
  const allUsers = useQuery(api.users.listUsers) ?? [];
  const students = allUsers.filter((u) => u.role === "student");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [trialStudent, setTrialStudent] = useState("");
  const [trialBusy, setTrialBusy] = useState(false);

  async function confirm(id: string) {
    setBusyId(id);
    try {
      await confirmPayment({ eventId: id as never });
      toast.success("Confirmed — pack granted and income booked");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function doReject() {
    if (!rejecting) return;
    if (reason.trim().length < 5) {
      toast.error("Give a short reason the student can read");
      return;
    }
    setBusyId(rejecting.id);
    try {
      await rejectPayment({
        eventId: rejecting.id as never,
        reason: reason.trim(),
      });
      toast.success("Claim rejected — student notified");
      setRejecting(null);
      setReason("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function recordTrial() {
    if (!trialStudent) {
      toast.error("Pick a student");
      return;
    }
    setTrialBusy(true);
    try {
      await recordTrialPayment({ studentId: trialStudent, amount: 1500 });
      toast.success("Paid trial recorded — 1 lesson granted, income booked");
      setTrialStudent("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTrialBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card" style={{ padding: 18 }}>
        <div className="h3" style={{ marginBottom: 2 }}>Pending confirmations</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>
          {claims.length === 0
            ? "Nothing waiting — new student claims appear here."
            : "Verify the transfer in your Kaspi app, then confirm. One idle click — the mutation is idempotent."}
        </p>

        {claims.length === 0 ? (
          <div className="body-sm" style={{ color: "var(--omnic-gray-400)", padding: "18px 0", textAlign: "center" }}>
            No pending claims.
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Pack</th>
                  <th>Expected</th>
                  <th>Submitted</th>
                  <th>Trial credit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c._id}>
                    <td style={{ fontWeight: 600 }}>
                      {c.studentName}
                      <div className="body-sm" style={{ color: "var(--omnic-gray-400)" }}>
                        {c.studentId}
                      </div>
                    </td>
                    <td>
                      {c.packName ?? "—"}
                      {c.points ? (
                        <div className="body-sm" style={{ color: "var(--omnic-gray-400)" }}>
                          {c.points} lessons
                        </div>
                      ) : null}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {c.amount.toLocaleString()} {c.currency}
                    </td>
                    <td className="body-sm">
                      {new Date(c.createdAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      {c.trialCreditApplied ? (
                        <span className="pill" style={{ background: "#DCFCE7", color: "#166534" }}>
                          −{c.trialCreditApplied} {c.currency}
                        </span>
                      ) : (
                        <span className="body-sm" style={{ color: "var(--omnic-gray-400)" }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "end", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <Button
                          size="sm"
                          disabled={busyId === c._id}
                          onClick={() => void confirm(c._id as never)}
                          style={{ background: "#059669" }}
                        >
                          Confirm received
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === c._id}
                          onClick={() => setRejecting({ id: c._id as never, name: c.studentName })}
                          style={{ borderColor: "#FCA5A5", color: "#B91C1C" }}
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject reason */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject claim — {rejecting?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">
              Nothing is granted to the student. The reason is shown to them;
              keep it short and actionable (e.g. “No transfer found for this
              amount — if you paid, write to support”).
            </p>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason the student will see"
            />
            <Button variant="destructive" className="w-full" disabled={busyId === rejecting?.id} onClick={() => void doReject()}>
              {busyId === rejecting?.id ? "Rejecting…" : "Reject claim"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Paid trial — 1,500 ₸ once per student, ever (POLICY §1) */}
      <div className="card" style={{ padding: 18 }}>
        <div className="h3" style={{ marginBottom: 2 }}>Record paid trial (1,500 ₸)</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>
          One per student, ever. Grants 1 trial lesson and books the income;
          the credit is applied to the student&apos;s first later package
          automatically. Re-running for the same student is a no-op.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={trialStudent} onValueChange={(v) => setTrialStudent(v ?? "")}>
            <SelectTrigger style={{ minWidth: 240 }}>
              <SelectValue placeholder="Pick a student" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.externalId} value={s.externalId}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={trialBusy} onClick={() => void recordTrial()}>
            {trialBusy ? "Recording…" : "Record trial payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
