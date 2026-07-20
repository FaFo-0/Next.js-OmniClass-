"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const { format } = useCurrency();

  const students = allUsers.filter((u: any) => u.role === "student");
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
            Lesson balances, manual grants, and the pack catalog.
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

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="packages">Packs ({packages.length})</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="mt-3">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Active lessons</th>
                  <th>Next expiry</th>
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
                    </tr>
                  );
                })}
                {balances.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: 32, textAlign: "center" }} className="body-sm">
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
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <Icon name="dollar" size={32} stroke="var(--omnic-gray-300)" />
            <div className="body" style={{ marginTop: 12 }}>
              Payment integration deferred. Manual grants tracked above.
            </div>
          </div>
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
              <Select value={grantStudent} onValueChange={(v) => setGrantStudent(v ?? "")}>
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
