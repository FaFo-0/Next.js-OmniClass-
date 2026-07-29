"use client";

// The account settings every role shares: who you are, what timezone your
// times are shown in, and which clock. One component so a teacher's profile
// can't drift from a student's.
//
// Reached from the avatar menu (Clerk's popup carries a "Profile" link into
// each portal), so this page and Clerk's "Manage account" are the two halves
// of one thing: Clerk owns identity (email, password, photo), we own the
// academy-side preferences.

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";
import { browserTz } from "@/lib/tz";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Common zones for this academy; free typing still allowed. */
const TZ_SUGGESTIONS = [
  "Asia/Almaty",
  "Asia/Damascus",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Africa/Cairo",
];

export const L1_OPTIONS = [
  { code: "ru", label: "Russian" },
  { code: "ar", label: "Arabic" },
  { code: "en", label: "English" },
];

export function AccountCard({
  /** Students also pick a native language — it drives their flashcards. */
  withNativeLanguage = false,
  currentL1,
}: {
  withNativeLanguage?: boolean;
  currentL1?: string | null;
}) {
  const me = useQuery(api.users.getMe);
  const updateProfile = useMutation(api.users.updateMyProfile);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftTz, setDraftTz] = useState("");
  const [draftFmt, setDraftFmt] = useState<"12h" | "24h">("24h");
  const [draftL1, setDraftL1] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setDraftName(me?.name ?? "");
    setDraftTz(me?.timezone ?? browserTz());
    setDraftFmt(me?.timeFormat ?? "24h");
    setDraftL1(currentL1 ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await updateProfile({
        name: draftName,
        timezone: draftTz,
        timeFormat: draftFmt,
        l1: withNativeLanguage && draftL1 ? draftL1 : undefined,
      });
      toast.success("Profile saved");
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const initials =
    me?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2) ?? "?";

  return (
    <>
      <div className="card" style={{ padding: 28, textAlign: "center", marginBottom: 16 }}>
        <span className="avatar avatar-lg">{initials}</span>
        <div className="h2" style={{ marginTop: 14 }}>{me?.name ?? "…"}</div>
        <div className="body" style={{ marginBottom: 14 }}>{me?.email}</div>
        <button className="btn btn-secondary btn-sm" onClick={openEdit}>
          <Icon name="edit" size={14} /> Edit profile
        </button>
        <div className="body-sm" style={{ marginTop: 10, color: "var(--omnic-gray-500)" }}>
          {me?.timezone ?? "No timezone set"} · {me?.timeFormat ?? "24h"} clock
          {withNativeLanguage &&
            (currentL1
              ? ` · native ${L1_OPTIONS.find((l) => l.code === currentL1)?.label ?? currentL1}`
              : " · native language not set")}
        </div>
        <div className="body-sm" style={{ marginTop: 6, color: "var(--omnic-gray-400)" }}>
          Email, password and photo live in <strong>Manage account</strong> — click
          your picture in the sidebar.
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="pf-name">Name</label>
              <Input id="pf-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="pf-tz">Timezone</label>
              <Input
                id="pf-tz"
                list="tz-suggestions"
                value={draftTz}
                onChange={(e) => setDraftTz(e.target.value)}
                placeholder="e.g. Asia/Damascus"
              />
              <datalist id="tz-suggestions">
                {TZ_SUGGESTIONS.map((tz) => <option key={tz} value={tz} />)}
              </datalist>
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                Lesson times everywhere show in this timezone.
              </p>
            </div>
            <div>
              <span className="text-sm font-medium">Clock</span>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {(["24h", "12h"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="chip"
                    onClick={() => setDraftFmt(f)}
                    style={draftFmt === f ? { background: "var(--brand-purple)", color: "#fff", borderColor: "var(--brand-purple)" } : undefined}
                  >
                    {f === "24h" ? "24-hour" : "12-hour (AM/PM)"}
                  </button>
                ))}
              </div>
            </div>
            {withNativeLanguage && (
              <div>
                <span className="text-sm font-medium">Native language</span>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {L1_OPTIONS.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      className="chip"
                      onClick={() => setDraftL1(l.code)}
                      style={draftL1 === l.code ? { background: "var(--brand-purple)", color: "#fff", borderColor: "var(--brand-purple)" } : undefined}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                  New words are translated into this language on your flashcards.
                </p>
              </div>
            )}
            <Button onClick={() => void save()} disabled={saving} className="w-full" style={{ background: "var(--brand-purple)" }}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
