"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function StudentLessonCleanup({ studentId, email }: { studentId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useQuery(api.studentLessonCleanup.preview, open ? { studentId } : "skip");
  const clear = useMutation(api.studentLessonCleanup.clear);
  return <>
    <Button variant="destructive" onClick={() => { setConfirmation(""); setOpen(true); }}>Clear test lesson history</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogTitle>Clear test lesson history</DialogTitle>
        <DialogDescription>
          Remove this student&apos;s cancelled and past one-to-one lessons from calendars, history and unpaid teacher payroll. Related sessions move to Deleted sessions. Live sessions are excluded.
        </DialogDescription>
        {preview ? <>
          <p>{preview.lessons} lessons · {preview.sessions} sessions · {preview.unpaidPayable} unpaid payroll lessons</p>
          <div className="max-h-48 overflow-y-auto rounded-md border p-3 text-sm">
            {preview.events.length ? preview.events.map(event => <div key={event.id} className="py-1">{event.date} · {event.startTime} · {event.title} · {event.status.replaceAll("_", " ")}</div>) : "No cancelled or past lessons to clear."}
          </div>
          {preview.payments.length > 0 && <div className="rounded-md border border-destructive p-3 text-sm">
            <p className="font-semibold">Recorded payments will also be corrected</p>
            {preview.payments.map(payment => <p key={payment.id}>Remove {payment.amount.toLocaleString()} {payment.currency} from a recorded teacher payment.</p>)}
            <p>This edits payroll and its money ledger. It does not recover money already sent to a teacher. Use this only for test records.</p>
          </div>}
          <p className="text-sm">The student account, future bookings, saved vocabulary, homework and lesson balance stay unchanged. This cleanup does not refund spent lessons.</p>
          <label className="text-sm" htmlFor="cleanup-email">Type {email} to confirm</label>
          <Input id="cleanup-email" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" />
        </> : <p>Loading lesson history…</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy || !preview?.lessons || confirmation.trim() !== email} onClick={async () => {
            if (!preview) return;
            setBusy(true);
            try {
              const result = await clear({ studentId, revision: preview.revision, confirmation });
              toast.success(`Cleared ${result.lessons} lessons and their payroll amounts`);
              setOpen(false);
            } catch (error) { toast.error((error as Error).message); }
            finally { setBusy(false); }
          }}>{busy ? "Clearing…" : "Clear lessons and payroll"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
