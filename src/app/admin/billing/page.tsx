"use client";

import { useState } from "react";
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

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantStudent, setGrantStudent] = useState<string>("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [grantExpires, setGrantExpires] = useState("");
  const grantPoints = useMutation(api.points.grantPoints);

  async function submitGrant() {
    const amount = Number(grantAmount);
    if (!grantStudent || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Pick student and positive amount");
      return;
    }
    try {
      await grantPoints({
        studentId: grantStudent,
        points: amount,
        source: "manual",
        notes: grantReason || undefined,
        expiresAt: grantExpires || undefined,
      });
      toast.success(`Granted ${amount} points`);
      setGrantOpen(false);
      setGrantStudent("");
      setGrantAmount("");
      setGrantReason("");
      setGrantExpires("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Billing</h1>
          <div className="body" style={{ marginTop: 4 }}>
            Point balances, manual grants, package catalog.
          </div>
        </div>
        <button className="btn btn-tenant" onClick={() => setGrantOpen(true)}>
          <Icon name="plus" size={14} /> Grant points
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatBox label="Students with balance" value={balances.length} />
        <StatBox label="Total active points" value={totalActiveBalance} />
        <StatBox label="Active packages" value={packages.filter((p: any) => p.isActive).length} />
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="packages">Packages ({packages.length})</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="mt-3">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Active points</th>
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
                      <td className="muted">{b.nextExpiresAt ?? "—"}</td>
                    </tr>
                  );
                })}
                {balances.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                      No active balances. Grant points to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="packages" className="mt-3">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Points</th>
                  <th>Price USD</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p: any) => (
                  <tr key={p._id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.points}</td>
                    <td>{format(p.priceUSD)}</td>
                    <td>{p.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {packages.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                      No packages yet. Catalog UI ships in H.11.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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

      {/* Grant points dialog */}
      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant points</DialogTitle>
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
              <label className="text-sm font-medium">Amount (points)</label>
              <Input
                type="number"
                min={1}
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Expires on (YYYY-MM-DD, default +45 days)</label>
              <Input
                type="date"
                value={grantExpires}
                onChange={(e) => setGrantExpires(e.target.value)}
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
