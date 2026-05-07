"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, DollarSign } from "lucide-react";

export default function BillingPage() {
  const allUsers = useQuery(api.users.listUsers) ?? [];
  const packages = useQuery(api.schedule.listPackagesForOrg) ?? [];

  const usersMap = new Map(allUsers.map((u) => [u.externalId, u]));

  const totalRevenue = packages.reduce((sum, p) => {
    // Placeholder: actual billing per-package would come from billingRecords
    return sum;
  }, 0);

  const totalSessions = packages.reduce((s, p) => s + p.totalSessions, 0);
  const totalUsed = packages.reduce((s, p) => s + (p.usedSessions ?? 0), 0);

  return (
    <div className="p-6">
      <PageHeader title="Billing" subtitle="Package management & revenue overview" />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--omnic-gray-100)" }}>
          <div className="text-xs text-zinc-500 mb-1">Active packages</div>
          <div className="text-2xl font-bold">{packages.filter((p) => p.status === "active").length}</div>
        </div>
        <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--omnic-gray-100)" }}>
          <div className="text-xs text-zinc-500 mb-1">Total sessions sold</div>
          <div className="text-2xl font-bold">{totalSessions}</div>
        </div>
        <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--omnic-gray-100)" }}>
          <div className="text-xs text-zinc-500 mb-1">Sessions used</div>
          <div className="text-2xl font-bold">{totalUsed}</div>
        </div>
      </div>

      <Tabs defaultValue="packages">
        <TabsList>
          <TabsTrigger value="packages">Packages ({packages.length})</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="packages" className="mt-3">
          <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: "var(--omnic-gray-100)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--omnic-gray-50)" }}>
                <tr className="border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Student</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Used</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Remaining</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Start</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => {
                  const student = usersMap.get(p.studentId);
                  return (
                    <tr key={p._id} className="border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
                      <td className="px-4 py-2.5 font-medium">{student?.name ?? p.studentId}</td>
                      <td className="px-4 py-2.5">{p.totalSessions}</td>
                      <td className="px-4 py-2.5">{p.usedSessions ?? 0}</td>
                      <td className="px-4 py-2.5">{p.totalSessions - (p.usedSessions ?? 0)}</td>
                      <td className="px-4 py-2.5"><StatusPill status={p.status} /></td>
                      <td className="px-4 py-2.5 text-zinc-500">{p.startDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="records" className="mt-3">
          <div className="rounded-lg border bg-white p-8 text-center" style={{ borderColor: "var(--omnic-gray-100)" }}>
            <CreditCard size={32} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-zinc-500">Billing records will be available when payments are integrated.</p>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-3">
          <div className="rounded-lg border bg-white p-8 text-center" style={{ borderColor: "var(--omnic-gray-100)" }}>
            <DollarSign size={32} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-zinc-500">Expense tracking coming in a future update.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
