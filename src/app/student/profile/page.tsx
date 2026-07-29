"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useClerk } from "@clerk/nextjs";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";
import { toast } from "sonner";
import { browserTz } from "@/lib/tz";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const L1_OPTIONS = [
  { code: "ru", label: "Russian" },
  { code: "ar", label: "Arabic" },
  { code: "en", label: "English" },
];

/** Common zones for this academy's students; free-typing still allowed. */
const TZ_SUGGESTIONS = [
  "Asia/Almaty",
  "Asia/Damascus",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Africa/Cairo",
];

export default function StudentProfilePage() {
  const { user } = useAuth();
  const balance = useQuery(api.points.getBalance, {});
  const lessons = useQuery(api.lessons.listPublishedForStudent, {}) ?? [];
  const myWords = useQuery(api.srs.listMyWords, {}) ?? [];
  const streak = useQuery(api.streaks.getForStudent, {});
  const { signOut } = useClerk();
  const me = useQuery(api.users.getMe);
  const onboarding = useQuery(api.onboarding.getMyOnboarding, {});
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const updateProfile = useMutation(api.users.updateMyProfile);

  // Edit dialog state — hydrated when opened, saved as one mutation.
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftTz, setDraftTz] = useState("");
  const [draftFmt, setDraftFmt] = useState<"12h" | "24h">("24h");
  const [draftL1, setDraftL1] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setDraftName(me?.name ?? user?.name ?? "");
    setDraftTz(me?.timezone ?? browserTz());
    setDraftFmt(me?.timeFormat ?? "24h");
    setDraftL1(onboarding?.l1 ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await updateProfile({
        name: draftName,
        timezone: draftTz,
        timeFormat: draftFmt,
        l1: draftL1 || undefined,
      });
      toast.success("Profile saved");
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const initials = user?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("") ?? "?";

  const points = balance?.balance ?? 0;
  const nextExpiresAt = balance?.nextExpiresAt ?? null;

  const ensureIcsToken = useMutation(api.users.ensureIcsToken);
  const [icsUrl, setIcsUrl] = useState<string | null>(null);

  async function handleSubscribe() {
    try {
      const token = await ensureIcsToken();
      const origin =
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
        process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
          ".convex.cloud",
          ".convex.site"
        ) ||
        "";
      const url = `${origin}/ics?token=${token}`;
      setIcsUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Calendar URL copied to clipboard");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="card" style={{ padding: 28, textAlign: "center", marginBottom: 16 }}>
        <span className="avatar avatar-lg">{initials}</span>
        <div className="h2" style={{ marginTop: 14 }}>{user?.name ?? "Student"}</div>
        <div className="body" style={{ marginBottom: 14 }}>{user?.email}</div>
        <button className="btn btn-secondary btn-sm" onClick={openEdit}>
          <Icon name="edit" size={14} /> Edit profile
        </button>
        <div className="body-sm" style={{ marginTop: 10, color: "var(--omnic-gray-500)" }}>
          {me?.timezone ?? "No timezone set"} · {me?.timeFormat ?? "24h"} clock
          {onboarding?.l1
            ? ` · native ${L1_OPTIONS.find((l) => l.code === onboarding.l1)?.label ?? onboarding.l1}`
            : " · native language not set"}
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Your stats</div>
        <div className="grid-3">
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{lessons.length}</div>
            <div className="body-sm">Lessons</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{myWords.length}</div>
            <div className="body-sm">Words</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--omnic-red)" }}>
              {streak?.currentStreak ?? 0}🔥
            </div>
            <div className="body-sm">Streak</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Points balance</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span className="body">Active points</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: "var(--omnic-tenant-primary)" }}>{points}</span>
        </div>
        {nextExpiresAt && (
          <div className="body-sm" style={{ marginBottom: 12 }}>
            Earliest expiry: <strong>{nextExpiresAt}</strong>
          </div>
        )}
        {tenant?.supportEmail ? (
          <a
            className="btn btn-secondary btn-block"
            href={`mailto:${tenant.supportEmail}?subject=${encodeURIComponent("Buying more lessons")}`}
          >
            <Icon name="send" size={14} /> Email the academy to buy more
          </a>
        ) : (
          <div className="body-sm">Ask your teacher about buying more lessons.</div>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 10 }}>Calendar subscription</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>
          Subscribe in Google Calendar or Apple Calendar to see lessons
          automatically.
        </p>
        <button className="btn btn-secondary btn-block" onClick={handleSubscribe}>
          <Icon name="external" size={14} /> Copy calendar URL
        </button>
        {icsUrl && (
          <div
            className="body-sm"
            style={{
              marginTop: 8,
              padding: 8,
              background: "var(--omnic-gray-50)",
              borderRadius: 6,
              wordBreak: "break-all",
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
            }}
          >
            {icsUrl}
          </div>
        )}
      </div>

      <button
        className="btn btn-secondary btn-block"
        onClick={() => void signOut({ redirectUrl: "/sign-in" })}
      >
        <Icon name="logout" size={14} /> Sign out
      </button>

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
            <Button onClick={() => void saveEdit()} disabled={saving} className="w-full" style={{ background: "var(--brand-purple)" }}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
