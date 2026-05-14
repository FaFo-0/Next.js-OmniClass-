"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";
import { toast } from "sonner";

export default function StudentProfilePage() {
  const { user } = useAuth();
  const balance = useQuery(api.points.getBalance, {});
  const lessons = useQuery(api.lessons.listPublishedForStudent, {}) ?? [];
  const vocab = useQuery(api.lessonContent.listAllVocab, {}) ?? [];
  const streak = useQuery(api.streaks.getForStudent, {});

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
        <button className="btn btn-secondary btn-sm"><Icon name="edit" size={14} /> Edit profile</button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 14 }}>Your stats</div>
        <div className="grid-3">
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{lessons.length}</div>
            <div className="body-sm">Lessons</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{vocab.length}</div>
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
        <button className="btn btn-secondary btn-block">
          Contact your provider to purchase more
        </button>
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

      <button className="btn btn-secondary btn-block"><Icon name="logout" size={14} /> Sign out</button>
    </div>
  );
}
