"use client";

// Teacher account page — reached from the avatar menu, same as every role.

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { AccountCard } from "@/components/shared/AccountCard";
import { Icon } from "@/components/shared/icons";
import { Input } from "@/components/ui/input";

export default function TeacherProfilePage() {
  const me = useQuery(api.users.getMe);
  const earnings = useQuery(api.reports.teacherEarnings, {});
  const setMeetLink = useMutation(api.users.setMeetLink);
  const [link, setLink] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = link ?? me?.meetLink ?? "";

  async function saveLink() {
    setSaving(true);
    try {
      await setMeetLink({ meetLink: value.trim() });
      toast.success("Meeting room saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <AccountCard />

      {/* C-8 — the room auto-filled onto every lesson this teacher runs. */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 8 }}>Meeting room</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>
          Your permanent Google Meet link. New lessons get it automatically, so
          students always have somewhere to join.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <Input
            value={value}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://meet.google.com/abc-defg-hij"
          />
          <button className="btn btn-tenant" onClick={() => void saveLink()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="h3" style={{ marginBottom: 14 }}>This month</div>
        <div className="grid-3">
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{earnings?.monthLessons ?? 0}</div>
            <div className="body-sm">Payable lessons</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {earnings?.monthEarningsUSD != null ? `$${earnings.monthEarningsUSD.toFixed(2)}` : "—"}
            </div>
            <div className="body-sm">Earnings</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{earnings?.upcoming ?? 0}</div>
            <div className="body-sm">Upcoming</div>
          </div>
        </div>
        <div className="body-sm" style={{ marginTop: 10, color: "var(--omnic-gray-500)" }}>
          <Icon name="info" size={12} /> Share and payout rules live in POLICY §4.
        </div>
      </div>
    </div>
  );
}
