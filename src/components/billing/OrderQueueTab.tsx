"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function OrderQueueTab() {
  const orders = useQuery(api.billing.listOrders, {}) ?? [];
  const grant = useMutation(api.billing.grantOrder);
  const reject = useMutation(api.billing.rejectOrder);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function grantOrder(orderId: string) {
    setBusy(orderId);
    try {
      await grant({ orderId: orderId as never });
      toast.success("Order granted; lesson and finance ledgers updated once.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rejectOrder(orderId: string) {
    if (!reason.trim()) return;
    setBusy(orderId);
    try {
      await reject({ orderId: orderId as never, reason });
      setReasonFor(null);
      setReason("");
      toast.success("Order rejected and the student was notified.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Buyer</th><th>Family / plan</th><th>Lessons</th><th>Price snapshot</th><th>Status</th><th>Requested</th><th /></tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.orderId}>
              <td><strong>{order.buyerName}</strong><br /><span className="muted">{order.buyerStudentId}</span></td>
              <td>{order.planSnapshot.familyLabel}<br />{order.planSnapshot.planLabel}</td>
              <td>{order.planSnapshot.lessonCount}</td>
              <td dir="ltr">{order.priceSnapshot.netAmount.toLocaleString()} {order.priceSnapshot.currency}{order.discountSnapshot ? <><br /><span className="muted">−{order.discountSnapshot.amount.toLocaleString()} discount</span></> : null}</td>
              <td>{order.status}</td>
              <td className="muted">{new Date(order.requestedAt).toLocaleString()}</td>
              <td>
                {order.status === "pending_verification" ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Button size="sm" disabled={busy === order.orderId} onClick={() => void grantOrder(order.orderId)}>Grant</Button>
                    <Button size="sm" variant="destructive" disabled={busy === order.orderId} onClick={() => setReasonFor(order.orderId)}>Reject</Button>
                  </div>
                ) : order.rejectionReason ? <span className="muted">{order.rejectionReason}</span> : null}
                {reasonFor === order.orderId && (
                  <div style={{ marginTop: 8, minWidth: 220 }}>
                    <Textarea rows={2} value={reason} placeholder="Student-readable reason" onChange={(event) => setReason(event.target.value)} />
                    <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                      <Button size="sm" variant="outline" onClick={() => setReasonFor(null)}>Cancel</Button>
                      <Button size="sm" variant="destructive" disabled={!reason.trim() || busy === order.orderId} onClick={() => void rejectOrder(order.orderId)}>Confirm</Button>
                    </div>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: "center" }}>No billing orders yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
