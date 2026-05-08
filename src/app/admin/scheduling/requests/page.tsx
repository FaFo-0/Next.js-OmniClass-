"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Check, X } from "lucide-react";
import Link from "next/link";

export default function RescheduleRequestsPage() {
  const requests = useQuery(api.schedule.listPendingReschedules) ?? [];
  const allUsers = useQuery(api.users.listUsers) ?? [];

  const resolveReschedule = useMutation(api.schedule.resolveReschedule);

  async function handleResolve(requestId: Id<"rescheduleRequests">, action: "approved" | "rejected") {
    try {
      await resolveReschedule({ requestId, action });
      toast.success(action === "approved" ? "Reschedule approved" : "Reschedule rejected");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function getUserName(id: string) {
    return allUsers.find((u) => u.externalId === id)?.name ?? id;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href="/admin/calendar"
        className="text-sm underline mb-3 inline-block"
        style={{ color: "var(--brand-purple)" }}
      >
        <ArrowLeft size={12} className="inline me-1" />
        Back to scheduling
      </Link>

      <PageHeader
        title="Reschedule Requests"
        subtitle="Approve or reject pending reschedule requests"
      />

      {requests.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center"
          style={{ borderColor: "var(--omnic-gray-100)" }}>
          <p className="text-zinc-500">No pending requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req._id}
              className="rounded-lg border bg-white p-4"
              style={{ borderColor: "var(--omnic-gray-100)" }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-zinc-500">Requested by: </span>
                    <span className="font-medium">
                      {getUserName(req.requesterId)} ({req.requestedBy})
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">From: </span>
                    <span>{req.fromDate} at {req.fromStartTime}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">To: </span>
                    <span className="font-semibold">{req.toDate} at {req.toStartTime}</span>
                  </div>
                  {req.reason && (
                    <div>
                      <span className="text-zinc-500">Reason: </span>
                      <span>{req.reason}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleResolve(req._id, "approved")}
                  >
                    <Check size={14} className="me-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleResolve(req._id, "rejected")}
                  >
                    <X size={14} className="me-1" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
