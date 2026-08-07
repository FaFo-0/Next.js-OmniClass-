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
import { PersonTime } from "@/components/shared/PersonTime";
import { TimezoneSelect } from "@/components/shared/TimezoneSelect";
import { browserTz } from "@/lib/tz";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const [draftPhone, setDraftPhone] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setDraftName(me?.name ?? "");
    setDraftTz(me?.timezone ?? browserTz());
    setDraftFmt(me?.timeFormat ?? "24h");
    setDraftPhone(me?.phoneWhatsapp ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await updateProfile({
        name: draftName,
        timezone: draftTz,
        timeFormat: draftFmt,
        phone: draftPhone,
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
        {/* Your own clock: the one every lesson time on your screen is drawn
            in, so a wrong timezone is visible instead of silently shifting
            every booking you read. */}
        {/* Only when it's known — the line underneath already says when it
            isn't, and two "no timezone" messages is one too many. */}
        {me?.timezone && (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
            <PersonTime
              tz={me.timezone}
              fmt={me.timeFormat ?? "24h"}
              possessive="your"
              size="header"
            />
          </div>
        )}
        <div className="body-sm" style={{ marginTop: 6, color: "var(--omnic-gray-500)" }}>
          <span style={me?.timezone ? undefined : { color: "#92400E", fontWeight: 600 }}>
            {me?.timezone ?? "No timezone set — lesson times may look wrong"}
          </span>{" "}
          · {me?.timeFormat ?? "24h"} clock
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
              <TimezoneSelect id="pf-tz" value={draftTz} onChange={setDraftTz} />
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
            <div>
              <label className="text-sm font-medium" htmlFor="pf-phone">Phone / WhatsApp</label>
              <Input
                id="pf-phone"
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                placeholder="+7 700 000 00 00"
              />
              <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                How your academy reaches you when a lesson has a problem.
              </p>
            </div>
            {withNativeLanguage && (
              <div>
                <span className="text-sm font-medium">Native language</span>
                <div className="text-sm" style={{ marginTop: 4 }}>
                  {currentL1
                    ? (L1_OPTIONS.find((l) => l.code === currentL1)?.label ?? currentL1)
                    : "Not set"}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-500)" }}>
                  Your flashcards are translated into this language. Your
                  teacher or the academy changes it — ask them if it is wrong.
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
